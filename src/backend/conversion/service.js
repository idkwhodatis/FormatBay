import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,stat,link,realpath} from 'node:fs/promises';
import path from 'node:path';
import {FFmpegAdapter} from './ffmpeg.js';
import {OpusencAdapter} from './opusenc.js';
import {planConversion,matchesTarget} from './planner.js';

const statuses=new Set(['ready','running','queued']);
/** Backend-owned tasks. The renderer can never supply an executable plan. */
export class ConversionService {
  constructor({onChange=()=>{},adapter,adapters}={}) {
    adapters ??= adapter?[adapter]:[new FFmpegAdapter(),new OpusencAdapter()];
    this.adapter=adapters[0];this.adapters=adapters;this.toolAdapters=new Map();this.formats=[];this.onChange=onChange;this.tasks=new Map();this.internal=new Map();
    this.outputDirectory=null;this.active=null;this.queue=[];this.closing=false;
    this.addChain=Promise.resolve();this.importController=new AbortController();
  }
  async initialize() {
    const tools=await Promise.all(this.adapters.map(adapter=>adapter.discover()));
    this.toolAdapters.clear();
    tools.forEach((tool,index)=>{
      if (this.toolAdapters.has(tool.id)) throw new Error('Duplicate conversion tool ID');
      this.toolAdapters.set(tool.id,this.adapters[index]);
    });
    const primaryAvailable=tools[0]?.available===true;
    tools.forEach((tool,index)=>{
      if (this.adapters[index] instanceof OpusencAdapter && tool.available && primaryAvailable && !this.adapter.canDecode?.('opus')) {
        tool.available=false;tool.detail='opusenc is installed, but FFmpeg needs an Opus decoder to verify its output.';
      }
    });
    // Every production route still requires the primary probe and verifier.
    const enabled=this.adapters.filter((adapter,index)=>primaryAvailable && tools[index].available);
    this.capabilities=enabled.flatMap(adapter=>adapter.capabilities());
    this.formats=[...new Set(enabled.flatMap(adapter=>adapter.formats()))];
    this.targetEncoders=this.capabilities.some(edge=>edge.toolId==='opusenc')?{opus:['opusenc']}:{};
    return {outputFormats:{Audio:this.formats},tools,targetEncoders:this.targetEncoders};
  }
  list() {return structuredClone([...this.tasks.values()]);}
  emit() {this.onChange(this.list());}
  async setOutputDirectory(directory) {
    if (directory===null) {this.outputDirectory=null;return;}
    const canonical=await realpath(directory);
    if (!(await stat(canonical)).isDirectory()) throw new Error('Output must be a directory');
    this.outputDirectory=canonical;
  }
  async addFiles(paths,target) {
    if (this.closing) throw new Error('Application is closing');
    if (!Array.isArray(paths)||!paths.length||paths.length>200||paths.some(file=>typeof file!=='string'||!path.isAbsolute(file))) throw new Error('Select 1–200 local files');
    if (!target || target.kind!=='audio' || !this.formats.includes(target.format)) throw new Error('Unsupported output format or unavailable tool');
    if (target.encoder!==undefined && !this.targetEncoders[target.format]?.includes(target.encoder)) throw new Error('Selected encoder is unavailable for this format');
    // Serialize imports to keep the task limit deterministic under repeated clicks.
    const operation=this.addChain.then(async()=>{
      if (this.closing) throw new Error('Application is closing');
      if (this.tasks.size+paths.length>500) throw new Error('Remove completed tasks before adding more (500 task limit)');
      for (const inputPath of paths) {
        if (this.closing) break;
        const id=randomUUID();
        const task={id,inputPath,target:{kind:target.kind,format:target.format,...(target.encoder?{encoder:target.encoder}:{})},status:'blocked',plan:null,error:null,progress:0,outputPath:null};
        try {
          const canonical=await realpath(inputPath);
          const probe=await this.adapter.probe(canonical,{signal:this.importController.signal});
          const identity=await stat(canonical);
          const plan=planConversion(probe.state,task.target,this.capabilities,{offline:true,requiredFinalTool:task.target.encoder??null});
          if (!plan.ok) throw new Error(plan.message);
          task.plan=plan;task.status='ready';
          this.internal.set(id,{inputPath:canonical,probe,identity:{size:identity.size,mtimeMs:identity.mtimeMs},outputDirectory:this.outputDirectory});
        } catch(error) {task.error=error.message;}
        this.tasks.set(id,task);this.emit();
      }
      return this.list();
    });
    this.addChain=operation.catch(()=>{});
    return operation;
  }
  start(id) {
    const task=this.tasks.get(id);
    if (!task || task.status!=='ready' || this.closing) return;
    task.status='queued';this.queue.push(id);this.emit();this.drain();
  }
  cancel(id) {
    const task=this.tasks.get(id);
    if (!task || !statuses.has(task.status)) return;
    if (task.status==='running') this.internal.get(id)?.controller?.abort();
    else {task.status='cancelled';this.queue=this.queue.filter(value=>value!==id);this.emit();}
  }
  remove(id) {
    if (this.tasks.get(id)?.status==='running') throw new Error('Cancel the running task before removing it');
    this.queue=this.queue.filter(value=>value!==id);this.tasks.delete(id);this.internal.delete(id);this.emit();
  }
  drain() {
    if (this.active || this.closing) return;
    const id=this.queue.shift();
    if (!id) return;
    this.active=this.run(id).finally(()=>{this.active=null;this.drain();});
  }
  async run(id) {
    const task=this.tasks.get(id),internal=this.internal.get(id);
    if (!task || !internal || task.status!=='queued') return;
    const controller=new AbortController();internal.controller=controller;
    const {signal}=controller;let temp;
    task.status='running';this.emit();
    try {
      // Reprobe at execution time; files may have changed while the task waited.
      const identity=await stat(internal.inputPath);
      if (identity.size!==internal.identity.size || identity.mtimeMs!==internal.identity.mtimeMs) throw new Error('The input changed since planning. Remove and add the file again.');
      const probe=await this.adapter.probe(internal.inputPath,{signal});
      const plan=planConversion(probe.state,task.target,this.capabilities,{offline:true,requiredFinalTool:task.target.encoder??null});
      if (!plan.ok) throw new Error(plan.message);
      if (JSON.stringify(plan)!==JSON.stringify(task.plan)) throw new Error('The input changed since planning. Remove and add the file again to review its new route.');
      const directory=internal.outputDirectory ?? path.dirname(internal.inputPath);
      temp=await mkdtemp(path.join(directory,'.formatbay-'));
      let current=internal.inputPath;
      for (const [index,step] of plan.steps.entries()) {
        if (signal.aborted) throw new Error('Cancelled');
        task.phase='converting';task.stepIndex=index;this.emit();
        const output=path.join(temp,`step-${index}.${step.output.format}`);
        const executor=this.toolAdapters.get(step.toolId);
        if (!executor) throw new Error('Planned tool is no longer available');
        // External encoders may recover corrupt input silently. Validate the
        // original stream before their first step; intermediates were checked.
        if (index===0 && executor!==this.adapter) {
          task.phase='verifying';this.emit();
          await this.adapter.verify?.(current,{signal,expectedDuration:probe.audioDuration||0});
          task.phase='converting';this.emit();
        }
        await executor.execute(step,current,output,{signal,duration:probe.duration,onProgress:value=>{
          task.progress=Math.min(99,Math.round(100*(index+value)/plan.steps.length));this.emit();
        }});
        task.phase='verifying';this.emit();
        const verified=await this.adapter.probe(output,{signal});
        if (!verified.size || !matchesTarget(verified.state,step.output) || verified.state.audioCodec!==step.output.audioCodec || !verified.state.hasAudio || verified.state.hasVideo || (step.output.audioChannels && verified.state.audioChannels!==step.output.audioChannels)) throw new Error('Tool output did not match the planned media format');
        await this.adapter.verify?.(output,{signal,expectedDuration:probe.audioDuration||verified.audioDuration||0});
        current=output;
      }
      if (signal.aborted) throw new Error('Cancelled');
      task.outputPath=await publish(current,directory,path.parse(internal.inputPath).name,task.target.format,signal);
      task.status='done';task.progress=100;
    } catch(error) {task.status=signal.aborted?'cancelled':'failed';task.error=signal.aborted?null:error.message;}
    finally {
      if (temp) {
        try {await rm(temp,{recursive:true,force:true});}
        catch {task.error=(task.error?task.error+' ':'')+'Temporary files could not be cleaned up: '+temp;}
      }
      delete internal.controller;delete task.phase;this.emit();
    }
  }
  async shutdown() {
    this.closing=true;this.importController.abort();
    for(const task of this.tasks.values())this.cancel(task.id);
    await this.active;await this.addChain;
  }
}

/** Atomic no-clobber publication on the output volume. No overwrite race. */
export async function publish(source,directory,name,format,signal) {
  for(let i=0;i<10000;i++) {
    if(signal?.aborted)throw new Error('Cancelled');
    const destination=path.join(directory,`${name}-converted${i?'-'+i:''}.${format}`);
    try {
      await link(source,destination);
      return destination;
    } catch(error) {
      if(error.code==='EEXIST')continue;
      // A same-directory temp file normally permits hard links. Do not fall back
      // to a non-atomic copy that would expose partially written output.
      throw new Error('Cannot safely publish output on this filesystem: '+error.message);
    }
  }
  throw new Error('Too many existing output files with this name');
}

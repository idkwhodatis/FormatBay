import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ConversionService,publish} from '../src/backend/conversion/service.js';
import {FFmpegAdapter} from '../src/backend/conversion/ffmpeg.js';
import {runProcess} from '../src/backend/conversion/process.js';
const temp=()=>mkdtemp(path.join(os.tmpdir(),'formatbay-test-'));
const waitFor=async(fn)=>{for(let i=0;i<1200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Timed out');};

test('publication is no-clobber even under concurrency',async()=>{
 const dir=await temp();try{
  const source=path.join(dir,'source.wav');await writeFile(source,'sound');
  const outputs=await Promise.all([publish(source,dir,'source','wav'),publish(source,dir,'source','wav')]);
  assert.notEqual(...outputs);assert.equal(await readFile(source,'utf8'),'sound');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('process wrapper handles failures, output cap and cancellation',async()=>{
 await assert.rejects(runProcess(process.execPath,['-e','process.exit(3)']),/failed/);
 await assert.rejects(runProcess(process.execPath,['-e','console.log("x".repeat(10000))'],{maxOutput:100}),/size limit/);
 const controller=new AbortController();const running=runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});
 controller.abort();await assert.rejects(running,/Cancelled/);
});

test('real FFmpeg: video to audio, silent input, nonmedia, no overwrite and cleanup',async t=>{
 const adapter=new FFmpegAdapter();
 if (!(await adapter.discover()).available) return t.skip('FFmpeg/ffprobe unavailable');
 const dir=await temp();const service=new ConversionService({adapter});
 try{
  const init=await service.initialize();assert.ok(init.outputFormats.Audio.includes('flac'));
  const input=path.join(dir,'视频 spaces & semi; $literal.mkv');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=32x32:d=0.5','-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:v','ffv1','-c:a','pcm_s16le','-shortest',input]);
  const before=await readFile(input);
  await service.addFiles([input],{kind:'audio',format:'flac'});
  const task=service.list()[0];assert.equal(task.status,'ready');assert.ok(task.plan.warnings.some(w=>w.includes('Video')));
  service.start(task.id);service.start(task.id);
  await waitFor(()=>service.list()[0].status==='done'||service.list()[0].status==='failed');
  const done=service.list()[0];assert.equal(done.status,'done',done.error);
  assert.equal((await adapter.probe(done.outputPath)).state.audioCodec,'flac');
  assert.deepEqual(await readFile(input),before);
  assert.equal((await readdir(dir)).some(n=>n.startsWith('.formatbay-')),false);
  const silent=path.join(dir,'silent.mkv');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=32x32:d=0.1','-c:v','ffv1',silent]);
  await service.addFiles([silent],{kind:'audio',format:'flac'});
  assert.equal(service.list()[1].status,'blocked');assert.match(service.list()[1].error,/no audio/);
  const bad=path.join(dir,'bad.wav');await writeFile(bad,'not media');
  await service.addFiles([bad],{kind:'audio',format:'flac'});assert.equal(service.list()[2].status,'blocked');
 } finally {await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('fake executor: queue, cancellation, failed validation and cleanup',async()=>{
 const dir=await temp();let started=0,release;
 const beforeListener=new Promise(resolve=>{release=resolve;});
 const input=path.join(dir,'in.a');await writeFile(input,'input');
 const state={kind:'audio',format:'a',hasAudio:true,hasVideo:false,audioCodec:'a'};
 const output={...state,format:'b',audioCodec:'b'};
 const adapter={discover:async()=>({id:'fake',available:true}),formats:()=>['b'],capabilities:()=>[{id:'fake',toolId:'fake',label:'fake',loss:0,accepts:s=>s.format==='a',output:()=>output}],
 probe:async file=>({state:file===input?state:output,size:5,duration:1}),
 execute:async(step,source,dest,{signal})=>{started++;await writeFile(dest,'partial');await beforeListener;await new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error('abort'));else signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true});});}};
 const service=new ConversionService({adapter});
 try {
  await service.initialize();await service.addFiles([input,input],{kind:'audio',format:'b'});
  const [a,b]=service.list();service.start(a.id);service.start(b.id);
  await waitFor(()=>started===1);assert.equal(service.list()[1].status,'queued');
  // Deliberately cancel while the fake tool is still awaiting file I/O.
  service.cancel(b.id);service.cancel(a.id);release();
  await waitFor(()=>service.list()[0].status==='cancelled');
  assert.equal(started,1);assert.equal((await readdir(dir)).some(n=>n.startsWith('.formatbay-')),false);
  service.remove(a.id);assert.equal(service.list().length,1);
 }finally{release();await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('real FFmpeg: every advertised target produces verified output, including same-format copy',async t=>{
 const adapter=new FFmpegAdapter();
 if (!(await adapter.discover()).available) return t.skip('FFmpeg/ffprobe unavailable');
 const dir=await temp(),service=new ConversionService({adapter});
 try {
  const {outputFormats}=await service.initialize();
  const input=path.join(dir,'source.wav');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.2','-c:a','pcm_s16le',input]);
  for(const format of outputFormats.Audio)await service.addFiles([input],{kind:'audio',format});
  for(const task of service.list())service.start(task.id);
  await waitFor(()=>service.list().every(task=>['done','failed'].includes(task.status)));
  for(const task of service.list())assert.equal(task.status,'done',`${task.target.format}: ${task.error}`);
  assert.equal(service.list().find(task=>task.target.format==='wav').plan.steps[0].capabilityId,'ffmpeg:copy:wav');
  assert.equal((await readdir(dir)).some(name=>name.startsWith('.formatbay-')),false);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('failed intermediate validation never publishes, and changed source requires reimport',async()=>{
 const dir=await temp();const input=path.join(dir,'in.a');await writeFile(input,'original');
 const state={kind:'audio',format:'a',hasAudio:true,hasVideo:false,audioCodec:'a'};
 const output={...state,format:'b',audioCodec:'b'};
 const adapter={discover:async()=>({id:'fake',available:true}),formats:()=>['b'],capabilities:()=>[{id:'fake',toolId:'fake',label:'fake',loss:0,accepts:s=>s.format==='a',output:()=>output}],
 probe:async()=>({state,size:8,duration:1}),execute:async(_s,_i,out)=>writeFile(out,'wrong')};
 const service=new ConversionService({adapter});
 try{
  await service.initialize();await service.addFiles([input],{kind:'audio',format:'b'});
  service.start(service.list()[0].id);await waitFor(()=>service.list()[0].status==='failed');
  assert.match(service.list()[0].error,/did not match/);assert.deepEqual(await readdir(dir),['in.a']);
  await service.addFiles([input],{kind:'audio',format:'b'});await writeFile(input,'changed content');
  service.start(service.list()[1].id);await waitFor(()=>service.list()[1].status==='failed');
  assert.match(service.list()[1].error,/changed since planning/);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('missing tools are explicit and do not advertise pretend formats',async()=>{
 const adapter=new FFmpegAdapter({runner:async()=>{throw new Error('not found');}});
 const service=new ConversionService({adapter});
 const result=await service.initialize();
 assert.equal(result.tools[0].available,false);assert.deepEqual(result.outputFormats.Audio,[]);
 await assert.rejects(service.addFiles([path.join(os.tmpdir(),'no-file')],{kind:'audio',format:'mp3'}),/unavailable tool/);
});

test('executor dispatches a multi-tool A → F → L plan and validates every intermediate',async()=>{
 const dir=await temp(),input=path.join(dir,'video.a');await writeFile(input,'video');
 const states={a:{kind:'video',format:'a',hasAudio:true,hasVideo:true,audioCodec:'x'},f:{kind:'audio',format:'f',hasAudio:true,hasVideo:false,audioCodec:'f'},l:{kind:'audio',format:'l',hasAudio:true,hasVideo:false,audioCodec:'l'}};
 const calls=[];
 const make=(id,from,to)=>({discover:async()=>({id,available:true}),formats:()=>[to],
  capabilities:()=>[{id:id+':convert',toolId:id,label:id,loss:0,accepts:s=>s.format===from,output:()=>states[to]}],
  probe:async file=>({state:states[path.extname(file).slice(1)],size:5,duration:1}),
  execute:async(step,source,out)=>{calls.push({id,input:await readFile(source,'utf8')});await writeFile(out,to);}});
 const service=new ConversionService({adapters:[make('A','a','f'),make('B','f','l')]});
 try{
  await service.initialize();await service.addFiles([input],{kind:'audio',format:'l'});
  const task=service.list()[0];assert.equal(task.plan.steps.length,2);service.start(task.id);
  await waitFor(()=>['done','failed'].includes(service.list()[0].status));
  assert.equal(service.list()[0].status,'done',service.list()[0].error);
  assert.deepEqual(calls,[{id:'A',input:'video'},{id:'B',input:'f'}]);
  assert.equal(await readFile(service.list()[0].outputPath,'utf8'),'l');
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('real FFmpeg: multichannel encoding declares and validates stereo downmix',async t=>{
 const adapter=new FFmpegAdapter();if (!(await adapter.discover()).available) return t.skip('FFmpeg unavailable');
 const dir=await temp(),service=new ConversionService({adapter});
 try {
  await service.initialize();if (!adapter.formats().includes('mp3'))return t.skip('MP3 encoder unavailable');
  const input=path.join(dir,'surround.wav');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','anullsrc=r=48000:cl=5.1','-t','0.2','-c:a','pcm_s16le',input]);
  await service.addFiles([input],{kind:'audio',format:'mp3'});
  const task=service.list()[0];assert.equal(task.plan.input.audioChannels,6);assert.equal(task.plan.steps.at(-1).output.audioChannels,2);
  assert.ok(task.plan.warnings.some(w=>w.includes('downmixed')));
  service.start(task.id);await waitFor(()=>['done','failed'].includes(service.list()[0].status));
  assert.equal(service.list()[0].status,'done',service.list()[0].error);
  assert.equal((await adapter.probe(service.list()[0].outputPath)).state.audioChannels,2);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('real FFmpeg: corrupted audio fails without publishing transcodes or stream copies',async t=>{
 const adapter=new FFmpegAdapter();if (!(await adapter.discover()).available) return t.skip('FFmpeg unavailable');
 const dir=await temp(),service=new ConversionService({adapter});
 try {
  await service.initialize();const input=path.join(dir,'damaged.flac');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=5','-c:a','flac',input]);
  const bytes=await readFile(input);bytes.fill(0,Math.floor(bytes.length*.45),Math.floor(bytes.length*.65));await writeFile(input,bytes);
  for(const format of ['wav','flac'])await service.addFiles([input],{kind:'audio',format});
  for(const task of service.list()) {assert.equal(task.status,'ready');service.start(task.id);}
  await waitFor(()=>service.list().every(task=>['done','failed'].includes(task.status)));
  for(const task of service.list()){assert.equal(task.status,'failed',task.target.format);assert.equal(task.outputPath,null);}
  assert.deepEqual(await readdir(dir),['damaged.flac']);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('full-decode verification rejects a duration mismatch even with a successful tool exit',async()=>{
 const adapter=new FFmpegAdapter({runner:async(_command,_args,options)=>{
  options.onStdout('out_time_us=3000000\nprogress=end\n');return {stdout:'',stderr:''};
 }});
 await assert.rejects(adapter.verify(path.join(os.tmpdir(),'output.wav'),{expectedDuration:5}),/duration/);
 await assert.doesNotReject(adapter.verify(path.join(os.tmpdir(),'output.wav'),{expectedDuration:3}));
});

test('backend snapshots carry increasing revisions and isolated task data',()=>{
 const pushes=[];const service=new ConversionService({onChange:(tasks,revision)=>pushes.push({tasks,revision})});
 assert.deepEqual(service.snapshot(),{revision:0,tasks:[]});
 service.tasks.set('test',{id:'test',status:'ready'});service.emit();
 const first=service.snapshot();assert.equal(first.revision,1);assert.equal(pushes[0].revision,1);
 first.tasks[0].status='tampered';assert.equal(service.list()[0].status,'ready');
 service.cancel('test');assert.equal(service.snapshot().revision,2);assert.equal(service.snapshot().tasks[0].status,'cancelled');
 service.remove('test');assert.equal(service.snapshot().revision,3);assert.deepEqual(service.snapshot().tasks,[]);
 assert.deepEqual(pushes.map(item=>item.revision),[1,2,3]);
});

test('terminal snapshot is published only after cleanup settles',async()=>{
 const dir=await temp(),input=path.join(dir,'in.a');await writeFile(input,'source');
 const state={kind:'audio',format:'a',hasAudio:true,hasVideo:false,audioCodec:'a'},output={...state,format:'b',audioCodec:'b'};
 const adapter={discover:async()=>({id:'fake',available:true}),formats:()=>['b'],capabilities:()=>[{id:'fake',toolId:'fake',label:'fake',loss:0,accepts:s=>s.format==='a',output:()=>output}],
 probe:async file=>({state:file===input?state:output,size:6,duration:1}),execute:async(_step,_input,destination)=>writeFile(destination,'output')};
 let release,cleaning=false;const gate=new Promise(resolve=>{release=resolve;});const pushes=[];
 const service=new ConversionService({adapter,onChange:(tasks,revision)=>pushes.push({tasks,revision}),cleanup:async directory=>{cleaning=true;await gate;await rm(directory,{recursive:true,force:true});}});
 try {
  await service.initialize();await service.addFiles([input],{kind:'audio',format:'b'});const id=service.list()[0].id;service.start(id);
  await waitFor(()=>cleaning);
  const pending=service.snapshot();assert.equal(pending.tasks[0].status,'running');assert.equal(pending.tasks[0].outputPath,null);
  assert.deepEqual(pending,pushes.at(-1));assert.throws(()=>service.remove(id),/Cancel/);
  release();await waitFor(()=>service.list()[0].status==='done');
  const settled=service.snapshot();assert.ok(settled.revision>pending.revision);assert.ok(settled.tasks[0].outputPath);
  assert.equal((await readdir(dir)).some(name=>name.startsWith('.formatbay-')),false);
 }finally{release();await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('stream-copy capability validates the original before a tool can hide damaged packets',async()=>{
 const dir=await temp(),input=path.join(dir,'in.a');await writeFile(input,'damaged');let executed=false;
 const state={kind:'audio',format:'a',hasAudio:true,hasVideo:false,audioCodec:'a'};
 const adapter={discover:async()=>({id:'fake',available:true}),formats:()=>['a'],capabilities:()=>[{id:'copy',toolId:'fake',label:'copy',loss:0,verifyInput:true,accepts:()=>true,output:()=>state}],
 probe:async()=>({state,size:7,duration:1}),verify:async()=>{throw new Error('Damaged original');},execute:async()=>{executed=true;}};
 const service=new ConversionService({adapter});
 try{
  await service.initialize();await service.addFiles([input],{kind:'audio',format:'a'});service.start(service.list()[0].id);
  await waitFor(()=>service.list()[0].status==='failed');assert.equal(executed,false);assert.match(service.list()[0].error,/Damaged original/);
  assert.equal(service.list()[0].outputPath,null);assert.deepEqual(await readdir(dir),['in.a']);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('verification rejects error-level diagnostics even if a tool exits successfully',async()=>{
 const adapter=new FFmpegAdapter({runner:async()=>({stdout:'',stderr:'Error decoding a damaged frame'})});
 await assert.rejects(adapter.verify(path.join(os.tmpdir(),'output.wav')),/decoding errors/);
});

test('conversion rejects error-level diagnostics even with a successful tool exit',async()=>{
 const adapter=new FFmpegAdapter({runner:async()=>({stdout:'',stderr:'Error reading a damaged packet'})});
 adapter.available=true;adapter.encoders=new Set(['pcm_s16le']);adapter.decoders=new Set(['pcm_s16le']);adapter.muxers=new Set(['wav']);
 await assert.rejects(adapter.execute({capabilityId:'ffmpeg:copy:wav',output:{format:'wav'}},path.join(os.tmpdir(),'input.wav'),path.join(os.tmpdir(),'output.wav')),/conversion errors/);
});

import {access} from 'node:fs/promises';
import {runProcess} from './process.js';

/** Optional Xiph opus-tools adapter. All inputs/outputs are local task-owned paths. */
export class OpusencAdapter {
  constructor({command='opusenc',runner=runProcess}={}) {
    this.command=command;this.runner=runner;this.available=false;this.version='';
  }
  async discover() {
    try {
      const result=await this.runner(this.command,['--version'],{timeout:10000});
      this.version=(result.stdout||result.stderr).trim().split('\n')[0];
      if (!/opusenc/i.test(this.version)) throw new Error('Unexpected opusenc version response');
      this.available=true;
      return {id:'opusenc',available:true,optional:true,detail:this.version};
    } catch {
      this.available=false;
      return {id:'opusenc',available:false,optional:true,detail:'Optional: install Xiph opus-tools (opusenc) on PATH and restart to enable this encoder. Automatic FFmpeg conversions remain available.'};
    }
  }
  formats() {return this.available?['opus']:[];}
  capabilities() {
    if (!this.available) return [];
    return [{id:'opusenc:encode:opus',toolId:'opusenc',toolVersion:this.version,
      label:'Encode audio to OPUS with opusenc',available:true,network:false,loss:1,
      accepts:state=>state.kind==='audio' && state.hasAudio && !state.hasVideo &&
        state.audioChannels>=1 && state.audioChannels<=8 &&
        ((state.format==='flac' && state.audioCodec==='flac') ||
         (state.format==='wav' && ['pcm_s16le','pcm_s24le','pcm_s32le','pcm_f32le'].includes(state.audioCodec))),
      output:state=>({kind:'audio',format:'opus',audioCodec:'opus',hasAudio:true,hasVideo:false,audioChannels:state.audioChannels}),
      warnings:()=>['Lossy Opus encoding can reduce audio quality.','Metadata, chapters and embedded artwork are not retained.','Opus uses a 48 kHz output sample rate.'],
    }];
  }
  async execute(step,inputPath,outputPath,{signal}={}) {
    const edge=this.capabilities().find(item=>item.id===step.capabilityId);
    if (!edge || !edge.accepts(step.input) || step.output.format!=='opus') throw new Error('Unsupported opusenc step');
    // opusenc normally overwrites files. The service supplies a unique private
    // temp path; additionally refuse any pre-existing path before invoking it.
    try {await access(outputPath);throw new Error('Intermediate output already exists');}
    catch(error) {if(error.code!=='ENOENT')throw error;}
    await this.runner(this.command,['--quiet','--discard-comments','--discard-pictures',inputPath,outputPath],
      {signal,timeout:24*60*60*1000});
  }
}

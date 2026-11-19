import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {OpusencAdapter} from '../src/backend/conversion/opusenc.js';
import {FFmpegAdapter} from '../src/backend/conversion/ffmpeg.js';
import {ConversionService} from '../src/backend/conversion/service.js';
import {planConversion} from '../src/backend/conversion/planner.js';
import {runProcess} from '../src/backend/conversion/process.js';
const waitFor=async(fn)=>{for(let i=0;i<1200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Timed out');};
const audio={kind:'audio',format:'wav',audioCodec:'pcm_s16le',hasAudio:true,hasVideo:false,audioChannels:2};

test('opusenc capability is specific and unavailable tools do not advertise output',async()=>{
 const missing=new OpusencAdapter({runner:async()=>{throw new Error('missing');}});
 assert.equal((await missing.discover()).available,false);assert.deepEqual(missing.formats(),[]);
 const adapter=new OpusencAdapter({runner:async()=>({stdout:'opusenc opus-tools 0.2',stderr:''})});
 assert.equal((await adapter.discover()).optional,true);
 const [edge]=adapter.capabilities();assert.equal(edge.accepts(audio),true);
 for(const state of [{...audio,kind:'video',hasVideo:true},{...audio,audioCodec:'mp3'},{...audio,audioChannels:9}])assert.equal(edge.accepts(state),false);
});

test('required final encoder cannot be replaced by a shorter different encoder',()=>{
 const state={...audio,format:'source'},target={kind:'audio',format:'opus'};
 const edge=(id,input,format)=>({id,toolId:id,label:id,loss:0,accepts:s=>s.format===input,output:()=>({...audio,format})});
 const edges=[edge('direct','source','opus'),edge('decode','source','wav'),edge('opusenc','wav','opus')];
 assert.equal(planConversion(state,target,edges).steps.length,1);
 assert.deepEqual(planConversion(state,target,edges,{requiredFinalTool:'opusenc'}).steps.map(s=>s.toolId),['decode','opusenc']);
 assert.equal(planConversion(state,target,edges,{requiredFinalTool:'absent'}).ok,false);
});

test('real FFmpeg → opusenc route, automatic direct route and verified output phases',async t=>{
 const ffmpeg=new FFmpegAdapter(),opusenc=new OpusencAdapter();
 if(!(await ffmpeg.discover()).available||!(await opusenc.discover()).available)return t.skip('FFmpeg and opusenc required');
 const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-音频 & chain-'));
 const phases=[];const service=new ConversionService({adapters:[ffmpeg,opusenc],onChange:tasks=>phases.push(...tasks.filter(t=>t.phase).map(t=>[t.phase,t.stepIndex]))});
 try{
  const catalog=await service.initialize();assert.deepEqual(catalog.targetEncoders,{opus:['opusenc']});
  const input=path.join(dir,'video a; literal.mkv');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=32x32:d=0.7','-f','lavfi','-i','sine=frequency=440:duration=0.7','-c:v','ffv1','-c:a','pcm_s16le','-shortest',input]);
  await service.addFiles([input],{kind:'audio',format:'opus'});
  await service.addFiles([input],{kind:'audio',format:'opus',encoder:'opusenc'});
  const [automatic,chain]=service.list();
  assert.equal(automatic.plan.steps.length,1);assert.equal(automatic.plan.steps[0].toolId,'ffmpeg');
  assert.deepEqual(chain.plan.steps.map(s=>s.toolId),['ffmpeg','opusenc']);
  assert.ok(['flac','wav'].includes(chain.plan.steps[0].output.format));
  for(const task of service.list())service.start(task.id);
  await waitFor(()=>service.list().every(task=>['done','failed'].includes(task.status)));
  for(const task of service.list()){
   assert.equal(task.status,'done',task.error);assert.equal((await ffmpeg.probe(task.outputPath)).state.audioCodec,'opus');
  }
  assert.ok(phases.some(([phase,step])=>phase==='converting'&&step===1));
  assert.ok(phases.some(([phase,step])=>phase==='verifying'&&step===1));
  assert.equal((await readdir(dir)).some(n=>n.startsWith('.formatbay-')),false);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('same-format Opus uses direct FFmpeg copy and rejects a forced opusenc round-trip',async t=>{
 const ffmpeg=new FFmpegAdapter(),opusenc=new OpusencAdapter();
 if(!(await ffmpeg.discover()).available||!(await opusenc.discover()).available)return t.skip('FFmpeg and opusenc required');
 const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-same-opus-'));
 const service=new ConversionService({adapters:[ffmpeg,opusenc]});
 try {
  await service.initialize();
  const source=path.join(dir,'source.opus');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','anullsrc=r=48000:cl=3.0','-t','0.35','-c:a','libopus','-mapping_family','1',source]);
  await service.addFiles([source],{kind:'audio',format:'opus'});
  await service.addFiles([source],{kind:'audio',format:'opus',encoder:'opusenc'});
  const [direct,forced]=service.list();
  assert.deepEqual(direct.plan.steps.map(step=>step.capabilityId),['ffmpeg:copy:opus']);
  assert.equal(forced.status,'blocked');
  assert.match(forced.error,/one compatible tool in one step/);
 } finally {await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('real fallback chains tools when FFmpeg Opus encoding is unavailable',async t=>{
 class NoOpusEncoder extends FFmpegAdapter {
  formats(){return super.formats().filter(format=>format!=='opus');}
 }
 const ffmpeg=new NoOpusEncoder(),opusenc=new OpusencAdapter();
 if(!(await ffmpeg.discover()).available||!(await opusenc.discover()).available)return t.skip('FFmpeg and opusenc required');
 const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-fallback-')),service=new ConversionService({adapters:[ffmpeg,opusenc]});
 try {
  const catalog=await service.initialize();assert.ok(catalog.outputFormats.Audio.includes('opus'));
  const input=path.join(dir,'source.mp3');await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=0.3','-c:a','libmp3lame',input]);
  await service.addFiles([input],{kind:'audio',format:'opus'});const task=service.list()[0];
  assert.deepEqual(task.plan.steps.map(s=>s.toolId),['ffmpeg','opusenc']);service.start(task.id);
  await waitFor(()=>['done','failed'].includes(service.list()[0].status));assert.equal(service.list()[0].status,'done',service.list()[0].error);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('real direct opusenc route rejects corrupted source before encoding',async t=>{
 const ffmpeg=new FFmpegAdapter(),opusenc=new OpusencAdapter();
 if(!(await ffmpeg.discover()).available||!(await opusenc.discover()).available)return t.skip('FFmpeg and opusenc required');
 const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-opus-corrupt-')),service=new ConversionService({adapters:[ffmpeg,opusenc]});
 try{
  await service.initialize();const input=path.join(dir,'damaged.flac');await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=5','-c:a','flac',input]);
  const bytes=await readFile(input);bytes.fill(0,Math.floor(bytes.length*.45),Math.floor(bytes.length*.65));await writeFile(input,bytes);
  await service.addFiles([input],{kind:'audio',format:'opus',encoder:'opusenc'});const task=service.list()[0];
  assert.equal(task.plan.steps.length,1);assert.equal(task.plan.steps[0].toolId,'opusenc');service.start(task.id);
  await waitFor(()=>['done','failed'].includes(service.list()[0].status));assert.equal(service.list()[0].status,'failed');assert.equal(service.list()[0].outputPath,null);
  assert.deepEqual(await readdir(dir),['damaged.flac']);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('optional encoder selection is rejected when unavailable and primary probing remains mandatory',async()=>{
 const missing=new FFmpegAdapter({runner:async()=>{throw new Error('missing');}});
 const opusenc=new OpusencAdapter({runner:async()=>({stdout:'opusenc opus-tools 0.2',stderr:''})});
 const service=new ConversionService({adapters:[missing,opusenc]});
 const catalog=await service.initialize();assert.deepEqual(catalog.outputFormats.Audio,[]);assert.deepEqual(catalog.targetEncoders,{});
 await assert.rejects(service.addFiles([path.join(os.tmpdir(),'test.wav')],{kind:'audio',format:'opus',encoder:'opusenc'}),/unavailable tool/);
});

test('second-step failure or cancellation cleans intermediate outputs and never publishes',async t=>{
 const ffmpeg=new FFmpegAdapter();if(!(await ffmpeg.discover()).available)return t.skip('FFmpeg required');
 for(const cancel of [false,true]) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-chain-stop-'));let began=false;
  const opusenc=new OpusencAdapter({runner:async(_command,args,{signal}={})=>{
   if(args[0]==='--version')return {stdout:'opusenc opus-tools 0.2',stderr:''};
   began=true;await writeFile(args.at(-1),'partial');
   if(!cancel)throw new Error('Injected opusenc failure');
   await new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error('Cancelled'));else signal.addEventListener('abort',()=>reject(new Error('Cancelled')),{once:true});});
  }});
  const service=new ConversionService({adapters:[ffmpeg,opusenc]});
  try{
   await service.initialize();const input=path.join(dir,'source.mp3');
   await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=0.2','-c:a','libmp3lame',input]);
   await service.addFiles([input],{kind:'audio',format:'opus',encoder:'opusenc'});const task=service.list()[0];
   assert.equal(task.plan.steps.length,2);service.start(task.id);
   await waitFor(()=>began);if(cancel)service.cancel(task.id);
   await waitFor(()=>['failed','cancelled'].includes(service.list()[0].status));
   assert.equal(service.list()[0].status,cancel?'cancelled':'failed');assert.equal(service.list()[0].outputPath,null);
   assert.deepEqual(await readdir(dir),['source.mp3']);
  }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
 }
});

test('opusenc is not advertised when the primary verifier cannot decode Opus',async()=>{
 const primary={discover:async()=>({id:'ffmpeg',available:true}),canDecode:()=>false,formats:()=>['wav'],capabilities:()=>[]};
 const optional=new OpusencAdapter({runner:async()=>({stdout:'opusenc opus-tools 0.2',stderr:''})});
 const service=new ConversionService({adapters:[primary,optional]});
 const catalog=await service.initialize();assert.deepEqual(catalog.outputFormats.Audio,['wav']);assert.deepEqual(catalog.targetEncoders,{});
 assert.equal(catalog.tools[1].available,false);assert.match(catalog.tools[1].detail,/decoder/);
});

test('missing opusenc diagnostic does not claim it is installed when decoder is also absent',async()=>{
 const primary={discover:async()=>({id:'ffmpeg',available:true}),canDecode:()=>false,formats:()=>['wav'],capabilities:()=>[]};
 const optional=new OpusencAdapter({runner:async()=>{throw new Error('missing');}});
 const catalog=await new ConversionService({adapters:[primary,optional]}).initialize();
 assert.equal(catalog.tools[1].available,false);assert.match(catalog.tools[1].detail,/install Xiph/);assert.doesNotMatch(catalog.tools[1].detail,/is installed/);
});

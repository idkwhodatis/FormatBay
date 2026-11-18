import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {audioLayout,hasCanonicalLayout} from '../src/backend/conversion/audio-layout.js';
import {FFmpegAdapter} from '../src/backend/conversion/ffmpeg.js';
import {OpusencAdapter} from '../src/backend/conversion/opusenc.js';
import {ConversionService} from '../src/backend/conversion/service.js';
import {planConversion} from '../src/backend/conversion/planner.js';
import {runProcess} from '../src/backend/conversion/process.js';
const waitFor=async(fn)=>{for(let i=0;i<1200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Timed out');};

test('speaker layout is not inferred from multichannel counts',()=>{
 assert.equal(audioLayout({audioChannels:1}),'mono');assert.equal(audioLayout({audioChannels:2}),'stereo');
 assert.equal(audioLayout({audioChannels:3}),'');
 assert.equal(hasCanonicalLayout({audioChannels:3,audioLayout:'2.1'}),false);
 assert.equal(hasCanonicalLayout({audioChannels:4,audioLayout:'quad'}),true);
 assert.equal(hasCanonicalLayout({audioChannels:6,audioLayout:'5.1(side)'}),false);
});

test('layout goal prevents a lossy stereo intermediate from laundering unsupported speakers',()=>{
 const input={kind:'audio',format:'wav',hasAudio:true,audioChannels:3,audioLayout:'2.1'};
 const edge=(id,from,to,layout)=>({id,toolId:id,label:id,loss:1,accepts:state=>state.format===from,
  output:()=>({...input,format:to,audioLayout:layout,audioChannels:layout==='stereo'?2:3})});
 const edges=[edge('downmix','wav','mp3','stereo'),edge('encode','mp3','opus','stereo')];
 assert.equal(planConversion(input,{kind:'audio',format:'opus'},edges).ok,true);
 assert.equal(planConversion(input,{kind:'audio',format:'opus'},edges,{requiredAudioLayout:'2.1'}).ok,false);
 edges.push(edge('preserving','wav','opus','2.1'));
 const plan=planConversion(input,{kind:'audio',format:'opus'},edges,{requiredAudioLayout:'2.1'});
 assert.equal(plan.steps[0].toolId,'preserving');
});

test('real quad layout is preserved; 2.1 Opus cannot silently relabel LFE or launder via stereo',async t=>{
 const ffmpeg=new FFmpegAdapter(),opusenc=new OpusencAdapter();
 if(!(await ffmpeg.discover()).available||!(await opusenc.discover()).available)return t.skip('FFmpeg and opusenc required');
 const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-layout-')),service=new ConversionService({adapters:[ffmpeg,opusenc]});
 try {
  await service.initialize();
  const unknown={kind:'audio',format:'wav',hasAudio:true,hasVideo:false,audioCodec:'pcm_s16le',audioChannels:3,audioLayout:''};
  assert.equal(planConversion(unknown,{kind:'audio',format:'opus'},service.capabilities,{requiredAudioLayout:''}).ok,false);
  for(const layout of ['quad','5.1','3.0','2.1']) {
   const input=path.join(dir,layout+'.wav');
   await runProcess('ffmpeg',['-v','error','-f','lavfi','-i',`anullsrc=r=48000:cl=${layout}`,'-t','0.2','-c:a','pcm_s16le',input]);
   assert.equal((await ffmpeg.probe(input)).state.audioLayout,layout);
   for(const encoder of [undefined,'opusenc'])await service.addFiles([input],{kind:'audio',format:'opus',...(encoder?{encoder}:{})});
  }
  const [autoQuad,opusQuad,autoSurround,opusSurround,autoThree,opusThree,...unsupported]=service.list();
  assert.equal(autoQuad.status,'ready');assert.equal(opusQuad.status,'ready');
  assert.deepEqual(autoQuad.plan.steps.map(s=>s.toolId),['ffmpeg']);
  assert.deepEqual(opusQuad.plan.steps.map(s=>s.toolId),['opusenc']);
  for(const task of unsupported){assert.equal(task.status,'blocked');assert.equal(task.outputPath,null);}
  assert.deepEqual(opusThree.plan.steps.map(s=>s.toolId),['ffmpeg','opusenc']);
  for(const task of [autoQuad,opusQuad,autoSurround,opusSurround,autoThree,opusThree]) {assert.equal(task.status,'ready');service.start(task.id);}
  await waitFor(()=>service.list().filter(t=>t.plan).every(t=>['done','failed'].includes(t.status)));
  for(const task of service.list().filter(t=>t.plan)) {
   assert.equal(task.status,'done',task.error);
   assert.equal((await ffmpeg.probe(task.outputPath)).state.audioLayout,path.parse(task.inputPath).name);
  }
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('opusenc refuses warnings about blind speaker mapping',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-layout-warning-'));
 const adapter=new OpusencAdapter({runner:async(_c,args)=>args[0]==='--version'?{stdout:'opusenc test',stderr:''}:{stdout:'',stderr:'WARNING: Unknown WAV surround channel mask. Blindly mapping speakers.'}});
 try {
  await adapter.discover();const state={kind:'audio',format:'wav',hasAudio:true,hasVideo:false,audioChannels:2,audioLayout:'stereo',audioCodec:'pcm_s16le'};
  const edge=adapter.capabilities()[0];
  await assert.rejects(adapter.execute({capabilityId:edge.id,input:state,output:edge.output(state)},path.join(dir,'input.wav'),path.join(dir,'output.opus')),/safely preserve/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('equal channel count cannot hide a wrong output speaker layout',async()=>{
 const {writeFile,readdir}=await import('node:fs/promises');
 const dir=await realpath(await mkdtemp(path.join(os.tmpdir(),'formatbay-layout-verify-'))),input=path.join(dir,'source.a');await writeFile(input,'source');
 const state={kind:'audio',format:'a',hasAudio:true,hasVideo:false,audioCodec:'a',audioChannels:3,audioLayout:'2.1'};
 const planned={...state,format:'b',audioCodec:'b'},actual={...planned,audioLayout:'3.0'};
 const adapter={discover:async()=>({id:'fake',available:true}),formats:()=>['b'],
  capabilities:()=>[{id:'convert',toolId:'fake',label:'convert',loss:0,accepts:s=>s.format==='a',output:()=>planned}],
  probe:async file=>({state:file===input?state:actual,size:6,duration:1}),
  execute:async(_step,_input,output)=>writeFile(output,'wrong speakers')};
 const service=new ConversionService({adapter});
 try{
  await service.initialize();await service.addFiles([input],{kind:'audio',format:'b'});const task=service.list()[0];assert.equal(task.status,'ready',task.error);service.start(task.id);
  await waitFor(()=>['done','failed'].includes(service.list()[0].status));
  assert.equal(service.list()[0].status,'failed');assert.match(service.list()[0].error,/did not match/);
  assert.equal(service.list()[0].outputPath,null);assert.deepEqual(await readdir(dir),['source.a']);
 }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ConversionService} from '../src/backend/conversion/service.js';
import {runProcess} from '../src/backend/conversion/process.js';

const inspect=async file=>JSON.parse((await runProcess('ffprobe',['-v','error','-show_streams','-of','json',file])).stdout).streams;
async function finished(service) {
  for(let retries=0;retries<500;retries++){
    const task=service.list()[0];
    if(['done','failed','cancelled'].includes(task?.status)) return task;
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  assert.fail('Conversion did not reach a terminal state');
}

test('service remuxes MKV in one step, preserves tracks, and applies the captured default audio choice',async t=>{
  const service=new ConversionService();
  t.after(()=>service.shutdown());
  const data=await service.initialize();
  if(!data.tools[0].available)return t.skip('FFmpeg and ffprobe required');
  assert.ok(data.outputFormats.Video.includes('mkv'));
  assert.equal(data.targetOptions.video.mkv.defaultTracks,true);
  const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-mkv-config-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const input=path.join(dir,'source.mkv'),sub=path.join(dir,'caption.srt');
  const occupied=path.join(dir,'source-converted.mkv');
  await writeFile(sub,'1\n00:00:00,000 --> 00:00:00,280\ncaption\n');
  await writeFile(occupied,'existing destination');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','color=s=32x32:r=12:d=0.3',
    '-f','lavfi','-i','sine=frequency=440:duration=0.3','-f','lavfi','-i','sine=frequency=550:duration=0.3',
    '-i',sub,'-map','0:v','-map','1:a','-map','2:a','-map','3:s','-c:v','ffv1','-c:a','pcm_s16le',
    '-c:s','srt','-disposition:a:0','default','-disposition:a:1','0',input]);
  const original=await readFile(input);
  const target={kind:'video',format:'mkv',options:{defaultAudioTrack:1}};
  await service.addFiles([input],target);
  target.options.defaultAudioTrack=0;
  const ready=service.list()[0];
  assert.equal(ready.status,'ready',ready.error);
  assert.equal(ready.plan.steps.length,1);
  assert.equal(ready.plan.steps[0].toolId,'ffmpeg');
  assert.equal(ready.target.options.defaultAudioTrack,1);
  service.start(ready.id);
  const done=await finished(service);
  assert.equal(done.status,'done',done.error);
  assert.equal(path.basename(done.outputPath),'source-converted-1.mkv');
  const streams=await inspect(done.outputPath);
  assert.deepEqual(streams.map(s=>s.codec_name),['ffv1','pcm_s16le','pcm_s16le','subrip']);
  assert.deepEqual(streams.filter(s=>s.codec_type==='audio').map(s=>s.disposition.default),[0,1]);
  assert.deepEqual(await readFile(input),original);
  assert.equal(await readFile(occupied,'utf8'),'existing destination');
});

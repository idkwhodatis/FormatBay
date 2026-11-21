import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ConversionService} from '../src/backend/conversion/service.js';
import {runProcess} from '../src/backend/conversion/process.js';
const marker='FORMATBAY_SOURCE_METADATA';
const inspect=async file=>JSON.parse((await runProcess('ffprobe',['-v','error','-show_streams','-show_format','-show_chapters','-of','json',file])).stdout);
const waitFor=async fn=>{for(let i=0;i<1200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Conversion timed out');};

test('real conversion explicitly drops source tags, chapters, subtitles and extra audio tracks',async t=>{
 const service=new ConversionService();
 const dir=await realpath(await mkdtemp(path.join(os.tmpdir(),'formatbay-retention-')));
 try {
  const catalog=await service.initialize();
  if(!catalog.outputFormats.Audio?.length||!catalog.targetEncoders.opus?.includes('opusenc'))return t.skip('FFmpeg/ffprobe and opusenc required');
  for(const format of ['aac','flac','mp3','ogg','opus','wav'])assert.ok(catalog.outputFormats.Audio.includes(format));
  const subtitles=path.join(dir,'subtitle.srt'),metadata=path.join(dir,'metadata.txt'),input=path.join(dir,'two-tracks.mkv');
  await writeFile(subtitles,'1\n00:00:00,000 --> 00:00:00,400\nSubtitle content\n');
  await writeFile(metadata,`;FFMETADATA1\ntitle=${marker}\nartist=${marker}\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=400\ntitle=${marker}\n`);
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=16x16:r=10:d=0.4',
   '-f','lavfi','-i','sine=frequency=440:duration=0.4','-f','lavfi','-i','sine=frequency=880:duration=0.4',
   '-i',subtitles,'-f','ffmetadata','-i',metadata,'-map','0:v','-map','1:a','-map','2:a','-map','3:s',
   '-map_metadata','4','-map_chapters','4','-metadata:s:a:0',`title=${marker}`,
   '-metadata:s:a:1',`title=${marker}_SECOND`,'-c:v','ffv1','-c:a','pcm_s16le','-c:s','srt',input]);
  const original=await readFile(input),source=await inspect(input);
  assert.equal(source.streams.filter(s=>s.codec_type==='audio').length,2);
  assert.equal(source.streams.filter(s=>s.codec_type==='subtitle').length,1);
  assert.equal(source.chapters.length,1);
  assert.match(JSON.stringify(source.format.tags),new RegExp(marker));
  assert.match(JSON.stringify(source.streams.find(stream=>stream.codec_type==='audio').tags),new RegExp(marker));
  for(const format of catalog.outputFormats.Audio)await service.addFiles([input],{kind:'audio',format});
  await service.addFiles([input],{kind:'audio',format:'opus',encoder:'opusenc'});
  for(const task of service.list()) {
   assert.equal(task.status,'ready',task.error);
   if(task.target.encoder==='opusenc')assert.deepEqual(task.plan.steps.map(step=>step.toolId),['ffmpeg','opusenc']);
   assert.ok(task.plan.warnings.some(w=>/only the first audio stream/i.test(w)));
   assert.ok(task.plan.warnings.some(w=>/subtitles/i.test(w)));
   assert.ok(task.plan.warnings.some(w=>/Metadata, chapters/.test(w)));
   service.start(task.id);
  }
  await waitFor(()=>service.list().every(task=>['done','failed'].includes(task.status)));
  for(const task of service.list()) {
   assert.equal(task.status,'done',task.error);
   const output=await inspect(task.outputPath);
   assert.deepEqual(output.streams.map(s=>s.codec_type),['audio']);
   assert.equal(output.chapters?.length??0,0);
   assert.doesNotMatch(JSON.stringify(output),new RegExp(marker)); // New encoder tags are allowed.
  }
  const wav=service.list().find(task=>task.target.format==='wav');
  assert.equal(wav.plan.steps[0].capabilityId,'ffmpeg:copy:wav');
  // Prove the selected audio is the FIRST track, not just that one survived.
  const reference=path.join(dir,'first.wav');
  await runProcess('ffmpeg',['-v','error','-i',input,'-map','0:a:0','-map_metadata','-1','-map_chapters','-1','-c:a','copy',reference]);
  const hash=async file=>(await runProcess('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-f','hash','-hash','sha256','-'])).stdout;
  assert.equal(await hash(wav.outputPath),await hash(reference));
  assert.deepEqual(await readFile(input),original);
  // Direct external encoder must discard comments too, not only rely on FFmpeg stripping them.
  const tagged=path.join(dir,'tagged.flac');
  await runProcess('ffmpeg',['-v','error','-i',reference,'-metadata',`title=${marker}`,'-c:a','flac',tagged]);
  assert.match(JSON.stringify(await inspect(tagged)),new RegExp(marker));
  await service.addFiles([tagged],{kind:'audio',format:'opus',encoder:'opusenc'});
  const direct=service.list().at(-1);assert.deepEqual(direct.plan.steps.map(s=>s.toolId),['opusenc']);
  service.start(direct.id);await waitFor(()=>['done','failed'].includes(service.list().at(-1).status));
  const done=service.list().at(-1);assert.equal(done.status,'done',done.error);
  assert.doesNotMatch(JSON.stringify(await inspect(done.outputPath)),new RegExp(marker));
 } finally {await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('audio-only and copy routes warn about every discarded stream class and source metadata',async()=>{
 const {FFmpegAdapter}=await import('../src/backend/conversion/ffmpeg.js');
 const adapter=new FFmpegAdapter();adapter.available=true;
 adapter.encoders=new Set(['pcm_s16le']);adapter.decoders=new Set(['pcm_s16le']);adapter.muxers=new Set(['wav']);
 const state={kind:'audio',format:'wav',audioCodec:'pcm_s16le',hasAudio:true,hasVideo:false,audioChannels:1,audioLayout:'mono'};
 for(const capability of adapter.capabilities()){
  assert.equal(capability.accepts(state),true);
  const warnings=capability.warnings(state).join(' ');
  for(const text of ['first audio stream','additional audio tracks','subtitles','data/attachments','chapters','artwork','from the source','new encoder tags'])assert.ok(warnings.includes(text),text);
 }
});

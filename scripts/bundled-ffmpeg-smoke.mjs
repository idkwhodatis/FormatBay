/** Real end-to-end smoke for every output in the pinned release catalog. */
import assert from 'node:assert/strict';
import {mkdtemp,realpath,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ConversionService} from '../src/backend/conversion/service.js';
import {FFmpegAdapter} from '../src/backend/conversion/ffmpeg.js';
import {BUNDLED_FFMPEG_CONTRACT,verifyBundledFFmpegCapabilities} from '../src/backend/conversion/bundled-ffmpeg-contract.js';
import {runProcess} from '../src/backend/conversion/process.js';

const bundle=process.argv[2]??process.env.FORMATBAY_FFMPEG_BUNDLE;
if(!bundle)throw new Error('Specify the exact pinned FFmpeg bundle root');
const suffix=process.platform==='win32'?'.exe':'';
const ffmpeg=path.resolve(bundle,'bin','ffmpeg'+suffix),ffprobe=path.resolve(bundle,'bin','ffprobe'+suffix);
await verifyBundledFFmpegCapabilities(ffmpeg,ffprobe);
const adapter=new FFmpegAdapter({ffmpeg,ffprobe,bundleContract:BUNDLED_FFMPEG_CONTRACT});
const service=new ConversionService({adapter});
const expected={
  Audio:['wav','flac','mp3','aac','ogg','opus','aiff','m4a','caf','au','ac3'],
  Video:['mp4','mkv','webm','mov','avi','m4v','mpg','ts','flv','wmv','asf','ogv','3gp'],
  Image:['png','jpg','bmp','jp2','ico','gif'],
  Subtitle:['srt','ass','vtt'],
};
const dir=await realpath(await mkdtemp(path.join(tmpdir(),'formatbay release fixtures # ')));
try {
  const catalog=await service.initialize();
  assert.equal(catalog.tools[0].available,true,catalog.tools[0].detail);
  assert.deepEqual(catalog.outputFormats,expected);
  for(const format of ['webm','ogv']) {
    assert.deepEqual(catalog.targetOptions.video[format].videoCodecs,[]);
    assert.equal(catalog.targetOptions.video[format].resize,false);
  }
  const fixture=path.join(dir,'测试 source.mkv'),caption=path.join(dir,'input.srt');
  await writeFile(caption,'1\n00:00:00,200 --> 00:00:01,000\nTest caption\n\n');
  await runProcess(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=96x64:r=25:d=1.6',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.6','-i',caption,
    '-map','0:v:0','-map','1:a:0','-map','2:s:0','-c:v','ffv1','-c:a','pcm_s16le','-c:s','subrip',fixture]);
  const sources=new Map([['main',fixture]]);
  for(const format of ['webm','ogv']) {
    const bytes=await readFile(new URL(`../test/fixtures/bundled-ffmpeg/copy.${format}`,import.meta.url));
    const input=path.join(dir,`copy.${format}`);await writeFile(input,bytes);sources.set(format,input);
  }
  const original=await Promise.all([...sources.values()].map(file=>readFile(file)));
  for(const [category,formats] of Object.entries(expected)) {
    for(const format of formats) {
      const kind=category.toLowerCase();
      const options=kind==='image'?{width:48}:kind==='subtitle'?{subtitleTrack:0}:
        (format==='mkv'&&kind==='video')?{videoCodec:'ffv1',width:48}:undefined;
      const input=sources.get(format)??fixture;
      await service.addFiles([input],{kind,format,...(options?{options}:{})});
      const [task]=service.list();
      assert.equal(task.status,'ready',`${kind}/${format}: ${task.error}`);
      assert.equal(task.plan.steps.length,1);
      if(sources.has(format))assert.equal(task.plan.steps[0].media.rows[0].codec,'copy',format);
      service.start(task.id);
      const deadline=Date.now()+30000;
      while(Date.now()<deadline && ['running','queued'].includes(service.list()[0].status)) {
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      const [result]=service.list();
      assert.equal(result.status,'done',`${kind}/${format}: ${result.status}: ${result.error}`);
      assert.equal(path.extname(result.outputPath),'.'+format);
      if(kind==='subtitle')assert.match(await readFile(result.outputPath,'utf8'),/Test caption/);
      await rm(result.outputPath);
      service.remove(task.id);
      console.log(`Bundled FFmpeg: ${kind}/${format} planned, produced and verified`);
    }
  }
  assert.deepEqual(await Promise.all([...sources.values()].map(file=>readFile(file))),original);
} finally {
  await service.shutdown();
  await rm(dir,{recursive:true,force:true});
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {FFmpegAdapter} from '../src/backend/conversion/ffmpeg.js';
import {FFmpegMediaAdapter} from '../src/backend/conversion/ffmpeg-media.js';
import {
  BUNDLED_FFMPEG_CONTRACT as contract,
  BUNDLED_FFMPEG_REQUIRED_CONFIG as required,
  readBundledFFmpegVersion,
  verifyBundledFFmpegCapabilities,
} from '../src/backend/conversion/bundled-ffmpeg-contract.js';

test('bundled release exposes only its stable codec, format and option profiles',async()=>{
  const calls=[];
  const runner=async(binary,args)=>{
    calls.push([binary,...args]);
    assert.deepEqual(args,['-version']);
    return {stdout:`${binary} version ${contract.version}-formatbay\r\nconfiguration: ignored runtime details`};
  };
  const audio=new FFmpegAdapter({runner,bundleContract:contract});
  assert.equal((await audio.discover()).available,true);
  const media=new FFmpegMediaAdapter(audio);
  assert.deepEqual(await media.discover(),{
    video:['mp4','mkv','webm','mov','avi','m4v','mpg','ts','flv','wmv','asf','ogv','3gp'],
    image:['png','jpg','bmp','jp2','ico','gif'],subtitle:['srt','ass','vtt'],
  });
  assert.deepEqual(audio.formats(),['wav','flac','mp3','aac','ogg','opus','aiff','m4a','caf','au','ac3']);
  assert.deepEqual(calls,[['ffmpeg','-version'],['ffprobe','-version']]);
  const config=media.config();
  assert.deepEqual(config.video.mp4.videoCodecs,['mpeg4']);
  assert.deepEqual(config.video.mkv.videoCodecs,['mpeg4','ffv1']);
  assert.deepEqual(config.video.webm.videoCodecs,[]);
  assert.equal(config.video.webm.resize,false);
  assert.deepEqual(config.video.ogv.videoCodecs,[]);
  assert.deepEqual(config.video.mp4.pixelFormats,{});
  assert.ok(Object.isFrozen(contract)&&Object.isFrozen(contract.encoders)&&Object.isFrozen(required));
});

test('bundled runtime never resolves PATH commands when explicit packaged paths are absent',async()=>{
  const audio=new FFmpegAdapter({bundleContract:contract});
  const state=await audio.discover();
  assert.equal(state.available,false);
  assert.match(state.detail,/explicit absolute paths/);
  assert.deepEqual(audio.formats(),[]);
});

test('packaging checks both independently versioned tools and the fixed feature contract',async()=>{
  const listings={
    '-encoders':[...contract.encoders,'libx264','libx265'].map(name=>` V..... ${name} example`),
    '-decoders':contract.decoders.map(name=>` V...BD ${name} example`),
    '-muxers':contract.muxers.map(name=>`  E  ${name} example`),
    '-demuxers':contract.demuxers.map(name=>` D   ${name} example`),
    '-filters':contract.filters.map((name,index)=>` ${index ? '..C' : '..'} ${name} V->V example`),
  };
  const makeRunner=(missing,ffprobeVersion=contract.version)=>async(binary,args)=>{
    if(args[0]==='-version')return {stdout:`${binary} version ${binary==='ffprobe'?ffprobeVersion:contract.version} snapshot\r\n`};
    const rows=listings[args[1]];
    assert.ok(rows);
    return {stdout:rows.filter(row=>binary!=='ffprobe'||!missing||!row.includes(` ${missing} `)).join('\r\n')};
  };
  assert.deepEqual(await verifyBundledFFmpegCapabilities('ffmpeg','ffprobe',{runner:makeRunner()}),
    {version:contract.version,detail:`ffmpeg version ${contract.version} snapshot`});
  await assert.rejects(verifyBundledFFmpegCapabilities('ffmpeg','ffprobe',{runner:makeRunner('jpeg_pipe')}),/demuxers:jpeg_pipe/);
  await assert.rejects(readBundledFFmpegVersion('ffmpeg','ffprobe',{runner:makeRunner(null,`${contract.version}.9`)}),/Bundled ffprobe must report release/);
  for(const key of ['CONFIG_PNG_ENCODER','CONFIG_IMAGE_PNG_PIPE_DEMUXER','CONFIG_ZLIB','CONFIG_TGP_MUXER','CONFIG_MPEGPS_DEMUXER','CONFIG_MPEG1SYSTEM_MUXER']){
    assert.ok(required.includes(key),key);
  }
});

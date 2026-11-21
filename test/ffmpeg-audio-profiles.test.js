import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FFmpegAdapter,normalizeAudioOptions} from '../src/backend/conversion/ffmpeg.js';
import {runProcess} from '../src/backend/conversion/process.js';

const state={kind:'audio',format:'wav',audioCodec:'pcm_s16le',hasAudio:true,hasVideo:false,
  audioChannels:2,audioLayout:'stereo',audioSampleRate:44100};

test('audio option discovery requires an installed encoder, decoder and muxer',async()=>{
  const calls=[];
  const adapter=new FFmpegAdapter({runner:async (_command,args)=>{
    calls.push(args);
    const outputs={
      '-version':'ffmpeg unit\n',
      '-encoders':' A..... pcm_s16le\n A..... pcm_s24le\n A..... alac\n A..... aac\n A..... libmp3lame',
      '-decoders':' A..... pcm_s16le\n A..... pcm_s24le\n A..... alac\n A..... mp3float',
      '-muxers':' E wav\n E ipod\n E adts',
    };
    return {stdout:outputs[args.at(-1)]??'',stderr:''};
  }});
  assert.equal((await adapter.discover()).available,true);
  assert.deepEqual(adapter.formats(),['wav','m4a']);
  assert.equal(adapter.audioOptions('m4a').defaultCodec,'alac');
  assert.deepEqual(adapter.audioOptions('m4a').codecs.map(value=>value.codec),['alac']);
  assert.deepEqual(adapter.audioOptions('wav').codecs.map(value=>value.codec),['pcm_s16le','pcm_s24le']);
  assert.equal(adapter.audioOptions('mp3'),null);
  assert.equal(adapter.audioOptions('__proto__'),null);
  assert.throws(()=>adapter.capabilities({format:'m4a',options:{codec:'aac'}}),/unsupported/i);
  assert.throws(()=>adapter.capabilities({format:'m4a',options:{bitrateKbps:128}}),/unsupported/i);

  assert.equal(adapter.capabilities().find(edge=>edge.id==='ffmpeg:copy:wav').accepts(state),true);
  const options={codec:'pcm_s24le',sampleRate:48000,channels:1};
  const tailored=adapter.capabilities({format:'wav',options});
  assert.equal(tailored.some(edge=>edge.id==='ffmpeg:copy:wav'),false);
  assert.equal(tailored.some(edge=>edge.id==='ffmpeg:encode:m4a'),true);
  const edge=tailored.find(edge=>edge.id==='ffmpeg:encode:wav:options');
  const step={capabilityId:edge.id,input:state,output:edge.output(state),options:edge.options};
  await adapter.execute(step,'input.wav','output.wav');
  const argv=calls.at(-1);
  for(const [flag,value] of [['-map','0:a:0'],['-c:a','pcm_s24le'],['-ac','1'],['-ar','48000'],['-f','wav']]){
    assert.equal(argv[argv.indexOf(flag)+1],value);
  }
  assert.ok(argv.includes('-n'));
  assert.equal(step.output.audioSampleRate,48000);
  assert.equal(step.output.audioLayout,'mono');
  assert.match(edge.warnings(state).join(' '),/downmixed/);
  const total=calls.length;
  await assert.rejects(adapter.execute({...step,options:undefined},'input.wav','output.wav'),/unsupported/i);
  await assert.rejects(adapter.execute({...step,output:{...step.output,audioSampleRate:1}},'input.wav','output.wav'),/unsupported/i);
  assert.equal(calls.length,total);
});

test('audio processing options reject unknown keys, commands and coerced numbers',()=>{
  assert.deepEqual(normalizeAudioOptions(),{});
  assert.deepEqual(normalizeAudioOptions({channels:2,codec:'aac',sampleRate:48000,bitrateKbps:128}),
    {codec:'aac',bitrateKbps:128,sampleRate:48000,channels:2});
  for(const invalid of [null,[],{command:'ffmpeg'},{codec:'-c:a'},{sampleRate:'48000'},{bitrateKbps:128.5},
    {channels:3},{channels:null},{sampleRate:0},{bitrateKbps:641},{[Symbol('opaque')]:1},
    Object.create({codec:'aac'})]) assert.throws(()=>normalizeAudioOptions(invalid),/invalid audio options/i);
});

test('real audio profiles produce correctly probed, fully decoded first-stream output',async t=>{
  const adapter=new FFmpegAdapter();
  if(!(await adapter.discover()).available)return t.skip('Requires FFmpeg and ffprobe');
  const fixtures=[
    ['wav',{codec:'pcm_s24le',sampleRate:48000,channels:1}],
    ['flac',{sampleRate:96000,channels:1}],
    ['mp3',{bitrateKbps:128,sampleRate:32000,channels:2}],
    ['aac',{bitrateKbps:128,sampleRate:48000,channels:1}],
    ['ogg',{bitrateKbps:96,sampleRate:44100,channels:1}],
    ['opus',{bitrateKbps:96,channels:1}],
    ['aiff',{codec:'pcm_s24be',sampleRate:48000,channels:1}],
    ['m4a',{codec:'alac',sampleRate:48000,channels:1}],
    ['m4a',{codec:'aac',bitrateKbps:128,sampleRate:44100,channels:2}],
    ['caf',{codec:'pcm_f32le',sampleRate:96000,channels:1}],
    ['au',{codec:'pcm_s24be',sampleRate:48000,channels:2}],
    ['ac3',{bitrateKbps:192,sampleRate:48000,channels:2}],
  ];
  const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-audio-profile-'));
  try {
    const file=path.join(dir,'two-audio.mkv');
    await runProcess(adapter.ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=44100',
      '-f','lavfi','-i','sine=frequency=880:sample_rate=96000','-t','0.5',
      '-map','0:a:0','-map','1:a:0','-c:a','pcm_s16le',file]);
    const source=await adapter.probe(file);
    assert.equal(source.state.audioSampleRate,44100);
    assert.equal(source.state.audioChannels,1);
    const copy=adapter.capabilities().find(value=>value.id==='ffmpeg:copy:wav');
    const copied=path.join(dir,'default.wav'),pcm=path.join(dir,'default.raw');
    await adapter.execute({capabilityId:copy.id,input:source.state,output:copy.output(source.state)},file,copied);
    assert.deepEqual((await adapter.probe(copied)).state,copy.output(source.state));
    await runProcess(adapter.ffmpeg,['-v','error','-i',copied,'-f','s16le',pcm]);
    const samples=await readFile(pcm);
    let crossings=0;
    for(let i=2;i<samples.length;i+=2)if(samples.readInt16LE(i-2)<=0 && samples.readInt16LE(i)>0)crossings++;
    const tone=crossings/(samples.length/2/44100);
    assert.ok(Math.abs(tone-440)<5,`audio copy must preserve the first 440Hz tone, got ${tone}Hz`);
    for(const [index,[format,options]] of fixtures.entries()){
      assert.ok(adapter.formats().includes(format),`Missing real integration profile: ${format}`);
      const edge=adapter.capabilities({format,options}).find(value=>value.id===`ffmpeg:encode:${format}:options`);
      assert.equal(edge.accepts(source.state),true);
      const planned=edge.output(source.state);
      const output=path.join(dir,`profile-${index}.${format}`);
      await adapter.execute({capabilityId:edge.id,input:source.state,output:planned,options:edge.options},file,output);
      const probed=await adapter.probe(output);
      assert.deepEqual(probed.state,planned,`${format} ${JSON.stringify(options)}`);
      const {stdout}=await runProcess(adapter.ffprobe,['-v','error','-show_entries','stream=codec_type','-of','json',output]);
      assert.deepEqual(JSON.parse(stdout).streams,[{codec_type:'audio'}]);
      await adapter.verify(output,{expectedDuration:source.audioDuration});
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

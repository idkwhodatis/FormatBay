import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FFmpegAdapter} from '../src/backend/conversion/ffmpeg.js';
import {FFmpegMediaAdapter,normalizeMediaTarget} from '../src/backend/conversion/ffmpeg-media.js';
import {runProcess} from '../src/backend/conversion/process.js';

test('rich target schema rejects undeclared flags, options, conflicting tracks and unconstrained settings',()=>{
  const target={kind:'video',format:'mkv'};
  assert.deepEqual(normalizeMediaTarget({...target,options:{videoCodec:'mpeg4',width:128,defaultAudioTrack:1}}),
    {...target,options:{videoCodec:'mpeg4',width:128,defaultAudioTrack:1}});
  for(const options of [null,[],{ffmpegArgs:['-y']},{videoCodec:'-f'},{audioTrack:64},{width:4098},{height:99},{frameRate:1.5},
    {crf:23},{videoCodec:'h264',crf:23,videoBitrateKbps:500},{dropSubtitles:true,subtitleTrack:0},{audioTrack:0,defaultAudioTrack:1},
    {subtitleTrack:0,defaultSubtitleTrack:1},{dropSubtitles:'yes'}]){
    assert.throws(()=>normalizeMediaTarget({...target,options}),/Invalid|Unsupported|CRF|Cannot|default/);
  }
  assert.throws(()=>normalizeMediaTarget({kind:'video',format:'mp4',options:{subtitleTrack:0}}),/requires MKV/);
  assert.throws(()=>normalizeMediaTarget({...target,options:{videoCodec:'mpeg4',pixelFormat:'yuv420p10le'}}),/requires explicit HEVC/);
  assert.throws(()=>normalizeMediaTarget({...target,options:{videoCodec:'hevc',pixelFormat:'yuv444p'}}),/Invalid media option/);
  assert.throws(()=>normalizeMediaTarget({kind:'video',format:'mp4',options:{defaultAudioTrack:0}}),/requires MKV/);
  assert.throws(()=>normalizeMediaTarget({kind:'image',format:'ico',options:{width:512}}),/256/);
  assert.throws(()=>normalizeMediaTarget({kind:'video',format:'mkv',inputPath:'/tmp/any'}),/Invalid/);
});

test('a tool without encoders cannot advertise invented encodes or arbitrary H.264 capabilities',async()=>{
  const runner=async (_binary,args)=>({stdout:args.includes('-demuxers')?' D   mov,mp4,m4a,3gp,3g2,mj2\n D   matroska,webm\n D   jpeg_pipe\n':' ..C scale            V->V       Scale\n'});
  const base=new FFmpegAdapter({runner});base.available=true;base.decoders=new Set(['mpeg4']);base.muxers=new Set(['mp4','matroska','image2pipe']);
  const media=new FFmpegMediaAdapter(base);
  assert.deepEqual(await media.discover(),{video:['mp4','mkv','m4v'],image:[],subtitle:[]});
  assert.deepEqual(media.config().video.mp4.videoCodecs,[]);
  assert.equal(media.config().video.mp4.resize,false);
  assert.equal(media.formats().video.includes('webm'),false);
});

test('real rich FFmpeg conversions verify mapped tracks, chapters, selected frame, geometry and safe input',async t=>{
  const base=new FFmpegAdapter();
  if(!(await base.discover()).available)return t.skip('FFmpeg/ffprobe required');
  const media=new FFmpegMediaAdapter(base),formats=await media.discover();
  assert.ok(formats.video.includes('mkv')&&formats.video.includes('mp4'));
  assert.ok(formats.image.includes('png')&&formats.image.includes('jpg'));
  assert.ok(['srt','ass','vtt'].every(format=>formats.subtitle.includes(format)));
  const dir=await realpath(await mkdtemp(join(tmpdir(),'formatbay-media 100% # ')));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=join(dir,'测试 source.mkv'),caption=join(dir,'captions.srt'),metadata=join(dir,'metadata.txt');
  await writeFile(caption,'1\n00:00:00,200 --> 00:00:00,900\nOriginal caption\n\n');
  await writeFile(metadata,';FFMETADATA1\ntitle=Fixture title\nartist=Fixture artist\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1200\ntitle=Fixture chapter\n');
  await runProcess(base.ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=96x64:r=25:d=1.2',
    '-f','lavfi','-i','sine=f=300:d=1.2','-f','lavfi','-i','sine=f=700:d=1.2',
    '-f','srt','-i',caption,'-f','ffmetadata','-i',metadata,
    '-map','0:v','-map','1:a','-map','2:a','-map','3:s','-map','3:s','-map_metadata','4','-map_chapters','4',
    '-c:v','mpeg4','-c:a','aac','-c:s','subrip','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=zho',
    '-metadata:s:s:0','language=eng','-metadata:s:s:1','language=zho','-disposition:a:0','default','-disposition:a:1','0',
    '-disposition:s:0','default','-disposition:s:1','forced',source]);
  const original=await readFile(source);
  const input=await media.probe(source);
  assert.equal(input.state.streams.length,5);
  const select=async(type,format,options)=>{
    const plan=media.plan(input.state,{kind:type,format,...(options?{options}:{})});
    assert.equal(plan.ok,true,plan.message);
    assert.equal(plan.steps.length,1);
    const step=plan.steps[0],output=join(dir,`${type}.${format}`);
    await media.execute(step,source,output,{duration:input.duration});
    const verified=await media.verify(output,step,{expectedDuration:input.duration});
    return {plan,output,state:verified.state};
  };
  const mkv=await select('video','mkv',{defaultAudioTrack:1,defaultSubtitleTrack:1});
  assert.ok(mkv.plan.steps[0].media.rows.every(r=>r.codec==='copy'));
  for(const type of ['audio','subtitle']){
    assert.deepEqual(mkv.state.streams.filter(s=>s.type===type).map(s=>[s.tags.language,s.default]),[['eng',false],['zho',true]]);
  }
  assert.equal(mkv.state.streams.filter(s=>s.type==='subtitle')[1].forced,true);
  assert.deepEqual(mkv.state.tags,input.state.tags);
  assert.deepEqual(mkv.state.chapters.map(ch=>ch.tags),input.state.chapters.map(ch=>ch.tags));
  assert.ok(Math.abs(mkv.state.chapters[0].start-input.state.chapters[0].start)<.05);
  assert.ok(Math.abs(mkv.state.chapters[0].end-input.state.chapters[0].end)<.05);
  const video=await select('video','mp4',{videoCodec:'mpeg4',width:128,frameRate:20,audioTrack:1,videoBitrateKbps:200});
  assert.equal(video.state.streams[0].width,128);
  assert.equal(video.state.streams[0].height,86);
  assert.equal(video.state.streams.filter(s=>s.type==='audio').length,1);
  assert.equal(video.state.streams.some(s=>s.type==='subtitle'),false);
  assert.ok(video.plan.warnings.some(s=>s.includes('subtitle')));
  for(const image of formats.image){
    const result=await select('image',image,image==='png'?{width:48}:undefined);
    assert.equal(result.state.streams.length,1);
    if(image==='png')assert.equal(result.state.streams[0].width,48);
    if(image==='jpg'){
      // Output name literally includes '%': neither probe nor encode interprets an image pattern.
      assert.equal(result.state.format,'jpg');
      await assert.rejects(media.execute(result.plan.steps[0],source,result.output),/already exists|not overwriting|Tool failed/i);
    }
  }
  for(const format of formats.subtitle){
    const subtitle=await select('subtitle',format,{subtitleTrack:1});
    assert.equal(subtitle.state.streams.length,1);
    assert.match(await readFile(subtitle.output,'utf8'),/Original caption/);
  }
  if(media.config().video.mp4.videoCodecs.includes('hevc')){
    const output=join(dir,'hevc.mp4'),plan=media.plan(input.state,{kind:'video',format:'mp4',options:{videoCodec:'hevc',audioTrack:0}});
    assert.equal(plan.ok,true,plan.message);
    await media.execute(plan.steps[0],source,output);
    const state=(await media.verify(output,plan.steps[0])).state.streams[0];
    assert.equal(state.codec,'hevc');
    assert.equal(state.pixelFormat,'yuv420p');
    if(media.config().video.mp4.pixelFormats.hevc?.includes('yuv420p10le')){
      const output10=join(dir,'hevc10.mp4');
      const plan10=media.plan(input.state,{kind:'video',format:'mp4',options:{videoCodec:'hevc',pixelFormat:'yuv420p10le',audioTrack:0}});
      assert.equal(plan10.ok,true,plan10.message);
      await media.execute(plan10.steps[0],source,output10);
      assert.equal((await media.verify(output10,plan10.steps[0])).state.streams[0].pixelFormat,'yuv420p10le');
      await assert.rejects(media.verify(output,plan10.steps[0]),/pixel format does not match/);
    }
  }
  assert.equal(media.plan(input.state,{kind:'video',format:'mkv',options:{audioTrack:12}}).ok,false);
  const concat=join(dir,'playlist.ffconcat');
  await writeFile(concat,'ffconcat version 1.0\nfile "测试 source.mkv"\n');
  await assert.rejects(media.probe(concat));
  await assert.rejects(media.probe('relative.mkv'),/local absolute/);
  assert.deepEqual(await readFile(source),original);
});

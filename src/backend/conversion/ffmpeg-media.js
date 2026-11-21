// Rich, single-step local FFmpeg operations. This registry is intentionally
// independent of audio graph edges: no intermediate may erase stream inventory.
import {stat} from 'node:fs/promises';
import {extname,isAbsolute} from 'node:path';

const VIDEO={
  mp4:{demux:'mov',mux:'mp4',copy:['h264','hevc','av1','mpeg4'],encode:['h264','mpeg4','hevc'],audio:['aac','mp3','ac3','eac3'],fallback:'aac'},
  mkv:{demux:'matroska',mux:'matroska',copy:['h264','hevc','av1','mpeg4','mpeg2video','mpeg1video','vp8','vp9','theora','ffv1','mjpeg','prores','huffyuv','vc1','wmv3'],encode:['h264','mpeg4','hevc','vp9','ffv1'],audio:['aac','mp3','ac3','eac3','opus','vorbis','flac','pcm_s16le','pcm_s24le','pcm_s32le','pcm_f32le','alac','dts','truehd','mp2'],fallback:'aac',preserve:true},
  webm:{demux:'matroska',mux:'webm',copy:['vp8','vp9','av1'],encode:['vp9','vp8'],audio:['opus','vorbis'],fallback:'opus'},
  mov:{demux:'mov',mux:'mov',copy:['h264','hevc','mpeg4','mjpeg','prores'],encode:['h264','mpeg4','hevc','prores'],audio:['aac','alac','pcm_s16le','pcm_s24le','pcm_s32le'],fallback:'aac'},
  avi:{demux:'avi',mux:'avi',copy:['mpeg4','mjpeg','h264','ffv1'],encode:['mpeg4','mjpeg','ffv1'],audio:['mp3','mp2','pcm_s16le'],fallback:'pcm_s16le'},
  m4v:{demux:'mov',mux:'mp4',copy:['h264','hevc','mpeg4'],encode:['h264','mpeg4','hevc'],audio:['aac','mp3','ac3'],fallback:'aac'},
  mpg:{demux:'mpeg',mux:'mpeg',copy:['mpeg1video','mpeg2video'],encode:['mpeg2video'],audio:['mp2','ac3','pcm_s16be'],fallback:'mp2'},
  ts:{demux:'mpegts',mux:'mpegts',copy:['h264','hevc','mpeg2video'],encode:['h264','mpeg2video','hevc'],audio:['aac','mp2','ac3','eac3'],fallback:'aac'},
  flv:{demux:'flv',mux:'flv',copy:['h264','flv1'],encode:['h264','flv1'],audio:['aac','mp3'],fallback:'aac'},
  wmv:{demux:'asf',mux:'asf',copy:['wmv1','wmv2'],encode:['wmv2'],audio:['wmav2','wmav1'],fallback:'wmav2'},
  asf:{demux:'asf',mux:'asf',copy:['wmv1','wmv2'],encode:['wmv2'],audio:['wmav2','wmav1'],fallback:'wmav2'},
  ogv:{demux:'ogg',mux:'ogg',copy:['theora'],encode:['theora'],audio:['vorbis'],fallback:'vorbis'},
  '3gp':{demux:'mov',mux:'3gp',copy:['h264','mpeg4'],encode:['h264','mpeg4'],audio:['aac'],fallback:'aac'},
};
const VIDEO_ENCODERS={
  h264:['libx264','yuv420p'],hevc:['libx265','yuv420p'],mpeg4:['mpeg4','yuv420p'],vp9:['libvpx-vp9','yuv420p'],vp8:['libvpx','yuv420p'],
  prores:['prores','yuv422p10le'],mjpeg:['mjpeg','yuvj420p'],ffv1:['ffv1','yuv420p'],mpeg2video:['mpeg2video','yuv420p'],
  flv1:['flv','yuv420p'],wmv2:['wmv2','yuv420p'],theora:['libtheora','yuv420p'],
};
const AUDIO_ENCODERS={aac:'aac',opus:'libopus',vorbis:'libvorbis',pcm_s16le:'pcm_s16le',mp2:'mp2',wmav2:'wmav2'};
const IMAGE={
  png:{codec:'png',encoder:'png',demux:'png_pipe'},jpg:{codec:'mjpeg',encoder:'mjpeg',demux:'jpeg_pipe',pix:'yuvj444p'},
  webp:{codec:'webp',encoder:'libwebp',demux:'webp_pipe'},bmp:{codec:'bmp',encoder:'bmp',demux:'bmp_pipe'},
  jp2:{codec:'jpeg2000',encoder:'jpeg2000',demux:'mjpeg_2000',args:['-format','jp2']},
  ico:{codec:'bmp',encoder:'bmp',demux:'ico',mux:'ico',pix:'bgra'},gif:{codec:'gif',encoder:'gif',demux:'gif',mux:'gif'},
  avif:{codec:'av1',encoder:'libaom-av1',demux:'mov',mux:'avif',pix:'yuv420p',args:['-still-picture','1']},
};
const SUBTITLE={
  srt:{codec:'subrip',encoder:'subrip',mux:'srt'},ass:{codec:'ass',encoder:'ass',mux:'ass'},vtt:{codec:'webvtt',encoder:'webvtt',mux:'webvtt'},
};
const MKV_SUBTITLES=new Set(['subrip','ass','ssa','webvtt','dvd_subtitle','hdmv_pgs_subtitle','dvb_subtitle']);
const TEXT_SUBTITLES=new Set(['subrip','ass','ssa','webvtt','mov_text','text']);
const DEMUX=new Set(['mov','matroska','webm','avi','mpeg','mpegts','flv','asf','mxf','wav','flac','mp3','aac','ogg','aiff','ape','srt','ass','webvtt','apng','png_pipe','jpeg_pipe','webp_pipe','bmp_pipe','tiff_pipe','gif','ico','mjpeg_2000']);
const STILL_DEMUX=new Map(Object.entries(IMAGE).filter(([,p])=>p.mux!=='avif').map(([k,p])=>[p.demux,k]));
STILL_DEMUX.set('apng','png');
STILL_DEMUX.set('tiff_pipe','tiff');
// Restrict demuxers as well as protocols. Never include image2 (sequence/glob),
// concat, HLS, DASH, ffconcat, scripted formats, or arbitrary devices.
const localInput=['-protocol_whitelist','file','-format_whitelist',[...DEMUX].join(',')];
const runLimit=24*60*60*1000;
const maxStreams=64,maxChapters=1024;
const semanticTags=new Set(['title','artist','album','comment','language']);
const HEVC_10_BIT='yuv420p10le';
const tracks=['audioTrack','subtitleTrack','defaultAudioTrack','defaultSubtitleTrack'];
const videoSettings=['width','height','videoCodec','crf','videoBitrateKbps','frameRate','pixelFormat'];
const own=(obj,key)=>Object.hasOwn(obj,key);
const isLocalAbsolute=path=>typeof path==='string'&&isAbsolute(path)&&(process.platform!=='win32'||/^[A-Za-z]:[\\/]/.test(path));
const validInt=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const isRecord=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));

export function normalizeMediaTarget(value) {
  if(!isRecord(value)||Object.keys(value).some(k=>!['kind','format','options'].includes(k))) throw new Error('Invalid media target');
  const {kind,format}=value;
  const profiles=kind==='video'?VIDEO:kind==='image'?IMAGE:kind==='subtitle'?SUBTITLE:null;
  if(!profiles||typeof format!=='string'||!own(profiles,format)) throw new Error('Unsupported media format');
  const options=own(value,'options')?value.options:{};
  if(!isRecord(options)) throw new Error('Invalid media options');
  const allowed=kind==='video'?[...tracks,...videoSettings,'dropSubtitles']:kind==='image'?['width','height']:['subtitleTrack'];
  for(const [key,val] of Object.entries(options)) {
    if(!allowed.includes(key)) throw new Error('Unsupported media option: '+key);
    if(tracks.includes(key)&&!validInt(val,0,maxStreams-1) ||
       ['width','height'].includes(key)&&(!validInt(val,16,4096)||val%2!==0) ||
       key==='frameRate'&&!validInt(val,1,120) ||
       key==='videoBitrateKbps'&&!validInt(val,100,50000) ||
       key==='crf'&&!validInt(val,0,51) ||
       key==='dropSubtitles'&&typeof val!=='boolean' ||
       key==='pixelFormat'&&val!==HEVC_10_BIT ||
       key==='videoCodec'&&(typeof val!=='string'||!VIDEO[format].encode.includes(val))) throw new Error('Invalid media option: '+key);
  }
  if((own(options,'defaultAudioTrack')||own(options,'defaultSubtitleTrack'))&&format!=='mkv') throw new Error('Default-track editing requires MKV output');
  if(kind==='video'&&format!=='mkv'&&(own(options,'subtitleTrack')||own(options,'dropSubtitles'))) throw new Error('Subtitle stream selection requires MKV output');
  if(own(options,'audioTrack')&&own(options,'defaultAudioTrack')&&options.audioTrack!==options.defaultAudioTrack ||
     own(options,'subtitleTrack')&&own(options,'defaultSubtitleTrack')&&options.subtitleTrack!==options.defaultSubtitleTrack) throw new Error('The default track must be included in the output selection');
  if(format==='ico'&&[options.width,options.height].some(v=>v>256))throw new Error('ICO dimensions cannot exceed 256 pixels');
  if(options.dropSubtitles&&(own(options,'subtitleTrack')||own(options,'defaultSubtitleTrack'))) throw new Error('Cannot select and remove subtitle tracks');
  if(own(options,'crf')&&(!['h264','vp9'].includes(options.videoCodec)||own(options,'videoBitrateKbps'))) throw new Error('CRF needs explicit H.264 or VP9 and cannot be combined with bitrate');
  if(own(options,'pixelFormat')&&options.videoCodec!=='hevc')throw new Error('10-bit pixel format requires explicit HEVC encoding');
  return {kind,format,...(Object.keys(options).length?{options:{...options}}:{})};
}
// JPEG may otherwise select the sequence-capable image2 demuxer based on its
// extension. Force the single-file pipe demuxer; malformed input still fails.
function localArgs(path) {
  const extension=extname(path).toLowerCase();
  if(['.jpg','.jpeg','.jpe','.jfif'].includes(extension))return [...localInput,'-f','jpeg_pipe'];
  if(['.jp2','.j2k','.j2c'].includes(extension))return [...localInput,'-f','mjpeg_2000'];
  return localInput;
}
const formatList=text=>new Set(text.split('\n').flatMap(line=>/^\s*D\s+(\S+)/.exec(line)?.[1]?.split(',')??[]));
function rateOf(raw){
  const match=typeof raw==='string'&&/^(\d{1,12})\/(\d{1,12})$/.exec(raw);
  const value=match?Number(match[1])/Number(match[2]):0;
  return Number.isFinite(value)&&value>0&&value<1000?value:0;
}
const durationOf=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):0;
const tagsOf=tags=>Object.fromEntries(Object.entries(tags??{}).flatMap(([key,value])=>{
  const lower=key.toLowerCase();
  return semanticTags.has(lower)&&typeof value==='string'&&value.length<=4096 ? [[lower,value]]:[];
}));
function filenameFormat(path,formats,data,streams) {
  const video=streams.some(s=>s.type==='video'&&!s.attached);
  const ext=extname(path).slice(1).toLowerCase();
  const first=formats[0];
  const brand=String(data.format?.tags?.major_brand??'').trim();
  if(brand==='avif'||brand==='avis') return {kind:'image',format:'avif'};
  if(STILL_DEMUX.has(first)&&video) return {kind:'image',format:STILL_DEMUX.get(first)};
  if(video) {
    const format=first==='matroska'?(ext==='webm'?'webm':'mkv')
      :first==='mov'?(brand==='qt'?'mov':brand.startsWith('3g')?'3gp':ext==='m4v'?'m4v':'mp4')
        :first==='mpeg'?'mpg':first==='mpegts'?'ts':first==='ogg'?'ogv':first==='asf'&&ext==='wmv'?'wmv':first;
    return {kind:'video',format};
  }
  if(streams.some(s=>s.type==='audio')) return {kind:'audio',format:first};
  if(streams.some(s=>s.type==='subtitle')) return {kind:'subtitle',format:first==='webvtt'?'vtt':first};
  throw new Error('This file has no supported media streams');
}

function stopPlan(reason,message){return {ok:false,reason,message};}
function addMapped(rows,source,codec,expectedCodec=source.codec) {rows.push({source,codec,expectedCodec});}
function ordinal(streams,value){return streams.find(s=>s.ordinal===value);}
function ensureSelection(streams,value,label){
  if(!Number.isInteger(value))return streams;
  const selected=ordinal(streams,value);
  if(!selected)throw new Error(`Requested ${label} track does not exist (zero-based index ${value}).`);
  return [selected];
}
function matchesMux(plan,state){
  return state.demuxers.includes(plan.demux)&&state.kind===plan.outputKind&&
    (plan.outputKind!=='image'||state.format===plan.outputFormat);
}

export class FFmpegMediaAdapter {
  constructor(ffmpegAdapter){
    this.base=ffmpegAdapter;
    this.demuxers=new Set();
    this.canScale=false;this.hevc10bit=false;
  }
  async discover(){
    this.demuxers=new Set();this.canScale=false;this.hevc10bit=false;
    if(!this.base.available)return this.formats();
    if(this.base.bundleContract){
      this.demuxers=new Set(this.base.bundleContract.demuxers);
      this.canScale=this.base.bundleContract.filters.includes('scale');
      return this.formats();
    }
    try {
      const [ffmpeg,ffprobe,filters]=await Promise.all([
        this.base.runner(this.base.ffmpeg,['-hide_banner','-demuxers']),
        this.base.runner(this.base.ffprobe,['-hide_banner','-demuxers']),
        this.base.runner(this.base.ffmpeg,['-hide_banner','-filters']),
      ]);
      const common=formatList(ffprobe.stdout);
      this.demuxers=new Set([...formatList(ffmpeg.stdout)].filter(x=>common.has(x)));
      this.canScale=filters.stdout.split('\n').some(line=>/^\s*[TSC.]{2,3}\s+scale\s+V->V(?:\s|$)/.test(line));
    } catch {
      // Rich catalog failure must not hide the existing audio engine.
      this.demuxers=new Set();this.canScale=false;
    }
    if(this.demuxers.size&&this.base.encoders.has('libx265')&&this.canDecode('hevc')){
      try {
        const {stdout}=await this.base.runner(this.base.ffmpeg,['-hide_banner','-h','encoder=libx265'],{timeout:10000});
        const reported=/^\s*Supported pixel formats:[ \t]+([^\r\n]+)$/m.exec(stdout)?.[1]?.trim().split(/\s+/)??[];
        this.hevc10bit=reported.includes(HEVC_10_BIT);
      } catch { /* Optional feature; do not affect default encodes. */ }
    }
    return this.formats();
  }
  canDecode(codec){
    const aliases={flv1:'flv',dts:'dca',dvd_subtitle:'dvdsub',hdmv_pgs_subtitle:'pgssub',dvb_subtitle:'dvbsub'};
    return this.base.canDecode(codec)||(Object.hasOwn(aliases,codec)&&this.base.decoders.has(aliases[codec]))||(codec==='av1'&&['libdav1d','libaom-av1'].some(name=>this.base.decoders.has(name)));}
  supportsMux(p){return this.base.available&&this.base.muxers.has(p.mux)&&this.demuxers.has(p.demux);}
  videoCodecs(spec){return spec.encode.filter(key=>this.base.encoders.has(VIDEO_ENCODERS[key][0])&&this.canDecode(key));}
  formats(){
    const video=Object.entries(VIDEO).flatMap(([format,s])=>this.supportsMux(s)&&(this.videoCodecs(s).length||s.copy.some(c=>this.canDecode(c)))?[format]:[]);
    const image=Object.entries(IMAGE).flatMap(([format,s])=>this.supportsMux({...s,mux:s.mux??'image2pipe'})&&this.base.encoders.has(s.encoder)&&this.canDecode(s.codec)?[format]:[]);
    const subtitle=Object.entries(SUBTITLE).flatMap(([format,s])=>this.supportsMux({...s,demux:s.mux})&&this.base.encoders.has(s.encoder)&&this.canDecode(s.codec)&&this.base.encoders.has('subrip')&&this.base.muxers.has('srt')?[format]:[]);
    return {video,image,subtitle};
  }
  config(){
    const {video,image,subtitle}=this.formats();
    return {
      video:Object.fromEntries(video.map(format=>{
        const videoCodecs=this.videoCodecs(VIDEO[format]);
        return [format,{videoCodecs,resize:this.canScale&&videoCodecs.length>0,frameRate:videoCodecs.length>0,bitrate:videoCodecs.length>0,
          crfCodecs:videoCodecs.filter(c=>['h264','vp9'].includes(c)),pixelFormats:this.hevc10bit&&videoCodecs.includes('hevc')?{hevc:[HEVC_10_BIT]}:{},preservesSubtitles:format==='mkv',defaultTracks:format==='mkv'}];
      })),
      image:Object.fromEntries(image.map(format=>[format,{resize:this.canScale}])),
      subtitle:Object.fromEntries(subtitle.map(format=>[format,{}])),
    };
  }
  async probe(path,{signal}={}){
    if(!isLocalAbsolute(path))throw new Error('Input must be a local absolute path');
    const file=await stat(path);
    if(!file.isFile())throw new Error('Input must be a regular file');
    const {stdout}=await this.base.runner(this.base.ffprobe,['-v','error',...localArgs(path),'-show_streams','-show_chapters','-show_format','-of','json',path],{signal,timeout:30000});
    const data=JSON.parse(stdout);
    if(!Array.isArray(data.streams)||!data.streams.length||data.streams.length>maxStreams||data.chapters?.length>maxChapters)throw new Error('Unsupported media stream or chapter count');
    const counts=Object.create(null),indexSet=new Set();
    const streams=data.streams.map(s=>{
      if(!validInt(s.index,0,maxStreams-1)||indexSet.has(s.index))throw new Error('Invalid media stream inventory');
      indexSet.add(s.index);
      const type=['video','audio','subtitle','attachment','data'].includes(s.codec_type)?s.codec_type:'unknown';
      const ordinal=counts[type]??0;counts[type]=ordinal+1;
      return {index:s.index,ordinal,type,codec:/^[A-Za-z0-9_]{1,64}$/.test(s.codec_name??'')?s.codec_name:'unknown',
        default:s.disposition?.default===1,forced:s.disposition?.forced===1,attached:s.disposition?.attached_pic===1,
        channels:validInt(s.channels,1,64)?s.channels:0,layout:typeof s.channel_layout==='string'?s.channel_layout:'',
        pixelFormat:/^[A-Za-z0-9_]{1,64}$/.test(s.pix_fmt??'')?s.pix_fmt:'',frameRate:rateOf(s.r_frame_rate),averageFrameRate:rateOf(s.avg_frame_rate),width:validInt(s.width,1,100000)?s.width:0,height:validInt(s.height,1,100000)?s.height:0,tags:tagsOf(s.tags)};
    });
    const demuxers=(data.format?.format_name??'').split(',').filter(f=>DEMUX.has(f));
    if(!demuxers.length)throw new Error('Unsupported local media container');
    const chapters=(data.chapters??[]).map(ch=>({start:Number(ch.start_time),end:Number(ch.end_time),tags:tagsOf(ch.tags)}));
    if(chapters.some(ch=>!Number.isFinite(ch.start)||!Number.isFinite(ch.end)||ch.end<ch.start))throw new Error('Invalid source chapters');
    const {kind,format}=filenameFormat(path,demuxers,data,streams);
    const audio=streams.find(s=>s.type==='audio'),video=streams.find(s=>s.type==='video'&&!s.attached);
    return {state:{kind,format,demuxers,streams,chapters,tags:tagsOf(data.format?.tags),hasAudio:!!audio,hasVideo:!!video,
      audioCodec:audio?.codec??'',audioChannels:audio?.channels??0,audioLayout:audio?.layout??''},duration:durationOf(data.format?.duration),size:file.size};
  }
  plan(input,value){
    let target;
    try {target=normalizeMediaTarget(value);} catch(error){return stopPlan('invalid-target',error.message);}
    const {kind,format,options={}}=target;
    if(!this.formats()[kind].includes(format))return stopPlan('missing-ffmpeg-capability','The installed FFmpeg build cannot produce and read this format.');
    const warnings=[], rows=[], args=[];
    let mux,demux,durationCheck=false,loss=0;
    try {
      const streams=input.streams;
      if(!Array.isArray(streams)||!Array.isArray(input.chapters)||!input.tags)throw new Error('Missing probed media inventory.');
      const videos=streams.filter(s=>s.type==='video'&&!s.attached);
      const audios=streams.filter(s=>s.type==='audio');
      const subtitles=streams.filter(s=>s.type==='subtitle');
      const firstVideo=videos[0];
      const resize=own(options,'width')||own(options,'height');
      const dimensions=video=>{
        if(!resize)return [];
        if(!this.canScale||!video.width||!video.height)throw new Error('The installed FFmpeg build or source cannot resize this output.');
        const width=options.width??Math.max(16,Math.round(options.height*video.width/video.height/2)*2);
        const height=options.height??Math.max(16,Math.round(options.width*video.height/video.width/2)*2);
        if(width>4096||height>4096)throw new Error('Aspect-preserving size exceeds 4096 pixels. Choose both dimensions or a smaller target.');
        if(options.width&&options.height)warnings.push('Setting both dimensions can stretch the image.');
        return [width,height];
      };
      let plannedSize=null;
      if(kind==='image'){
        if(!firstVideo||!this.canDecode(firstVideo.codec))throw new Error('No compatible image or video stream is available.');
        const p=IMAGE[format]; mux=p.mux??'image2pipe'; demux=p.demux;
        addMapped(rows,firstVideo,p.encoder,p.codec);
        const size=dimensions(firstVideo);
        if(format==='ico'&&((size[0]??firstVideo.width)>256||(size[1]??firstVideo.height)>256))throw new Error('ICO dimensions cannot exceed 256 pixels. Set a smaller target size.');
        if(size.length)plannedSize=size;
        if(size.length)args.push('-filter:v:0',`scale=${size[0]}:${size[1]}`);
        args.push('-frames:v','1',...(p.pix?['-pix_fmt',p.pix]:[]),...(p.args??[]));
        warnings.push('Only the first decoded frame is saved; animation, audio, subtitles, chapters and source metadata are not retained.');
        if(['jpg','gif','avif'].includes(format))warnings.push('This image encoder can reduce color precision or image quality.');
        loss=1;
      } else if(kind==='subtitle'){
        const p=SUBTITLE[format];mux=p.mux;demux=mux;
        const source=own(options,'subtitleTrack')?ensureSelection(subtitles,options.subtitleTrack,'subtitle')[0]:subtitles.find(s=>TEXT_SUBTITLES.has(s.codec)&&this.canDecode(s.codec));
        if(!source||!TEXT_SUBTITLES.has(source.codec)||!this.canDecode(source.codec))throw new Error('Choose a supported text subtitle track. Bitmap subtitles require OCR, which is not supported.');
        addMapped(rows,source,source.codec===p.codec?'copy':p.encoder,p.codec);
        if(source.codec!==p.codec)warnings.push('Subtitle conversion can discard formatting, positioning and style information.');
        warnings.push('Only the selected subtitle track is saved.');
        loss=source.codec===p.codec?0:1;
      } else {
        const p=VIDEO[format]; mux=p.mux; demux=p.demux;
        if(input.kind!=='video'||!firstVideo)throw new Error('This target requires a video input.');
        const keep=p.preserve===true;
        if(!keep&&own(options,'subtitleTrack'))throw new Error('Subtitle track selection requires MKV output.');
        const requestedAudio=ensureSelection(audios,options.audioTrack,'audio');
        const chooseAudio=format==='flv'?requestedAudio.slice(0,1):requestedAudio;
        const chooseSubtitles=keep&&!options.dropSubtitles?ensureSelection(subtitles,options.subtitleTrack,'subtitle'):[];
        const selectedAudio=Number.isInteger(options.defaultAudioTrack)?ordinal(chooseAudio,options.defaultAudioTrack):null;
        const selectedSub=Number.isInteger(options.defaultSubtitleTrack)?ordinal(chooseSubtitles,options.defaultSubtitleTrack):null;
        if(own(options,'defaultAudioTrack')&&!selectedAudio)throw new Error('Requested default audio track is not present in the output selection.');
        if(own(options,'defaultSubtitleTrack')&&!selectedSub)throw new Error('Requested default subtitle track is not present in the output selection.');
        const videoChange=resize||['videoCodec','crf','videoBitrateKbps','frameRate'].some(key=>own(options,key));
        const codecs=this.videoCodecs(p);
        const size=dimensions(firstVideo);
        if(size.length)plannedSize=size;
        const coding=options.videoCodec??codecs[0];
        if(options.pixelFormat&&!this.hevc10bit)throw new Error('The installed HEVC encoder does not report 10-bit support.');
        if(options.videoCodec&&!codecs.includes(options.videoCodec))throw new Error('This video encoder is not present in the installed FFmpeg build.');
        if(!videoChange&&p.copy.includes(firstVideo.codec)&&this.canDecode(firstVideo.codec)){
          addMapped(rows,firstVideo,'copy');
        } else {
          if(!coding||!this.canDecode(firstVideo.codec))throw new Error('No compatible video encoder or stream-copy route is available.');
          if(!size.length&&((firstVideo.width%2)||(firstVideo.height%2))&&VIDEO_ENCODERS[coding][1].includes('420'))throw new Error('This encoder requires even dimensions. Set a target width or height.');
          const [encoder,pix]=VIDEO_ENCODERS[coding];
          addMapped(rows,firstVideo,encoder,coding);
          args.push('-pix_fmt:v:0',options.pixelFormat??pix,'-threads:v:0','4');
          if(coding==='hevc')args.push('-x265-params','pools=none:frame-threads=2:log-level=error');
          if(size.length)args.push('-filter:v:0',`scale=${size[0]}:${size[1]}`);
          if(options.frameRate)args.push('-r:v:0',String(options.frameRate));
          if(options.videoBitrateKbps)args.push('-b:v:0',`${options.videoBitrateKbps}k`);
          if(own(options,'crf')){
            args.push('-crf',String(options.crf));
            if(coding==='vp9')args.push('-b:v:0','0');
          } else if(!options.videoBitrateKbps&&['mpeg4','mjpeg'].includes(coding))args.push('-q:v:0','3');
          if(coding==='mpeg2video'&&!options.frameRate)args.push('-r:v:0','25');
          warnings.push('The primary video stream is re-encoded; quality and file size can change.');
          loss++;
        }
        if(keep) {
          for(const s of videos.slice(1)){
            if(!p.copy.includes(s.codec)||!this.canDecode(s.codec))throw new Error('MKV cannot preserve one of the additional video tracks with this FFmpeg build.');
            addMapped(rows,s,'copy');
          }
        } else if(videos.length>1)warnings.push('Only the primary video stream is saved in this output.');
        for(const s of chooseAudio){
          if(p.audio.includes(s.codec)&&this.canDecode(s.codec))addMapped(rows,s,'copy');
          else {
            const encoder=AUDIO_ENCODERS[p.fallback];
            if(!this.canDecode(s.codec)||!encoder||!this.base.encoders.has(encoder)||!this.canDecode(p.fallback))throw new Error('One of the selected audio tracks has no compatible local conversion.');
            if(!s.channels||s.channels>(['wmav2','mp2','vorbis'].includes(p.fallback)?2:8))throw new Error('An audio track exceeds this encoder’s safe channel limit.');
            if(s.channels>2&&!s.layout)throw new Error('An audio track has an unknown speaker layout.');
            addMapped(rows,s,encoder,p.fallback);
            warnings.push('One or more audio tracks are re-encoded; audio quality can change.');
            loss++;
          }
        }
        if(chooseAudio.length!==audios.length)warnings.push('Other audio tracks are not retained.');
        for(const s of chooseSubtitles){
          if(this.canDecode(s.codec)&&MKV_SUBTITLES.has(s.codec))addMapped(rows,s,'copy');
          else if(this.canDecode(s.codec)&&TEXT_SUBTITLES.has(s.codec)&&this.base.encoders.has('subrip')){
            addMapped(rows,s,'subrip','subrip');
            warnings.push('An embedded subtitle track is re-encoded as SubRip; styling and positioning may change.');
            loss++;
          } else throw new Error('MKV cannot preserve one of the subtitle tracks with this FFmpeg build. Choose another subtitle track or explicitly remove subtitles.');
        }
        if(chooseSubtitles.some(s=>!TEXT_SUBTITLES.has(s.codec)))warnings.push('Bitmap subtitle tracks are copied without OCR; their stream headers, not rendered cues, are verified.');
        if(chooseSubtitles.length!==subtitles.length)warnings.push('One or more source subtitle tracks are not retained.');
        if(chooseSubtitles.some(s=>TEXT_SUBTITLES.has(s.codec))&&(!this.base.encoders.has('subrip')||!this.base.muxers.has('srt')))throw new Error('This FFmpeg cannot verify preserved text subtitles.');
        if(keep)for(const s of streams.filter(s=>s.type==='attachment'&&['ttf','otf'].includes(s.codec)))addMapped(rows,s,'copy');
        if(streams.some(s=>!['audio','subtitle'].includes(s.type)&&!rows.some(row=>row.source.index===s.index)))warnings.push('Unsupported extra data, cover images or attachment streams are not retained.');
        if(keep){
          for(const [type,letter,selection] of [['audio','a',selectedAudio],['subtitle','s',selectedSub]]){
            rows.filter(row=>row.source.type===type).forEach((row,idx)=>{
              row.expectedDefault=selection?selection.index===row.source.index:row.source.default;
              args.push(`-disposition:${letter}:${idx}`,row.expectedDefault?'+default':'-default');
            });
          }
        } else if(input.chapters.length||Object.keys(input.tags).length){
          warnings.push('Source metadata and chapters are not retained in this output.');
        }
        durationCheck=audios.length===chooseAudio.length&&subtitles.length===chooseSubtitles.length;
      }
      if(!rows.length)throw new Error('No compatible streams are available.');
      const keep=kind==='video'&&format==='mkv';
      const media={mux,demux,args,rows,keep,durationCheck,outputKind:kind,outputFormat:format,size:plannedSize,
        chapters:keep?input.chapters:[],tags:keep?input.tags:{},frameRate:options.frameRate??null,pixelFormat:options.pixelFormat??null};
      const warningsUnique=[...new Set(warnings)];
      const outputAudio=rows.find(row=>row.source.type==='audio');
      const output={kind,format,hasAudio:!!outputAudio,hasVideo:rows.some(row=>row.source.type==='video'),
        audioCodec:outputAudio?.expectedCodec??'',audioChannels:outputAudio?.source.channels??0,audioLayout:outputAudio?.source.layout??''};
      const step={capabilityId:`ffmpeg:media:${kind}:${format}`,toolId:'ffmpeg',toolVersion:this.base.version,
        label:`FFmpeg ${rows.every(x=>x.codec==='copy')?'copy/remux':'convert'} → ${format.toUpperCase()}`,input,output,media};
      return {ok:true,input,target,steps:[step],warnings:warningsUnique,loss};
    } catch(error){return stopPlan('unreachable',error.message);}
  }
  async execute(step,inputPath,outputPath,{signal,duration=0,onProgress}={}){
    if(!isLocalAbsolute(inputPath)||!isLocalAbsolute(outputPath))throw new Error('Conversion requires local absolute paths');
    if(!step?.media||step.capabilityId!==`ffmpeg:media:${step.output.kind}:${step.output.format}`)throw new Error('Unsupported conversion step');
    const {mux,rows,args,keep}=step.media;
    const maps=rows.flatMap(row=>['-map',`0:${row.source.index}`]);
    const codecs=rows.flatMap((row,index)=>[`-c:${index}`,row.codec]);
    const progress=makeProgress(value=>{if(duration>0)onProgress?.(Math.min(.99,value/duration));});
    const result=await this.base.runner(this.base.ffmpeg,['-hide_banner','-nostdin','-v','error','-xerror','-err_detect','explode',
      '-n',...localArgs(inputPath),'-i',inputPath,...maps,...codecs,
      '-map_metadata',keep?'0':'-1','-map_chapters',keep?'0':'-1',
      ...(!keep?['-map_metadata:s','-1']:[]),
      ...args,'-f',mux,'-progress','pipe:1','-nostats',outputPath],{signal,timeout:runLimit,onStdout:progress});
    if(result.stderr?.trim())throw new Error('Tool reported conversion errors: '+result.stderr.trim().slice(-2000));
  }
  async verify(path,step,{signal,expectedDuration=0}={}){
    const plan=step?.media;
    if(!plan)throw new Error('Missing verification plan');
    const result=await this.probe(path,{signal});
    if(!matchesMux(plan,result.state))throw new Error('Output container does not match the conversion plan');
    const sourceGroups=Map.groupBy(plan.rows,r=>r.source.type);
    const actualGroups=Map.groupBy(result.state.streams,s=>s.type);
    if(sourceGroups.size!==actualGroups.size)throw new Error('Output stream types do not match the conversion plan');
    for(const [type,rows] of sourceGroups){
      const actual=actualGroups.get(type);
      if(actual?.length!==rows.length)throw new Error('Output track count does not match the conversion plan');
      rows.forEach((row,index)=>{
        const real=actual[index];
        if(real.codec!==row.expectedCodec && !(row.expectedCodec==='ssa'&&real.codec==='ass'))throw new Error('Output codec does not match the conversion plan');
        if(type==='audio'&&(real.channels!==row.source.channels||(real.layout&&row.source.layout&&real.layout!==row.source.layout)))throw new Error('Output audio speaker layout does not match the conversion plan');
        if(type==='video'&&index===0&&plan.size&&(real.width!==plan.size[0]||real.height!==plan.size[1]))throw new Error('Output dimensions do not match the conversion plan');
        if(type==='video'&&index===0&&plan.frameRate&&![real.frameRate,real.averageFrameRate].some(rate=>Math.abs(rate-plan.frameRate)<.5))throw new Error('Output frame rate does not match the conversion plan');
        if(type==='video'&&index===0&&plan.pixelFormat&&plan.pixelFormat!==real.pixelFormat)throw new Error('Output pixel format does not match the conversion plan');
        if(plan.keep){
          if(typeof row.expectedDefault==='boolean'&&row.expectedDefault!==real.default)throw new Error('Output default disposition does not match the conversion plan');
          if(real.forced!==row.source.forced)throw new Error('Output forced disposition does not match the source');
          verifyTags(row.source.tags,real.tags);
        }
      });
    }
    if(plan.keep){
      verifyTags(plan.tags,result.state.tags);
      if(result.state.chapters.length!==plan.chapters.length)throw new Error('Output chapter count does not match the conversion plan');
      plan.chapters.forEach((chapter,i)=>{
        const actual=result.state.chapters[i];
        if(Math.abs(chapter.start-actual.start)>.05||Math.abs(chapter.end-actual.end)>.05)throw new Error('Output chapter timing does not match the source');
        verifyTags(chapter.tags,actual.tags);
      });
    }
    let decodedDuration=0;
    const strict=['-hide_banner','-nostdin','-v','error','-xerror','-err_detect','explode',...localArgs(path),'-i',path];
    const av=result.state.streams.filter(s=>s.type==='video'||s.type==='audio');
    if(av.length){
      const decoded=await this.base.runner(this.base.ffmpeg,[...strict,...av.flatMap(s=>['-map',`0:${s.index}`]),
        '-abort_on','empty_output_stream','-threads','1','-progress','pipe:1','-f','null','-'],{signal,timeout:runLimit,onStdout:makeProgress(value=>{decodedDuration=Math.max(decodedDuration,value);})});
      if(decoded.stderr?.trim())throw new Error('Tool reported media decoding errors: '+decoded.stderr.trim().slice(-2000));
      if(plan.outputKind==='video'&&plan.durationCheck&&expectedDuration>0&&Math.abs(decodedDuration-expectedDuration)>Math.max(.75,expectedDuration*.05))throw new Error('Decoded video duration does not match the expected source duration');
    }
    const text=result.state.streams.filter(s=>s.type==='subtitle'&&TEXT_SUBTITLES.has(s.codec));
    if(text.length){
      if(!this.base.encoders.has('subrip')||!this.base.muxers.has('srt'))throw new Error('FFmpeg cannot validate output text subtitle tracks');
      // One local decode-to-stdout per track. Discard payload; never create files.
      for(const s of text){
        const decoded=await this.base.runner(this.base.ffmpeg,[...strict,'-map',`0:${s.index}`,'-c:s','subrip','-abort_on','empty_output_stream','-f','srt','pipe:1'],{signal,timeout:runLimit,onStdout:()=>{}});
        if(decoded.stderr?.trim())throw new Error('Tool reported subtitle decoding errors: '+decoded.stderr.trim().slice(-2000));
      }
    }
    return result;
  }
}

function makeProgress(onTime){
  let buffer='';
  return chunk=>{
    buffer+=chunk;
    const lines=buffer.split('\n');buffer=lines.pop().slice(-4096);
    for(const line of lines){const m=/^out_time_us=(\d+)/.exec(line);if(m)onTime(Number(m[1])/1e6);}
  };
}

function verifyTags(expected,actual){
  for(const [key,value] of Object.entries(expected)){
    // MKV omits the implicit undetermined language rather than storing "und".
    if(key==='language'&&value==='und'&&!actual[key])continue;
    if(actual[key]!==value)throw new Error('Output metadata does not match the source: '+key);
  }
}

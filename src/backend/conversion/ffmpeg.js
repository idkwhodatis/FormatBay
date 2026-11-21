import {stat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {runProcess} from './process.js';
import {readBundledFFmpegVersion} from './bundled-ffmpeg-contract.js';
import {resolveTool} from './tool-path.js';
import {audioLayout,hasCanonicalLayout,hasKnownLayout} from './audio-layout.js';

const commonRates=[22050,32000,44100,48000,88200,96000];
const mp3Rates=[32000,44100,48000];
const aacRates=[32000,44100,48000];
const pcm=(codec,loss,precision)=>({codec,encoder:codec,loss,precision,sampleRates:commonRates});
const lossy=(codec,encoder,sampleRates,bitrates)=>({codec,encoder,loss:1,sampleRates,bitrates});
const aac=lossy('aac','aac',aacRates,[64,96,128,160,192]);
// Packaged choices are intersected with the fixed release contract, never ambient tools.
// These deliberately conservative subsets avoid invalid rate/bitrate tuples.
const audioFormats={
  wav:{muxer:'wav',profiles:[pcm('pcm_s16le',.1,16),pcm('pcm_s24le',.01,24),pcm('pcm_s32le',.005,32),pcm('pcm_f32le',.005,32)]},
  flac:{muxer:'flac',canonical:true,profiles:[{codec:'flac',encoder:'flac',loss:0,sampleRates:commonRates}]},
  mp3:{muxer:'mp3',channelLimit:2,autoDownmix:true,profiles:[lossy('mp3','libmp3lame',mp3Rates,[64,96,128,160,192,224,256,320])]},
  aac:{muxer:'adts',profiles:[aac]},
  ogg:{muxer:'ogg',canonical:true,profiles:[lossy('vorbis','libvorbis',[44100,48000],[64,96,112,128])]},
  opus:{muxer:'opus',canonical:true,profiles:[lossy('opus','libopus',[48000],[32,64,96,128,160,192,256])]},
  aiff:{muxer:'aiff',channelLimit:2,profiles:[pcm('pcm_s16be',.1,16),pcm('pcm_s24be',.01,24),pcm('pcm_s32be',.005,32)]},
  m4a:{muxer:'ipod',channelLimit:2,profiles:[aac,{codec:'alac',encoder:'alac',loss:0,sampleRates:commonRates}]},
  caf:{muxer:'caf',channelLimit:2,profiles:[pcm('pcm_s16le',.1,16),pcm('pcm_s24le',.01,24),pcm('pcm_f32le',.005,32)]},
  au:{muxer:'au',channelLimit:2,profiles:[pcm('pcm_s16be',.1,16),pcm('pcm_s24be',.01,24)]},
  ac3:{muxer:'ac3',channelLimit:2,profiles:[lossy('ac3','ac3',[32000,44100,48000],[96,128,192,224,256,320,384,448,512,640])]},
};
// Flat defaults remain available to callers that only need the ordinary profile.
export const AUDIO_FORMATS=Object.freeze(Object.fromEntries(Object.entries(audioFormats).map(([format,spec])=>{
  const {codec,encoder,loss}=spec.profiles[0];return [format,Object.freeze({codec,encoder,loss,muxer:spec.muxer})];
})));
const localInput = ['-protocol_whitelist','file,pipe','-format_whitelist',
  'mov,matroska,webm,avi,mpeg,mpegts,flv,asf,mxf,wav,flac,mp3,aac,ogg,aiff,ape,caf,au,ac3'];

export function normalizeAudioOptions(options={}) {
  if (!options || typeof options!=='object' || ![Object.prototype,null].includes(Object.getPrototypeOf(options)) ||
    Reflect.ownKeys(options).some(key=>!['codec','bitrateKbps','sampleRate','channels'].includes(key))) throw new Error('Invalid audio options');
  const {codec,bitrateKbps,sampleRate,channels}=options;
  const validInt=(value,min,max)=>value===undefined || (Number.isInteger(value)&&value>=min&&value<=max);
  if ((codec!==undefined && (typeof codec!=='string' || !/^[a-z0-9_]{1,24}$/.test(codec))) ||
    !validInt(bitrateKbps,8,640) || !validInt(sampleRate,8000,192000) || !validInt(channels,1,2)) throw new Error('Invalid audio options');
  return Object.freeze({...(codec===undefined?{}:{codec}),...(bitrateKbps===undefined?{}:{bitrateKbps}),
    ...(sampleRate===undefined?{}:{sampleRate}),...(channels===undefined?{}:{channels})});
}

export class FFmpegAdapter {
  constructor({ffmpeg='ffmpeg',ffprobe='ffprobe',runner=runProcess,bundleContract=null}={}) {
    this.bundleContract=bundleContract;this.ffmpeg=ffmpeg;this.ffprobe=ffprobe;this.runner=runner;this.available=false;
    this.encoders=new Set();this.decoders=new Set();this.muxers=new Set();this.version='';
  }
  async discover() {
    try {
      // Custom runners are internal test seams; real process execution always
      // resolves trusted executable paths before discovery or conversion.
      if (this.runner===runProcess) {
        if(this.bundleContract&&(!this.ffmpeg||!this.ffprobe||!isAbsolute(this.ffmpeg)||!isAbsolute(this.ffprobe)))throw new Error('Bundled executables require explicit absolute paths');
        [this.ffmpeg,this.ffprobe]=await Promise.all([resolveTool(this.ffmpeg),resolveTool(this.ffprobe)]);
      }
      if(this.bundleContract){
        const {detail}=await readBundledFFmpegVersion(this.ffmpeg,this.ffprobe,{runner:this.runner,contract:this.bundleContract});
        this.version=detail;
        this.encoders=new Set(this.bundleContract.encoders);this.decoders=new Set(this.bundleContract.decoders);
        this.muxers=new Set(this.bundleContract.muxers);
        this.available=true;
        return {id:'ffmpeg',available:true,detail};
      }
      const results=await Promise.all([
        this.runner(this.ffmpeg,['-version']),this.runner(this.ffprobe,['-version']),
        this.runner(this.ffmpeg,['-hide_banner','-encoders']),
        this.runner(this.ffmpeg,['-hide_banner','-decoders']),
        this.runner(this.ffmpeg,['-hide_banner','-muxers']),
      ]);
      this.version=results[0].stdout.split('\n')[0];
      const parseCodecs=text=>new Set(text.split('\n').flatMap(line=>/^\s*[AVS][A-Z.]{5}\s+(\S+)/.exec(line)?.[1] ?? []));
      this.encoders=parseCodecs(results[2].stdout);this.decoders=parseCodecs(results[3].stdout);
      this.muxers=new Set(results[4].stdout.split('\n').flatMap(line=>/^\s*E\s+(\S+)/.exec(line)?.[1]?.split(',') ?? []));
      this.available=true;
      return {id:'ffmpeg',available:true,detail:this.version};
    } catch (error) {
      this.available=false;
      return {id:'ffmpeg',available:false,detail:(this.bundleContract?'The FormatBay FFmpeg bundle is missing or cannot be opened. ':'FFmpeg and ffprobe could not be opened. ')+error.message};
    }
  }
  availableProfiles(format) {
    const spec=Object.hasOwn(audioFormats,format)?audioFormats[format]:null;
    return this.available && spec && this.muxers.has(spec.muxer)
      ? spec.profiles.filter(profile=>this.encoders.has(profile.encoder) && this.canDecode(profile.codec)) : [];
  }
  formats() {return Object.keys(audioFormats).filter(format=>this.availableProfiles(format).length);}
  audioOptions(format) {
    const profiles=this.availableProfiles(format);
    if (!profiles.length) return null;
    return {defaultCodec:profiles[0].codec,codecs:profiles.map(({codec,sampleRates,bitrates})=>
      ({codec,sampleRates:[...sampleRates],bitrates:[...(bitrates??[])],channels:[1,2]}))};
  }
  audioProfile(format,options) {
    const profiles=this.availableProfiles(format);
    const profile=options.codec?profiles.find(item=>item.codec===options.codec):profiles[0];
    if(!profile ||
      (options.bitrateKbps!==undefined&&!profile.bitrates?.includes(options.bitrateKbps)) ||
      (options.sampleRate!==undefined&&!profile.sampleRates.includes(options.sampleRate))) {
      throw new Error('Audio options are unsupported by this format or installed encoder');
    }
    return profile;
  }
  capabilities(target) {
    const requested=normalizeAudioOptions(target?.options);
    const hasOptions=Object.keys(requested).length>0;
    if(hasOptions)this.audioProfile(target?.format,requested);
    return this.formats().flatMap(format => {
      const spec=audioFormats[format];
      const options=hasOptions&&target.format===format?requested:null;
      const profile=this.audioProfile(format,options??{});
      const output=state=>({kind:'audio',format,audioCodec:profile.codec,hasAudio:true,hasVideo:false,audioChannels:state.audioChannels??2,audioLayout:audioLayout(state)});
      const channelLimit=spec.channelLimit??Infinity;
      const channels=state=>options?.channels??Math.min(state.audioChannels??2,channelLimit);
      const selectedRate=state=>options?.sampleRate??(format==='opus'?48000:
        options?.bitrateKbps!==undefined ? (profile.sampleRates.includes(state.audioSampleRate)?state.audioSampleRate:48000) : undefined);
      const encodedOutput=state=>({...output(state),audioChannels:channels(state),
        audioLayout:options?.channels ? (channels(state)===1?'mono':'stereo') : (state.audioChannels??2)>channelLimit?'stereo':audioLayout(state),
        ...(selectedRate(state)!==undefined?{audioSampleRate:selectedRate(state)}:{})});
      const copiedOutput=state=>({...output(state),...(state.audioSampleRate!==undefined?{audioSampleRate:state.audioSampleRate}:{})});
      // FLAC/Vorbis/Opus use defined speaker mappings. A count-only conversion
      // can silently relabel LFE as center or side as back speakers.
      const acceptsLayout=state=>hasKnownLayout(state) &&
        (options?.channels!==undefined || !spec.canonical || hasCanonicalLayout(state)) &&
        (options?.channels!==undefined || spec.autoDownmix || (state.audioChannels??2)<=channelLimit);
      const warnings=state=>[
        'Video, subtitles, additional audio tracks and data/attachments are discarded; only the first audio stream is kept.',
        'Metadata, chapters and embedded artwork from the source are not retained; new encoder tags may be generated.',
      ];
      return [
        ...(!options?[{id:`ffmpeg:copy:${format}`,toolId:'ffmpeg',toolVersion:this.version,label:`Copy audio to ${format.toUpperCase()} (no re-encoding)`,available:true,verifyInput:true,loss:0,
          accepts:state=>state.hasAudio && hasKnownLayout(state) && state.audioCodec===profile.codec &&
            (spec.channelLimit===undefined || (state.audioChannels??2)<=channelLimit),output:copiedOutput,warnings}]:[]),
        {id:`ffmpeg:encode:${format}${options?':options':''}`,toolId:'ffmpeg',toolVersion:this.version,
          label:`Encode audio to ${format.toUpperCase()}${options?.codec?` (${profile.codec})`:''}`,
          available:true,loss:profile.loss,...(options?{options}:{}),
          accepts:state=>state.hasAudio && this.canDecode(state.audioCodec) && acceptsLayout(state),output:encodedOutput,
          warnings:state=>[...warnings(state),
            ...(channels(state)<(state.audioChannels??2)?[`Audio is downmixed to ${channels(state)} channels for this encoder.`]:[]),
            ...(channels(state)>(state.audioChannels??2)?[`Audio is expanded to ${channels(state)} channels; no new source channels are recovered.`]:[]),
            ...(format!=='opus'&&selectedRate(state)!==undefined&&selectedRate(state)!==state.audioSampleRate?[`Audio is encoded at ${selectedRate(state)} Hz.`]:[]),
            ...(profile.loss===1?['Lossy encoding can reduce audio quality.']:[]),
            ...(profile.precision?[`${format.toUpperCase()} encoding uses ${profile.precision}-bit PCM and may reduce higher bit-depth precision.`]:[]),
            ...(format==='opus'?['Opus uses a 48 kHz output sample rate.']:[]),
            ...(['flac','alac'].includes(profile.codec)?[`${profile.codec.toUpperCase()} stores integer PCM; floating-point or higher-precision inputs may be quantized. Lossless output cannot restore previously lost quality.`]:[])]},
      ];
    });
  }
  canDecode(codec) {
    const aliases={mp3:['mp3','mp3float'],aac:['aac','aac_fixed'],vorbis:['vorbis','libvorbis'],opus:['opus','libopus']};
    return (aliases[codec]??[codec]).some(value=>this.decoders.has(value));
  }
  async probe(path,{signal}={}) {
    const info=await stat(path);
    if (!info.isFile()) throw new Error('Input must be a regular file');
    const {stdout}=await this.runner(this.ffprobe,['-v','error',...localInput,'-show_streams','-show_format','-of','json',path],{signal,timeout:30000});
    const data=JSON.parse(stdout);
    const audio=data.streams?.find(stream=>stream.codec_type==='audio');
    const video=data.streams?.find(stream=>stream.codec_type==='video' && !stream.disposition?.attached_pic);
    const formats=(data.format?.format_name??'unknown').split(',');
    const brand=String(data.format?.tags?.major_brand??'').trim();
    const format=audio?.codec_name==='aac' && formats.includes('aac') ? 'aac' :
      formats.includes('ogg') ? (audio?.codec_name==='opus'?'opus':'ogg') :
      !video&&audio&&formats.includes('mov')&&brand==='M4A' ? 'm4a' : formats[0];
    const duration=Number(data.format?.duration ?? audio?.duration);
    const audioDuration=Number(audio?.duration ?? (!video ? data.format?.duration : 0));
    const audioSampleRate=Number(audio?.sample_rate);
    return {state:{kind:video?'video':'audio',format,audioCodec:audio?.codec_name??'',hasAudio:!!audio,hasVideo:!!video,audioChannels:audio?.channels??0,audioLayout:audioLayout({audioLayout:audio?.channel_layout,audioChannels:audio?.channels}),
      ...(Number.isSafeInteger(audioSampleRate)&&audioSampleRate>0?{audioSampleRate}:{})},
      duration:Number.isFinite(duration)&&duration>0?duration:0,audioDuration:Number.isFinite(audioDuration)&&audioDuration>0?audioDuration:0,size:info.size};
  }
  async verify(path,{signal,expectedDuration=0}={}) {
    let buffer='',decodedDuration=0;
    // Header probing alone accepts damaged/partially decodable media. Decode the
    // entire output before publishing, including stream-copy routes.
    const result=await this.runner(this.ffmpeg,['-hide_banner','-nostdin','-v','error','-xerror',
      '-err_detect','explode',...localInput,'-i',path,'-map','0:a:0','-vn','-sn','-dn',
      '-progress','pipe:1','-f','null','-'],{signal,timeout:24*60*60*1000,onStdout:chunk=>{
        buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop().slice(-4096);
        for(const line of lines){const match=/^out_time_us=(\d+)/.exec(line);if(match)decodedDuration=Math.max(decodedDuration,Number(match[1])/1e6);}
      }});
    if (result.stderr?.trim()) throw new Error('Tool reported decoding errors: '+result.stderr.trim().slice(-2000));
    if (expectedDuration>0 && Math.abs(decodedDuration-expectedDuration)>Math.max(.5,expectedDuration*.05)) {
      throw new Error('Decoded output duration does not match the expected audio duration');
    }
  }
  async execute(step,inputPath,outputPath,{signal,duration=0,onProgress}={}) {
    const format=step.output.format,spec=Object.hasOwn(audioFormats,format)?audioFormats[format]:null;
    const options=normalizeAudioOptions(step.options);
    const edge=this.capabilities({format,options}).find(item=>item.id===step.capabilityId);
    if (!spec || !edge || !edge.accepts(step.input)) throw new Error('Unsupported conversion step');
    const expected=edge.output(step.input);
    if(Object.keys(expected).some(key=>step.output[key]!==expected[key])) throw new Error('Unsupported conversion step output');
    const copy=step.capabilityId===`ffmpeg:copy:${format}`;
    const profile=this.audioProfile(format,options);
    let buffer='';
    const result=await this.runner(this.ffmpeg,['-hide_banner','-nostdin','-v','error','-xerror','-err_detect','explode','-n',...localInput,'-i',inputPath,
      '-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-map_chapters','-1',
      '-c:a',copy?'copy':profile.encoder,
      // -ac with an unchanged count can replace quad with default 4.0.
      ...(!copy && step.output.audioChannels!==step.input.audioChannels?['-ac',String(step.output.audioChannels)]:[]),
      ...(!copy && options.channels!==undefined && step.output.audioLayout!==audioLayout(step.input)
        ?['-channel_layout',step.output.audioLayout]:[]),
      ...(!copy && expected.audioSampleRate!==undefined?['-ar',String(expected.audioSampleRate)]:[]),
      ...(!copy && options.bitrateKbps!==undefined?['-b:a',`${options.bitrateKbps}k`]:[]),
      '-f',spec.muxer,'-progress','pipe:1','-nostats',outputPath],{
        signal,timeout:24*60*60*1000,onStdout:chunk=>{
          buffer+=chunk;
          const lines=buffer.split('\n');buffer=lines.pop().slice(-4096);
          for(const line of lines){const match=/^out_time_us=(\d+)/.exec(line);if(match&&duration)onProgress?.(Math.min(.99,Number(match[1])/1e6/duration));}
        },
      });
    if (result.stderr?.trim()) throw new Error('Tool reported conversion errors: '+result.stderr.trim().slice(-2000));
  }
}

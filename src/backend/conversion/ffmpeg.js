import {stat} from 'node:fs/promises';
import {runProcess} from './process.js';
import {resolveTool} from './tool-path.js';
import {audioLayout,hasCanonicalLayout,hasKnownLayout} from './audio-layout.js';

export const AUDIO_FORMATS = Object.freeze({
  wav:{codec:'pcm_s16le',encoder:'pcm_s16le',muxer:'wav',loss:0},
  flac:{codec:'flac',encoder:'flac',muxer:'flac',loss:0},
  mp3:{codec:'mp3',encoder:'libmp3lame',muxer:'mp3',loss:1},
  aac:{codec:'aac',encoder:'aac',muxer:'adts',loss:1},
  ogg:{codec:'vorbis',encoder:'libvorbis',muxer:'ogg',loss:1},
  opus:{codec:'opus',encoder:'libopus',muxer:'opus',loss:1},
});
const localInput = ['-protocol_whitelist','file,pipe','-format_whitelist',
  'mov,matroska,webm,avi,mpeg,mpegts,flv,asf,mxf,wav,flac,mp3,aac,ogg,aiff,ape'];

export class FFmpegAdapter {
  constructor({ffmpeg='ffmpeg',ffprobe='ffprobe',runner=runProcess}={}) {
    this.ffmpeg=ffmpeg;this.ffprobe=ffprobe;this.runner=runner;this.available=false;
    this.encoders=new Set();this.decoders=new Set();this.muxers=new Set();this.version='';
  }
  async discover() {
    try {
      // Custom runners are internal test seams; real process execution always
      // resolves trusted executable paths before discovery or conversion.
      if (this.runner===runProcess) {
        [this.ffmpeg,this.ffprobe]=await Promise.all([resolveTool(this.ffmpeg),resolveTool(this.ffprobe)]);
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
      return {id:'ffmpeg',available:false,detail:'Install FFmpeg and ffprobe on PATH, then restart FormatBay. '+error.message};
    }
  }
  formats() {return Object.keys(AUDIO_FORMATS).filter(format=>this.available && this.encoders.has(AUDIO_FORMATS[format].encoder) && this.muxers.has(AUDIO_FORMATS[format].muxer) && this.canDecode(AUDIO_FORMATS[format].codec));}
  capabilities() {
    return this.formats().flatMap(format => {
      const spec=AUDIO_FORMATS[format];
      const output=state=>({kind:'audio',format,audioCodec:spec.codec,hasAudio:true,hasVideo:false,audioChannels:state.audioChannels??2,audioLayout:audioLayout(state)});
      const channelLimit=format==='mp3'?2:Infinity;
      const encodedOutput=state=>({...output(state),audioChannels:Math.min(state.audioChannels??2,channelLimit),
        audioLayout:(state.audioChannels??2)>channelLimit?'stereo':audioLayout(state)});
      // FLAC/Vorbis/Opus use defined speaker mappings. A count-only conversion
      // can silently relabel LFE as center or side as back speakers.
      const acceptsLayout=state=>hasKnownLayout(state) &&
        (!['flac','ogg','opus'].includes(format) || hasCanonicalLayout(state));
      const warnings=state=>[
        ...(state.hasVideo ? ['Video, subtitles and additional audio tracks are discarded; only the first audio stream is kept.'] : ['Only the first audio stream is kept.']),
        'Metadata, chapters and embedded artwork are not retained.',
      ];
      return [
        {id:`ffmpeg:copy:${format}`,toolId:'ffmpeg',toolVersion:this.version,label:`Copy audio to ${format.toUpperCase()} (no re-encoding)`,available:true,verifyInput:true,loss:0,
          accepts:state=>state.hasAudio && hasKnownLayout(state) && state.audioCodec===spec.codec,output,warnings},
        {id:`ffmpeg:encode:${format}`,toolId:'ffmpeg',toolVersion:this.version,label:`Encode audio to ${format.toUpperCase()}`,available:true,loss:spec.loss || (format==='wav' ? 0.1 : 0),
          accepts:state=>state.hasAudio && this.canDecode(state.audioCodec) && acceptsLayout(state),output:encodedOutput,
          warnings:state=>[...warnings(state),...((state.audioChannels??2)>channelLimit ? [`Audio is downmixed to ${channelLimit} channels for this encoder.`] : []),...(spec.loss ? ['Lossy encoding can reduce audio quality.'] : []),...(format==='wav' ? ['WAV encoding uses 16-bit PCM and may reduce higher bit-depth precision.'] : []),...(format==='opus' ? ['Opus uses a 48 kHz output sample rate.'] : []),...(format==='flac' ? ['FLAC stores integer PCM; floating-point or higher-precision inputs may be quantized. Lossless output cannot restore previously lost quality.'] : [])]},
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
    const format=audio?.codec_name==='aac' && formats.includes('aac') ? 'aac' : formats.includes('ogg') ? (audio?.codec_name==='opus'?'opus':'ogg') : formats[0];
    const duration=Number(data.format?.duration ?? audio?.duration);
    const audioDuration=Number(audio?.duration ?? (!video ? data.format?.duration : 0));
    return {state:{kind:video?'video':'audio',format,audioCodec:audio?.codec_name??'',hasAudio:!!audio,hasVideo:!!video,audioChannels:audio?.channels??0,audioLayout:audioLayout({audioLayout:audio?.channel_layout,audioChannels:audio?.channels})},
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
    const format=step.output.format,spec=AUDIO_FORMATS[format];
    if (!spec || !this.capabilities().some(edge=>edge.id===step.capabilityId)) throw new Error('Unsupported conversion step');
    const copy=step.capabilityId===`ffmpeg:copy:${format}`;
    let buffer='';
    const result=await this.runner(this.ffmpeg,['-hide_banner','-nostdin','-v','error','-xerror','-err_detect','explode','-n',...localInput,'-i',inputPath,
      '-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-map_chapters','-1',
      '-c:a',copy?'copy':spec.encoder,
      // -ac with an unchanged count can replace quad with default 4.0.
      ...(!copy && step.output.audioChannels!==step.input.audioChannels?['-ac',String(step.output.audioChannels)]:[]),
      ...(!copy && format==='opus'?['-ar','48000']:[]),
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

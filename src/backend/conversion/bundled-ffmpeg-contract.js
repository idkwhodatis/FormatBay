// Fixed capability contract for the source-complete LGPL build described in
// scripts/bundled-ffmpeg-sources.tsv and scripts/build-bundled-ffmpeg.sh.
// This is an intentionally conservative allowlist, not the list of everything
// that FFmpeg happened to compile. Packaging verifies each declared requirement.
import {runProcess} from './process.js';

const names=value=>Object.freeze(value.split(/\s+/).filter(Boolean));
const definitions=Object.freeze({
  encoders:names(`
    aac ac3 alac flac libmp3lame libopus libvorbis mp2 wmav2
    pcm_f32le pcm_s16be pcm_s16le pcm_s24be pcm_s24le pcm_s32be pcm_s32le
    bmp ffv1 flv gif jpeg2000 mjpeg mpeg2video mpeg4 png prores wmv2
    ass subrip webvtt
  `),
  decoders:names(`
    aac ac3 alac ape dca eac3 flac mp2 mp3float opus truehd vorbis wmav1 wmav2
    pcm_f32be pcm_f32le pcm_f64be pcm_f64le pcm_s8 pcm_u8 pcm_s16be pcm_s16le pcm_s24be pcm_s24le pcm_s32be pcm_s32le
    bmp ffv1 flv gif h264 hevc huffyuv jpeg2000 mjpeg mpeg1video mpeg2video mpeg4 png prores theora tiff vc1 vp8 vp9 webp wmv1 wmv2 wmv3
    ass dvbsub dvdsub mov_text pgssub ssa subrip text webvtt
  `),
  muxers:names(`3gp ac3 adts aiff asf au avi caf flac flv gif ico image2pipe ipod matroska mov mp3 mp4 mpeg mpegts null ogg opus srt ass wav webm webvtt`),
  demuxers:names(`
    aac ac3 aiff ape asf ass au avi bmp_pipe caf flac flv gif ico jpeg_pipe matroska
    mjpeg_2000 mov mp3 mpeg mpegts mxf ogg png_pipe srt tiff_pipe wav webm webp_pipe webvtt
  `),
  filters:names('scale aresample'),
});
export const BUNDLED_FFMPEG_CONTRACT=Object.freeze({version:'9.0.2',...definitions});

// configure identifiers need not match demuxer/muxer CLI aliases.
const suffix={encoders:'ENCODER',decoders:'DECODER',muxers:'MUXER',demuxers:'DEMUXER',filters:'FILTER'};
const configureAliases={
  'decoders:mov_text':'movtext','muxers:3gp':'tgp','muxers:mpeg':'mpeg1system',
  'demuxers:mpeg':'mpegps','demuxers:webm':'matroska',
  'demuxers:bmp_pipe':'image_bmp_pipe','demuxers:jpeg_pipe':'image_jpeg_pipe',
  'demuxers:png_pipe':'image_png_pipe','demuxers:tiff_pipe':'image_tiff_pipe','demuxers:webp_pipe':'image_webp_pipe',
};
export const BUNDLED_FFMPEG_REQUIRED_CONFIG=Object.freeze([...new Set([
  ...Object.entries(definitions).flatMap(([kind,list])=>list.map(value=>
    `CONFIG_${(configureAliases[`${kind}:${value}`]??value).toUpperCase()}_${suffix[kind]}`)),
  'CONFIG_FFMPEG','CONFIG_FFPROBE','CONFIG_FILE_PROTOCOL','CONFIG_PIPE_PROTOCOL',
  'CONFIG_WRAPPED_AVFRAME_ENCODER','CONFIG_ZLIB',
])]);

const readList=(stdout,pattern)=>new Set(stdout.split('\n')
  .flatMap(line=>pattern.exec(line)?.[1]?.split(',')??[]));
const codecLine=/^\s*[AVS][A-Z.]{5}\s+([a-zA-Z0-9_]+)(?=\s|$)/;
const muxerLine=/^\s*E\s+([a-zA-Z0-9_,]+)(?=\s|$)/;
const demuxerLine=/^\s*D\s+([a-zA-Z0-9_,]+)(?=\s|$)/;
const filterLine=/^\s*[TSC.]{2,3}\s+([a-zA-Z0-9_]+)(?=\s|$)/;

export async function readBundledFFmpegVersion(ffmpeg,ffprobe,{runner=runProcess,contract=BUNDLED_FFMPEG_CONTRACT}={}){
  const results=await Promise.all([ffmpeg,ffprobe].map(command=>runner(command,['-version'],{timeout:15000})));
  const detail=results.map(result=>result.stdout.split(/\r?\n/,1)[0]);
  // Exact release, optionally followed by an ordinary build suffix. Do not
  // accept dotted newer/older versions or the wrong program's version line.
  const expected=contract.version.replaceAll('.','\\.');
  for(const [i,name] of ['ffmpeg','ffprobe'].entries()){
    if(!new RegExp(`^${name} version ${expected}(?:-[A-Za-z0-9+_.-]+)?(?:\\s|$)`).test(detail[i])){
      throw new Error(`Bundled ${name} must report release ${contract.version}; observed ${detail[i]||'no version'}`);
    }
  }
  return {version:contract.version,detail:detail[0]};
}

/** Packaging acceptance only. Runtime uses the release allowlist, never these results. */
export async function verifyBundledFFmpegCapabilities(ffmpeg,ffprobe,{runner=runProcess}={}){
  const version=await readBundledFFmpegVersion(ffmpeg,ffprobe,{runner});
  const read=(binary,flag,pattern)=>runner(binary,['-hide_banner',flag],{timeout:15000}).then(r=>readList(r.stdout,pattern));
  const [encoders,decoders,muxers,demuxers,probeDemuxers,filters]=await Promise.all([
    read(ffmpeg,'-encoders',codecLine),read(ffmpeg,'-decoders',codecLine),read(ffmpeg,'-muxers',muxerLine),
    read(ffmpeg,'-demuxers',demuxerLine),read(ffprobe,'-demuxers',demuxerLine),read(ffmpeg,'-filters',filterLine),
  ]);
  const observed={encoders,decoders,muxers,demuxers,filters};
  const missing=Object.entries(definitions).flatMap(([kind,list])=>list.filter(value=>
    !observed[kind].has(value)||(kind==='demuxers'&&!probeDemuxers.has(value))).map(value=>`${kind}:${value}`));
  if(missing.length)throw new Error('Bundled FFmpeg capability contract is incomplete: '+missing.join(', '));
  return version;
}

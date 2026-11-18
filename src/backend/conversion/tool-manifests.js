/** Reviewed, immutable download catalog. Renderer never supplies URLs or hashes. */
export const TOOL_MANIFESTS = Object.freeze({
 ffmpeg:Object.freeze({id:'ffmpeg',label:'FFmpeg + ffprobe',version:'9.0.2-gyan-essentials',platform:'win32',arch:'x64',
  url:'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip',
  sha256:'60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
  size:114768076,maxBytes:200*1024*1024,maxExtractBytes:600*1024*1024,
  hosts:['github.com','release-assets.githubusercontent.com'],license:'GPL-3.0 (upstream static build)',licenseURL:'https://www.gyan.dev/ffmpeg/builds/',
  files:{'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe':'ffmpeg.exe','ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe':'ffprobe.exe','ffmpeg-9.0.2-essentials_build/LICENSE':'LICENSE'},
  commands:['ffmpeg','ffprobe']}),
 opusenc:Object.freeze({id:'opusenc',label:'Xiph opusenc',version:'0.2-opus-1.3',platform:'win32',arch:'x64',
  url:'https://archive.mozilla.org/pub/opus/win64/opus-tools-0.2-opus-1.3-win64.zip',
  sha256:'a892bd29358e142fa756da6bfcaea2faadc0f82ee1947d9eb2cecd208f1b873f',
  size:1460562,maxBytes:10*1024*1024,maxExtractBytes:10*1024*1024,
  hosts:['archive.mozilla.org'],license:'BSD-style (see included upstream notices)',licenseURL:'https://opus-codec.org/license/',
  files:{'opusenc.exe':'opusenc.exe','LICENSE':'LICENSE','opusenc.html':'opusenc.html'},commands:['opusenc']})
});

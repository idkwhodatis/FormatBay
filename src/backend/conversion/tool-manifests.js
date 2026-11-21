/** Reviewed, immutable download catalog. Renderer never supplies URLs or hashes. */
export const TOOL_MANIFESTS = Object.freeze({
 // FFmpeg is part of the application bundle, not the download catalog.
 ffmpeg:Object.freeze({id:'ffmpeg',label:'FFmpeg + ffprobe',version:'9.0.2-formatbay-lgpl',
  license:'LGPL-2.1-or-later (bundled source build)',commands:Object.freeze(['ffmpeg','ffprobe'])}),
 opusenc:Object.freeze({id:'opusenc',label:'Xiph opusenc',version:'0.2-opus-1.3',platform:'win32',arch:'x64',
  url:'https://archive.mozilla.org/pub/opus/win64/opus-tools-0.2-opus-1.3-win64.zip',
  sha256:'a892bd29358e142fa756da6bfcaea2faadc0f82ee1947d9eb2cecd208f1b873f',
  size:1460562,maxBytes:10*1024*1024,maxExtractBytes:10*1024*1024,
  hosts:['archive.mozilla.org'],license:'BSD-style (see included upstream notices)',licenseURL:'https://opus-codec.org/license/',
  files:{'opusenc.exe':'opusenc.exe','LICENSE':'LICENSE','opusenc.html':'opusenc.html'},commands:['opusenc']})
});

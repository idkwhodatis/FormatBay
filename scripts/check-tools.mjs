import assert from 'node:assert/strict';
import {FFmpegAdapter} from '../src/backend/conversion/ffmpeg.js';
import {OpusencAdapter} from '../src/backend/conversion/opusenc.js';

// CI must exercise actual binaries, never silently pass by skipping integrations.
const ffmpeg=new FFmpegAdapter(),opusenc=new OpusencAdapter();
for(const tool of [await ffmpeg.discover(),await opusenc.discover()]) {
  assert.equal(tool.available,true,`${tool.id}: ${tool.detail}`);
  console.log(`${tool.id}: ${tool.detail}`);
}
for(const format of ['wav','flac','mp3','aac','ogg','opus']) {
  assert.ok(ffmpeg.formats().includes(format),`FFmpeg needs ${format} encode/mux/decode support for the integration suite`);
}

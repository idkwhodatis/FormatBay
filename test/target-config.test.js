import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTarget} from '../src/frontend/src/lib/target-config.js';

const outputFormats = {Audio: ['opus'], Video: ['mkv', 'mp4'], Image: ['png', 'ico'], Subtitle: ['srt']};
const mkv = {
  videoCodecs: ['h264', 'mpeg4', 'vp9', 'hevc'], crfCodecs: ['h264', 'vp9'], pixelFormats: {hevc: ['yuv420p10le']},
  resize: true, frameRate: true, bitrate: true, preservesSubtitles: true, defaultTracks: true
};
const targetOptions = {
  audio: {opus: {defaultCodec: 'opus', codecs: [{codec: 'opus', sampleRates: [48000], bitrates: [96, 128], channels: [1, 2]}]}},
  video: {mkv, mp4: {...mkv, preservesSubtitles: false, defaultTracks: false}},
  image: {png: {resize: true}, ico: {resize: true}},
  subtitle: {srt: {}}
};
const configure = (format, draft = {}, encoder = '') =>
  buildTarget(format, draft, encoder, outputFormats, targetOptions, {opus: ['opusenc']});

test('renderer sends typed target kinds and automatic defaults', () => {
  for (const [category, format] of [['Audio', 'opus'], ['Video', 'mkv'], ['Image', 'png'], ['Subtitle', 'srt']]) {
    assert.deepEqual(configure([category, format]).target, {kind: category.toLowerCase(), format});
  }
  assert.equal(configure(['Video', 'avi']).target, null);
  assert.equal(configure(['text', 'srt']).target, null);
});

test('Opus encoder remains an alternative to typed FFmpeg options, not combined with them', () => {
  const draft = {codec: 'opus', sampleRate: '48000', bitrateKbps: '128', channels: '2'};
  assert.deepEqual(configure(['Audio', 'opus'], draft).target,
    {kind: 'audio', format: 'opus', options: {codec: 'opus', sampleRate: 48000, bitrateKbps: 128, channels: 2}});
  assert.deepEqual(configure(['Audio', 'opus'], {sampleRate: '48000'}).target,
    {kind: 'audio', format: 'opus', options: {sampleRate: 48000}});
  assert.equal(configure(['Audio', 'opus'], {sampleRate: '44100'}).errors.sampleRate, 'unavailable');
  assert.deepEqual(configure(['Audio', 'opus'], draft, 'opusenc').target,
    {kind: 'audio', format: 'opus', encoder: 'opusenc'});
});

test('new video drafts validate typed dimensions, track numbers and mutually exclusive options', () => {
  const draft = {videoCodec: 'h264', crf: '23', width: '1024', frameRate: '24', audioTrack: '0', defaultAudioTrack: '0'};
  const target = configure(['Video', 'mkv'], draft).target;
  assert.deepEqual(target, {kind: 'video', format: 'mkv',
    options: {videoCodec: 'h264', crf: 23, frameRate: 24, width: 1024, audioTrack: 0, defaultAudioTrack: 0}});
  draft.width = '64';
  assert.equal(target.options.width, 1024, 'a prepared target does not share a mutable draft');
  assert.deepEqual(configure(['Video', 'mkv'], {width: '17', height: '16.5', audioTrack: '64', frameRate: '1e2'}).errors,
    {frameRate: 'range', width: 'range', height: 'range', audioTrack: 'range'});
  assert.equal(configure(['Video', 'mkv'], {...draft, videoBitrateKbps: '700'}).errors.videoBitrateKbps, 'rateConflict');
  assert.equal(configure(['Video', 'mkv'], {...draft, defaultAudioTrack: '1'}).errors.defaultAudioTrack, 'trackConflict');
});

test('config only sends format-supported fields and removes subtitle selections when dropping all', () => {
  const rect = {width: '640', height: '360', audioTrack: '1', subtitleTrack: '2', dropSubtitles: true, argv: '-i hidden'};
  assert.deepEqual(configure(['Image', 'png'], rect).target, {kind: 'image', format: 'png', options: {width: 640, height: 360}});
  assert.deepEqual(configure(['Subtitle', 'srt'], rect).target, {kind: 'subtitle', format: 'srt', options: {subtitleTrack: 2}});
  assert.deepEqual(configure(['Video', 'mkv'], rect).target, {kind: 'video', format: 'mkv',
    options: {width: 640, height: 360, audioTrack: 1, dropSubtitles: true}});
  assert.deepEqual(configure(['Video', 'mp4'], rect).target, {kind: 'video', format: 'mp4',
    options: {width: 640, height: 360, audioTrack: 1}});
  assert.equal(configure(['Image', 'ico'], {width: '258'}).errors.width, 'range');
  assert.deepEqual(configure(['Image', 'ico'], {width: '256'}).target.options, {width: 256});
});

test('10-bit HEVC is offered only for a selected HEVC encoder with a declared pixel format', () => {
  const draft = {videoCodec: 'hevc', pixelFormat: 'yuv420p10le'};
  assert.deepEqual(configure(['Video', 'mkv'], draft).target.options, draft);
  assert.deepEqual(configure(['Video', 'mkv'], {...draft, videoCodec: 'h264'}).target.options, {videoCodec: 'h264'});
  assert.equal(configure(['Video', 'mkv'], {...draft, pixelFormat: 'yuv444p'}).target, null);
  const withoutSupport = {video: {mkv: {...mkv, pixelFormats: {}}}};
  assert.deepEqual(buildTarget(['Video', 'mkv'], draft, '', outputFormats, withoutSupport, {}).target.options, {videoCodec: 'hevc'});
});

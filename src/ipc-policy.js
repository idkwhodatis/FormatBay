/** Renderer authority is limited to our current top-level app document. */
export function assertTrustedSender(event, win, allowedURL, quitting = false) {
  if (quitting || !win || event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame || event.senderFrame?.url !== allowedURL) {
    throw new Error(`Untrusted IPC sender (closing=${quitting}, window=${!!win}, sender=${event.sender === win?.webContents}, mainFrame=${event.senderFrame === win?.webContents.mainFrame}, document=${event.senderFrame?.url === allowedURL})`);
  }
}
const categories = {audio: 'Audio', video: 'Video', image: 'Image', subtitle: 'Subtitle'};
const integer = (min, max) => value => Number.isInteger(value) && value >= min && value <= max;
const codec = value => typeof value === 'string' && /^[a-z0-9_]{1,32}$/.test(value);
const track = integer(0, 63);
const dimension = value => integer(16, 4096)(value) && value % 2 === 0;
const fields = {
  audio: {codec, bitrateKbps: integer(8, 640), sampleRate: integer(8000, 192000), channels: integer(1,2)},
  video: {videoCodec: codec, pixelFormat:value=>value==='yuv420p10le', crf: integer(0,51), videoBitrateKbps: integer(100, 50000), frameRate: integer(1,120),
    width:dimension, height:dimension, audioTrack:track, subtitleTrack:track, defaultAudioTrack:track, defaultSubtitleTrack:track, dropSubtitles:value=>typeof value==='boolean'},
  image: {width:dimension, height:dimension},
  subtitle: {subtitleTrack:track},
};
export function validateTarget(target, outputFormats, targetEncoders = {}) {
  if (!target || typeof target.kind !== 'string' || !Object.hasOwn(categories, target.kind) || typeof target.format !== 'string' ||
      !/^[a-z0-9]{1,12}$/.test(target.format) ||
      !outputFormats[categories[target.kind]]?.includes(target.format)) throw new Error('Unsupported target or unavailable tool');
  const clean = {kind: target.kind, format: target.format};
  if (target.options !== undefined) {
    if (!target.options || Array.isArray(target.options) || typeof target.options !== 'object') throw new Error('Invalid conversion options');
    const schema = fields[target.kind], options = {};
    for (const key of Object.keys(target.options)) {
      if (!Object.hasOwn(schema,key) || !schema[key](target.options[key])) throw new Error('Unsupported conversion option or value');
      options[key] = target.options[key];
    }
    if (Object.keys(options).length) clean.options = options;
  }
  if (target.encoder !== undefined) {
    if (target.kind !== 'audio' || target.options && Object.keys(target.options).length ||
        target.format !== 'opus' || target.encoder !== 'opusenc' ||
        !targetEncoders.opus?.includes('opusenc')) throw new Error('Unsupported or unavailable encoder');
    clean.encoder = 'opusenc';
  }
  return clean;
}
export function validateSetting(key, value, outputFormats) {
  if (key === 'offlineMode') {
    if (typeof value !== 'boolean') throw new Error('Expected boolean');
    return value;
  }
  if (key !== 'favorite') throw new Error('Unsupported setting');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid favorites');
  return Object.fromEntries(Object.entries(outputFormats).map(([category, formats]) => [category,
    Object.fromEntries(formats.map(format => [format, value[category]?.[format] === true]))]));
}

/** Validate the entire renderer batch before acting; never yield between cancellations. */
export function runTaskActionBatch(service, action, ids) {
  if (!['start', 'cancel', 'remove'].includes(action)) throw new Error('Unsupported action');
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500 ||
      ids.some(id => typeof id !== 'string' || !id || id.length > 128) || new Set(ids).size !== ids.length) {
    throw new Error('Invalid task selection');
  }
  const tasks = new Map(service.list().map(task => [task.id, task]));
  for (const id of ids) {
    if (!tasks.has(id)) throw new Error('Unknown task');
    if (action === 'remove' && tasks.get(id).status === 'running') throw new Error('Cancel the running task before removing it');
  }
  // Remove pending work before aborting the active tool. A synchronous batch also
  // prevents the queue draining between separate renderer IPC roundtrips.
  const ordered = action === 'cancel'
    ? [...ids.filter(id => tasks.get(id).status !== 'running'), ...ids.filter(id => tasks.get(id).status === 'running')]
    : ids;
  for (const id of ordered) service[action](id);
  return service.snapshot();
}

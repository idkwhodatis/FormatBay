const kinds = {Audio: 'audio', Video: 'video', Image: 'image', Subtitle: 'subtitle'};
const track = key => ({key, type: 'integer', min: 0, max: 63, step: 1});
const dimension = (key, max = 4096) => ({key, type: 'integer', min: 16, max, step: 2});
const integer = (key, min, max) => ({key, type: 'integer', min, max, step: 1});
const select = (key, choices) => ({key, type: 'select', choices});

export function targetKind(category) {
  return Object.hasOwn(kinds, category) ? kinds[category] : null;
}

function configFields(kind, format, profile, draft = {}, encoder = '') {
  if (kind === 'audio') {
    if (encoder || !profile?.codecs?.length) return [];
    const choices = profile.codecs.map(({codec}) => codec);
    const codec = profile.codecs.find(entry => entry.codec === (draft.codec || profile.defaultCodec));
    const fields = [select('codec', choices)];
    for (const [key, list] of [['sampleRate', codec?.sampleRates], ['bitrateKbps', codec?.bitrates], ['channels', codec?.channels]]) {
      if (list?.length) fields.push(select(key, list));
    }
    return fields;
  }
  if (kind === 'subtitle') return [track('subtitleTrack')];
  if (kind === 'image') {
    const maximum = format === 'ico' ? 256 : 4096;
    return profile?.resize ? [dimension('width', maximum), dimension('height', maximum)] : [];
  }
  if (kind !== 'video' || !profile) return [];

  const fields = [];
  if (profile.videoCodecs?.length) fields.push(select('videoCodec', profile.videoCodecs));
  const pixelFormats = draft.videoCodec === 'hevc'
    ? profile.pixelFormats?.hevc?.filter(value => value === 'yuv420p10le') : [];
  if (pixelFormats?.length) fields.push(select('pixelFormat', pixelFormats));
  if (profile.crfCodecs?.includes(draft.videoCodec)) fields.push(integer('crf', 0, 51));
  if (profile.bitrate) fields.push(integer('videoBitrateKbps', 100, 50000));
  if (profile.frameRate) fields.push(integer('frameRate', 1, 120));
  if (profile.resize) fields.push(dimension('width'), dimension('height'));
  fields.push(track('audioTrack'));
  if (profile.defaultTracks) fields.push(track('defaultAudioTrack'));
  if (profile.preservesSubtitles) {
    fields.push({key: 'dropSubtitles', type: 'boolean'});
    if (!draft.dropSubtitles) {
      fields.push(track('subtitleTrack'));
      if (profile.defaultTracks) fields.push(track('defaultSubtitleTrack'));
    }
  }
  return fields;
}

/** Build a fresh IPC value. Keep UI drafts and task snapshots independent. */
export function buildTarget(selectedFormat, draft, selectedEncoder, outputFormats, targetOptions, targetEncoders) {
  const [category, format] = selectedFormat ?? [];
  const kind = targetKind(category);
  const encoder = kind === 'audio' && format === 'opus' && selectedEncoder === 'opusenc' && targetEncoders?.opus?.includes('opusenc')
    ? selectedEncoder : '';
  const fields = configFields(kind, format, targetOptions?.[kind]?.[format], draft, encoder);
  const errors = {};
  if (!kind || !outputFormats?.[category]?.includes(format)) return {target: null, fields, errors};

  const target = {kind, format};
  if (encoder) target.encoder = encoder;
  const options = {};
  for (const field of fields) {
    const raw = draft?.[field.key];
    if (raw === undefined || raw === '') continue;
    if (field.type === 'boolean') {
      if (raw === true) options[field.key] = true;
    } else if (field.type === 'select') {
      const choice = field.choices.find(value => String(value) === raw);
      if (choice !== undefined) options[field.key] = choice;
      else errors[field.key] = 'unavailable';
    } else {
      const value = Number(raw);
      if (!(typeof raw === 'string' && /^\d+$/.test(raw)) || !Number.isSafeInteger(value) ||
          value < field.min || value > field.max || (value - field.min) % field.step !== 0) {
        errors[field.key] = 'range';
      } else {
        options[field.key] = value;
      }
    }
  }
  if (options.crf !== undefined && options.videoBitrateKbps !== undefined) errors.videoBitrateKbps = 'rateConflict';
  for (const [track, defaultTrack] of [['audioTrack', 'defaultAudioTrack'], ['subtitleTrack', 'defaultSubtitleTrack']]) {
    if (options[track] !== undefined && options[defaultTrack] !== undefined && options[track] !== options[defaultTrack]) {
      errors[defaultTrack] = 'trackConflict';
    }
  }
  if (Object.keys(options).length) target.options = options;
  return {target: Object.keys(errors).length ? null : target, fields, errors};
}

export const reviewOrder = [
  'videoCodec', 'pixelFormat', 'crf', 'videoBitrateKbps', 'frameRate', 'width', 'height',
  'codec', 'sampleRate', 'bitrateKbps', 'channels', 'audioTrack', 'defaultAudioTrack',
  'dropSubtitles', 'subtitleTrack', 'defaultSubtitleTrack'
];

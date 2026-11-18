/** Renderer authority is limited to our current top-level app document. */
export function assertTrustedSender(event, win, allowedURL, quitting = false) {
  if (quitting || !win || event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame || event.senderFrame?.url !== allowedURL) {
    throw new Error('Untrusted IPC sender');
  }
}
export function validateTarget(target, outputFormats, targetEncoders = {}) {
  if (!target || target.kind !== 'audio' || typeof target.format !== 'string' ||
      !outputFormats.Audio?.includes(target.format)) throw new Error('Unsupported target');
  const clean = {kind: 'audio', format: target.format};
  if (target.encoder !== undefined) {
    if (target.format !== 'opus' || target.encoder !== 'opusenc' ||
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

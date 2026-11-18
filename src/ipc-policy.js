/** Renderer authority is limited to our current top-level app document. */
export function assertTrustedSender(event, win, allowedURL, quitting = false) {
  if (quitting || !win || event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame || event.senderFrame?.url !== allowedURL) {
    throw new Error('Untrusted IPC sender');
  }
}
export function validateTarget(target, outputFormats) {
  if (!target || target.kind !== 'audio' || typeof target.format !== 'string' ||
      !outputFormats.Audio?.includes(target.format)) throw new Error('Unsupported target');
  return {kind: 'audio', format: target.format};
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

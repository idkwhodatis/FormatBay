// Potential formats are discoverable, but only actual capabilities may be imported.
export function visibleFormats(actual = {}, installable = {}) {
  return Object.fromEntries([...new Set([...Object.keys(actual), ...Object.keys(installable)])]
    .map(kind => [kind, [...new Set([...(actual[kind] ?? []), ...(installable[kind] ?? [])])]]));
}
export function acceptsToolSnapshot(currentRevision, snapshot) {
  return !!snapshot && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 &&
    snapshot.revision >= currentRevision && Array.isArray(snapshot.tools);
}

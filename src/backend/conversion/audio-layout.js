// Canonical speaker layouts represent positions, not just channel counts.
// Do not guess multichannel ordering from a count: e.g. 2.1 is not 3.0.
export const CANONICAL_LAYOUTS = Object.freeze({
  1:'mono',2:'stereo',3:'3.0',4:'quad',5:'5.0',6:'5.1',7:'6.1',8:'7.1',
});
export function audioLayout(state) {
  return state.audioLayout || (state.audioChannels===1?'mono':state.audioChannels===2?'stereo':'');
}
export function hasCanonicalLayout(state) {
  return !!CANONICAL_LAYOUTS[state.audioChannels] && audioLayout(state)===CANONICAL_LAYOUTS[state.audioChannels];
}
export function hasKnownLayout(state) {
  return !!audioLayout(state);
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertTrustedSender, validateTarget, validateSetting} from '../src/ipc-policy.js';

test('IPC accepts only current window main frame and exact document URL', () => {
  const url = 'file:///app/index.html';
  const frame = {url};
  const win = {webContents: {mainFrame: frame}};
  const event = {sender: win.webContents, senderFrame: frame};
  assert.doesNotThrow(() => assertTrustedSender(event, win, url));
  assert.throws(() => assertTrustedSender({...event, sender: {}}, win, url));
  assert.throws(() => assertTrustedSender({...event, senderFrame: {url}}, win, url));
  assert.throws(() => assertTrustedSender(event, win, 'https://evil.example/'));
  assert.throws(() => assertTrustedSender(event, win, url, true));
  assert.throws(() => assertTrustedSender(event, null, url));
  assert.throws(() => assertTrustedSender({...event, senderFrame: undefined}, win, url));
});
test('target strips extra renderer authority and rejects unsupported formats', () => {
  assert.deepEqual(validateTarget({kind:'audio',format:'wav',command:'rm',path:'/etc/passwd'}, {Audio:['wav']}), {kind:'audio',format:'wav'});
  for(const target of [null,{}, {kind:'video',format:'wav'}, {kind:'audio',format:'mp3'}])
    assert.throws(() => validateTarget(target, {Audio:['wav']}));
});
test('settings are allowlisted and favorite values normalized to catalog booleans', () => {
  assert.equal(validateSetting('offlineMode', false, {}), false);
  assert.throws(() => validateSetting('offlineMode', 'false', {}));
  assert.throws(() => validateSetting('outputDirectory', '/etc', {}));
  assert.throws(() => validateSetting('favorite', [], {}));
  assert.deepEqual(validateSetting('favorite', {Audio:{wav:true,mp3:1,evil:true},Other:{}}, {Audio:['wav','mp3']}), {Audio:{wav:true,mp3:false}});
});
test('encoder preference requires advertised opusenc capability for Opus only', () => {
  const outputs={Audio:['opus','wav']};const encoders={opus:['opusenc']};
  assert.deepEqual(validateTarget({kind:'audio',format:'opus'},outputs,encoders),{kind:'audio',format:'opus'});
  assert.deepEqual(validateTarget({kind:'audio',format:'opus',encoder:'opusenc',command:'ignored'},outputs,encoders),{kind:'audio',format:'opus',encoder:'opusenc'});
  for(const encoder of ['',null,1,'ffmpeg','unknown'])
    assert.throws(()=>validateTarget({kind:'audio',format:'opus',encoder},outputs,encoders));
  assert.throws(()=>validateTarget({kind:'audio',format:'wav',encoder:'opusenc'},outputs,encoders));
  assert.throws(()=>validateTarget({kind:'audio',format:'opus',encoder:'opusenc'},outputs,{}));
  assert.throws(()=>validateTarget({kind:'audio',format:'opus',encoder:'opusenc'},outputs));
  assert.throws(()=>validateTarget({kind:'audio',format:'opus',encoder:'opusenc'},{Audio:[]},encoders));
});

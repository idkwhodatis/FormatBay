import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {assertTrustedSender, validateTarget, validateSetting, runTaskActionBatch} from '../src/ipc-policy.js';

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
test('Windows packaged document URLs round-trip special path characters and keep exact IPC checks', () => {
  const entry = String.raw`C:\Users\RUNNER~1\AppData\Local\Temp\portable ~ space # % 中文\resources\app.asar\src\frontend\dist\index.html`;
  // Node's WHATWG URL is used for both loadURL and the trusted sender URL.
  // Legacy Electron loadFile formatting left ~ unescaped and broke this equality.
  const allowedURL = pathToFileURL(entry, {windows: true}).href;
  assert.equal(allowedURL, 'file:///C:/Users/RUNNER%7E1/AppData/Local/Temp/portable%20%7E%20space%20%23%20%25%20%E4%B8%AD%E6%96%87/resources/app.asar/src/frontend/dist/index.html');
  assert.equal(fileURLToPath(allowedURL, {windows: true}), entry);
  assert.equal(new URL(allowedURL).href, allowedURL);
  const frame = {url: allowedURL};
  const win = {webContents: {mainFrame: frame}};
  const event = {sender: win.webContents, senderFrame: frame};
  assert.doesNotThrow(() => assertTrustedSender(event, win, allowedURL));
  for (const untrustedURL of [
    allowedURL.replaceAll('%7E', '~'), // equivalent path, but not the exact loaded URL
    `${allowedURL}#fragment`,
    `${allowedURL}?query=1`,
    allowedURL.replace('index.html', 'other.html'),
  ]) {
    frame.url = untrustedURL;
    assert.throws(() => assertTrustedSender(event, win, allowedURL));
  }
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
test('batch cancellation handles queued tasks before active task without yielding', () => {
  const calls=[];let revision=0;
  const service={list:()=>[{id:'a',status:'running'},{id:'b',status:'queued'},{id:'c',status:'queued'}],cancel:id=>{calls.push(id);revision++;},snapshot:()=>({revision,tasks:[]})};
  assert.deepEqual(runTaskActionBatch(service,'cancel',['a','b','c']),{revision:3,tasks:[]});
  assert.deepEqual(calls,['b','c','a']);
});
test('invalid action or any invalid batch member prevents all mutations', () => {
  const calls=[];const service={list:()=>[{id:'a',status:'ready'},{id:'b',status:'running'}],start:id=>calls.push(id),remove:id=>calls.push(id),snapshot:()=>({revision:0,tasks:[]})};
  for(const ids of [null,'a',[],['a','missing'],['a','a'],['a',3],['a',''],['a','x'.repeat(129)],Array.from({length:501},(_,i)=>String(i))])
    assert.throws(()=>runTaskActionBatch(service,'start',ids));
  assert.throws(()=>runTaskActionBatch(service,'shutdown',['a']));
  assert.throws(()=>runTaskActionBatch(service,'remove',['a','b']));
  assert.deepEqual(calls,[]);
  runTaskActionBatch(service,'start',['a']);
  assert.deepEqual(calls,['a']);
});

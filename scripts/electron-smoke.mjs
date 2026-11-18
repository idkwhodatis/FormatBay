/** Native production-entry smoke. Run with: node scripts/electron-smoke.mjs
 * No production test hooks, fake bridges, or mocked native dialogs are used.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, rm, access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(filename), '..');
const successMarker = 'FORMATBAY_NATIVE_SMOKE_PASSED';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, milliseconds, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
  })]); } finally { clearTimeout(timer); }
}

async function launch() {
  await access(path.join(root, 'src/frontend/dist/index.html'));
  const require = createRequire(import.meta.url);
  const electron = require('electron'); // Installed binary path, not a downloaded runner.
  await access(electron);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'formatbay electron smoke-'));
  let safeToRemoveProfile = true;
  try {
    await mkdir(path.join(temporary, 'userData'));
    await mkdir(path.join(temporary, 'session'));
    const env = {...process.env, FORMATBAY_SMOKE_ROOT: temporary};
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [filename], {
      cwd: root, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32', windowsHide: true,
    });
    safeToRemoveProfile = false;
    let stdout = '', stderr = '', timedOut = false, closed = false, spawnError;
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-65536); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-65536); });
    const exit = new Promise(resolve => {
      child.once('error', error => { spawnError = error; });
      child.once('close', (code, signal) => {
        closed = true;
        safeToRemoveProfile = true;
        resolve({code, signal});
      });
    });
    const finalKill = () => { try { child.kill('SIGKILL'); } catch {} };
    const killTree = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {shell:false, windowsHide:true, stdio:'ignore', timeout:5000});
        killer.on('error', finalKill);
        killer.on('exit', code => { if (code !== 0) finalKill(); });
        killer.unref();
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { finalKill(); }
      }
    };
    const timer = setTimeout(() => { timedOut = true; killTree(); }, 90000);
    let result;
    try {
      result = await bounded(exit, 100000, 'Electron child exit');
    } finally {
      clearTimeout(timer);
      if (!closed) {
        killTree();
        try { await bounded(exit, 5000, 'Final Electron termination'); }
        catch {
          // Do not delete a potentially live profile or let failed taskkill keep
          // the Node runner alive via inherited pipes/process handles.
          finalKill();
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
          console.error(`Could not confirm Electron exit after final kill; retaining isolated profile: ${temporary}`);
        }
      }
    }
    if (spawnError) throw spawnError;
    if (timedOut || result.code !== 0 || !stdout.includes(successMarker)) {
      throw new Error(`Native smoke failed (timeout=${timedOut}, code=${result.code}, signal=${result.signal}).\n${stdout}\n${stderr}`);
    }
    console.log(stdout.trim());
  } finally {
    // Remove profiles only after Electron releases Windows file handles.
    if (safeToRemoveProfile) await rm(temporary, {recursive:true, force:true, maxRetries:10, retryDelay:200});
  }
}

async function smoke() {
  const {app} = await import('electron');
  const temporary = process.env.FORMATBAY_SMOKE_ROOT;
  if (!temporary) throw new Error('Run this harness with node scripts/electron-smoke.mjs');
  app.setPath('userData', path.join(temporary, 'userData'));
  app.setPath('sessionData', path.join(temporary, 'session'));
  app.commandLine.appendSwitch('lang', 'en-US');
  const errors = [];
  let window;
  let debuggerReady;
  let passed = false;
  const watchdog = setTimeout(() => {
    console.error('Native smoke child exceeded 75 seconds');
    app.exit(1);
  }, 75000);
  app.on('will-quit', () => {
    clearTimeout(watchdog);
    if (passed && !errors.length) console.log(successMarker);
    else if (errors.length) console.error(errors.join('\n'));
  });
  app.on('browser-window-created', (_event, created) => {
    if (window) { errors.push('Unexpected additional BrowserWindow'); return; }
    window = created;
    const web = created.webContents;
    web.on('preload-error', (_event, preload, error) => errors.push(`Preload ${preload}: ${error.message}`));
    web.on('did-fail-load', (_event, code, description, url, mainFrame) => {
      if (mainFrame) errors.push(`Load ${code}: ${description} ${url}`);
    });
    web.on('render-process-gone', (_event, details) => {
      if (!passed || details.reason !== 'clean-exit') {
        errors.push(`Renderer exited unexpectedly: ${details.reason}`);
      }
    });
    web.on('console-message', details => {
      if (details.level === 'error') errors.push(`Renderer console: ${details.message}`);
    });
    try {
      web.debugger.attach('1.3');
      web.debugger.on('message', (_event, method, params) => {
        if (method === 'Runtime.exceptionThrown') {
          const detail = params.exceptionDetails;
          errors.push(`Renderer exception: ${detail.exception?.description ?? detail.text}`);
        }
      });
      debuggerReady = web.debugger.sendCommand('Runtime.enable').catch(error => { errors.push(`Debugger: ${error.message}`); });
    } catch (error) { errors.push(`Debugger attach: ${error.message}`); }
  });
  try {
    await import('../src/main.js');
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.deepEqual(errors, []);
      if (window && !window.isDestroyed() && !window.webContents.isLoading()) {
        ready = await bounded(window.webContents.executeJavaScript(
          "Boolean(document.querySelector('main aside') && document.querySelector('main section h1') && window.electronAPI && window.store)"), 5000, 'Renderer boot check');
        if (ready) break;
      }
      await sleep(100);
    }
    assert.ok(ready, 'Production renderer did not initialize');
    await debuggerReady;
    assert.equal(window.webContents.getURL(), pathToFileURL(path.join(root, 'src/frontend/dist/index.html')).href);
    const preferences = window.webContents.getLastWebPreferences();
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.nodeIntegration, false);
    const result = await bounded(window.webContents.executeJavaScript(`(async () => {
      const expectReject = async (operation) => {
        try { await operation(); return false; } catch { return true; }
      };
      const api = window.electronAPI;
      const data = await api.getInitData();
      const unsubscribe = api.onTasks(() => {});
      const canUnsubscribe = typeof unsubscribe === 'function';
      unsubscribe();
      await window.store.set('offlineMode', false);
      const persisted = await window.store.get('offlineMode');
      const rejects = await Promise.all([
        expectReject(() => api.addFiles({kind:'video',format:'not-real'})),
        expectReject(() => api.taskAction('start',['not-a-task'])),
        expectReject(() => api.taskAction('start',[])),
        expectReject(() => api.taskAction('shutdown',['not-a-task'])),
        expectReject(() => window.store.get('arbitrary-secret')),
        expectReject(() => window.store.set('outputDirectory','not-authorized')),
      ]);
      const resetOutput = await api.resetOutputDirectory();
      return {title:document.title, heading:document.querySelector('main section h1').textContent,
        apiKeys:Object.keys(api).sort(), storeKeys:Object.keys(window.store).sort(),
        requireType:typeof window.require, processType:typeof window.process,
        data, canUnsubscribe, persisted, rejects, resetOutput,
        after:(await api.getInitData()).taskSnapshot};
    })()`), 15000, 'Real preload IPC assertions');
    assert.equal(result.title, 'FormatBay');
    assert.ok(result.heading.trim());
    assert.deepEqual(result.apiKeys, ['addFiles','chooseOutputDirectory','closeApp','getInitData','minimizeApp','onTasks','resetOutputDirectory','taskAction'].sort());
    assert.deepEqual(result.storeKeys, ['get','set']);
    assert.equal(result.requireType, 'undefined');
    assert.equal(result.processType, 'undefined');
    assert.ok(result.data.outputFormats.Audio.length > 0, 'Install FFmpeg/ffprobe for native smoke');
    assert.ok(result.data.tools.some(tool => tool.id === 'ffmpeg' && tool.available));
    assert.deepEqual(result.data.taskSnapshot, {revision:0,tasks:[]});
    assert.deepEqual(result.after, result.data.taskSnapshot);
    assert.equal(result.canUnsubscribe, true);
    assert.equal(result.persisted, false);
    assert.ok(result.rejects.every(Boolean), 'An invalid IPC request was accepted');
    assert.equal(result.resetOutput, null);
    await sleep(100);
    assert.deepEqual(errors, []);
    console.log('Native production renderer, preload isolation, real IPC/catalog/settings validation: passed. Native file dialogs were not exercised.');
    passed = true;
    // Exercise the actual preload send and production shutdown path.
    // Destruction can reject executeJavaScript after the close IPC was delivered.
    // A missing close still fails via watchdog; only will-quit prints success.
    void window.webContents.executeJavaScript('window.electronAPI.closeApp()').catch(() => {});
  } catch (error) {
    clearTimeout(watchdog);
    console.error(error.stack ?? error);
    app.exit(1);
  }
}

if (process.versions.electron) {
  await smoke();
} else {
  await launch().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
}

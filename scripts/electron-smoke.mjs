/** Native production-entry smoke. Run with: node scripts/electron-smoke.mjs
 * Production startup/IPC/conversion are real. Only OS dialog results and Explorer
 * reveal are stubbed inside this harness for deterministic workflow coverage.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, rm, access, readFile, writeFile, stat, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {prepareWindowsDevFFmpeg} from './package-windows.mjs';

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
    if (process.env.FORMATBAY_FFMPEG_BUNDLE) {
      env.FORMATBAY_DEV_BUNDLED_TOOLS = path.join(temporary, 'tools');
      await prepareWindowsDevFFmpeg(process.env.FORMATBAY_FFMPEG_BUNDLE, env.FORMATBAY_DEV_BUNDLED_TOOLS);
    }
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
    const timer = setTimeout(() => { timedOut = true; killTree(); }, 195000);
    let result;
    try {
      result = await bounded(exit, 205000, 'Electron child exit');
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

async function exerciseWorkflows({window, dialogState, reveals, temporary, errors}) {
  const {runProcess} = await import('../src/backend/conversion/process.js');
  const web = window.webContents;
  const js = source => bounded(web.executeJavaScript(source), 10000, 'Workflow renderer command');
  const selector = id => `[data-testid="${id}"]`;
  async function until(predicate, label, timeout = 45000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      assert.deepEqual(errors, []);
      if (await js(predicate)) return;
      await sleep(25);
    }
    throw new Error(`Workflow timed out: ${label}`);
  }
  async function click(id, twice = false) {
    await until(`Boolean(document.querySelector(${JSON.stringify(selector(id))}) && !document.querySelector(${JSON.stringify(selector(id))}).disabled)`, `enabled ${id}`);
    await js(`{ const button = document.querySelector(${JSON.stringify(selector(id))}); button.click(); ${twice ? 'button.click();' : ''} }`);
  }
  async function select(id, value) {
    await until(`Boolean(document.querySelector(${JSON.stringify(selector(id))}))`, id);
    await js(`{ const input = document.querySelector(${JSON.stringify(selector(id))}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', {bubbles:true})); }`);
  }
  const snapshot = () => js('window.electronAPI.getInitData().then(data => data.taskSnapshot)');
  const input = path.join(temporary, '真实 video & input.mkv');
  await runProcess('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=black:s=16x16:r=2:d=1',
    '-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','ffv1','-c:a','pcm_s16le','-shortest',input]);
  const original = await readFile(input);
  assert.equal(await js(`document.querySelector('${selector('add-files')}').disabled`), true);
  await click('category-audio');
  await click('format-opus');
  await select('encoder-select', 'opusenc');
  await click('favorite-opus', true);
  await until('window.store.get("favorite").then(value => value?.Audio?.opus === true)', 'favorite saved');
  // The packaged catalog must not depend on PATH. Only optional opusenc
  // should disappear from the separate encoder selector when PATH is cleared.
  const pathEntries = Object.entries(process.env).filter(([key]) => key.toLowerCase() === 'path');
  const previousFavorite = await js('window.store.get("favorite")');
  const beforeTools = await js('window.electronAPI.getInitData()');
  try {
    for (const [key] of pathEntries) delete process.env[key];
    process.env.PATH = '';
    await click('tool-manager-toggle');
    await click('tools-refresh', true);
    await until(`window.electronAPI.getInitData().then(data => !data.targetEncoders?.opus?.includes('opusenc') && data.toolManagement.tools.find(tool => tool.id === 'opusenc')?.source === 'missing')`, 'only optional PATH encoder disappears');
    await until(`!document.querySelector('${selector('tools-refresh')}').disabled`, 'tool refresh unlocks');
    const afterTools = await js('window.electronAPI.getInitData()');
    assert.deepEqual(afterTools.outputFormats, beforeTools.outputFormats);
    assert.deepEqual(afterTools.targetOptions, beforeTools.targetOptions);
    assert.equal(afterTools.toolManagement.tools.find(tool=>tool.id==='ffmpeg').source, 'bundled');
    assert.equal(await js(`document.querySelector('${selector('tool-install-ffmpeg')}')`), null);
    assert.equal(await js(`document.querySelector('${selector('tool-remove-ffmpeg')}')`), null);
    assert.deepEqual(await js('window.store.get("favorite")'), previousFavorite);
  } finally {
    delete process.env.PATH;
    for (const [key, value] of pathEntries) process.env[key] = value;
  }
  await click('tools-refresh');
  await until(`window.electronAPI.getInitData().then(data => data.targetEncoders?.opus?.includes('opusenc'))`, 'tool refresh restores encoder');
  await until(`!document.querySelector('${selector('tools-refresh')}').disabled`, 'restored refresh unlocks');
  assert.deepEqual(await js('window.store.get("favorite")'), previousFavorite);
  assert.equal((await snapshot()).tasks.length, 0);
  await click('tool-manager-toggle');
  await click('format-opus');

  await click('format-wav');
  await until(`!document.querySelector('${selector('encoder-select')}')`, 'encoder hidden for WAV');
  await click('format-opus');
  await until(`document.querySelector('${selector('encoder-select')}')?.value === ''`, 'target change resets encoder');
  await select('encoder-select', 'opusenc');
  await click('tab-tasks');
  await click('tab-formats');
  await until(`document.querySelector('${selector('encoder-select')}')?.value === 'opusenc'`, 'encoder survives tab switch');

  // OS picker results are deliberately stubbed; all renderer events/IPC/planning
  // and real conversion processes below are production code.
  dialogState.queue.push({result:{canceled:true,filePaths:[]}});
  const cancelledCalls = dialogState.calls;
  await click('add-files', true);
  await until(`!document.querySelector('${selector('add-files')}').disabled`, 'cancelled picker unlocks');
  assert.equal(dialogState.calls, cancelledCalls + 1);
  assert.equal((await snapshot()).tasks.length, 0);
  dialogState.queue.push({error:'smoke picker failure'});
  await click('add-files');
  await until('document.body.innerText.includes("smoke picker failure")', 'picker rejection displayed');
  await until(`!document.querySelector('${selector('add-files')}').disabled`, 'failed picker unlocks');
  dialogState.queue.push({result:{canceled:false,filePaths:[path.join(temporary,'missing-input.mkv')]}});
  await click('add-files');
  await until(`document.querySelector('${selector('task-detail')}')?.dataset.status === 'blocked'`, 'invalid picker path becomes blocked');
  await click('task-remove');
  await until('window.electronAPI.getInitData().then(data => data.taskSnapshot.tasks.length === 0)', 'blocked task removed');

  dialogState.queue.push({result:{canceled:false,filePaths:[input]}});
  const importCalls = dialogState.calls;
  await click('add-files', true);
  await until(`document.querySelector('${selector('task-detail')}')?.dataset.status === 'ready'`, 'real source planned');
  assert.equal(dialogState.calls, importCalls + 1);
  const pendingSnapshot = await snapshot();
  const managementRejected = await js(`(async () => {
    const errors = [];
    for (const [method, id] of [['refreshTools'], ['installTool','opusenc'], ['removeTool','opusenc']]) {
      try { await window.electronAPI[method](id); errors.push(null); }
      catch (error) { errors.push(error.message); }
    }
    return errors;
  })()`);
  assert.ok(managementRejected.every(message => /pending conversion tasks/.test(message)), 'Pending plans must block tool mutation');
  assert.deepEqual(await snapshot(), pendingSnapshot);

  assert.deepEqual(await js(`Array.from(document.querySelectorAll('${selector('route-step')}'), node => node.dataset.toolId)`), ['ffmpeg','opusenc']);
  assert.ok(await js(`Array.from(document.querySelectorAll('${selector('route-warning')}')).some(node => /video/i.test(node.textContent))`));
  await click('task-start', true);
  await click('tab-formats');
  await click('tab-tasks');
  await until(`document.querySelector('${selector('task-detail')}')?.dataset.status === 'done'`, 'actual multi-tool conversion', 60000);
  const completed = (await snapshot()).tasks[0];
  assert.equal(completed.target.encoder, 'opusenc');
  assert.equal(completed.plan.steps.length, 2);
  assert.ok((await stat(completed.outputPath)).size > 0);
  assert.deepEqual(await readFile(input), original);
  await click('reveal-output', true);
  await until(`!document.querySelector('${selector('reveal-output')}').disabled`, 'reveal result');
  assert.deepEqual(reveals, [completed.outputPath]);
  const outputBytes = await readFile(completed.outputPath);
  await rm(completed.outputPath);
  try {
    await click('reveal-output');
    await until(`Array.from(document.querySelectorAll('[role="alert"]')).some(node => node.textContent.includes("moved or deleted"))`, 'missing output reveal error');
    await until(`!document.querySelector('${selector('reveal-output')}').disabled`, 'failed reveal unlocks');
    assert.deepEqual(reveals, [completed.outputPath], 'Missing output must not reach Explorer boundary');
  } finally { await writeFile(completed.outputPath, outputBytes); }
  await select('language-select', 'zh-cn');
  await until(`document.querySelector('${selector('reveal-output')}')?.textContent.includes('文件夹')`, 'Chinese UI');
  await select('language-select', 'en-us');
  await until(`document.querySelector('${selector('reveal-output')}')?.textContent.includes('folder')`, 'English UI');
  await click('task-remove');
  await until('window.electronAPI.getInitData().then(data => data.taskSnapshot.tasks.length === 0)', 'completed task removed');
  assert.ok((await stat(completed.outputPath)).size > 0, 'Removing task must not delete output');

  const longInput = path.join(temporary, 'cancel 音频 & input.mkv');
  await runProcess('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=black:s=16x16:r=2:d=120',
    '-f','lavfi','-i','sine=frequency=440:duration=120','-c:v','ffv1','-c:a','pcm_s16le','-shortest',longInput]);
  dialogState.queue.push({result:{canceled:false,filePaths:[longInput,longInput]}});
  await click('add-files');
  await until('window.electronAPI.getInitData().then(data => data.taskSnapshot.tasks.length === 2 && data.taskSnapshot.tasks.every(task => task.status === "ready"))', 'bulk input plans');
  await click('task-start-all', true);
  await click('task-stop-all', true);
  await until('window.electronAPI.getInitData().then(data => data.taskSnapshot.tasks.every(task => task.status === "cancelled"))', 'bulk cancellation cleanup');
  assert.ok((await snapshot()).tasks.every(task => !task.outputPath));
  assert.equal((await readdir(temporary)).some(name => name.startsWith('.formatbay-')), false);
  await click('task-remove');
  await until('window.electronAPI.getInitData().then(data => data.taskSnapshot.tasks.length === 1)', 'first cancelled task removed');
  const remaining = (await snapshot()).tasks[0];
  await until(`document.querySelectorAll('${selector('task-row')}').length === 1 && Boolean(document.querySelector('[data-testid="task-row"][data-task-id="${remaining.id}"]'))`, 'remaining task row rendered');
  await js(`document.querySelector('[data-testid="task-row"][data-task-id="${remaining.id}"]').click()`);
  await click('task-remove');
  await until('window.electronAPI.getInitData().then(data => data.taskSnapshot.tasks.length === 0)', 'cancelled tasks removed');

  await click('tab-formats');
  await click('category-video');
  await click('format-mkv');
  await until(`Boolean(document.querySelector('${selector('config-width')}'))`, 'MKV Config width');
  await js(`{ const input=document.querySelector('${selector('config-width')}'); input.value='32'; input.dispatchEvent(new Event('input',{bubbles:true})); }`);
  dialogState.queue.push({result:{canceled:false,filePaths:[input]}});
  await click('add-files');
  await until(`document.querySelector('${selector('task-detail')}')?.dataset.status === 'ready'`, 'configured MKV route');
  let mediaTask=(await snapshot()).tasks[0];
  assert.equal(mediaTask.target.options.width,32);
  assert.deepEqual(mediaTask.plan.steps.map(step=>step.toolId),['ffmpeg']);
  await click('task-start');
  await until(`document.querySelector('${selector('task-detail')}')?.dataset.status === 'done'`, 'configured MKV conversion',60000);
  mediaTask=(await snapshot()).tasks[0];
  const proof=JSON.parse((await runProcess('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',mediaTask.outputPath])).stdout);
  assert.deepEqual([proof.streams[0].width,proof.streams[0].height],[32,32]);
  assert.deepEqual(await readFile(input),original);
  assert.equal(dialogState.queue.length, 0);
  assert.deepEqual(errors, []);
  console.log('Real Electron DOM workflow passed: target/opusenc/favorite/tabs/language, fixed bundled catalog and management guards, picker cancellation/error, real FFmpeg→opusenc conversion, Config-driven one-step MKV with verified dimensions, reveal and bulk cancellation/removal. OS native dialogs and Explorer were stubbed, not tested.');
}

async function prepareSmoke(app) {
  const {dialog, shell} = await import('electron');
  const dialogState = {queue: [], calls: 0};
  const reveals = [];
  const originalDialog = dialog.showOpenDialog;
  const originalReveal = shell.showItemInFolder;
  dialog.showOpenDialog = async () => {
    dialogState.calls++;
    const next = dialogState.queue.shift();
    if (!next) throw new Error('Unexpected native dialog request in smoke');
    await sleep(30);
    if (next.error) throw new Error(next.error);
    return next.result;
  };
  shell.showItemInFolder = file => { reveals.push(file); };
  app.once('will-quit', () => {
    dialog.showOpenDialog = originalDialog;
    shell.showItemInFolder = originalReveal;
  });
  const errors = [];
  let window;
  let debuggerReady;
  let passed = false;
  const watchdog = setTimeout(() => {
    console.error('Native smoke child exceeded 180 seconds');
    app.exit(1);
  }, 180000);
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
  async function bootDiagnostics() {
    const diagnostic = {appReady: app.isReady(), windowExists: Boolean(window), windowDestroyed: window?.isDestroyed(),
      expectedURL: pathToFileURL(path.join(root, 'src/frontend/dist/index.html')).href,
      appPath: app.getAppPath(), errors: [...errors]};
    if (!window || window.isDestroyed()) return diagnostic;
    const web = window.webContents;
    diagnostic.currentURL = web.getURL();
    diagnostic.loading = web.isLoading();
    diagnostic.preferences = web.getLastWebPreferences();
    try {
      diagnostic.renderer = await bounded(web.executeJavaScript(`(async () => {
        const api = window.electronAPI;
        const result = {readyState: document.readyState, title: document.title,
          body: document.body?.innerText?.slice(0, 4000),
          status: document.querySelector('[role="status"]')?.textContent,
          apiKeys: api ? Object.keys(api) : null,
          storeKeys: window.store ? Object.keys(window.store) : null};
        if (typeof api?.getInitData === 'function') {
          let timer;
          try {
            const data = await Promise.race([api.getInitData(), new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('Diagnostic init IPC timed out')), 3000);
            })]);
            result.init = {keys: Object.keys(data), outputFormats: data.outputFormats,
              tools: data.tools, taskSnapshot: data.taskSnapshot};
          } catch (error) { result.initError = error.stack ?? error.message ?? String(error); }
          finally { clearTimeout(timer); }
        }
        return result;
      })()`), 5000, 'Boot diagnostics');
    } catch (error) { diagnostic.rendererError = error.stack ?? String(error); }
    return diagnostic;
  }
  await import('../src/main.js');
  return async function verify() {
  try {
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.deepEqual(errors, []);
      if (window && !window.isDestroyed() && !window.webContents.isLoading()) {
        const boot = await bounded(window.webContents.executeJavaScript(`({
          ready: Boolean(document.querySelector('main aside') && document.querySelector('main section h1') && window.electronAPI && window.store),
          status: document.querySelector('main [role="status"]')?.textContent?.trim() ?? ''
        })`), 5000, 'Renderer boot check');
        ready = boot.ready;
        if (ready) break;
        if (boot.status && !boot.status.startsWith('Loading FormatBay')) {
          throw new Error(`Production renderer displayed a boot error: ${boot.status}`);
        }
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
        expectReject(() => api.installTool('ffmpeg')),
        expectReject(() => api.removeTool('ffmpeg')),
        expectReject(() => api.taskAction('start',['not-a-task'])),
        expectReject(() => api.taskAction('start',[])),
        expectReject(() => api.taskAction('shutdown',['not-a-task'])),
        expectReject(() => api.revealOutput('not-a-task')),
        expectReject(() => api.revealOutput({path:'not-authorized'})),
        expectReject(() => window.store.get('arbitrary-secret')),
        expectReject(() => window.store.set('outputDirectory','not-authorized')),
      ]);
      for (const invalid of ['not-a-tool', {url:'https://not-authorized.invalid/tool.zip'}, null]) {
        for (const method of ['installTool', 'removeTool', 'cancelToolInstall'])
          rejects.push(await expectReject(() => api[method](invalid)));
      }
      const stopTools = api.onTools(() => {});
      if (typeof stopTools !== 'function') throw new Error('Tool listener must be removable');
      stopTools();
      const resetOutput = await api.resetOutputDirectory();
      return {title:document.title, heading:document.querySelector('main section h1').textContent,
        apiKeys:Object.keys(api).sort(), storeKeys:Object.keys(window.store).sort(),
        requireType:typeof window.require, processType:typeof window.process,
        data, canUnsubscribe, persisted, rejects, resetOutput,
        after:(await api.getInitData()).taskSnapshot};
    })()`), 15000, 'Real preload IPC assertions');
    assert.equal(result.title, 'FormatBay');
    assert.ok(result.heading.trim());
    assert.deepEqual(result.apiKeys, ['installTool','cancelToolInstall','removeTool','refreshTools','onTools','addFiles','chooseOutputDirectory','closeApp','getInitData','minimizeApp','onTasks','resetOutputDirectory','revealOutput','taskAction'].sort());
    assert.deepEqual(result.storeKeys, ['get','set']);
    assert.equal(result.requireType, 'undefined');
    assert.equal(result.processType, 'undefined');
    assert.ok(result.data.outputFormats.Audio.length > 0, 'Prepare the release FFmpeg/ffprobe bundle for native smoke');
    assert.ok(result.data.tools.some(tool => tool.id === 'ffmpeg' && tool.available));
    assert.deepEqual(result.data.taskSnapshot, {revision:0,tasks:[]});
    assert.deepEqual(result.after, result.data.taskSnapshot);
    assert.equal(result.canUnsubscribe, true);
    assert.equal(result.persisted, false);
    assert.ok(result.rejects.every(Boolean), 'An invalid IPC request was accepted');
    assert.equal(result.resetOutput, null);
    assert.equal(dialogState.calls, 0, 'Invalid IPC must reject before native dialogs');
    assert.ok(result.data.targetEncoders?.opus?.includes('opusenc'), 'Install opusenc for workflow smoke');
    await exerciseWorkflows({window, dialogState, reveals, temporary: process.env.FORMATBAY_SMOKE_ROOT, errors});
    await sleep(100);
    assert.deepEqual(errors, []);
    console.log('Native production renderer, preload isolation, real IPC/catalog/settings validation: passed. OS native dialogs/Explorer were stubbed only for workflow testing.');
    passed = true;
    // Exercise the actual preload send and production shutdown path.
    // Destruction can reject executeJavaScript after the close IPC was delivered.
    // A missing close still fails via watchdog; only will-quit prints success.
    void window.webContents.executeJavaScript('window.electronAPI.closeApp()').catch(() => {});
  } catch (error) {
    clearTimeout(watchdog);
    console.error(error.stack ?? error);
    try { console.error('BOOT_DIAGNOSTICS ' + JSON.stringify(await bootDiagnostics(), null, 2)); }
    catch (diagnosticError) { console.error('Boot diagnostic collection failed: ' + diagnosticError.message); }
    app.exit(1);
  }
  };
}

if (process.versions.electron) {
  // Electron delays app readiness until its ESM entry finishes evaluation. Only
  // bootstrap is top-level awaited; awaiting the smoke's window loop here would
  // deadlock production main's app.whenReady(). Configure paths before yielding.
  const {app} = await import('electron');
  const temporary = process.env.FORMATBAY_SMOKE_ROOT;
  if (!temporary) throw new Error('Run this harness with node scripts/electron-smoke.mjs');
  app.setPath('userData', path.join(temporary, 'userData'));
  app.setPath('sessionData', path.join(temporary, 'session'));
  app.commandLine.appendSwitch('lang', 'en-US');
  try {
    const verify = await prepareSmoke(app);
    void verify().catch(error => { console.error(error.stack ?? error); app.exit(1); });
  } catch (error) { console.error(error.stack ?? error); app.exit(1); }
} else {
  await launch().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
}

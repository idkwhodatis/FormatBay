/** Windows packaged executable acceptance, not a source-entry Electron launch.
 * Usage: node scripts/packaged-smoke.mjs path/to/FormatBay.exe
 * Requires playwright-core and installed FFmpeg/ffprobe/opusenc on the test PATH.
 * Only native dialog results/Explorer reveal are stubbed at the OS boundary.
 * Official API: https://playwright.dev/docs/api/class-electron
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, cp, rm, stat, readFile, access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pollValue} from './smoke-poll.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = value => path.resolve(value).toLowerCase();
async function bounded(promise, timeout, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeout);
  })]); } finally { clearTimeout(timer); }
}
function runTool(command, args, {cwd, timeout=60000}={}) {
  return new Promise((resolve, reject) => {
    const child=spawn(command,args,{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
    child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString()).slice(-65536);});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-65536);});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(new Error(`${command} failed (${code}): ${stderr}`));});
  });
}
function environment(temporary, toolPath) {
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>
    !['path','node_options','node_path','electron_run_as_node','electron_force_is_packaged'].includes(key.toLowerCase())));
  // Defense in depth; --user-data-dir is also verified against app.getPath.
  env.PATH=toolPath;
  env.APPDATA=path.join(temporary,'appdata');
  env.LOCALAPPDATA=path.join(temporary,'localappdata');
  env.TEMP=temporary;env.TMP=temporary;
  return env;
}
async function stopApplication(application) {
  const child=application.process();
  let closed=child.exitCode!==null || child.signalCode!==null;
  const exited=new Promise(resolve=>{
    if(closed)return resolve();
    child.once('close',()=>{closed=true;resolve();});
  });
  try { await bounded(application.close(),15000,'Packaged application shutdown'); }
  catch(error) {
    console.error(`Graceful packaged shutdown failed: ${error.message}`);
    if(child.pid) {
      const killer=spawn(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore',timeout:5000});
      killer.on('error',()=>{try{child.kill('SIGKILL');}catch{}});
      killer.unref();
    }
    try {await bounded(exited,7000,'Packaged process termination');}
    catch {
      try {child.kill('SIGKILL');} catch {}
      for(const stream of child.stdio??[])stream?.destroy?.();
      child.unref();
      throw new Error('Packaged process termination was not confirmed; retain temporary profile');
    }
    throw error; // Forced shutdown is not a passing smoke run.
  }
  await bounded(exited,5000,'Packaged process exit');
  assert.equal(child.exitCode,0,'Packaged app must exit cleanly');
}

async function scenario(electron, executablePath, temporary, toolPath, missingTools) {
  const profile=path.join(temporary,missingTools?'missing-profile':'installed-profile');
  const working=path.join(temporary,missingTools?'missing-cwd':'installed-cwd');
  await mkdir(profile);await mkdir(working);
  for(const dir of ['appdata','localappdata'])await mkdir(path.join(temporary,dir),{recursive:true});
  const application=await electron.launch({executablePath,
    args:[`--user-data-dir=${profile}`,'--lang=en-US','--dev'],cwd:working,
    env:environment(temporary,toolPath),timeout:60000});
  const errors=[];
  const context=application.context();context.setDefaultTimeout(15000);
  const attach=page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('crash',()=>errors.push('Renderer crashed'));
  };
  context.on('page',attach);context.pages().forEach(attach);
  let page;
  try {
    const identity=await application.evaluate(({app})=>({
      packaged:app.isPackaged,appPath:app.getAppPath(),userData:app.getPath('userData'),
      resources:process.resourcesPath,executable:process.execPath,cwd:process.cwd(),
    }));
    assert.equal(identity.packaged,true,'Must run the packaged application');
    assert.equal(normalize(identity.executable),normalize(executablePath));
    assert.equal(normalize(identity.resources),normalize(path.join(path.dirname(executablePath),'resources')));
    assert.equal(normalize(identity.appPath),normalize(path.join(identity.resources,'app.asar')));
    assert.equal(normalize(identity.userData),normalize(profile),'Do not use the real user profile');
    assert.equal(normalize(identity.cwd),normalize(working));
    console.log('PACKAGED_IDENTITY '+JSON.stringify(identity));
    page=await application.firstWindow({timeout:45000});
    const preferences=await application.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration};});
    assert.deepEqual(preferences,{sandbox:true,contextIsolation:true,nodeIntegration:false});
    await page.locator('main aside').waitFor();
    await page.locator('main section h1').waitFor();
    assert.equal(await page.title(),'FormatBay');
    const url=new URL(page.url());assert.equal(url.protocol,'file:');
    assert.equal(normalize(fileURLToPath(url)),normalize(path.join(identity.appPath,'src','frontend','dist','index.html')));
    const isolation=await page.evaluate(()=>({require:typeof window.require,process:typeof window.process}));
    assert.deepEqual(isolation,{require:'undefined',process:'undefined'});
    const data=await page.evaluate(()=>window.electronAPI.getInitData());
    assert.deepEqual(data.taskSnapshot,{revision:0,tasks:[]});
    assert.equal(await page.getByTestId('add-files').isDisabled(),true);
    assert.equal(data.tools.find(tool=>tool.id==='ffmpeg')?.available,true);
    const ffmpeg = data.toolManagement.tools.find(tool=>tool.id==='ffmpeg');
    assert.equal(ffmpeg.source,'bundled');
    assert.equal(ffmpeg.canRemove,false);
    assert.deepEqual([...data.outputFormats.Audio].sort(),['aac','flac','mp3','ogg','opus','wav']);
    if(missingTools) {
      assert.equal(data.tools.find(tool=>tool.id==='opusenc')?.available,false);
      assert.deepEqual(data.targetEncoders,{});
      const optional=data.toolManagement.tools.find(tool=>tool.id==='opusenc');
      assert.equal(optional.source,'missing');assert.equal(optional.canInstall,true);
      // No network until the second, explicit confirmation click. First dismiss.
      await page.getByTestId('tool-manager-toggle').click();
      assert.equal(await page.getByTestId('tool-remove-ffmpeg').count(),0);
      await page.getByTestId('tool-install-opusenc').click();
      const prompt=page.getByTestId('tool-confirm-opusenc');
      await prompt.waitFor();
      const disclosure=await prompt.innerText();
      assert.ok(disclosure.includes(optional.downloadURL));
      assert.ok(disclosure.includes(optional.licenseURL));
      assert.match(disclosure,/network/i);assert.match(disclosure,/MiB/);
      await page.getByTestId('tool-dismiss').click();
      await prompt.waitFor({state:'detached'});
      const dismissed=await page.evaluate(()=>window.electronAPI.getInitData());
      assert.equal(dismissed.toolManagement.busy,false);
      assert.equal(dismissed.toolManagement.tools.find(tool=>tool.id==='opusenc').bytes,0);
      await page.getByTestId('tool-install-opusenc').click();
      await page.getByTestId('tool-confirm-install-opusenc').click();
      const installed=await pollValue(()=>page.evaluate(()=>window.electronAPI.getInitData()),data=>{
        const tool=data.toolManagement.tools.find(tool=>tool.id==='opusenc');
        if(tool.status==='failed'||tool.status==='cancelled')throw new Error(`Real opusenc installation failed: ${tool.error}`);
        return tool.source==='managed' && data.targetEncoders.opus?.includes('opusenc');
      },{timeout:120000,label:'Real managed opusenc installation'});
      assert.equal(installed.toolManagement.tools.find(tool=>tool.id==='ffmpeg').source,'bundled');
      assert.equal(installed.toolManagement.tools.find(tool=>tool.id==='opusenc').installedVersion,optional.version);
      await access(path.join(profile,'tools','opusenc',optional.version,'install.json'));
      await access(path.join(profile,'tools','opusenc',optional.version,'opusenc.exe'));
      await page.getByTestId('tool-manager-toggle').click();
      console.log('PACKAGED_MANAGED_INSTALL_PASSED: bundled FFmpeg with minimal PATH; dismissed prompt then real pinned opusenc download/extraction and catalog refresh.');
    } else {
      assert.ok(data.targetEncoders.opus?.includes('opusenc'));
      assert.equal(data.toolManagement.tools.find(tool=>tool.id==='opusenc').source,'path');
      assert.equal(data.toolManagement.tools.find(tool=>tool.id==='opusenc').canRemove,false);
    }
    {
      const input=path.join(working,'打包 video & input.mkv');
      await runTool('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=16x16:r=2:d=1',
        '-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','ffv1','-c:a','pcm_s16le','-shortest',input],{cwd:working});
      const before=await readFile(input);
      await application.evaluate(({dialog,shell},file)=>{
        globalThis.__formatbayPackagedBoundary={dialogCalls:0,reveals:[]};
        dialog.showOpenDialog=async()=>{
          globalThis.__formatbayPackagedBoundary.dialogCalls++;
          return {canceled:false,filePaths:[file]};
        };
        shell.showItemInFolder=file=>{globalThis.__formatbayPackagedBoundary.reveals.push(file);};
      },input);
      await page.getByTestId('category-audio').click();
      await page.getByTestId('format-opus').click();
      await page.getByTestId('encoder-select').selectOption('opusenc');
      await page.getByTestId('add-files').click();
      await page.locator('[data-testid="task-detail"][data-status="ready"]').waitFor({timeout:30000});
      assert.deepEqual(await page.getByTestId('route-step').evaluateAll(nodes=>nodes.map(node=>node.dataset.toolId)),['ffmpeg','opusenc']);
      assert.ok((await page.getByTestId('route-warning').allTextContents()).some(text=>/video/i.test(text)));
      await page.getByTestId('task-start').click();
      await page.locator('[data-testid="task-detail"][data-status="done"]').waitFor({timeout:60000});
      const task=await page.evaluate(async()=> (await window.electronAPI.getInitData()).taskSnapshot.tasks[0]);
      assert.equal(task.target.encoder,'opusenc');
      assert.ok((await stat(task.outputPath)).size>0);
      assert.deepEqual(await readFile(input),before);
      // Independent real FFmpeg decode outside the packaged app confirms the result.
      await runTool('ffmpeg',['-v','error','-xerror','-i',task.outputPath,'-f','null','-'],{cwd:working});
      await page.getByTestId('reveal-output').click();
      const deadline=Date.now()+5000;let boundary;
      do {boundary=await application.evaluate(()=>globalThis.__formatbayPackagedBoundary);if(boundary.reveals.length)break;await sleep(25);}while(Date.now()<deadline);
      assert.equal(boundary.dialogCalls,1);assert.deepEqual(boundary.reveals,[task.outputPath]);
      const box=await page.getByTestId('task-detail').boundingBox();
      assert.ok(box&&box.width>100&&box.height>100,'Packaged task detail must have a rendered layout');
      await page.evaluate(()=>window.store.set('offlineMode',true));
      assert.equal(await page.evaluate(()=>window.store.get('offlineMode')),true);
      assert.equal(JSON.parse(await readFile(path.join(profile,'config.json'),'utf8')).offlineMode,true);
      if(missingTools) {
        const outputBytes=await readFile(task.outputPath);
        await page.getByTestId('tool-manager-toggle').click();
        await page.getByTestId('tool-remove-opusenc').click();
        const removed=await pollValue(()=>page.evaluate(()=>window.electronAPI.getInitData()),data=>{
          return data.toolManagement.tools.find(tool=>tool.id==='opusenc').source==='missing' && !data.targetEncoders.opus?.includes('opusenc');
        },{timeout:30000,label:'Managed opusenc removal'});
        assert.equal(removed.toolManagement.tools.find(tool=>tool.id==='ffmpeg').source,'bundled');
        assert.equal(removed.toolManagement.tools.find(tool=>tool.id==='ffmpeg').canRemove,false);
        assert.equal(removed.taskSnapshot.tasks[0].status,'done');
        assert.deepEqual(await readFile(task.outputPath),outputBytes);
        await assert.rejects(access(path.join(profile,'tools','opusenc',data.toolManagement.tools.find(tool=>tool.id==='opusenc').version,'opusenc.exe')));
        console.log('PACKAGED_MANAGED_REMOVE_PASSED: optional managed encoder removed; bundled FFmpeg and completed output preserved.');
      }
      console.log('PACKAGED_CONVERSION_PASSED: actual app.asar UI/IPC FFmpeg→opusenc output decoded; source preserved; isolated settings verified. Native picker/Explorer boundaries stubbed.');
    }
    assert.deepEqual(errors,[]);
  } catch(error) {
    console.error('PACKAGED_DIAGNOSTICS '+JSON.stringify({missingTools,errors,url:page?.url(),
      body:page?await page.locator('body').innerText({timeout:3000}).catch(()=>'<unavailable>'):'<no window>'}));
    throw error;
  } finally {
    await stopApplication(application);
    assert.deepEqual(errors,[]);
  }
}

async function main() {
  if(process.platform!=='win32')throw new Error('Packaged acceptance currently requires a real Windows runner');
  const supplied=process.argv[2];
  if(!supplied||process.argv.length!==3)throw new Error('Usage: node scripts/packaged-smoke.mjs path/to/FormatBay.exe');
  const executable=path.resolve(supplied);
  await access(executable);await access(path.join(path.dirname(executable),'resources','app.asar'));
  const {_electron:electron}=await import('playwright-core');
  const temporary=await mkdtemp(path.join(os.tmpdir(),'formatbay packaged acceptance-'));
  let cleanup=true;
  try {
    // Relocate the complete portable directory away from the checkout, preserving
    // only the packaged resources and using empty working directories for launch.
    const portable=path.join(temporary,'portable ~ space # % 中文');
    await cp(path.dirname(executable),portable,{recursive:true,errorOnExist:true});
    const relocated=path.join(portable,path.basename(executable));
    const systemRoot=process.env.SystemRoot??'C:\\Windows';
    const minimalPath=[path.join(systemRoot,'System32'),systemRoot].join(path.delimiter);
    const toolPath=Object.entries(process.env).find(([key])=>key.toLowerCase()==='path')?.[1];
    assert.ok(toolPath,'Test tools must be available on PATH');
    await scenario(electron,relocated,temporary,minimalPath,true);
    await scenario(electron,relocated,temporary,toolPath,false);
    console.log('FORMATBAY_PACKAGED_SMOKE_PASSED');
  } catch(error) {
    if(error.message.includes('termination was not confirmed'))cleanup=false;
    throw error;
  } finally {
    if(cleanup)await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});
    else console.error(`Retained potentially live packaged profile: ${temporary}`);
  }
}
await main().catch(error=>{console.error(error.stack??error);process.exitCode=1;});

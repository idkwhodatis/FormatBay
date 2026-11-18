/** Unsigned Windows x64 portable preview. Tools remain external PATH installs. */
import {cp,mkdir,mkdtemp,readFile,readdir,writeFile,rm,stat,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixed=new Set(['src/main.js','src/preload.cjs','src/ipc-policy.js','src/settings-migration.js']);
export function runtimeSources(files) {
  return files.filter(file=>fixed.has(file)||/^src\/backend\/conversion\/[^/]+\.js$/.test(file));
}
export function safeSourcePath(file) {
  return typeof file==='string' && file.length>0 && file!=='.' && !file.includes(':') && !file.includes('\\') && !file.includes('\0') &&
    !path.posix.isAbsolute(file) && path.posix.normalize(file)===file && !file.startsWith('../') &&
    !file.split('/').some(part=>['.git','node_modules','config.json'].includes(part)||part.startsWith('.env'));
}
export async function sourceInventory(directory) {
  try {
    const files=execFileSync('git',['ls-files','-z'],{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);
    if(!files.length)throw new Error('No tracked source files');
    const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    const dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().length>0;
    return {revision,dirty,files:files.filter(safeSourcePath)};
  } catch {
    const inventory=JSON.parse(await readFile(path.join(directory,'.formatbay-source-files.json'),'utf8'));
    if(!Array.isArray(inventory.files)||inventory.files.some(file=>!safeSourcePath(file)))throw new Error('Invalid source inventory');
    return inventory;
  }
}
export async function collectNotices(modules) {
  const notices=[],seen=new Set();
  async function visit(base) {
    let entries;try{entries=await readdir(base,{withFileTypes:true});}catch{return;}
    for(const entry of entries) {
      if(entry.name.startsWith('.'))continue;
      const location=path.join(base,entry.name);
      if(entry.name.startsWith('@')){await visit(location);continue;}
      let manifest;try{manifest=JSON.parse(await readFile(path.join(location,'package.json'),'utf8'));}catch{continue;}
      const key=`${manifest.name}@${manifest.version}`;
      if(!seen.has(key)) {
        seen.add(key);
        const licenseFiles=(await readdir(location)).filter(name=>/^(licen[cs]e|copying|notice)(\.|$|-)/i.test(name));
        const texts=[];
        for(const name of licenseFiles) {
          const file=path.join(location,name);
          if((await stat(file)).isFile())texts.push(`${name}\n${await readFile(file,'utf8')}`);
        }
        notices.push(`${key}\nLicense metadata: ${JSON.stringify(manifest.license??'See upstream package')}\n${manifest.homepage??JSON.stringify(manifest.repository??'')}\n${texts.join('\n\n')}`);
      }
      await visit(path.join(location,'node_modules'));
    }
  }
  for(const directory of modules)await visit(directory);
  return 'Third-party notices for runtime dependencies and the frontend build dependency set.\nThe list is deliberately inclusive; build-only packages may also be listed.\nElectron/Chromium notices are supplied separately with the runtime.\n\n'+notices.sort().join('\n\n--------------------\n\n')+'\n';
}
export async function buildWindows() {
  if(process.platform!=='win32')throw new Error('Build this Windows preview on Windows (CI uses windows-2025)');
  const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const requiredBun=manifest.packageManager.split('@')[1];
  if(execFileSync('bun',['--version'],{encoding:'utf8'}).trim()!==requiredBun)throw new Error(`Use Bun ${requiredBun} for the frozen package build`);
  execFileSync('bun',['run','build'],{cwd:root,stdio:'inherit'});
  const inventory=await sourceInventory(root);
  if(inventory.dirty)throw new Error('Package from a clean committed checkout; untracked or modified source cannot be omitted');
  const workspace=await mkdtemp(path.join(os.tmpdir(),'formatbay-package-'));
  const stage=path.join(workspace,'app');await mkdir(stage);
  try {
    for(const file of ['package.json','bun.lock','LICENSE',...runtimeSources(inventory.files)]) {
      const destination=path.join(stage,file);await mkdir(path.dirname(destination),{recursive:true});await cp(path.join(root,file),destination);
    }
    await cp(path.join(root,'src/frontend/dist'),path.join(stage,'src/frontend/dist'),{recursive:true});
    // A fresh stage avoids Bun retaining previously installed devDependencies.
    execFileSync('bun',['install','--production','--frozen-lockfile','--ignore-scripts'],{cwd:stage,stdio:'inherit'});
    for(const forbidden of ['electron','@electron/packager','playwright-core']) {
      try {await access(path.join(stage,'node_modules',forbidden));}catch{continue;}
      throw new Error(`Development dependency leaked into runtime stage: ${forbidden}`);
    }
    const runtimeManifest=Object.fromEntries(['name','version','description','author','main','type','dependencies'].filter(key=>manifest[key]!==undefined).map(key=>[key,manifest[key]]));
    await writeFile(path.join(stage,'package.json'),JSON.stringify(runtimeManifest,null,2)+'\n');
    await rm(path.join(stage,'bun.lock'));
    const notices=await collectNotices([path.join(stage,'node_modules'),path.join(root,'src/frontend/node_modules')]);
    await writeFile(path.join(stage,'THIRD-PARTY-NOTICES.txt'),notices);
    const require=createRequire(import.meta.url);
    const electronVersion=require('electron/package.json').version;
    const {packager}=await import('@electron/packager');
    const [application]=await packager({dir:stage,out:path.join(root,'release'),name:'FormatBay',platform:'win32',arch:'x64',
      electronVersion,asar:true,prune:false,overwrite:true,appVersion:manifest.version,buildVersion:'0.1.0.0'});
    await access(path.join(application,'FormatBay.exe'));
    await access(path.join(application,'resources/app.asar'));
    await cp(path.join(root,'LICENSE'),path.join(application,'FORMATBAY-LICENSE.txt'));
    await writeFile(path.join(application,'THIRD-PARTY-NOTICES.txt'),notices);
    const sources=path.join(application,'source');await mkdir(sources,{recursive:true});
    for(const file of inventory.files) {
      const destination=path.join(sources,file);await mkdir(path.dirname(destination),{recursive:true});await cp(path.join(root,file),destination);
    }
    await writeFile(path.join(sources,'.formatbay-source-files.json'),JSON.stringify(inventory,null,2)+'\n');
    await writeFile(path.join(application,'BUILD-INFO.json'),JSON.stringify({version:manifest.version,electronVersion,revision:inventory.revision,dirty:inventory.dirty,platform:'win32',arch:'x64',signed:false,bundledMediaTools:[]},null,2)+'\n');
    await writeFile(path.join(application,'READ-ME-FIRST.txt'),`FormatBay ${manifest.version} — unsigned portable preview\n\nExtract the whole folder before running FormatBay.exe. This is not an installer\nand is not signed. It does not install tools, modify PATH, or bypass Windows security.\n\nInstall FFmpeg and ffprobe yourself in an absolute local PATH directory and restart\nFormatBay. Optional opusenc from Xiph opus-tools enables cross-tool Opus routes.\nNo ffmpeg.exe, ffprobe.exe or opusenc.exe is bundled. Relative/empty/UNC PATH\nentries and Windows command scripts are deliberately ignored.\n\nProject source matching this build is in source/, including Bun locks/build\ninstructions. FORMATBAY-LICENSE.txt preserves the project license; Electron's\nLICENSE/LICENSES.chromium.html and THIRD-PARTY-NOTICES.txt preserve notices.\nNative picker/Explorer interaction and signing are not acceptance claims.\n`);
    console.log(`Unsigned portable Windows preview: ${application}`);
    return application;
  } finally {await rm(workspace,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await buildWindows().catch(error=>{console.error(error.stack??error);process.exitCode=1;});
}

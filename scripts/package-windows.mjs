/** Unsigned Windows x64 portable preview with source-complete FFmpeg bundle. */
import {cp,mkdir,mkdtemp,readFile,readdir,writeFile,rm,stat,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {sha256File} from '../src/backend/conversion/tool-download.js';

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
export async function verifyFFmpegBundle(bundle) {
  if(!bundle)throw new Error('Set FORMATBAY_FFMPEG_BUNDLE to the complete output of scripts/build-bundled-ffmpeg.sh');
  const expectedManifest=await readFile(path.join(root,'scripts/bundled-ffmpeg-sources.tsv'),'utf8');
  if(await readFile(path.join(bundle,'source/bundled-ffmpeg-sources.tsv'),'utf8')!==expectedManifest)throw new Error('Bundled FFmpeg source manifest differs from reviewed pins');
  const sums=await readFile(path.join(bundle,'SHA256SUMS'),'utf8');
  const files={};
  for(const name of ['ffmpeg.exe','ffprobe.exe']) {
    const expected=sums.split(/\r?\n/).find(line=>line.endsWith(`bin/${name}`))?.slice(0,64);
    const actual=await sha256File(path.join(bundle,'bin',name));
    if(!expected||actual!==expected)throw new Error(`Bundled FFmpeg integrity failed: ${name}`);
    files[name]=actual;
  }
  for(const line of expectedManifest.split(/\r?\n/)) {
    if(!line||line.startsWith('#'))continue;
    const [, , archive,hash]=line.split('\t');
    if(await sha256File(path.join(bundle,'source/archives',archive))!==hash)throw new Error(`Bundled source integrity failed: ${archive}`);
  }
  if(await readFile(path.join(bundle,'source/build-bundled-ffmpeg.sh'),'utf8')!==await readFile(path.join(root,'scripts/build-bundled-ffmpeg.sh'),'utf8'))throw new Error('Bundled build recipe differs from reviewed script');
  await access(path.join(bundle,'source/BUILD-ENVIRONMENT.txt'));
  const configuration=await readFile(path.join(bundle,'source/build-logs/config.h'),'utf8');
  const components=await readFile(path.join(bundle,'source/build-logs/config.mak'),'utf8');
  for(const feature of ['GPL','NONFREE','VERSION3','NETWORK'])if(!new RegExp(`^#define CONFIG_${feature} 0$`,'m').test(configuration))throw new Error(`Unsafe bundled FFmpeg configuration: ${feature}`);
  for(const codec of ['PCM_S16LE','FLAC','AAC','LIBMP3LAME','LIBVORBIS','LIBOPUS'])if(!new RegExp(`^CONFIG_${codec}_ENCODER=yes$`,'m').test(components))throw new Error(`Bundled encoder missing: ${codec}`);
  for(const component of ['ffmpeg-9.0.2','libogg-1.3.6','libvorbis-1.3.7','lame-3.100','opus-1.6.1','toolchain']){
    const directory=path.join(bundle,'licenses',component);
    if(!(await readdir(directory,{recursive:true,withFileTypes:true})).some(entry=>entry.isFile()))throw new Error(`Bundled license notices missing: ${component}`);
  }
  return {id:'ffmpeg',version:'9.0.2-formatbay-lgpl',files};
}
export async function buildWindows() {
  if(process.platform!=='win32')throw new Error('Build this Windows preview on Windows (CI uses windows-2025)');
  const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const bundle=process.env.FORMATBAY_FFMPEG_BUNDLE;
  const bundledInfo=await verifyFFmpegBundle(bundle);
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
    const toolRoot=path.join(application,'resources/tools/ffmpeg');
    await cp(bundle,toolRoot,{recursive:true});
    for(const name of Object.keys(bundledInfo.files))await cp(path.join(bundle,'bin',name),path.join(toolRoot,name));
    await rm(path.join(toolRoot,'bin'),{recursive:true});
    await writeFile(path.join(toolRoot,'install.json'),JSON.stringify(bundledInfo,null,2)+'\n');
    await cp(path.join(root,'LICENSE'),path.join(application,'FORMATBAY-LICENSE.txt'));
    await writeFile(path.join(application,'THIRD-PARTY-NOTICES.txt'),notices);
    const sources=path.join(application,'source');await mkdir(sources,{recursive:true});
    for(const file of inventory.files) {
      const destination=path.join(sources,file);await mkdir(path.dirname(destination),{recursive:true});await cp(path.join(root,file),destination);
    }
    await writeFile(path.join(sources,'.formatbay-source-files.json'),JSON.stringify(inventory,null,2)+'\n');
    await writeFile(path.join(application,'BUILD-INFO.json'),JSON.stringify({version:manifest.version,electronVersion,revision:inventory.revision,dirty:inventory.dirty,platform:'win32',arch:'x64',signed:false,bundledMediaTools:[bundledInfo]},null,2)+'\n');
    await writeFile(path.join(application,'READ-ME-FIRST.txt'),`FormatBay ${manifest.version} — unsigned portable preview\n\nExtract the whole folder before running FormatBay.exe. This is not an installer\nand is not signed. It does not modify PATH or bypass Windows security.\n\nFFmpeg and ffprobe are bundled, built from the enclosed pinned LGPL/BSD source\narchives. Keep resources/tools/ffmpeg/source and licenses with the executables.\nOptional opusenc can be installed explicitly from Tools after reviewing the\nsource/license/network disclosure. Downloads are pinned and SHA256 verified,\ninstalled only in app userData, and never triggered merely by selecting a format.\nManaged installation is Windows x64 only. System PATH tools remain supported.\n\nProject source matching this build is in source/, including Bun locks/build\ninstructions. FORMATBAY-LICENSE.txt preserves the project license; Electron's\nLICENSE/LICENSES.chromium.html and THIRD-PARTY-NOTICES.txt preserve notices.\nNative picker/Explorer interaction and signing are not acceptance claims.\n`);
    console.log(`Unsigned portable Windows preview: ${application}`);
    return application;
  } finally {await rm(workspace,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await buildWindows().catch(error=>{console.error(error.stack??error);process.exitCode=1;});
}

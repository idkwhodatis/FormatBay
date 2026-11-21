import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,readdir,symlink,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import yauzl from 'yauzl';
import path from 'node:path';
import os from 'node:os';
import {ToolManager} from '../src/backend/conversion/tool-manager.js';
import {TOOL_MANIFESTS} from '../src/backend/conversion/tool-manifests.js';
import {downloadVerified,extractSelected,validateDownloadURL,safeArchiveName} from '../src/backend/conversion/tool-download.js';
import {zipFixture} from './helpers/zip-fixture.js';
const digest=body=>createHash('sha256').update(body).digest('hex');
const bytes=zipFixture([{name:'tool.exe',data:'verified exe'},{name:'LICENSE',data:'Notices'}]);
const manifest={id:'test',label:'Test',version:'1.0',platform:'win32',arch:'x64',url:'https://example.org/tool.zip',hosts:['example.org'],sha256:digest(bytes),maxBytes:10000,maxExtractBytes:10000,commands:['tool'],files:{'tool.exe':'tool.exe','LICENSE':'LICENSE'}};
const temporary=()=>mkdtemp(path.join(os.tmpdir(),'formatbay-tools-'));
const missing=async()=>{throw new Error('Missing');};
const download=(manifest,file,options)=>downloadVerified(manifest,file,{...options,fetcher:async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}})});

test('downloads enforce HTTPS destination, redirect allowlist, byte limit and SHA256 before extraction',async()=>{
 const dir=await temporary();try{
  for(const url of ['http://example.org/x','https://evil.example/x','https://user:pass@example.org/x','https://example.org:123/x'])assert.throws(()=>validateDownloadURL(url,manifest.hosts));
  await download(manifest,path.join(dir,'good'),{});assert.deepEqual(await readFile(path.join(dir,'good')),bytes);
  await assert.rejects(downloadVerified(manifest,path.join(dir,'redirect'),{fetcher:async()=>new Response(null,{status:302,headers:{location:'https://evil.example/x'}})}),/Unapproved/);
  await assert.rejects(download({...manifest,sha256:'0'.repeat(64)},path.join(dir,'bad'),{}),/checksum/);
  await assert.rejects(download({...manifest,maxBytes:1},path.join(dir,'large'),{}),/size limit/);
  const abort=new AbortController();abort.abort();await assert.rejects(download(manifest,path.join(dir,'cancel'),{signal:abort.signal}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('archive extraction rejects traversal, symlinks, duplicate and missing reviewed entries',async()=>{
 const dir=await temporary();try{
  for(const name of ['../evil','/evil','C:/evil','a\\evil','a/../evil'])assert.equal(safeArchiveName(name),false);
  const cases=[[{name:'../evil'}],[{name:'tool.exe',mode:0o120777}],[{name:'tool.exe'},{name:'TOOL.EXE'}],[{name:'unexpected.exe'}]];
  for(let i=0;i<cases.length;i++){
   const file=path.join(dir,`${i}.zip`);await writeFile(file,zipFixture(cases[i]));
   await assert.rejects(extractSelected(file,path.join(dir,`out${i}`),manifest));
  }
  const file=path.join(dir,'valid.zip');await writeFile(file,bytes);await extractSelected(file,path.join(dir,'good'),manifest);
  assert.equal(await readFile(path.join(dir,'good','tool.exe'),'utf8'),'verified exe');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('managed installation is explicit, pinned, atomic, discovered without PATH changes and recoverably removed',async()=>{
 const root=await temporary(),manager=new ToolManager({root,platform:'win32',arch:'x64',manifests:{test:manifest},download,resolver:missing});
 try{
  await manager.refresh();assert.equal(manager.snapshot().tools[0].canInstall,true);assert.deepEqual(manager.commands(),{});
  await assert.rejects(manager.install('../outside'),/Unknown tool/);
  await manager.install('test');assert.equal(manager.snapshot().tools[0].source,'managed');assert.ok(manager.commands().tool.endsWith('tool.exe'));
  assert.equal(await readFile(path.join(root,'test','1.0','LICENSE'),'utf8'),'Notices');
  await assert.rejects(manager.install('test'),/already available/);
  await manager.remove('test');assert.equal(manager.snapshot().tools[0].source,'missing');assert.equal((await readdir(path.join(root,'trash'))).length,1);
  await manager.install('test');await writeFile(manager.commands().tool,'tampered');await manager.refresh();
  assert.equal(manager.snapshot().tools[0].status,'failed');assert.equal(manager.snapshot().tools[0].canRemove,true);assert.deepEqual(manager.commands(),{});
  await manager.remove('test');assert.equal(manager.snapshot().tools[0].canInstall,true);
 }finally{await manager.shutdown();await rm(root,{recursive:true,force:true});}
});
test('failed or cancelled installation never publishes files and concurrent operations are refused',async()=>{
 const root=await temporary();let began;
 const started=new Promise(resolve=>{began=resolve;});
 const manager=new ToolManager({root,platform:'win32',arch:'x64',manifests:{test:manifest},resolver:missing,
  download:async(_manifest,_destination,{signal})=>{began();await new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}});
 try{
  const pending=manager.install('test');await started;
  await assert.rejects(manager.install('test'),/already in progress/);await assert.rejects(manager.refresh(),/current tool/);
  manager.cancel('test');await assert.rejects(pending);assert.equal(manager.snapshot().tools[0].status,'cancelled');
  assert.deepEqual(await readdir(root),[]);assert.deepEqual(manager.commands(),{});
 }finally{await manager.shutdown();await rm(root,{recursive:true,force:true});}
});
test('unsupported platforms, bundled/system tools and root symlinks cannot be removed or installed',async t=>{
 const root=await temporary();try{
  const manager=new ToolManager({root,platform:'linux',arch:'x64',manifests:{test:manifest},resolver:async()=>'/usr/bin/tool'});
  await manager.refresh();assert.equal(manager.snapshot().tools[0].source,'path');
  await assert.rejects(manager.install('test'),/unsupported/);await assert.rejects(manager.remove('test'),/Only app-managed/);
  if(process.platform!=='win32'){
   const target=path.join(root,'target');await mkdir(target);const link=path.join(root,'link');await symlink(target,link);
   await assert.rejects(new ToolManager({root:link,manifests:{test:manifest},resolver:missing}).refresh(),/symlink/);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});


test('extraction cancellation waits for the active entry stream to close before staging cleanup',async t=>{
 const directory=await temporary(),controller=new AbortController();let streamClosed=false,opened;
 const ready=new Promise(resolve=>{opened=resolve;});
 const archive=new EventEmitter();archive.close=()=>{};
 archive.readEntry=()=>queueMicrotask(()=>archive.emit('entry',{fileName:'tool.exe',uncompressedSize:5,externalFileAttributes:0,isEncrypted:()=>false}));
 archive.openReadStream=(_entry,callback)=>{
  const stream=new Readable({read(){this.push(Buffer.from('bytes'));this._read=()=>{};},
   destroy(error,complete){setTimeout(()=>{streamClosed=true;complete(error);},50);}});
  callback(null,stream);opened();
 };
 t.mock.method(yauzl,'open',(_file,_options,callback)=>callback(null,archive));
 try{
  const operation=extractSelected('fixture.zip',directory,{files:{'tool.exe':'tool.exe'},maxExtractBytes:100},{signal:controller.signal});
  const rejected=assert.rejects(operation,/cancel fixture/);
  await ready;controller.abort(new Error('cancel fixture'));
  await rejected;
  assert.equal(streamClosed,true,'extractSelected must not settle while a Windows file handle is still closing');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('adapter discovery failure is surfaced for a managed tool while allowing explicit removal',async()=>{
 const root=await temporary(),manager=new ToolManager({root,platform:'win32',arch:'x64',manifests:{test:manifest},download,resolver:missing});
 try{
  await manager.install('test');
  manager.applyDiscovery([{id:'test',available:false,detail:'Verified binary cannot run on this processor'}]);
  const tool=manager.snapshot().tools[0];
  assert.equal(tool.source,'managed');assert.equal(tool.status,'failed');assert.match(tool.error,/cannot run/);
  assert.equal(tool.canRemove,true);assert.equal(tool.canInstall,false);
  await manager.remove('test');assert.equal(manager.snapshot().tools[0].canInstall,true);
 }finally{await manager.shutdown();await rm(root,{recursive:true,force:true});}
});

const ffmpegManifest=TOOL_MANIFESTS.ffmpeg;
const ffmpegName=command=>command+(process.platform==='win32'?'.exe':'');
async function fixtureFFmpeg(directory,source,{commands=ffmpegManifest.commands,version=ffmpegManifest.version}={}){
 await mkdir(directory,{recursive:true});
 const files={};
 for(const command of commands){
  const name=ffmpegName(command),content=source+' '+command;
  await writeFile(path.join(directory,name),content,{mode:0o700});
  files[name]=digest(content);
 }
 await writeFile(path.join(directory,'install.json'),JSON.stringify({id:'ffmpeg',version,files}));
}

test('FFmpeg activates only the fixed bundled pair; optional PATH tools remain independent',async()=>{
 const base=await temporary();
 try{
  const root=path.join(base,'managed'),bundledRoot=path.join(base,'resources');
  const managed=path.join(root,'ffmpeg',ffmpegManifest.version),bundled=path.join(bundledRoot,'ffmpeg');
  const system=path.join(base,'system');
  for(const [directory,source] of [[managed,'managed'],[bundled,'bundled'],[system,'system']])await fixtureFFmpeg(directory,source);
  const resolved=[],downloads=[];
  const resolver=async command=>{resolved.push(command);return command==='tool'?path.join(system,command):realpath(path.join(system,ffmpegName(command)));};
  const manager=new ToolManager({root,bundledRoot,resolver,manifests:{ffmpeg:ffmpegManifest,test:manifest},download:async()=>downloads.push(true)});
  const snapshot=await manager.refresh(),ffmpeg=snapshot.tools[0];
  assert.equal(ffmpeg.source,'bundled');assert.equal(ffmpeg.status,'available');
  assert.equal(ffmpeg.version,'9.0.2-formatbay-lgpl');assert.equal(ffmpeg.installedVersion,ffmpeg.version);
  assert.equal(ffmpeg.canInstall,false);assert.equal(ffmpeg.canRemove,false);assert.equal(ffmpeg.canUpdate,false);
  assert.equal(ffmpeg.downloadURL,null);assert.equal(ffmpeg.licenseURL,null);assert.match(ffmpeg.license,/LGPL/);
  assert.equal(Object.hasOwn(ffmpeg,'preference'),false);assert.equal(Object.hasOwn(ffmpeg,'canSelectSystem'),false);
  assert.equal(manager.setFFmpegPreference,undefined);
  assert.deepEqual(manager.commands(),{
   ffmpeg:await realpath(path.join(bundled,ffmpegName('ffmpeg'))),
   ffprobe:await realpath(path.join(bundled,ffmpegName('ffprobe'))),
   tool:path.join(system,'tool')
  });
  assert.deepEqual(resolved,['tool']);
  assert.equal(snapshot.tools[1].source,'path');
  await assert.rejects(manager.install('ffmpeg'),/fixed bundled tools/);
  await assert.rejects(manager.remove('ffmpeg'),/fixed bundled tools/);
  assert.throws(()=>manager.cancel('ffmpeg'),/fixed bundled tools/);
  assert.deepEqual(downloads,[]);
  assert.equal(await readFile(path.join(managed,ffmpegName('ffmpeg')),'utf8'),'managed ffmpeg');
  assert.equal(await readFile(path.join(system,ffmpegName('ffmpeg')),'utf8'),'system ffmpeg');
 }finally{await rm(base,{recursive:true,force:true});}
});

test('an absent, partial, tampered or wrong-version bundle is unavailable without fallback',async()=>{
 const base=await temporary();
 try{
  const root=path.join(base,'managed'),bundledRoot=path.join(base,'resources'),bundled=path.join(bundledRoot,'ffmpeg');
  await fixtureFFmpeg(path.join(root,'ffmpeg',ffmpegManifest.version),'managed');
  const resolved=[];
  const manager=new ToolManager({root,bundledRoot,manifests:{ffmpeg:ffmpegManifest},resolver:async command=>{
   resolved.push(command);return path.join(base,ffmpegName(command));
  }});
  const checkMissing=async()=>{
   const status=(await manager.refresh()).tools[0];
   assert.equal(status.source,'missing');assert.equal(status.status,'missing');assert.match(status.error,/Bundled FFmpeg/);
   assert.equal(status.canInstall,false);assert.equal(status.canRemove,false);assert.deepEqual(manager.commands(),{});
  };
  await checkMissing();
  await fixtureFFmpeg(bundled,'bundled',{commands:['ffmpeg']});await checkMissing();
  await fixtureFFmpeg(bundled,'bundled',{version:'8.0.0'});await checkMissing();
  await fixtureFFmpeg(bundled,'bundled');await manager.refresh();
  assert.equal(manager.snapshot().tools[0].source,'bundled');
  await writeFile(path.join(bundled,ffmpegName('ffprobe')),'changed');await checkMissing();
  assert.deepEqual(resolved,[]);
  manager.applyDiscovery([{id:'ffmpeg',available:false,detail:'No command'}]);
  assert.match(manager.snapshot().tools[0].error,/Bundled FFmpeg/);
 }finally{await rm(base,{recursive:true,force:true});}
});

test('a linked bundle or binary is not a trusted fixed FFmpeg pair',async()=>{
 const base=await temporary();
 try{
  const root=path.join(base,'managed'),actual=path.join(base,'actual'),bundledRoot=path.join(base,'resources');
  await fixtureFFmpeg(path.join(actual,'ffmpeg'),'bundled');await symlink(actual,bundledRoot,process.platform==='win32'?'junction':'dir');
  const manager=new ToolManager({root,bundledRoot,manifests:{ffmpeg:ffmpegManifest},resolver:missing});
  assert.equal((await manager.refresh()).tools[0].source,'missing');
  assert.deepEqual(manager.commands(),{});
  if(process.platform==='win32')return; // A directory junction does not require Windows symlink privilege.
  await rm(bundledRoot);const bundled=path.join(bundledRoot,'ffmpeg');
  await fixtureFFmpeg(bundled,'bundled');
  await rm(path.join(bundled,'ffprobe'));await symlink(path.join(actual,'ffmpeg','ffprobe'),path.join(bundled,'ffprobe'));
  assert.equal((await manager.refresh()).tools[0].source,'missing');assert.deepEqual(manager.commands(),{});
 }finally{await rm(base,{recursive:true,force:true});}
});

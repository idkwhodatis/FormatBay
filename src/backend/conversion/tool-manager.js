import {mkdir,mkdtemp,lstat,readFile,writeFile,rename,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
import {TOOL_MANIFESTS} from './tool-manifests.js';
import {downloadVerified,extractSelected,sha256File} from './tool-download.js';
import {resolveTool} from './tool-path.js';

/** Explicit user-initiated app-local installs; never mutates system PATH or executes installers. */
export class ToolManager {
 constructor({root,bundledRoot,platform=process.platform,arch=process.arch,onChange=()=>{},manifests=TOOL_MANIFESTS,
  download=downloadVerified,extract=extractSelected,resolver=resolveTool}={}) {
  if(!root)throw new Error('Managed tool root required');
  Object.assign(this,{root:path.resolve(root),bundledRoot,platform,arch,onChange,manifests,download,extract,resolver});
  this.revision=0;this.active=null;this.states=new Map();this.resolved=new Map();this.closed=false;this.corrupt=new Set();
 }
 manifest(id){if(typeof id!=='string'||!Object.hasOwn(this.manifests,id))throw new Error('Unknown tool');return this.manifests[id];}
 supported(manifest){return manifest.platform===this.platform&&manifest.arch===this.arch;}
 destination(manifest){return path.join(this.root,manifest.id,manifest.version);}
 snapshot(){return {revision:this.revision,busy:!!this.active,tools:Object.values(this.manifests).map(manifest=>{
  const state=this.states.get(manifest.id)??{},installed=this.resolved.get(manifest.id),source=installed?.source??'missing';
  return {id:manifest.id,label:manifest.label,version:manifest.version,installedVersion:installed?.version??null,source,
   status:state.status??(this.corrupt.has(manifest.id)?'failed':installed?'available':'missing'),bytes:state.bytes??0,total:state.total??manifest.size??0,error:state.error??(this.corrupt.has(manifest.id)?'Managed tool integrity failed. Remove this managed copy before reinstalling.':''),
   canInstall:this.supported(manifest)&&(source==='missing'||(state.status==='failed'&&source!=='managed'))&&!this.active&&!this.corrupt.has(manifest.id),
   canRemove:(source==='managed'||this.corrupt.has(manifest.id))&&!this.active,canUpdate:false,
   downloadURL:manifest.url,licenseURL:manifest.licenseURL,license:manifest.license,maxBytes:manifest.maxBytes,
   unsupportedReason:this.supported(manifest)?'':'Managed installation is currently available only on Windows x64. Install tools on an absolute local PATH directory for this platform.'};
 })};}
 emit(){this.revision++;this.onChange(this.snapshot());}
 async ensureRoot(){await mkdir(this.root,{recursive:true});if((await lstat(this.root)).isSymbolicLink())throw new Error('Managed tool directory must not be a symlink');}
 async inspectDirectory(directory,manifest,source){
  try{
   if(!(await lstat(directory)).isDirectory()||(await lstat(directory)).isSymbolicLink())return null;
   const info=JSON.parse(await readFile(path.join(directory,'install.json'),'utf8'));
   if(info.id!==manifest.id||typeof info.version!=='string'||!info.files||typeof info.files!=='object')return null;
   if(source==='managed'&&(info.version!==manifest.version||info.archiveSha256!==manifest.sha256))return null;
   const commands={};
   for(const command of manifest.commands){
    const file=path.join(directory,command+(this.platform==='win32'?'.exe':''));
    const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink())return null;
    if(await sha256File(file)!==info.files[path.basename(file)])return null;
    commands[command]=await realpath(file);
   }
   return {source,version:info.version,commands};
  }catch{return null;}
 }
 async refresh(){
  if(this.active)throw new Error('Wait for the current tool operation');
  try{if((await lstat(this.root)).isSymbolicLink())throw new Error('Managed tool directory must not be a symlink');}catch(error){if(error.code!=='ENOENT')throw error;}
  this.resolved.clear();this.corrupt.clear();
  for(const manifest of Object.values(this.manifests)){
   let found=null;
   if(this.supported(manifest)){
    // A symlink at the per-tool directory could redirect install/removal outside app storage.
    try{if((await lstat(path.join(this.root,manifest.id))).isSymbolicLink())throw new Error('Managed tool directory must not be a symlink');
     found=await this.inspectDirectory(this.destination(manifest),manifest,'managed');
     if(!found){try{await lstat(this.destination(manifest));this.corrupt.add(manifest.id);}catch(error){if(error.code!=='ENOENT')throw error;}}}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!found&&this.bundledRoot)found=await this.inspectDirectory(path.join(this.bundledRoot,manifest.id),manifest,'bundled');
   }
   if(!found){const commands={};try{for(const command of manifest.commands)commands[command]=await this.resolver(command);found={source:'path',version:'System PATH',commands};}catch{}}
   if(found)this.resolved.set(manifest.id,found);
   this.states.delete(manifest.id);
  }
  this.emit();return this.snapshot();
 }
 applyDiscovery(tools){for(const tool of tools){if(!tool.available){this.states.set(tool.id,{status:'failed',error:tool.detail});}else{this.states.set(tool.id,{status:'available'});}}this.emit();}
 commands(){return Object.assign({},...[...this.resolved.values()].map(value=>value.commands));}
 async install(id){
  const manifest=this.manifest(id);
  if(this.closed)throw new Error('Application is closing');
  if(!this.supported(manifest))throw new Error('Managed installation unsupported on this platform');
  if(this.active)throw new Error('A tool operation is already in progress');
  if(this.resolved.has(id)&&!(this.states.get(id)?.status==='failed'&&this.resolved.get(id).source!=='managed'))throw new Error('Tool is already available; no update is published in this app version');
  const controller=new AbortController(),active={id,controller,promise:null};this.active=active;
  this.states.set(id,{status:'downloading'});this.emit();
  const work=async()=>{
   let temp;
   const deadline=setTimeout(()=>controller.abort(new Error('Tool download timed out')),10*60*1000);
   try{
    await this.ensureRoot();temp=await mkdtemp(path.join(this.root,'.install-'));
    const archive=path.join(temp,'download.zip'),stage=path.join(temp,'payload');
    let last=0;
    await this.download(manifest,archive,{signal:controller.signal,onProgress:(bytes,total)=>{
     this.states.set(id,{status:'downloading',bytes,total});if(Date.now()-last>100){last=Date.now();this.emit();}
    }});
    this.states.set(id,{status:'verifying'});this.emit();controller.signal.throwIfAborted();
    await this.extract(archive,stage,manifest,{signal:controller.signal});
    const files={};for(const output of Object.values(manifest.files))files[output]=await sha256File(path.join(stage,output));
    await writeFile(path.join(stage,'install.json'),JSON.stringify({id,version:manifest.version,archiveSha256:manifest.sha256,files},null,2)+'\n',{flag:'wx'});
    this.states.set(id,{status:'installing'});this.emit();controller.signal.throwIfAborted();
    const parent=path.join(this.root,id);await mkdir(parent,{recursive:true});if((await lstat(parent)).isSymbolicLink())throw new Error('Managed tool directory must not be a symlink');
    const destination=this.destination(manifest);
    try{await lstat(destination);throw new Error('Existing tool files require explicit removal before reinstalling');}catch(error){if(error.code!=='ENOENT')throw error;}
    controller.signal.throwIfAborted();await rename(stage,destination);
    const installed=await this.inspectDirectory(destination,manifest,'managed');if(!installed)throw new Error('Installed tool integrity verification failed');
    this.resolved.set(id,installed);this.states.set(id,{status:'available'});
   }catch(error){this.states.set(id,{status:controller.signal.aborted?'cancelled':'failed',error:controller.signal.aborted?'Installation cancelled; no downloaded executable was started.':error.message});throw error;}
   finally{clearTimeout(deadline);try{if(temp)await rm(temp,{recursive:true,force:true});}finally{this.active=null;this.emit();}}
   return this.snapshot();
  };
  active.promise=work();return active.promise;
 }
 cancel(id){this.manifest(id);if(this.active?.id!==id)throw new Error('No matching installation to cancel');this.active.controller.abort(new Error('Installation cancelled'));return this.snapshot();}
 async remove(id){
  const manifest=this.manifest(id);if(this.active)throw new Error('Wait for the current tool operation');
  if(this.resolved.get(id)?.source!=='managed'&&!this.corrupt.has(id))throw new Error('Only app-managed tools can be removed; bundled and system tools are untouched');
  await this.ensureRoot();const parent=path.join(this.root,id);if((await lstat(parent)).isSymbolicLink())throw new Error('Managed tool directory must not be a symlink');
  const destination=this.destination(manifest);if((await lstat(destination)).isSymbolicLink())throw new Error('Managed tool directory must not be a symlink');
  // Recoverable removal: move only the owned version into app-local Trash.
  const trash=path.join(this.root,'trash');await mkdir(trash,{recursive:true});if((await lstat(trash)).isSymbolicLink())throw new Error('Tool Trash must not be a symlink');
  await rename(destination,path.join(trash,`${id}-${Date.now()}-${Math.random().toString(16).slice(2)}`));
  this.resolved.delete(id);this.states.delete(id);await this.refresh();return this.snapshot();
 }
 async shutdown(){this.closed=true;if(this.active){this.active.controller.abort(new Error('Application closing'));await this.active.promise?.catch(()=>{});}}
}

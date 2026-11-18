import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runtimeSources,safeSourcePath,sourceInventory,collectNotices} from '../scripts/package-windows.mjs';

test('runtime staging excludes checkout, test harnesses and frontend development sources',()=>{
 const candidates=['src/main.js','src/preload.cjs','src/ipc-policy.js','src/settings-migration.js','src/backend/conversion/service.js',
  'src/backend/conversion/tool-path.js','scripts/electron-smoke.mjs','scripts/packaged-smoke.mjs','src/frontend/src/App.svelte','config.json','.env','test/output.test.js','src/backend/consts/initData.json'];
 assert.deepEqual(runtimeSources(candidates),candidates.slice(0,6));
});
test('source inventory cannot traverse paths or copy local settings/dependency caches',()=>{
 for(const file of ['../private','/absolute','C:/private','src\\main.js','.','a/../private','.git/config','node_modules/x/index.js','config.json','.env','.env.local','src/.env.production'])assert.equal(safeSourcePath(file),false,file);
 for(const file of ['package.json','bun.lock','LICENSE','src/main.js','scripts/package-windows.mjs'])assert.equal(safeSourcePath(file),true,file);
});
test('distributed source inventory works without git and rejects unsafe entries',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'formatbay-source-'));
 try {
  const inventory={revision:'test',dirty:false,files:['package.json','src/main.js']};
  await writeFile(path.join(directory,'.formatbay-source-files.json'),JSON.stringify(inventory));
  assert.deepEqual(await sourceInventory(directory),inventory);
  inventory.files.push('../secret');await writeFile(path.join(directory,'.formatbay-source-files.json'),JSON.stringify(inventory));
  await assert.rejects(sourceInventory(directory),/Invalid source inventory/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('third-party notices preserve license text including scoped packages',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'formatbay-notices-'));
 try {
  const pkg=path.join(directory,'@example','package');await mkdir(pkg,{recursive:true});
  await writeFile(path.join(pkg,'package.json'),JSON.stringify({name:'@example/package',version:'1.0.0',license:'MIT'}));
  await writeFile(path.join(pkg,'LICENSE'),'Copyright Example\nPermission notice preserved.');
  const result=await collectNotices([directory]);assert.match(result,/@example\/package@1.0.0/);assert.match(result,/Permission notice preserved/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

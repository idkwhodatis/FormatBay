import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {revealTaskOutput} from '../src/backend/conversion/output.js';

test('reveal accepts only a completed backend-owned regular output and preserves literal paths',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-reveal-'));
  const outputPath=path.join(dir,'音频 & literal; converted.wav');
  const task={id:'task',status:'done',outputPath};const service={list:()=>[task]};const calls=[];
  try {
    await writeFile(outputPath,'output');
    assert.equal(await revealTaskOutput(service,'task',value=>calls.push(value)),true);
    assert.deepEqual(calls,[outputPath]);
    for(const id of [null,{},'', 'x'.repeat(129),'unknown',outputPath])
      await assert.rejects(revealTaskOutput(service,id,value=>calls.push(value)),/Unknown task/);
    for(const status of ['ready','queued','running','cancelled','failed','blocked']) {
      task.status=status;
      await assert.rejects(revealTaskOutput(service,'task',value=>calls.push(value)),/no completed output/);
    }
    assert.deepEqual(calls,[outputPath]);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('missing, non-file or non-local outputs fail without opening anything',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-reveal-'));
  const task={id:'task',status:'done',outputPath:path.join(dir,'missing.wav')};
  const service={list:()=>[task]};const calls=[];
  try {
    await assert.rejects(revealTaskOutput(service,'task',value=>calls.push(value)),/moved or deleted/);
    await mkdir(task.outputPath);
    await assert.rejects(revealTaskOutput(service,'task',value=>calls.push(value)),/regular file/);
    task.outputPath='https://example.invalid/not-a-local-output';
    await assert.rejects(revealTaskOutput(service,'task',value=>calls.push(value)),/no completed output/);
    task.outputPath=null;
    await assert.rejects(revealTaskOutput(service,'task',value=>calls.push(value)),/no completed output/);
    assert.deepEqual(calls,[]);
  } finally {await rm(dir,{recursive:true,force:true});}
});

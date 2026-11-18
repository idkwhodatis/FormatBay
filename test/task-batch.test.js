import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ConversionService} from '../src/backend/conversion/service.js';
import {runTaskActionBatch} from '../src/ipc-policy.js';

test('Stop All cannot drain queued tasks after cancelling the active conversion', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'formatbay-batch-'));
  const input=path.join(dir,'input.a');await writeFile(input,'test');
  const state={kind:'audio',format:'a',audioCodec:'a',hasAudio:true,hasVideo:false};
  const output={...state,format:'b',audioCodec:'b'};let calls=0,started;
  const entered=new Promise(resolve=>{started=resolve;});
  const adapter={discover:async()=>({id:'fake',available:true}),formats:()=>['b'],
    capabilities:()=>[{id:'convert',toolId:'fake',label:'convert',loss:0,accepts:s=>s.format==='a',output:()=>output}],
    probe:async file=>({state:file===input?state:output,size:4,duration:1}),
    execute:async(_step,_input,out,{signal})=>{
      calls++;
      if(calls===1)await new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});started();});
      else await writeFile(out,'test');
    }};
  const service=new ConversionService({adapter});
  try {
    await service.initialize();await service.addFiles([input,input,input],{kind:'audio',format:'b'});
    const ids=service.list().map(task=>task.id);
    runTaskActionBatch(service,'start',ids);await entered;
    assert.deepEqual(service.list().map(task=>task.status),['running','queued','queued']);
    runTaskActionBatch(service,'cancel',ids);
    await service.active;
    assert.deepEqual(service.list().map(task=>task.status),['cancelled','cancelled','cancelled']);
    assert.equal(calls,1);
    assert.equal(service.list().some(task=>task.outputPath),false);
  } finally {await service.shutdown();await rm(dir,{recursive:true,force:true});}
});

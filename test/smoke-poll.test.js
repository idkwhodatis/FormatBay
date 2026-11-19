import test from 'node:test';
import assert from 'node:assert/strict';
import {pollValue} from '../scripts/smoke-poll.mjs';
test('smoke polling awaits snapshots and false predicates rather than accepting a Promise',async()=>{
 let reads=0;const value=await pollValue(async()=>({ready:++reads===3}),async snapshot=>snapshot.ready,{timeout:1000,interval:1});
 assert.deepEqual(value,{ready:true});assert.equal(reads,3);
});
test('smoke polling preserves failures and has a bounded timeout',async()=>{
 await assert.rejects(pollValue(async()=>false,value=>value,{timeout:5,interval:1,label:'Install'}),/Install timed out/);
 await assert.rejects(pollValue(async()=>{throw new Error('Failed download');},()=>true),/Failed download/);
});

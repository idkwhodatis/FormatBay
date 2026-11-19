import test from 'node:test';
import assert from 'node:assert/strict';
import {planConversion} from '../src/backend/conversion/planner.js';
const video={kind:'video',format:'a',hasAudio:true,hasVideo:true,audioCodec:'x'};
const audio=format=>({kind:'audio',format,hasAudio:true,hasVideo:false,audioCodec:format});
const edge=(id,from,to,loss=0,extra={})=>({id,toolId:id.split(':')[0],label:id,loss,accepts:s=>s.format===from,output:()=>audio(to),...extra});
const target={kind:'audio',format:'l'};
test('tool A video a → lossless audio f → tool B audio l',()=>{
 const plan=planConversion(video,target,[edge('A:extract','a','f'),edge('B:encode','f','l',1)]);
 assert.equal(plan.ok,true);assert.deepEqual(plan.steps.map(s=>s.toolId),['A','B']);
});
test('quality wins over shorter route; cycles terminate',()=>{
 const plan=planConversion(video,target,[edge('bad','a','l',2),edge('good','a','f'),edge('cycle','f','a'),edge('end','f','l',1)]);
 assert.deepEqual(plan.steps.map(s=>s.capabilityId),['good','end']);
});
test('silent video rejects audio route',()=>assert.equal(planConversion({...video,hasAudio:false},target,[]).reason,'no-audio'));
test('codec predicates, missing tools and offline policy constrain reachability',()=>{
 const edges=[edge('A','a','f'),edge('B','f','l',1,{accepts:s=>s.audioCodec==='g'})];
 assert.equal(planConversion(video,target,edges).ok,false);
 assert.equal(planConversion(video,target,[edge('A','a','l',0,{available:false})]).ok,false);
 assert.equal(planConversion(video,target,[edge('A','a','l',0,{network:true})]).ok,false);
 assert.equal(planConversion(video,target,[edge('A','a','l',0,{network:true})],{offline:false}).ok,true);
});
test('bounded paths, deterministic tie order, invalid registry',()=>{
 const edges=[edge('A','a','f'),edge('B','f','l')];
 assert.equal(planConversion(video,target,edges,{maxSteps:1}).ok,false);
 assert.equal(planConversion(video,target,[edge('first','a','l'),edge('second','a','l')]).steps[0].capabilityId,'first');
 assert.throws(()=>planConversion(video,target,[edge('x','a','l',-1)]));
});
test('same-format source still yields an explicit output plan',()=>{
 assert.equal(planConversion(audio('l'),target,[edge('copy','l','l')]).steps.length,1);
});
test('same-format output must use one compatible operation, even if a detour costs less',()=>{
 const edges=[edge('direct:edit','l','l',2),edge('first:stage','l','f'),edge('other:encode','f','l')];
 assert.deepEqual(planConversion(audio('l'),target,edges).steps.map(s=>s.capabilityId),['direct:edit']);
 const blocked=planConversion(audio('l'),target,edges,{requiredFinalTool:'other'});
 assert.equal(blocked.ok,false);
 assert.equal(blocked.reason,'same-format-direct-only');
 assert.match(blocked.message,/one compatible tool in one step/);
});

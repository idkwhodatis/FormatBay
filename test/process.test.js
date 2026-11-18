import test from 'node:test';
import assert from 'node:assert/strict';
import {runProcess} from '../src/backend/conversion/process.js';

test('progress callback errors reject after stopping the child instead of escaping the event handler',async()=>{
  let callbacks=0;
  await assert.rejects(runProcess(process.execPath,['-e',
    'setInterval(()=>process.stdout.write("progress\\n"),5)'],{
    onStdout(){callbacks++;throw new Error('Progress consumer failed');},timeout:5000,
  }),/Progress consumer failed/);
  assert.equal(callbacks,1);
});

test('a child ignoring termination is forcibly stopped after bounded output overflow',async()=>{
  const started=Date.now();
  await assert.rejects(runProcess(process.execPath,['-e',
    'process.on("SIGTERM",()=>{});setInterval(()=>process.stdout.write("x".repeat(65536)),1)'],
    {maxOutput:100,timeout:5000}),/size limit/);
  assert.ok(Date.now()-started<4500);
});

test('argument arrays preserve spaces, Unicode, Windows paths and shell metacharacters',async()=>{
  const args=['C:\\Users\\测试 用户\\a & b.mp4','--flag','$(echo unsafe)','semi;colon'];
  const {stdout}=await runProcess(process.execPath,['-e','console.log(JSON.stringify(process.argv.slice(1)))','--',...args]);
  assert.deepEqual(JSON.parse(stdout),args);
});

test('non-Error progress failures still stop and reject',async()=>{
  await assert.rejects(runProcess(process.execPath,['-e','console.log("progress")'],{
    onStdout(){throw undefined;},
  }),/undefined/);
});

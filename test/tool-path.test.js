import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,realpath,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {toolCandidates,resolveTool} from '../src/backend/conversion/tool-path.js';
import {FFmpegAdapter} from '../src/backend/conversion/ffmpeg.js';
import {OpusencAdapter} from '../src/backend/conversion/opusenc.js';

test('Windows tool candidates exclude implicit cwd, scripts and nonlocal/relative PATH entries',()=>{
 const env={Path:';.;relative;C:relative;\\rooted;\\\\server\\share;"C:\\工具 space";D:\\tools',PATHEXT:'.COM;.BAT;.EXE'};
 assert.deepEqual(toolCandidates('ffmpeg',{platform:'win32',env}),['C:\\工具 space\\ffmpeg.exe','D:\\tools\\ffmpeg.exe']);
 for(const command of ['ffmpeg.cmd','ffmpeg.bat','ffmpeg.com','..\\ffmpeg','C:ffmpeg.exe','\\ffmpeg.exe','\\\\server\\ffmpeg.exe'])
  assert.deepEqual(toolCandidates(command,{platform:'win32',env}),[]);
 assert.deepEqual(toolCandidates('C:\\trusted space\\ffmpeg.exe',{platform:'win32',env:{}}),['C:\\trusted space\\ffmpeg.exe']);
 assert.deepEqual(toolCandidates('C:\\trusted\\ffmpeg.cmd',{platform:'win32',env}),[]);
 assert.deepEqual(toolCandidates('ffprobe',{platform:'win32',env:{PATH:''}}),[]);
});

test('POSIX candidates skip empty/relative entries and preserve literal paths',()=>{
 assert.deepEqual(toolCandidates('opusenc',{platform:'linux',env:{PATH:':.:relative:/工具 space:/opt/bin:'}}),['/工具 space/opusenc','/opt/bin/opusenc']);
 assert.deepEqual(toolCandidates('./opusenc',{platform:'linux',env:{PATH:'/usr/bin'}}),[]);
});

test('resolution uses only explicit PATH entries, regular executables, and trusted absolute overrides',async()=>{
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'formatbay-tools-')));
 const dir=path.join(root,'工具 space'),missing=path.join(root,'missing');await mkdir(dir);
 const name=process.platform==='win32'?'formatbay-test-tool.exe':'formatbay-test-tool';
 const executable=path.join(dir,name);await writeFile(executable,'fixture');await chmod(executable,0o755);
 try {
  const env={PATH:[missing,'','.',dir].join(path.delimiter)};
  assert.equal(await resolveTool('formatbay-test-tool',{env}),await realpath(executable));
  assert.equal(await resolveTool(executable,{env:{PATH:''}}),await realpath(executable));
  await assert.rejects(resolveTool('formatbay-test-tool',{env:{PATH:'.'}}),/absolute local PATH/);
  await rm(executable);await mkdir(executable);
  await assert.rejects(resolveTool('formatbay-test-tool',{env}),/absolute local PATH/);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('adapter custom-runner fixtures remain independent of installed PATH tools',async()=>{
 const calls=[];
 const ffmpeg=new FFmpegAdapter({ffmpeg:'fixture-ffmpeg',ffprobe:'fixture-probe',runner:async(command)=>{calls.push(command);return {stdout:'fixture',stderr:''};}});
 assert.equal((await ffmpeg.discover()).available,true);assert.ok(calls.includes('fixture-probe'));
 const opusenc=new OpusencAdapter({command:'fixture-opusenc',runner:async command=>{assert.equal(command,'fixture-opusenc');return {stdout:'opusenc fixture',stderr:''};}});
 assert.equal((await opusenc.discover()).available,true);
});

test('a cwd decoy is ignored even when no valid PATH tool exists',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'formatbay-decoy-')),previous=process.cwd();
 const name=process.platform==='win32'?'formatbay-decoy.exe':'formatbay-decoy';
 try {
  await writeFile(path.join(root,name),'decoy');await chmod(path.join(root,name),0o755);
  process.chdir(root);
  await assert.rejects(resolveTool('formatbay-decoy',{env:{PATH:['','.','relative'].join(path.delimiter)}}),/absolute local PATH/);
 } finally {process.chdir(previous);await rm(root,{recursive:true,force:true});}
});

test('missing explicit ffprobe keeps production discovery unavailable without spawning ffmpeg',async()=>{
 const missing=path.join(os.tmpdir(),'formatbay-missing-probe-'+process.pid,process.platform==='win32'?'ffprobe.exe':'ffprobe');
 const adapter=new FFmpegAdapter({ffmpeg:process.execPath,ffprobe:missing});
 const result=await adapter.discover();assert.equal(result.available,false);
 assert.match(result.detail,/ffprobe/);assert.deepEqual(adapter.formats(),[]);
});

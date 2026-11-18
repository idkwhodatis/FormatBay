import {spawn} from 'node:child_process';

/** Spawn only trusted adapter commands; bounded diagnostics, no shell, abortable. */
export function runProcess(command,args,{signal,onStdout,timeout=120000,maxOutput=1024*1024}={}) {
  return new Promise((resolve,reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled'));
    const child = spawn(command,args,{stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false});
    let stdout='',stderr='',settled=false,timedOut=false,overflow=false,callbackError,killTimer;
    const stop = () => { child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'),1500); killTimer.unref(); };
    const timer = setTimeout(() => { timedOut=true; stop(); },timeout);
    timer.unref();
    signal?.addEventListener('abort',stop,{once:true});
    const finish = (error,value) => {
      if (settled) return;
      settled=true; clearTimeout(timer); clearTimeout(killTimer);
      signal?.removeEventListener('abort',stop);
      error ? reject(error) : resolve(value);
    };
    child.stdout.on('data',chunk => {
      const text=chunk.toString();
      if (settled || overflow || callbackError) return;
      if (onStdout) {
        try {onStdout(text);} catch (error) {callbackError=error instanceof Error?error:new Error(String(error));stop();}
      } else {
        // Do not keep buffering while a slow/stubborn process is being killed.
        const remaining=Math.max(0,maxOutput-stdout.length);
        stdout+=text.slice(0,remaining);
        if (text.length>remaining) {overflow=true;stop();}
      }
    });
    child.stderr.on('data',chunk => {stderr=(stderr+chunk.toString()).slice(-16000);});
    child.on('error',error => finish(error));
    child.on('close',code => {
      if (signal?.aborted) return finish(new Error('Cancelled'));
      if (callbackError) return finish(callbackError);
      if (timedOut) return finish(new Error('Tool exceeded its execution time limit'));
      if (overflow) return finish(new Error('Tool output exceeded its size limit'));
      if (code!==0) return finish(new Error(`Tool failed (${code}): ${stderr.trim().slice(-2000)}`));
      finish(null,{stdout,stderr});
    });
  });
}

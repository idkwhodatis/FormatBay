import {createHash} from 'node:crypto';
import {createWriteStream,createReadStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import yauzl from 'yauzl';

export function validateDownloadURL(value,hosts) {
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.includes(url.hostname))throw new Error('Unapproved tool download destination');
 return url.href;
}
export async function downloadVerified(manifest,destination,{signal,onProgress=()=>{},fetcher=fetch}={}) {
 let url=validateDownloadURL(manifest.url,manifest.hosts),response;
 for(let redirects=0;redirects<=5;redirects++) {
  signal?.throwIfAborted();
  response=await fetcher(url,{signal,redirect:'manual',credentials:'omit',headers:{'Accept-Encoding':'identity'}});
  if([301,302,303,307,308].includes(response.status)) {
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location||redirects===5)throw new Error('Invalid tool download redirect');
   url=validateDownloadURL(new URL(location,url).href,manifest.hosts);continue;
  }
  break;
 }
 if(!response.ok||!response.body){await response.body?.cancel();throw new Error(`Tool download failed (${response.status})`);}
 const declared=response.headers.get('content-length'),total=declared===null?0:Number(declared);
 if(!Number.isSafeInteger(total)||total<0||total>manifest.maxBytes){await response.body.cancel();throw new Error('Tool download exceeds size limit');}
 let bytes=0;const hash=createHash('sha256');
 const meter=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>manifest.maxBytes){callback(new Error('Tool download exceeds size limit'));return;}hash.update(chunk);onProgress(bytes,total);callback(null,chunk);}});
 await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(destination,{flags:'wx',mode:0o600}),{signal});
 if(total&&bytes!==total)throw new Error('Incomplete tool download');
 if(hash.digest('hex')!==manifest.sha256)throw new Error('Tool checksum verification failed');
 return bytes;
}
export function safeArchiveName(name) {
 return typeof name==='string'&&name.length>0&&!name.includes('\\')&&!name.includes(':')&&!name.includes('\0')&&!name.startsWith('/')&&
  !name.split('/').some(part=>part==='..'||part==='.')&&path.posix.normalize(name)===name;
}
/** Extract only reviewed files after whole-archive SHA256 verification. No executable hooks. */
export async function extractSelected(zipPath,directory,manifest,{signal}={}) {
 await mkdir(directory,{recursive:true});
 const zip=await new Promise((resolve,reject)=>yauzl.open(zipPath,{lazyEntries:true,strictFileNames:true,validateEntrySizes:true},(error,value)=>error?reject(error):resolve(value)));
 const seen=new Set(),written=new Set();let total=0,count=0;
 try {
  await new Promise((resolve,reject)=>{
   let active=null,finished=false;
   const settle=async error=>{
    if(finished)return;finished=true;signal?.removeEventListener('abort',abort);zip.close();
    // Windows cannot unlink a staging file until its active stream has closed.
    await active?.catch(()=>{});error?reject(error):resolve();
   };
   const abort=()=>{void settle(signal.reason??new Error('Cancelled'));};
   signal?.addEventListener('abort',abort,{once:true});
   zip.on('error',error=>{void settle(error);});zip.once('end',()=>{void settle();});
   zip.on('entry',entry=>{
    if(finished)return;
    active=(async()=>{
     signal?.throwIfAborted();count++;total+=entry.uncompressedSize;
     const name=entry.fileName,key=name.toLowerCase(),kind=(entry.externalFileAttributes>>>16)&0xf000;
     if(count>10000||total>manifest.maxExtractBytes||!safeArchiveName(name)||seen.has(key)||kind===0xa000||entry.isEncrypted())throw new Error('Unsafe tool archive entry');
     seen.add(key);
     const output=manifest.files[name];
     if(output){
      if(!safeArchiveName(output)||output.includes('/'))throw new Error('Invalid tool manifest output');
      const stream=await new Promise((resolve,reject)=>zip.openReadStream(entry,(error,value)=>error?reject(error):resolve(value)));
      await pipeline(stream,createWriteStream(path.join(directory,output),{flags:'wx',mode:0o700}),{signal});written.add(name);
     }
     signal?.throwIfAborted();if(!finished)zip.readEntry();
    })();
    active.catch(error=>{void settle(error);});
   });
   if(signal?.aborted){abort();return;}zip.readEntry();
  });
 }finally{zip.close();}
 for(const name of Object.keys(manifest.files))if(!written.has(name))throw new Error(`Tool archive missing required file: ${name}`);
}
export async function sha256File(file){
 const hash=createHash('sha256');let size=0;
 for await(const chunk of createReadStream(file)){size+=chunk.length;if(size>600*1024*1024)throw new Error('Tool file exceeds integrity-check size limit');hash.update(chunk);}
 return hash.digest('hex');
}

import {access,realpath,stat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';

// Windows root-relative paths (\\tools) and drive-relative paths (C:tools)
// depend on process state. Only fully qualified local drive paths are accepted.
const absolute = (value,platform) => platform==='win32'
  ? /^[a-z]:[\\/]/i.test(value)
  : path.posix.isAbsolute(value);

export function toolCandidates(command,{platform=process.platform,env=process.env}={}) {
  if (typeof command!=='string' || !command || command.includes('\0')) return [];
  const windows=platform==='win32',paths=windows?path.win32:path.posix;
  if (absolute(command,platform)) {
    return !windows || /\.exe$/i.test(command)?[command]:[];
  }
  if (!/^[a-z0-9_-]+(?:\.exe)?$/i.test(command)) return [];
  const key=windows?Object.keys(env).sort().find(key=>key.toLowerCase()==='path'):'PATH';
  const search=env[key]??'';
  const name=windows && !/\.exe$/i.test(command)?command+'.exe':command;
  return [...new Set(search.split(windows?';':':').flatMap(entry=>{
    // Quotes may surround Windows PATH entries; do not trim meaningful spaces.
    if (windows && entry.startsWith('"') && entry.endsWith('"')) entry=entry.slice(1,-1);
    return absolute(entry,platform)?[paths.join(entry,name)]:[];
  }))];
}

/** Search explicit PATH directories, never the OS's implicit working directory. */
export async function resolveTool(command,options={}) {
  const platform=options.platform??process.platform;
  for (const candidate of toolCandidates(command,options)) {
    try {
      const resolved=await realpath(candidate);
      if (!absolute(resolved,platform) || (platform==='win32' && !/\.exe$/i.test(resolved))) continue;
      if (!(await stat(resolved)).isFile()) continue;
      if (platform!=='win32') await access(resolved,constants.X_OK);
      return resolved;
    } catch { /* Missing/inaccessible PATH entries do not mask later tools. */ }
  }
  throw new Error(`Cannot find ${path.basename(command)} in an absolute local PATH directory`);
}

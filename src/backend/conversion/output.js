import {lstat} from 'node:fs/promises';
import path from 'node:path';

/** Reveal a completed backend-owned result, never a renderer-supplied path/URL. */
export async function revealTaskOutput(service,id,reveal) {
  if (typeof id!=='string' || !id || id.length>128) throw new Error('Unknown task');
  const task=service.list().find(item=>item.id===id);
  if (!task) throw new Error('Unknown task');
  if (task.status!=='done' || typeof task.outputPath!=='string' || !path.isAbsolute(task.outputPath)) {
    throw new Error('This task has no completed output to reveal');
  }
  let info;
  try {info=await lstat(task.outputPath);}
  catch (error) {
    if (error.code==='ENOENT') throw new Error('The output was moved or deleted. It cannot be shown in its original folder.');
    throw error;
  }
  if (!info.isFile()) throw new Error('The output is no longer a regular file');
  // showItemInFolder selects the file in the OS file manager; it does not open
  // or execute the media, accept URLs, or construct a shell command.
  reveal(task.outputPath);
  return true;
}

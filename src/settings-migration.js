import {readFile} from 'node:fs/promises';
import {validateSetting} from './ipc-policy.js';

/** Read-only legacy migration. Existing userData values always take precedence. */
export async function migrateLegacySettings(settings, legacyPath, outputFormats, read = readFile) {
  const missing = ['favorite', 'offlineMode'].filter(key => !settings.has(key));
  if (!missing.length) return;
  let legacy;
  try { legacy = JSON.parse(await read(legacyPath, 'utf8')); }
  catch { return; } // A missing, unreadable, or malformed legacy file is not fatal.
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return;
  for (const key of missing) {
    if (!Object.hasOwn(legacy, key)) continue;
    // Missing tools are temporary: do not consume legacy favorites with an empty catalog.
    if (key === 'favorite' && !Object.values(outputFormats).some(formats => formats.length)) continue;
    let value;
    try { value = validateSetting(key, legacy[key], outputFormats); }
    catch { continue; }
    settings.set(key, value);
  }
}

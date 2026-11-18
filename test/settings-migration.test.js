import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacySettings} from '../src/settings-migration.js';
function store(initial = {}) {
  const data = {...initial};
  return {data, has:key=>Object.hasOwn(data,key), set:(key,value)=>{data[key]=value;}};
}
const catalog = {Audio:['wav','mp3']};
test('legacy migration copies only valid missing allowlisted settings', async () => {
  const settings=store({offlineMode:true});let reads=0;
  const read=async pathname=>{assert.equal(pathname,'/legacy/config.json');reads++;return JSON.stringify({offlineMode:false,favorite:{Audio:{wav:true,mp3:'true',bad:true}},outputDirectory:'/private'});};
  await migrateLegacySettings(settings,'/legacy/config.json',catalog,read);
  assert.deepEqual(settings.data,{offlineMode:true,favorite:{Audio:{wav:true,mp3:false}}});
  await migrateLegacySettings(settings,'/legacy/config.json',catalog,read);
  assert.equal(reads,1);
});
test('malformed, missing, non-object legacy settings are harmless', async () => {
  for (const content of ['invalid','null','[]','42']) {
    const settings=store();await migrateLegacySettings(settings,'legacy',catalog,async()=>content);
    assert.deepEqual(settings.data,{});
  }
  const settings=store();await migrateLegacySettings(settings,'legacy',catalog,async()=>{throw new Error('ENOENT');});
  assert.deepEqual(settings.data,{});
});
test('bad legacy types are skipped without replacing existing values', async () => {
  const settings=store({favorite:{Audio:{wav:false}}});
  await migrateLegacySettings(settings,'legacy',catalog,async()=>JSON.stringify({favorite:{Audio:{wav:true}},offlineMode:'false'}));
  assert.deepEqual(settings.data,{favorite:{Audio:{wav:false}}});
});
test('missing tools do not consume legacy favorites before a catalog is available', async () => {
  const settings=store();const read=async()=>JSON.stringify({offlineMode:false,favorite:{Audio:{wav:true}}});
  await migrateLegacySettings(settings,'legacy',{Audio:[]},read);
  assert.deepEqual(settings.data,{offlineMode:false});
  await migrateLegacySettings(settings,'legacy',catalog,read);
  assert.deepEqual(settings.data,{offlineMode:false,favorite:{Audio:{wav:true,mp3:false}}});
});

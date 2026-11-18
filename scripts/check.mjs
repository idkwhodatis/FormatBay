import {readdirSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const files=['src/main.js','src/preload.cjs','src/ipc-policy.js','src/settings-migration.js',
  ...readdirSync('src/backend/conversion').filter(name=>name.endsWith('.js')).map(name=>path.join('src/backend/conversion',name))];
for(const file of files)execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
const keys=(value,prefix='')=>Object.entries(value).flatMap(([key,item])=>
  typeof item==='object'&&item!==null?keys(item,`${prefix}${key}.`):[prefix+key]);
const locale=name=>JSON.parse(readFileSync(`src/frontend/src/lib/localization/${name}.json`,'utf8'));
assert.deepEqual(keys(locale('en-us')).sort(),keys(locale('zh-cn')).sort(),'Locale keys must remain synchronized');
console.log(`Syntax checked ${files.length} backend/bridge files; locale keys match.`);

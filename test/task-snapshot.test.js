import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTaskSnapshot} from '../src/frontend/src/lib/task-snapshot.js';
const initial = () => ({revision:-1,tasks:{},selectedTask:null});
const task = (id,status) => ({id,status});
test('delayed init cannot replace a newer task push', () => {
  const current=applyTaskSnapshot(initial(),{revision:2,tasks:[task('a','running')]});
  assert.equal(applyTaskSnapshot(current,{revision:0,tasks:[]}),current);
  assert.equal(current.tasks.a.status,'running');
});
test('old command replies cannot roll back completed tasks or resurrect removed tasks', () => {
  let current=applyTaskSnapshot(initial(),{revision:6,tasks:[task('a','done')]});
  assert.equal(applyTaskSnapshot(current,{revision:5,tasks:[task('a','running')]}),current);
  current=applyTaskSnapshot(current,{revision:7,tasks:[]});
  assert.equal(applyTaskSnapshot(current,{revision:6,tasks:[task('a','done')]}),current);
  assert.deepEqual(current.tasks,{});
});
test('selection is preserved for existing tasks, removed only by newer snapshots', () => {
  let current={revision:1,tasks:{a:task('a','ready')},selectedTask:'a'};
  assert.equal(applyTaskSnapshot(current,{revision:0,tasks:[]}).selectedTask,'a');
  current=applyTaskSnapshot(current,{revision:2,tasks:[task('a','running')]});
  assert.equal(current.selectedTask,'a');
  current=applyTaskSnapshot(current,{revision:3,tasks:[]});
  assert.equal(current.selectedTask,null);
});
test('same revision is idempotent; invalid or duplicate snapshots are rejected', () => {
  const current={revision:2,tasks:{a:task('a','done')},selectedTask:'a'};
  assert.equal(applyTaskSnapshot(current,{revision:2,tasks:[]}),current);
  for (const snapshot of [null,{}, {revision:-1,tasks:[]}, {revision:NaN,tasks:[]}, {revision:3,tasks:{}}, {revision:3,tasks:[{}]}, {revision:3,tasks:[task('a','ready'),task('a','done')]}])
    assert.throws(()=>applyTaskSnapshot(current,snapshot));
  assert.equal(current.tasks.a.status,'done');
});

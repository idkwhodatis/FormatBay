import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleFormats, acceptsToolSnapshot} from '../src/frontend/src/lib/tool-catalog.js';

test('potential formats stay discoverable without claiming actual availability', () => {
  const actual = {Audio: ['wav']};
  const potential = {Audio: ['wav', 'opus']};
  assert.deepEqual(visibleFormats(actual, potential), {Audio: ['wav', 'opus']});
  assert.deepEqual(actual, {Audio: ['wav']});
  assert.deepEqual(visibleFormats({}, potential), potential);
  assert.deepEqual(visibleFormats(), {});
});
test('tool catalog rejects delayed replies and invalid revisions but accepts paired same-revision catalog', () => {
  assert.equal(acceptsToolSnapshot(5, {revision: 4, tools: []}), false);
  assert.equal(acceptsToolSnapshot(5, {revision: 5, tools: []}), true);
  assert.equal(acceptsToolSnapshot(5, {revision: 6, tools: []}), true);
  for (const snapshot of [null, {}, {revision: -1, tools: []}, {revision: 1.5, tools: []}, {revision: 7, tools: {}}])
    assert.equal(acceptsToolSnapshot(-1, snapshot), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { startingLimit } from './manifest.js';

test('the dialog field wins, including a cleared one', () => {
  assert.equal(startingLimit({ usd: 12 }, 50), 12);
  assert.equal(startingLimit({ usd: null }, 50), null);
});

test('a dispatch with no dialog slice starts with the Settings default', () => {
  assert.equal(startingLimit(null, 50), 50);
  assert.equal(startingLimit(undefined, 50), 50);
  assert.equal(startingLimit({}, 50), 50);
});

test('no default and no slice means no limit', () => {
  assert.equal(startingLimit(null, undefined), null);
  assert.equal(startingLimit(null, '50'), null);
});

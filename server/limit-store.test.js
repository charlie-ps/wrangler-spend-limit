import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LimitStore, MAX_LIMIT_USD } from './limit-store.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spend-limit-')), 'spend-limits.json');

test('a set limit survives a reload, rounded to cents', () => {
  const file = tmpFile();
  assert.deepEqual(new LimitStore({ file }).set('c1', 5.004), { ok: true });
  assert.equal(new LimitStore({ file }).get('c1'), 5);
});

test('null clears a limit', () => {
  const file = tmpFile();
  const s = new LimitStore({ file });
  s.set('c1', 3);
  s.set('c1', null);
  assert.equal(new LimitStore({ file }).get('c1'), null);
  assert.deepEqual(s.all(), {});
});

test('a non-positive, non-finite or oversized limit is refused and not stored', () => {
  const s = new LimitStore({ file: tmpFile() });
  for (const bad of [0, -1, NaN, Infinity, '5', MAX_LIMIT_USD + 1]) {
    assert.equal(s.set('c1', bad).ok, false, String(bad));
  }
  assert.equal(s.set('', 5).ok, false);
  assert.deepEqual(s.all(), {});
});

test('an unreadable file starts empty', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(new LimitStore({ file }).all(), {});
});

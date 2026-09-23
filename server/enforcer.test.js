import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnforcer, limitsForGraph, COOLDOWN_MS } from './enforcer.js';

function fakeHost({ live = () => true } = {}) {
  const interrupted = [];
  return {
    interrupted,
    sessions: { interrupt: async (id) => { interrupted.push(id); return live(id); } },
    log: () => {},
  };
}

const graph = (...sessions) => ({ sessions });

test('interrupts a working card at or over its limit, and nothing else', async () => {
  const e = createEnforcer();
  e.noteGraph(graph(
    { sessionId: 'over', status: 'working', usd: 5 },
    { sessionId: 'under', status: 'working', usd: 4.99 },
    { sessionId: 'idle', status: 'idle', usd: 9 },
    { sessionId: 'unlimited', status: 'working', usd: 100 },
  ));
  const host = fakeHost();
  assert.deepEqual(await e.tick(host, { over: 5, under: 5, idle: 5 }), ['over']);
  assert.deepEqual(host.interrupted, ['over']);
});

test('one interrupt per card per cooldown, then again once it is working again', async () => {
  let t = 0;
  const e = createEnforcer({ now: () => t });
  e.noteGraph(graph({ sessionId: 'c1', status: 'working', usd: 6 }));
  const host = fakeHost();
  await e.tick(host, { c1: 5 });
  t += COOLDOWN_MS - 1;
  await e.tick(host, { c1: 5 });
  assert.equal(host.interrupted.length, 1);
  t += 1;
  await e.tick(host, { c1: 5 });
  assert.equal(host.interrupted.length, 2);
});

test('raising the limit stops the interrupts', async () => {
  const e = createEnforcer();
  e.noteGraph(graph({ sessionId: 'c1', status: 'working', usd: 6 }));
  const host = fakeHost();
  assert.deepEqual(await e.tick(host, { c1: 10 }), []);
});

test('a card with no live pane is not reported as interrupted', async () => {
  const e = createEnforcer();
  e.noteGraph(graph({ sessionId: 'c1', status: 'working', usd: 6 }));
  assert.deepEqual(await e.tick(fakeHost({ live: () => false }), { c1: 5 }), []);
});

test('an empty graph (the activation-time contributor call) is harmless', async () => {
  const e = createEnforcer();
  e.noteGraph({});
  assert.deepEqual(await e.tick(fakeHost(), { c1: 5 }), []);
  assert.deepEqual(limitsForGraph(undefined, { c1: 5 }), { c1: { limit: 5, reached: false } });
});

test('limitsForGraph marks reached against the card usd', () => {
  assert.deepEqual(
    limitsForGraph([{ sessionId: 'a', usd: 2 }, { sessionId: 'b', usd: 1 }], { a: 2, b: 5 }),
    { a: { limit: 2, reached: true }, b: { limit: 5, reached: false } },
  );
});

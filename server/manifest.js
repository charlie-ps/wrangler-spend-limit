import { fileURLToPath } from 'node:url';
import { LimitStore } from './limit-store.js';
import { createEnforcer, limitsForGraph } from './enforcer.js';

// The extension manifest (agent-wrangler docs/extensions.md). `dir` is the repo
// root so `client`/`styles` resolve inside `<dir>/public/`; for an installed copy
// discovery overwrites it with the real location.
export const dir = fileURLToPath(new URL('..', import.meta.url));

const enforcer = createEnforcer();

// Browser-supplied, so re-validated here; the store refuses anything the panel's
// input should not have let through, and the throw becomes the router's error
// envelope.
async function setLimit(msg, host) {
  const usd = msg.usd == null || msg.usd === '' ? null : Number(msg.usd);
  const res = host.stores.limits.set(msg.sessionId, usd);
  if (!res.ok) throw new Error(`spend-limit: ${res.error}`);
  await host.rebuild();
}

export default {
  id: 'spend-limit',
  label: 'Spend limits',
  description: 'Set a USD spend limit on a session. Once its card\'s spend reaches the limit, the wrangler interrupts the model whenever it is working, until you raise or clear the limit.',
  help: 'Adds a Spend limit field to the new-session dialog and a "Spend limit…" item to the card and Actions menus; a limited card\'s cost tag reads spent / limit. Limits are kept in spend-limits.json across toggles.',
  author: 'Charlie Goldstraw',
  homepage: 'https://github.com/charlie-ps/wrangler-spend-limit',
  defaultEnabled: true,
  dir,
  requires: ['sessions:interrupt', 'board:rebuild'],
  engines: { wranglerApi: '^1.10.0' },

  stores: { limits: () => new LimitStore() },

  handlers: [{ type: 'spend-limit-set', handler: setLimit }],

  // Every ~4s tick: keep the enforcer's view of the board fresh and publish each
  // limited card's state for the client. Pure reads only — nothing here may log
  // or throw.
  graph: ({ host, graph }) => {
    enforcer.noteGraph(graph);
    return { spendLimits: limitsForGraph(graph.sessions, host.stores.limits.all()) };
  },

  session: {
    // The new-session dialog's field arrives as this extension's `ext` slice
    // before the pane starts, so the limit is in force from the first turn.
    onBeforeDispatch: ({ sessionId, ext, host }) => {
      if (ext?.usd != null) host.stores.limits.set(sessionId, Number(ext.usd));
    },
    onPurge: ({ sessionId, host }) => { host.stores.limits.set(sessionId, null); },
  },

  sweeps: [{ id: 'enforce', everyMs: 5000, run: ({ host }) => enforcer.tick(host, host.stores.limits.all()) }],

  client: 'public/index.js',
  styles: 'public/spend-limit.css',
};

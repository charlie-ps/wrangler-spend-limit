import { fileURLToPath } from 'node:url';
import { LimitStore, MAX_LIMIT_USD } from './limit-store.js';
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

// The limit a new session starts with. The new-session dialog always sends its
// field — `usd: null` when the human cleared it — so its slice wins outright.
// Every other dispatch (spawn_session, a schedule saved before this setting, a
// sub-agent) carries no slice and gets the Settings default. Runs before the
// pane starts, so the limit is in force from the first turn.
export function startingLimit(ext, defaultUsd) {
  if (ext && 'usd' in ext) return ext.usd == null ? null : Number(ext.usd);
  return typeof defaultUsd === 'number' ? defaultUsd : null;
}

export default {
  id: 'spend-limit',
  label: 'Spend limits',
  description: 'Set a USD spend limit on a session. Once its card\'s spend reaches the limit, the wrangler interrupts the model whenever it is working, until you raise or clear the limit.',
  help: 'Adds a default limit for new sessions, a Spend limit field under the new-session dialog\'s Advanced options and a "Spend limit…" item to the card and Actions menus; a limited card\'s cost tag reads spent / limit. Limits are kept in spend-limits.json across toggles.',
  author: 'Charlie Goldstraw',
  homepage: 'https://github.com/charlie-ps/wrangler-spend-limit',
  defaultEnabled: true,
  dir,
  requires: ['sessions:interrupt', 'board:rebuild'],
  engines: { wranglerApi: '^1.13.0' },

  settings: [{
    key: 'defaultUsd',
    type: 'number',
    label: 'Default spend limit ($)',
    help: 'The limit every new session starts with. The new-session dialog prefills it under Advanced options, where you can change or clear it for that one session. Empty means sessions start with no limit.',
    placeholder: 'No limit',
    min: 0.01,
    max: MAX_LIMIT_USD,
    // Cents. Without it the browser's default step of 1, counted from min,
    // refuses $25.50 (only 25.01, 26.01, … are valid).
    step: 0.01,
  }],

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
    onBeforeDispatch: ({ sessionId, ext, host }) => {
      const usd = startingLimit(ext, host.settings.get('defaultUsd'));
      if (usd != null) host.stores.limits.set(sessionId, usd);
    },
    onPurge: ({ sessionId, host }) => { host.stores.limits.set(sessionId, null); },
  },

  sweeps: [{ id: 'enforce', everyMs: 5000, run: ({ host }) => enforcer.tick(host, host.stores.limits.all()) }],

  client: 'public/index.js',
  styles: 'public/spend-limit.css',
};

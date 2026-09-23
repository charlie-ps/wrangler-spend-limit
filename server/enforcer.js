// The limit check. Spend is the card's own `usd` off the board graph — the figure
// the card shows, sub-agents included — rather than host.usage.byCard(), which
// sums every transcript the card ever owned and would disagree with the number
// the human set the limit against. A /clear or a fork therefore starts a fresh
// count, exactly as it does on the card.

// Minimum gap between two interrupts of one card. The graph's `status` can still
// read `working` for a tick after an Escape lands, and a second Escape on an idle
// Claude composer opens the rewind menu, so one interrupt per card per window.
export const COOLDOWN_MS = 15_000;

export function isOver(usd, limit) {
  return typeof limit === 'number' && typeof usd === 'number' && usd >= limit;
}

// What the graph contributor publishes for the client: every limited card on the
// board, with whether it has reached its limit.
export function limitsForGraph(sessions, limits) {
  const out = {};
  const usdOf = new Map((sessions || []).map((s) => [s.sessionId, s.usd]));
  for (const [id, limit] of Object.entries(limits)) {
    const usd = usdOf.get(id);
    out[id] = { limit, reached: isOver(usd, limit) };
  }
  return out;
}

export function createEnforcer({ now = () => Date.now() } = {}) {
  let sessions = [];
  const lastInterrupt = new Map();
  let running = false;

  return {
    // Called from the graph contributor every tick with the fresh board.
    noteGraph(graph) {
      if (Array.isArray(graph?.sessions)) sessions = graph.sessions;
    },

    // One sweep: interrupt every working card at or over its limit that has not
    // been interrupted inside the cooldown. Returns the ids it interrupted.
    async tick(host, limits) {
      if (running) return [];
      running = true;
      try {
        const done = [];
        const live = new Set();
        for (const s of sessions) {
          live.add(s.sessionId);
          const limit = limits[s.sessionId];
          if (s.status !== 'working' || !isOver(s.usd, limit)) continue;
          const last = lastInterrupt.get(s.sessionId);
          if (last != null && now() - last < COOLDOWN_MS) continue;
          lastInterrupt.set(s.sessionId, now());
          if (await host.sessions.interrupt(s.sessionId)) {
            host.log(`interrupted ${s.sessionId}: $${s.usd.toFixed(2)} spent, limit $${limit.toFixed(2)}`);
            done.push(s.sessionId);
          }
        }
        for (const id of lastInterrupt.keys()) if (!live.has(id)) lastInterrupt.delete(id);
        return done;
      } finally {
        running = false;
      }
    },
  };
}

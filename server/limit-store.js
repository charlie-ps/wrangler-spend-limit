import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The wrangler hands a store factory no data dir, so this resolves the same one
// the wrangler uses (AW_DATA_DIR, else ~/.agent-wrangler). A run-dev instance
// sets AW_DATA_DIR, so its limits stay out of the live board's file.
export function defaultFile() {
  const dataDir = process.env.AW_DATA_DIR || path.join(os.homedir(), '.agent-wrangler');
  return path.join(dataDir, 'spend-limits.json');
}

// Hard ceiling on a limit, only to catch a typo (5000 for 50.00) before it
// quietly disables the guard.
export const MAX_LIMIT_USD = 10_000;

// cardId -> { usd, setAt }. Small and written only on a human's edit, so every
// write is a whole-file atomic replace.
export class LimitStore {
  constructor({ file = defaultFile() } = {}) {
    this.file = file;
    this.limits = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed.limits === 'object') this.limits = parsed.limits;
    } catch { /* missing or unreadable: start empty */ }
  }

  get(sessionId) {
    return this.limits[sessionId]?.usd ?? null;
  }

  all() {
    return Object.fromEntries(Object.entries(this.limits).map(([id, l]) => [id, l.usd]));
  }

  // `usd` null clears. Anything else must be a positive finite number within
  // MAX_LIMIT_USD; the caller gets the reason back rather than a throw.
  set(sessionId, usd, now = Date.now()) {
    if (typeof sessionId !== 'string' || !sessionId) return { ok: false, error: 'sessionId must be a card id' };
    if (usd == null) {
      if (!(sessionId in this.limits)) return { ok: true };
      delete this.limits[sessionId];
    } else {
      if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return { ok: false, error: 'limit must be a positive number of dollars' };
      if (usd > MAX_LIMIT_USD) return { ok: false, error: `limit must be at most $${MAX_LIMIT_USD}` };
      this.limits[sessionId] = { usd: Math.round(usd * 100) / 100, setAt: now };
    }
    this.save();
    return { ok: true };
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ limits: this.limits }, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

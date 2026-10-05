// The client half, living entirely in the board's own chrome:
//  - a Spend limit field under the new-session dialog's Advanced options
//    (dispatch.field), prefilled with the Settings default and sent to the
//    server half as this extension's `ext` data, stored before launch;
//  - a "Spend limit…" item in the card and Actions menus (card.action), which
//    opens a small dialog to set, change or remove it;
//  - the ceiling in the core cost tag (card.cost), which core draws as
//    `$8.08 / $50.00` and turns red once reached.
// All three read `graph.spendLimits` ({ [cardId]: { limit, reached } }) from
// the server's graph contributor. Every string goes in through textContent.

const MAX_LIMIT_USD = 10_000;

const DOLLAR_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';

const money = (n) => `$${n.toFixed(2)}`;

function limitFor(graph, sessionId) {
  return graph?.spendLimits?.[sessionId] || null;
}

// A positive dollar amount within range, or null for "no limit". Anything else
// is `undefined`: not a value to send.
function parseLimit(raw) {
  const text = String(raw ?? '').trim().replace(/^\$/, '');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 && n <= MAX_LIMIT_USD ? Math.round(n * 100) / 100 : undefined;
}

function dollarInput(value = '') {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0.01';
  input.max = String(MAX_LIMIT_USD);
  input.step = 'any';
  input.placeholder = 'No limit';
  input.value = value;
  return input;
}

// The Settings default as the dialog's starting value ('' for none). Read live,
// so a change in Settings shows on the next open.
function defaultValue(api) {
  const usd = parseLimit(api.settings?.()?.defaultUsd);
  return usd ? String(usd) : '';
}

// Lives under Advanced options. `open` runs once per dialog open, after core
// has reset its own fields: a fresh dialog gets the Settings default, and
// editing a schedule gets the value saved with it. A schedule saved before this
// field existed has no slice and launches with the default, so it shows that.
function dispatchField() {
  let api = null;
  return {
    id: 'dispatch',
    at: 'advanced',
    mount(el, a) {
      api = a;
      const label = document.createElement('label');
      label.textContent = 'Spend limit ($)';
      const input = dollarInput();
      input.className = 'spend-limit-dispatch-input';
      input.setAttribute('aria-label', 'Spend limit in dollars');
      el.append(label, input);
    },
    open(el, ctx) {
      const input = el.querySelector('.spend-limit-dispatch-input');
      if (!input) return;
      input.value = ctx.editing && ctx.saved
        ? (ctx.saved.usd == null ? '' : String(ctx.saved.usd))
        : defaultValue(api);
    },
    // Always sent, so a cleared field means "no limit" for this session rather
    // than falling back to the default server-side. Invalid counts as blank.
    ext(el) {
      return { usd: parseLimit(el.querySelector('.spend-limit-dispatch-input')?.value) ?? null };
    },
  };
}

// One dialog at a time, built on the board's own .modal-card so it reads like
// every other dialog. Enter saves, Escape or a backdrop click cancels.
function openLimitDialog(session, current, api) {
  document.querySelector('.spend-limit-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'spend-limit-modal';
  const card = document.createElement('div');
  card.className = 'modal-card';
  const title = document.createElement('h3');
  title.textContent = 'Spend limit';
  const body = document.createElement('p');
  body.className = 'confirm-body';
  const spent = typeof session.usd === 'number' ? session.usd : 0;
  body.textContent = `${session.label || 'This session'} has spent ${money(spent)}. When it reaches the limit, the model is interrupted whenever it starts working.`;
  const label = document.createElement('label');
  label.textContent = 'Limit ($)';
  const input = dollarInput(current ? String(current.limit) : '');
  const error = document.createElement('div');
  error.className = 'spend-limit-error';
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const button = (text, cls) => { const b = document.createElement('button'); b.textContent = text; b.className = cls; return b; };
  const cancel = button('Cancel', 'ghost');
  const remove = button('Remove limit', 'ghost');
  const save = button('Save', 'primary');
  remove.hidden = !current;
  actions.append(cancel, remove, save);
  card.append(title, body, label, input, error, actions);
  overlay.append(card);
  document.body.append(overlay);
  input.focus();
  input.select();

  const close = () => overlay.remove();
  const submit = (usd) => {
    api.send({ type: 'spend-limit-set', sessionId: session.sessionId, usd });
    close();
  };
  save.addEventListener('click', () => {
    // Blank is not "remove" here: that is the Remove limit button's job.
    const usd = parseLimit(input.value);
    if (usd == null) { error.textContent = `Enter an amount between $0.01 and ${money(MAX_LIMIT_USD)}.`; return; }
    submit(usd);
  });
  remove.addEventListener('click', () => submit(null));
  cancel.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Enter') { e.preventDefault(); save.click(); }
  });
}

function menuAction() {
  return {
    id: 'menu',
    items(session, graph, api) {
      const current = limitFor(graph, session.sessionId);
      return [{
        label: 'Spend limit…',
        icon: DOLLAR_ICON,
        hint: current ? money(current.limit) : '',
        run: () => openLimitDialog(session, current, api),
      }];
    },
  };
}

function costCeiling() {
  return {
    id: 'cost',
    cost(session, graph) {
      const entry = limitFor(graph, session?.sessionId);
      return entry ? { usd: entry.limit, reached: entry.reached } : null;
    },
  };
}

export default {
  register(slots) {
    slots.register('dispatch.field', dispatchField());
    slots.register('card.action', menuAction());
    slots.register('card.cost', costCeiling());
  },
};

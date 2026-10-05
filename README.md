# Spend limits

An [Agent Wrangler](https://github.com/PortSwigger/agent-wrangler) extension that puts a USD spend limit on a session.

Set a default under **Settings → Extensions → Spend limits** and every new session starts with it, including ones launched by `spawn_session` or a schedule. The new-session dialog prefills the default in its **Spend limit ($)** field under **Advanced options**; change it for that session, or clear it for no limit. You can also set a limit at any time from **Spend limit…** in the card's right-click menu or the session's Actions menu. A limited card's cost tag reads `$8.08 / $50.00` and turns red once the limit is reached. After that, the wrangler presses Escape in the session's pane whenever the model is working, at most once every 15 s per card. Raise or remove the limit to let it continue.

Spend is the card's own figure (the `$` tag on the card, sub-agents included). A `/clear` or a fork therefore starts a fresh count. Claude only writes spend to its transcript when a message lands, so the check runs between steps. A single long reply with no tool calls can't be stopped part-way.

Requires host API `^1.13.0`: the `sessions:interrupt` capability, the `card.action` and `card.cost` slots, dispatch-field `ext` data and the browser's `api.settings()`. An older wrangler quarantines the extension at load. Limits live in `<AW_DATA_DIR>/spend-limits.json`.

## Install

In the wrangler's Extensions tab, install from `https://github.com/charlie-ps/wrangler-spend-limit.git` and consent to the two capabilities it asks for: `sessions:interrupt` and `board:rebuild`.

## Develop

```
npm test
```

To try it on a dev wrangler, **copy** (don't symlink) this directory to `<AW_DATA_DIR>/extensions/spend-limit` and start the wrangler.

## Licence

Apache-2.0, see `LICENSE`.

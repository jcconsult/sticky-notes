/* Running widgets: fetch on a schedule, re-render every minute, keep the
 * last good data, and hold each widget's action table.
 *
 * Each fetch gets a `host` — the only thing a widget ever touches:
 *   host.fetch(url, opts?)   text over the network, with a timeout and a cap;
 *                            opts: { method, headers, body } for an API
 *   host.connections(type)   this widget's ticked connections, decrypted
 *   host.report(id, error)   how a connection fared, for Settings → Connections
 * Nothing from Electron, the file system or the secret store reaches a
 * widget directly. Built-in widgets use exactly this contract.
 *
 * Fetched data lives here, in memory. notes.json holds only a widget's type
 * and settings — writing data into it every few minutes would rewrite the
 * user's whole notes file for nothing.
 */
const registry = require('./registry');
const format = require('./format');

const TICK_MS = 60 * 1000;

const today = () => new Date().toDateString();
const plural = (noun) => `${noun}s`;

/**
 * @param {object} deps
 * @param {(id: string) => object|null} deps.getNote
 * @param {(id: string, payload: object) => void} deps.send   to the widget's window
 * @param {object} deps.store   connections: list(type), values(type), report(id, error), exists(id)
 * @param {(url: string, options?: object) => Promise<string>} deps.fetchText
 * @param {() => void} deps.onSummary                         a one-line summary changed
 * @param {(id: string) => void} [deps.onForm]                settings options changed
 */
function createRuntime({ getNote, send, store, fetchText, onSummary, onForm = () => {} }) {
  const live = new Map();

  function parts(id) {
    const entry = live.get(id);
    const note = getNote(id);
    const def = note && note.widget ? registry.widget(note.widget.type) : null;
    if (!entry || !def) return null;
    return { entry, def, settings: registry.clean(def.type, note.widget.settings, store.exists) };
  }

  // Before fetching: does this widget have anything to fetch from? The same
  // two answers for every widget, so no widget writes its own empty state.
  function precondition(def, settings) {
    for (const type of def.uses || []) {
      const kind = registry.connection(type);
      const noun = kind ? kind.noun : type;
      const all = store.list(type);
      if (!all.length) {
        return {
          message: {
            text: `No ${plural(noun)} connected yet.`,
            detail: 'Set it up once in Settings → Connections, and every widget can use it.',
            action: { label: `Connect a ${noun}…`, target: { command: 'connections', type } },
          },
          summary: `No ${plural(noun)} connected`,
        };
      }
      const skip = registry.excluded(type, def.type, settings);
      if (all.every((c) => skip.includes(c.id))) {
        return {
          message: {
            text: `No ${plural(noun)} selected for this widget.`,
            action: { label: `Choose ${plural(noun)}…`, target: { command: 'settings' } },
          },
          summary: `No ${plural(noun)} selected`,
        };
      }
    }
    return null;
  }

  function host(def, settings) {
    return {
      fetch: fetchText,
      connections: (type) => {
        const skip = registry.excluded(type, def.type, settings);
        return store.values(type).filter((c) => !skip.includes(c.id));
      },
      report: (connectionId, error) => store.report(connectionId, error || null),
    };
  }

  function render(id) {
    const p = parts(id);
    if (!p) return;
    const { entry, def, settings } = p;

    let view = precondition(def, settings);
    const blocked = !!view; // nothing to fetch from: no fetch is coming
    if (!view && entry.data) view = def.view(entry.data, settings, Date.now());
    else if (!view && entry.error) {
      const type = (def.uses || [])[0];
      const kind = type ? registry.connection(type) : null;
      view = {
        message: {
          text: 'Couldn’t load this widget.',
          detail: entry.error,
          action: kind ? { label: `Check ${plural(kind.noun)}…`, target: { command: 'connections', type } } : null,
        },
        summary: 'Couldn’t load',
      };
    }
    // Otherwise the first fetch is still running.

    const rendered = view ? format.render(view) : { markdown: '', actions: {} };
    entry.actions = rendered.actions;
    entry.markdown = rendered.markdown;

    // Kept as well as sent: a window still loading misses the message, and
    // asks for the latest one when it starts.
    const waiting = !view;
    entry.payload = {
      markdown: rendered.markdown,
      loading: waiting,
      blocked,
      refreshing: entry.busy,
      fetchedAt: entry.fetchedAt,
      error: entry.data ? entry.error : null, // with no data, the error is the content
      failed: !entry.data && !!entry.error,
      warning: entry.warning,
      sources: (entry.data && entry.data.sources) || [],
    };
    send(id, entry.payload);

    const summary = view ? view.summary || null : null;
    if (summary !== entry.summary) {
      entry.summary = summary;
      onSummary();
    }
    // The tile a widget would show in a group; kept, not yet drawn anywhere.
    entry.glance = view ? view.glance || null : null;
  }

  async function refresh(id) {
    const p = parts(id);
    if (!p || p.entry.busy) return;
    const { entry, def, settings } = p;
    if (precondition(def, settings)) {
      render(id); // nothing to fetch from; say so
      return;
    }
    entry.busy = true;
    render(id);
    try {
      entry.data = await def.fetch(settings, host(def, settings));
      entry.fetchedAt = Date.now();
      entry.error = null;
      entry.warning = entry.data.warning || null;
    } catch (err) {
      // Keep the last good data; the footer says it is stale.
      entry.error = (err && err.message) || 'Couldn’t refresh';
    } finally {
      entry.busy = false;
      entry.day = today();
    }
    if (!live.has(id)) return;
    render(id);
    // Settings whose options come from the data (a team checklist) have to
    // redraw when those options change — including the first fetch, which
    // either fills them or means they can't be filled.
    const options = JSON.stringify(registry.dataOptions(def.type, entry.data));
    if (options !== undefined && options !== entry.options) {
      entry.options = options;
      onForm(id);
    }
  }

  function start(id) {
    if (live.has(id)) return;
    const note = getNote(id);
    const def = note && note.widget ? registry.widget(note.widget.type) : null;
    if (!def) return;
    const entry = {
      data: null, fetchedAt: null, error: null, warning: null, busy: false,
      actions: {}, markdown: '', summary: null, glance: null, options: null, day: null, payload: null,
      timer: setInterval(() => refresh(id), def.refreshMinutes * 60 * 1000),
    };
    live.set(id, entry);
    refresh(id);
  }

  function stop(id) {
    const entry = live.get(id);
    if (!entry) return;
    clearInterval(entry.timer);
    live.delete(id);
  }

  // Every minute: redraw, so "now" and "finished" move with the clock; after
  // midnight, fetch again so "today" is really today.
  const tick = setInterval(() => {
    for (const [id, entry] of live) {
      if (entry.day && entry.day !== today()) refresh(id);
      else render(id);
    }
  }, TICK_MS);

  // `reset` when what a widget showed is no longer true — connections added
  // or removed, or its selection changed — so it shows "Loading…" and then
  // the new result, never the old content with a new error under it.
  function reset(id) {
    const entry = live.get(id);
    if (!entry) return;
    Object.assign(entry, { data: null, error: null, warning: null, fetchedAt: null });
  }

  function refreshAll({ reset: fresh = false } = {}) {
    for (const id of live.keys()) {
      if (fresh) reset(id);
      refresh(id);
    }
  }

  // Only ids this widget's last render created; anything else does nothing.
  function action(id, actionId) {
    const entry = live.get(id);
    if (!entry || !Object.prototype.hasOwnProperty.call(entry.actions, actionId)) return null;
    return entry.actions[actionId];
  }

  // Stop everything — for tests, which would otherwise never exit.
  function dispose() {
    clearInterval(tick);
    for (const id of [...live.keys()]) stop(id);
  }

  return {
    start,
    stop,
    dispose,
    refresh,
    refreshAll,
    reset,
    render,
    action,
    summary: (id) => (live.get(id) || {}).summary || null,
    glance: (id) => (live.get(id) || {}).glance || null,
    // What a settings form needs to fill options that come from the data —
    // and, when there is none, whether a fetch is coming (loading), went
    // wrong (failed), or can't happen until something is connected (blocked).
    source: (id) => {
      const entry = live.get(id);
      const p = parts(id);
      return {
        data: entry ? entry.data : null,
        failed: !!(entry && !entry.data && entry.error),
        blocked: !!(p && precondition(p.def, p.settings)),
      };
    },
    markdown: (id) => (live.get(id) || {}).markdown || '',
    payload: (id) => (live.get(id) || {}).payload || { loading: true },
  };
}

module.exports = { createRuntime };

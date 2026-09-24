/* Running widgets: fetch on a schedule, re-render every minute, keep the
 * last good data, and hold each widget's action table.
 *
 * Fetched data lives here, in memory. notes.json holds only a widget's type
 * and settings — writing a calendar into it every few minutes would rewrite
 * the user's whole notes file for nothing.
 */
const widgets = require('./index');
const format = require('./format');

const TICK_MS = 60 * 1000;

const today = () => new Date().toDateString();

/**
 * @param {object} deps
 * @param {(id: string) => object|null} deps.getNote
 * @param {(id: string, payload: object) => void} deps.send   to the widget's window
 * @param {object} deps.ctx                                   what fetch() may use
 * @param {() => void} deps.onSummary                         a one-line summary changed
 */
function createRuntime({ getNote, send, ctx, onSummary }) {
  const live = new Map();

  function parts(id) {
    const entry = live.get(id);
    const note = getNote(id);
    const def = note && note.widget ? widgets.definition(note.widget.type) : null;
    if (!entry || !def) return null;
    return { entry, def, settings: widgets.clean(def.type, note.widget.settings) };
  }

  function render(id) {
    const p = parts(id);
    if (!p) return;
    const { entry, def, settings } = p;

    let view;
    if (entry.data) view = def.view(entry.data, settings, Date.now());
    else if (entry.error) view = { message: { text: 'Couldn’t load this widget.', detail: entry.error }, summary: 'Couldn’t load' };
    else view = null; // first fetch still running

    const rendered = view ? format.render(view) : { markdown: '', actions: {} };
    entry.actions = rendered.actions;
    entry.markdown = rendered.markdown;

    // Kept as well as sent: a window still loading misses the message, and
    // asks for the latest one when it starts.
    entry.payload = {
      markdown: rendered.markdown,
      loading: !view,
      refreshing: entry.busy,
      fetchedAt: entry.fetchedAt,
      error: entry.data ? entry.error : null, // with no data, the error is the content
      warning: entry.warning,
      sources: (entry.data && entry.data.sources) || [],
    };
    send(id, entry.payload);

    const summary = view ? view.summary || null : null;
    if (summary !== entry.summary) {
      entry.summary = summary;
      onSummary();
    }
  }

  async function refresh(id) {
    const p = parts(id);
    if (!p || p.entry.busy) return;
    const { entry, def, settings } = p;
    entry.busy = true;
    render(id);
    try {
      entry.data = await def.fetch(settings, ctx);
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
    if (live.has(id)) render(id);
  }

  function start(id) {
    if (live.has(id)) return;
    const note = getNote(id);
    const def = note && note.widget ? widgets.definition(note.widget.type) : null;
    if (!def) return;
    const entry = {
      data: null, fetchedAt: null, error: null, warning: null, busy: false,
      actions: {}, markdown: '', summary: null, day: null,
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
  setInterval(() => {
    for (const [id, entry] of live) {
      if (entry.day && entry.day !== today()) refresh(id);
      else render(id);
    }
  }, TICK_MS);

  // `reset` when what a widget showed is no longer true — calendars added or
  // removed — so it shows "Loading…" and then the new result, never the old
  // content with a new error under it.
  function refreshAll({ reset = false } = {}) {
    for (const [id, entry] of live) {
      if (reset) {
        entry.data = null;
        entry.error = null;
        entry.warning = null;
        entry.fetchedAt = null;
      }
      refresh(id);
    }
  }

  // Only ids this widget's last render created; anything else does nothing.
  function action(id, actionId) {
    const entry = live.get(id);
    if (!entry || !Object.prototype.hasOwnProperty.call(entry.actions, actionId)) return null;
    return entry.actions[actionId];
  }

  return {
    start,
    stop,
    refresh,
    refreshAll,
    render,
    action,
    summary: (id) => (live.get(id) || {}).summary || null,
    markdown: (id) => (live.get(id) || {}).markdown || '',
    payload: (id) => (live.get(id) || {}).payload || { loading: true },
  };
}

module.exports = { createRuntime };

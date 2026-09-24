/* Agenda: today and tomorrow from every connected calendar, merged.
 *
 * A widget is three things: the settings it offers (drawn by the framework),
 * fetch (the slow part, run every few minutes) and view (the fast, pure part,
 * run every minute so "now" and "finished" stay true between fetches).
 */
const { parse } = require('./ics');
const { view, startOfDay, addDays } = require('./agenda-view');

// Fetch a little either side of the days shown, so crossing midnight needs
// no refetch and an event that started yesterday is still found.
const WINDOW_BEFORE_DAYS = 1;
const WINDOW_AFTER_DAYS = 3;

module.exports = {
  type: 'agenda',
  name: 'Agenda',
  color: 'blue',
  refreshMinutes: 5,

  // Offered when every calendar fails: the links are where it gets fixed.
  fix: { label: 'Check calendar links…', target: { command: 'connections' } },

  settings: [
    {
      key: 'days', label: 'Show', type: 'choice', default: 2,
      options: [[1, 'Today'], [2, 'Today and tomorrow']],
    },
    { key: 'showFinished', label: 'Show finished events', type: 'toggle', default: true },
  ],

  /**
   * @param {object} _settings
   * @param {{ calendars(): {urls: {label, url}[], unreadable: number}, fetchText(url): Promise<string> }} ctx
   */
  async fetch(_settings, ctx) {
    const { urls, unreadable } = ctx.calendars();
    if (!urls.length && !unreadable) return { connected: false, events: [], sources: [] };

    const today = startOfDay(Date.now());
    const from = addDays(today, -WINDOW_BEFORE_DAYS);
    const to = addDays(today, WINDOW_AFTER_DAYS);

    const results = await Promise.allSettled(urls.map(({ url }) => ctx.fetchText(url)));
    const events = [];
    const failed = [];
    // Each failure names the calendar and says why, e.g. "Google Calendar:
    // link not found (404)" — a bare "couldn't reach" leaves nothing to act on.
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        failed.push(`${urls[i].label}: ${(result.reason && result.reason.message) || 'failed'}`);
        return;
      }
      try {
        events.push(...parse(result.value, from, to));
      } catch {
        failed.push(`${urls[i].label}: not a readable calendar`);
      }
    });

    // The same meeting can arrive from two calendars (an Outlook invite that
    // is also on Google); show it once.
    const seen = new Set();
    const unique = events.filter((e) => {
      const key = `${e.title}|${e.start}|${e.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unreadable) failed.push(`${unreadable} link${unreadable === 1 ? '' : 's'} saved on another PC — add again`);
    if (failed.length === urls.length + (unreadable ? 1 : 0)) {
      throw new Error(failed.join('; '));
    }
    return {
      connected: true,
      events: unique,
      sources: [...new Set(urls.map((u) => u.label))],
      warning: failed.length ? failed.join('; ') : null,
    };
  },

  view(data, settings, now) {
    if (!data || !data.connected) {
      return {
        message: {
          text: 'No calendars connected yet.',
          detail: 'Add the secret iCal address from Google Calendar, or the published ICS link from Outlook. Only those addresses are contacted.',
          action: { label: 'Add a calendar link…', target: { command: 'connections' } },
        },
        summary: 'No calendars connected',
      };
    }
    return view(data.events, settings, now);
  },
};

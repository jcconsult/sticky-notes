/* Calendar extension: calendar links (a connection type) and the Agenda
 * widget that shows them.
 *
 * Everything calendar-specific lives here — what a link is, how it is
 * checked, what to call it, how events become rows. The framework only reads
 * this manifest: it draws Settings → Connections from `connections`, puts
 * `widgets` in the + menu, and hands each widget a `host` to work through.
 */
const { parse, calendarName } = require('./ics');
const { view, startOfDay, addDays } = require('./agenda-view');

// Fetch a little either side of the days shown, so crossing midnight needs
// no refetch and an event that started yesterday is still found.
const WINDOW_BEFORE_DAYS = 1;
const WINDOW_AFTER_DAYS = 3;

function provider(hostname) {
  if (/(^|\.)google\.com$/i.test(hostname)) return 'Google';
  if (/(^|\.)(outlook\.office365\.com|outlook\.office\.com|outlook\.live\.com)$/i.test(hostname)) return 'Outlook';
  return hostname;
}

const ics = {
  type: 'ics',
  name: 'Calendars',
  noun: 'calendar',
  multiple: true,
  fields: [
    {
      key: 'url', label: 'Calendar link', type: 'url', secret: true,
      placeholder: 'Paste a calendar link (https:// or webcal://)',
    },
  ],
  help: 'Google: Settings → your calendar → Integrate calendar → Secret address in iCal format. '
    + 'Outlook: Settings → Calendar → Shared calendars → Publish a calendar, with “Can view all details”.',

  // Calendar apps hand out webcal:// links; they are plain HTTPS underneath.
  normalise(values) {
    const url = String(values.url || '').trim().replace(/^webcal:\/\//i, 'https://');
    return { url };
  },

  // Run when a link is added: refuse, with a reason, anything that can't
  // work — and name the calendar from the feed itself, so two Google
  // calendars read "Work" and "Family" rather than "Google Calendar" twice.
  async check(values, host) {
    let url;
    try {
      url = new URL(values.url);
    } catch {
      throw new Error('That doesn’t look like a link. It should start with https:// or webcal://.');
    }
    if (url.protocol !== 'https:') throw new Error('Calendar links must use https:// or webcal://.');

    let text;
    try {
      text = await host.fetch(url.href);
    } catch (err) {
      if (err.status === 404 && /google\.com$/i.test(url.hostname) && url.pathname.includes('/public/')) {
        throw new Error('Google says that link doesn’t exist: it is the calendar’s public address, which only works for calendars shared with everyone. Use “Secret address in iCal format” instead.');
      }
      throw new Error(`Couldn’t read that calendar: ${err.message}.`);
    }
    if (!/^﻿?\s*BEGIN:VCALENDAR/i.test(text)) {
      throw new Error('That link opens a web page, not a calendar. Copy the iCal (ICS) address instead.');
    }
    const name = calendarName(text);
    return { label: name || provider(url.hostname), detail: provider(url.hostname) };
  },
};

const agenda = {
  type: 'agenda',
  name: 'Agenda',
  color: 'blue',
  uses: ['ics'],
  refreshMinutes: 5,
  settings: [
    { key: 'calendars', label: 'Calendars', type: 'connections', of: 'ics' },
    {
      key: 'days', label: 'Show', type: 'choice', default: 2,
      options: [[1, 'Today'], [2, 'Today and tomorrow']],
    },
    { key: 'showFinished', label: 'Show finished events', type: 'toggle', default: true },
  ],

  async fetch(_settings, host) {
    const calendars = host.connections('ics');
    const today = startOfDay(Date.now());
    const from = addDays(today, -WINDOW_BEFORE_DAYS);
    const to = addDays(today, WINDOW_AFTER_DAYS);

    const results = await Promise.allSettled(calendars.map((c) => host.fetch(c.values.url)));
    const events = [];
    const failed = [];
    // Each failure names the calendar and says why, and is recorded against
    // the connection, so Settings → Connections shows which link is broken.
    results.forEach((result, i) => {
      const calendar = calendars[i];
      let error = result.status === 'rejected' ? (result.reason && result.reason.message) || 'failed' : null;
      if (!error) {
        try {
          events.push(...parse(result.value, from, to));
        } catch {
          error = 'not a readable calendar';
        }
      }
      host.report(calendar.id, error);
      if (error) failed.push(`${calendar.label}: ${error}`);
    });

    if (failed.length === calendars.length) throw new Error(failed.join('; '));

    // The same meeting can arrive from two calendars (an Outlook invite that
    // is also on Google); show it once.
    const seen = new Set();
    const unique = events.filter((e) => {
      const key = `${e.title}|${e.start}|${e.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      events: unique,
      sources: [...new Set(calendars.map((c) => c.label))],
      warning: failed.length ? failed.join('; ') : null,
    };
  },

  view(data, settings, now) {
    return view(data.events, settings, now);
  },
};

module.exports = {
  id: 'calendar',
  name: 'Calendar',
  connections: [ics],
  widgets: [agenda],
};

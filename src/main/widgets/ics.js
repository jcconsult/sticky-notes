/* iCalendar (.ics) → plain events, for the Agenda.
 *
 * Google's "secret address" and Outlook's "publish calendar" both serve
 * iCalendar. ical.js (Mozilla's parser, the one Thunderbird uses) does the
 * hard parts: repeating events with skipped (EXDATE) and moved (RECURRENCE-ID)
 * occurrences, and time zones — including Outlook's Windows names such as
 * "W. Europe Standard Time", which it resolves from the VTIMEZONE blocks the
 * feed embeds, registered below.
 *
 * Everything in a feed is written by other people, so nothing here is
 * trusted: titles are only ever rendered as escaped text, and a join link is
 * taken only from a known meeting host.
 */
const ICAL = require('ical.js');
const { addDays } = require('./agenda-view');

const MAX_OCCURRENCES = 20000; // a daily event since 1970 is ~20k; beyond that is a broken feed

// Only these become a Join button. Anything else in an invite stays text.
const JOIN = /https:\/\/(?:teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|(?:[\w-]+\.)?zoom\.us)\/[^\s<>"')\]]+/i;

function registerZones(root) {
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(vtz);
    if (zone.tzid && !ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone);
  }
}

// All-day dates carry no time zone; they belong to the local calendar day.
function toMs(time) {
  if (time.isDate) return new Date(time.year, time.month - 1, time.day).getTime();
  return time.toJSDate().getTime();
}

function joinUrl(component) {
  const fields = ['location', 'description', 'url', 'x-google-conference']
    .map((name) => component.getFirstPropertyValue(name))
    .filter((value) => typeof value === 'string');
  for (const text of fields) {
    const match = JOIN.exec(text);
    if (match) return match[0];
  }
  return null;
}

// A location that is just a meeting URL says nothing the Join button doesn't.
function place(component) {
  const location = component.getFirstPropertyValue('location');
  if (typeof location !== 'string' || /^\s*https?:\/\//i.test(location)) return null;
  const text = location.replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text || null;
}

function toEvent(component, start, end) {
  const allDay = start.isDate;
  const startMs = toMs(start);
  let endMs = end ? toMs(end) : startMs;
  if (allDay && endMs <= startMs) endMs = addDays(startMs, 1); // DTEND is optional for all-day
  return {
    title: component.getFirstPropertyValue('summary') || '',
    start: startMs,
    end: endMs,
    allDay,
    location: place(component),
    joinUrl: joinUrl(component),
  };
}

function cancelled(component) {
  return String(component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED';
}

/**
 * Events overlapping [from, to), in epoch ms.
 * @param {string} text  the .ics file
 * @param {number} from
 * @param {number} to
 */
function parse(text, from, to) {
  const root = new ICAL.Component(ICAL.parse(text));
  registerZones(root);

  const masters = [];
  const exceptions = new Map(); // uid → moved or edited occurrences
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);
    if (event.isRecurrenceException()) {
      if (!exceptions.has(event.uid)) exceptions.set(event.uid, []);
      exceptions.get(event.uid).push(event);
    } else {
      masters.push(event);
    }
  }

  const events = [];
  const keep = (e) => { if (e.start < to && e.end > from) events.push(e); };

  for (const master of masters) {
    for (const exception of exceptions.get(master.uid) || []) master.relateException(exception);

    if (!master.isRecurring()) {
      if (!cancelled(master.component)) keep(toEvent(master.component, master.startDate, master.endDate));
      continue;
    }

    const it = master.iterator();
    for (let n = 0, next = it.next(); next && n < MAX_OCCURRENCES; n += 1, next = it.next()) {
      // Stop on the series' own time, not a moved occurrence's: one instance
      // moved far ahead must not cut off the rest.
      if (toMs(next) >= to) break;
      const details = master.getOccurrenceDetails(next);
      if (cancelled(details.item.component)) continue;
      keep(toEvent(details.item.component, details.startDate, details.endDate));
    }
  }
  return events;
}

module.exports = { parse };

/* Agenda: events → rows. Pure — no network, no clock of its own.
 *
 * `now` is passed in, so the widget re-renders every minute (what is on now,
 * what has finished) without fetching anything, and the tests can stand at
 * any moment they like.
 *
 * An event is { title, start, end, allDay, location, joinUrl }, with start and
 * end as epoch ms. All-day events start and end at local midnight (end
 * exclusive), which is how they stay on their own date in every time zone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Adding 24h is wrong across a daylight-saving change; step by calendar day.
function addDays(dayStart, n) {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

function formatters(locale) {
  return {
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    day: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
  };
}

function duration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function overlaps(event, from, to) {
  return event.start < to && event.end > from;
}

function row(event, dayStart, now, fmt) {
  const running = event.start <= now && now < event.end;
  const over = event.end <= now;

  let lead;
  if (event.allDay) lead = 'all day';
  else if (event.start < dayStart) lead = 'cont.';
  else lead = fmt.time.format(event.start);

  const meta = [];
  if (running && !event.allDay) meta.push('Now', `ends ${fmt.time.format(event.end)}`);
  if (event.location) meta.push(event.location);
  if (!event.allDay && !running) meta.push(duration(event.end - event.start));

  return {
    lead,
    text: event.title || '(no title)',
    state: running && !event.allDay ? 'now' : over ? 'done' : undefined,
    meta,
    actions: event.joinUrl && !over ? [{ label: 'Join', target: { url: event.joinUrl } }] : [],
  };
}

function byTime(a, b) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.start - b.start || a.end - b.end;
}

/**
 * @param {object[]} events
 * @param {{ days: number, showFinished: boolean }} settings
 * @param {number} now epoch ms
 * @param {string} [locale]
 */
function view(events, settings, now, locale) {
  const fmt = formatters(locale);
  const today = startOfDay(now);
  const names = ['Today', 'Tomorrow'];
  const sections = [];

  for (let i = 0; i < settings.days; i += 1) {
    const from = addDays(today, i);
    const to = addDays(today, i + 1);
    const rows = events
      .filter((e) => overlaps(e, from, to))
      .sort(byTime)
      .map((e) => row(e, from, now, fmt))
      .filter((r) => settings.showFinished || r.state !== 'done');
    const hadAny = events.some((e) => overlaps(e, from, to));
    sections.push({
      heading: `${names[i] || ''} · ${fmt.day.format(from)}`,
      items: rows,
      empty: i === 0 && hadAny ? 'Nothing else today' : i === 0 ? 'Nothing on today' : 'Nothing scheduled',
    });
  }

  return { sections, summary: summary(events, now, fmt), glance: glance(events, now, fmt) };
}

// The tile: the time of what is on or next today, and what it is.
function glance(events, now, fmt) {
  const timed = events.filter((e) => !e.allDay).sort(byTime);
  const current = timed.find((e) => e.start <= now && now < e.end);
  if (current) return { value: fmt.time.format(current.start), caption: `${current.title} · on now`, live: true };
  const tonight = addDays(startOfDay(now), 1);
  const next = timed.find((e) => e.start > now && e.start < tonight);
  if (next) return { value: fmt.time.format(next.start), caption: next.title };
  return { value: 'Free', caption: 'Nothing else today' };
}

// One line for All Notes: what is on, or what is next today.
function summary(events, now, fmt) {
  const timed = events.filter((e) => !e.allDay).sort(byTime);
  const current = timed.find((e) => e.start <= now && now < e.end);
  if (current) return `Now: ${current.title} · until ${fmt.time.format(current.end)}`;
  const tonight = addDays(startOfDay(now), 1);
  const next = timed.find((e) => e.start > now && e.start < tonight);
  if (next) return `Next: ${fmt.time.format(next.start)} ${next.title}`;
  return 'Nothing else today';
}

module.exports = { view, startOfDay, addDays, DAY_MS };

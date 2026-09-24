/* Tests for the widget formatter and the Agenda's rows.
 *
 * Both are pure, so plain Node runs them: the formatter's escaping and action
 * table, and the Agenda at chosen moments of a made-up day.
 *
 *   npm test
 */
const path = require('path');

const { render } = require(path.join(__dirname, '..', 'src', 'main', 'widgets', 'format.js'));
const { view } = require(path.join(__dirname, '..', 'src', 'main', 'widgets', 'agenda-view.js'));

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}`);
    console.log(`         got:  ${a}`);
    console.log(`         want: ${b}`);
  }
}

// --- formatter: escaping ---------------------------------------------------

let out = render({ sections: [{ heading: 'Today', items: [{ lead: '09:00', text: '[Join](https://evil.example) **now**' }] }] });
check('link syntax in a title is inert', out.markdown.includes('\\[Join\\](https://evil.example) \\*\\*now\\*\\*'), true);
check('no action is made from title text', out.actions, {});

out = render({ sections: [{ heading: 'x', items: [{ text: '# not a heading' }, { text: '1. not a list' }] }] });
check('block syntax at the start is escaped', out.markdown.includes('- \\# not a heading') && out.markdown.includes('- 1\\. not a list'), true);

out = render({ sections: [{ heading: 'x', items: [{ text: 'line one\nline two' }] }] });
check('newlines collapse, so a row stays one row', out.markdown.includes('- line one line two'), true);

// --- formatter: actions ----------------------------------------------------

out = render({
  sections: [{
    heading: 'Today',
    items: [{
      lead: '11:00', text: 'Review', state: 'now',
      meta: ['Teams'], actions: [{ label: 'Join', target: { url: 'https://teams.microsoft.com/l/x' } }],
    }],
  }],
});
check('actions become opaque ids', out.markdown.includes('[Join](sticky://act/a1)'), true);
check('the table holds the real target', out.actions, { a1: { url: 'https://teams.microsoft.com/l/x' } });
check('a row that is on now is bold', out.markdown.includes('`11:00` **Review**'), true);

out = render({ sections: [{ heading: 'Tomorrow', items: [], empty: 'Nothing scheduled' }] });
check('an empty section says so', out.markdown, '#### Tomorrow\n\n_Nothing scheduled_\n');

out = render({ message: { text: 'No calendars connected yet.', action: { label: 'Add a calendar link…', target: { command: 'connections' } } } });
check('a message can carry a command', out.actions, { a1: { command: 'connections' } });

// --- agenda ----------------------------------------------------------------

// Local times on a made-up Wednesday, 23 Sep 2026.
const at = (h, m = 0, day = 23) => new Date(2026, 8, day, h, m).getTime();
const events = [
  { title: 'Gym', start: at(8), end: at(9) },
  { title: 'Sprint review', start: at(11), end: at(12), location: 'Teams', joinUrl: 'https://teams.microsoft.com/l/x' },
  { title: 'Lunch with Sam', start: at(13, 30), end: at(14, 30) },
  { title: 'Sprint 14 ends', start: at(0), end: at(0, 0, 24), allDay: true },
  { title: 'Standup', start: at(9, 30, 24), end: at(9, 45, 24), location: 'Teams' },
  { title: 'Next week', start: at(10, 0, 30), end: at(11, 0, 30) },
];
const settings = { days: 2, showFinished: true };

let v = view(events, settings, at(11, 20), 'en-GB');
// Current ICU abbreviates September as "Sept" in en-GB.
check('two sections, today then tomorrow', v.sections.map((s) => s.heading), ['Today · Wed 23 Sept', 'Tomorrow · Thu 24 Sept']);
check('all-day first, then by time', v.sections[0].items.map((r) => r.text), ['Sprint 14 ends', 'Gym', 'Sprint review', 'Lunch with Sam']);
check('all-day lead', v.sections[0].items[0].lead, 'all day');
check('finished events are marked done', v.sections[0].items[1].state, 'done');
check('the running event is now, with its end', [v.sections[0].items[2].state, v.sections[0].items[2].meta], ['now', ['Now', 'ends 12:00', 'Teams']]);
check('a running event offers Join', v.sections[0].items[2].actions.length, 1);
check('a later event shows its length', v.sections[0].items[3].meta, ['1 h']);
check('the all-day event is not repeated tomorrow', v.sections[1].items.map((r) => r.text), ['Standup']);
check('summary names what is on now', v.summary, 'Now: Sprint review · until 12:00');

v = view(events, { days: 2, showFinished: false }, at(11, 20), 'en-GB');
check('finished events can be hidden', v.sections[0].items.map((r) => r.text), ['Sprint 14 ends', 'Sprint review', 'Lunch with Sam']);

v = view(events, { days: 1, showFinished: false }, at(15), 'en-GB');
check('one day only', v.sections.length, 1);
check('late in the day, only the all-day event is left', v.sections[0].items.map((r) => r.text), ['Sprint 14 ends']);
check('summary when nothing is left', v.summary, 'Nothing else today');

v = view(events, settings, at(12, 30), 'en-GB');
check('summary names the next event', v.summary, 'Next: 13:30 Lunch with Sam');
check('Join disappears once an event is over', v.sections[0].items[2].actions, []);

v = view([], settings, at(9), 'en-GB');
check('an empty day', v.sections.map((s) => s.empty), ['Nothing on today', 'Nothing scheduled']);

// An overnight event shows on both days, marked as continuing on the second.
v = view([{ title: 'Deploy window', start: at(22), end: at(2, 0, 24) }], settings, at(9), 'en-GB');
check('overnight: starts today', v.sections[0].items[0].lead, '22:00');
check('overnight: continues tomorrow', v.sections[1].items[0].lead, 'cont.');

// --- ics parsing -----------------------------------------------------------

const { parse } = require(path.join(__dirname, '..', 'src', 'main', 'widgets', 'ics.js'));

// Made-up feed. Covers what real Google and Outlook feeds throw at a parser:
// a Windows time zone name with its VTIMEZONE (Outlook), a weekly series with
// a skipped and a moved occurrence, an all-day event, a multi-day event, a
// cancelled event, and a lookalike link that must not become a Join button.
const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sticky-notes//test//EN',
  'BEGIN:VTIMEZONE', 'TZID:W. Europe Standard Time',
  'BEGIN:STANDARD', 'DTSTART:16010101T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10', 'END:STANDARD',
  'BEGIN:DAYLIGHT', 'DTSTART:16010101T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3', 'END:DAYLIGHT',
  'END:VTIMEZONE',
  'BEGIN:VEVENT', 'UID:weekly-1', 'SUMMARY:Standup',
  'DTSTART;TZID=W. Europe Standard Time:20260902T093000',
  'DTEND;TZID=W. Europe Standard Time:20260902T094500',
  'RRULE:FREQ=WEEKLY;BYDAY=WE',
  'EXDATE;TZID=W. Europe Standard Time:20260916T093000',
  'LOCATION:Microsoft Teams Meeting',
  'DESCRIPTION:Join: https://teams.microsoft.com/l/meetup-join/abc',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:weekly-1', 'SUMMARY:Standup (moved)',
  'RECURRENCE-ID;TZID=W. Europe Standard Time:20260923T093000',
  'DTSTART;TZID=W. Europe Standard Time:20260923T110000',
  'DTEND;TZID=W. Europe Standard Time:20260923T111500',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:allday-1', 'SUMMARY:Sprint 14 ends',
  'DTSTART;VALUE=DATE:20260923', 'DTEND;VALUE=DATE:20260924', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:multi-1', 'SUMMARY:Offsite',
  'DTSTART:20260922T080000Z', 'DTEND:20260924T150000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:cancel-1', 'SUMMARY:Cancelled thing', 'STATUS:CANCELLED',
  'DTSTART:20260923T120000Z', 'DTEND:20260923T130000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:phish-1', 'SUMMARY:Lookalike',
  'DTSTART:20260923T140000Z', 'DTEND:20260923T150000Z',
  'DESCRIPTION:Click https://evil.example/teams.microsoft.com/l/x now', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// Times in UTC so the test means the same on any machine and in CI.
const found = parse(ICS, Date.UTC(2026, 8, 8), Date.UTC(2026, 8, 26));
const titled = (title) => found.filter((e) => e.title === title);

check('series: skipped occurrence is gone', titled('Standup').map((e) => new Date(e.start).toISOString()), ['2026-09-09T07:30:00.000Z']);
check('Windows time zone resolved (09:30 CEST = 07:30Z)', titled('Standup')[0].end - titled('Standup')[0].start, 15 * 60000);
check('series: moved occurrence at its new time', titled('Standup (moved)').map((e) => new Date(e.start).toISOString()), ['2026-09-23T09:00:00.000Z']);
check('Join link from a known host', titled('Standup')[0].joinUrl, 'https://teams.microsoft.com/l/meetup-join/abc');
check('location kept', titled('Standup')[0].location, 'Microsoft Teams Meeting');
check('all-day stays on its local date', [titled('Sprint 14 ends')[0].start, titled('Sprint 14 ends')[0].end, titled('Sprint 14 ends')[0].allDay], [new Date(2026, 8, 23).getTime(), new Date(2026, 8, 24).getTime(), true]);
check('multi-day event spans its days', [titled('Offsite')[0].start, titled('Offsite')[0].end], [Date.UTC(2026, 8, 22, 8), Date.UTC(2026, 8, 24, 15)]);
check('cancelled events are dropped', titled('Cancelled thing').length, 0);
check('a lookalike link is not a Join button', titled('Lookalike')[0].joinUrl, null);
check('the window is respected', parse(ICS, Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 2)).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

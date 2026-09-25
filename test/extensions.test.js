/* The extension contract, and the framework running a widget.
 *
 * First, every extension must provide what the framework relies on — the
 * check a third-party widget would one day have to pass. Then the runtime is
 * driven with a fake connection store and a fake network, exactly the way
 * main.js drives it, to prove the framework's own states (nothing connected,
 * nothing selected, working, failed) without Electron.
 *
 *   npm test
 */
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'main');
const extensions = require(path.join(src, 'extensions'));
const registry = require(path.join(src, 'widgets', 'registry.js'));
const { createRuntime } = require(path.join(src, 'widgets', 'runtime.js'));
const { PALETTE } = require(path.join(__dirname, '..', 'src', 'shared', 'palette.js'));

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

// --- the contract ----------------------------------------------------------

const FIELD_TYPES = ['toggle', 'choice', 'connections', 'checklist'];
const INPUT_TYPES = ['url', 'text'];
const connectionTypes = new Set();
const widgetTypes = new Set();

for (const ext of extensions) {
  check(`extension "${ext.id}" has an id and a name`, !!(ext.id && ext.name), true);

  for (const c of ext.connections || []) {
    check(`connection "${c.type}" is unique`, connectionTypes.has(c.type), false);
    connectionTypes.add(c.type);
    check(`connection "${c.type}" names itself`, !!(c.name && c.noun), true);
    check(`connection "${c.type}" declares fields`, Array.isArray(c.fields) && c.fields.length > 0, true);
    check(`connection "${c.type}" fields are well formed`,
      c.fields.every((f) => f.key && f.label && INPUT_TYPES.includes(f.type)), true);
    check(`connection "${c.type}" can check itself`, typeof c.check, 'function');
  }

  for (const w of ext.widgets || []) {
    check(`widget "${w.type}" is unique`, widgetTypes.has(w.type), false);
    widgetTypes.add(w.type);
    check(`widget "${w.type}" has a name and a palette colour`,
      !!w.name && PALETTE.some((p) => p.id === w.color), true);
    check(`widget "${w.type}" refreshes on a schedule`, w.refreshMinutes > 0, true);
    check(`widget "${w.type}" has fetch and view`, [typeof w.fetch, typeof w.view], ['function', 'function']);
    check(`widget "${w.type}" settings use known field types`,
      w.settings.every((f) => f.key && f.label && FIELD_TYPES.includes(f.type)), true);
    check(`widget "${w.type}" choices have defaults among their options`,
      w.settings.filter((f) => f.type === 'choice').every((f) => f.options.some(([v]) => v === f.default)), true);
    check(`widget "${w.type}" checklists take their options from data, and name them`,
      w.settings.filter((f) => f.type === 'checklist').every((f) => typeof f.options === 'function' && !!f.noun), true);
    check(`widget "${w.type}" icon is one of the app's own`, registry.ICONS.includes(w.icon), true);
  }
}

// References are checked once everything is known, so order doesn't matter.
for (const w of registry.widgetTypes()) {
  check(`widget "${w.type}" uses only registered connection types`,
    (w.uses || []).every((t) => connectionTypes.has(t)), true);
  check(`widget "${w.type}" connections fields point at registered types`,
    w.settings.filter((f) => f.type === 'connections').every((f) => connectionTypes.has(f.of)), true);
}

// --- settings rules --------------------------------------------------------

check('defaults: connections start empty (nothing excluded)', registry.defaults('agenda').calendars, []);
check('clean drops bad values and unknown connections',
  registry.clean('agenda', { days: 7, showFinished: 'yes', calendars: ['k1', 'gone', 3] }, (id) => id === 'k1'),
  { calendars: ['k1'], days: 2, showFinished: true });
check('schema fills a connections field with what exists',
  registry.schema('agenda', () => [{ id: 'k1', label: 'Work', detail: 'Google', health: null, secret: 'never' }])[0].options,
  [{ id: 'k1', label: 'Work', detail: 'Google', health: null }]);

const teamsData = { teams: [{ id: 't1', name: 'Acme', key: 'ACM' }], issues: [] };
const teamsField = (source) => registry.schema('linear-mine', () => [], source)[0];
check('checklist: no data yet means loading', [teamsField().options, teamsField().failed], [null, false]);
check('checklist: no data after a failure says so', teamsField({ data: null, failed: true }).failed, true);
check('checklist: options come from the data', teamsField({ data: teamsData, failed: false }).options,
  [{ id: 't1', label: 'Acme', detail: '' }]);
check('checklist: excluded ids keep only their shape', registry.clean('linear-mine', { teams: ['t9', 4, 'x'.repeat(300)] }).teams, ['t9']);
check('refetch: a team or backlog change only redraws',
  registry.refetches('linear-mine', { teams: [], backlog: false }, { teams: ['t1'], backlog: true }), false);
check('refetch: connections still refetch', registry.refetches('agenda', { calendars: [] }, { calendars: ['k1'] }), true);

// --- the framework running the Agenda --------------------------------------

const today = new Date();
const stamp = (h) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};
const FEED = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Work',
  'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Planning', `DTSTART:${stamp(23)}`, `DTEND:${stamp(23)}`, 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function harness({ connections = [], feed = FEED, fails = false, excluded = [] } = {}) {
  const sent = [];
  const reports = {};
  const note = { id: 'w1', widget: { type: 'agenda', settings: { calendars: excluded } } };
  const runtime = createRuntime({
    getNote: () => note,
    send: (_id, payload) => sent.push(payload),
    store: {
      list: () => connections.map(({ id, label }) => ({ id, label })),
      values: () => connections.map(({ id, label }) => ({ id, label, values: { url: `https://example.test/${id}` } })),
      report: (id, error) => { reports[id] = error; },
      exists: (id) => connections.some((c) => c.id === id),
    },
    fetchText: async () => {
      if (fails) throw new Error('link not found (404)');
      return feed;
    },
    onSummary: () => {},
  });
  return { runtime, sent, reports, last: () => sent[sent.length - 1] };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

(async () => {
  let h = harness();
  h.runtime.start('w1');
  await settle();
  check('nothing connected: the framework says so', h.last().markdown.includes('No calendars connected yet.'), true);
  check('nothing connected: it offers to connect', h.last().markdown.includes('[Connect a calendar…](sticky://act/'), true);
  check('nothing connected: blocked, not loading — the footer must not say "Loading…"',
    [h.last().blocked, h.last().loading], [true, false]);
  h.runtime.dispose();

  h = harness({ connections: [{ id: 'k1', label: 'Work' }], excluded: ['k1'] });
  h.runtime.start('w1');
  await settle();
  check('all unticked: the framework says so', h.last().markdown.includes('No calendars selected for this widget.'), true);
  h.runtime.dispose();

  h = harness({ connections: [{ id: 'k1', label: 'Work' }] });
  h.runtime.start('w1');
  await settle();
  check('connected: events render', h.last().markdown.includes('Planning'), true);
  check('connected: the source is named', h.last().sources, ['Work']);
  check('a working connection reports healthy', h.reports, { k1: null });
  h.runtime.dispose();

  // A Linear widget added before any key: its team list says what to do,
  // rather than "Loading…" for ever — there is nothing to load from.
  const lone = { id: 'w2', widget: { type: 'linear-mine', settings: {} } };
  const blocked = createRuntime({
    getNote: () => lone,
    send: () => {},
    store: { list: () => [], values: () => [], report: () => {}, exists: () => false },
    fetchText: async () => { throw new Error('should not fetch'); },
    onSummary: () => {},
  });
  blocked.start('w2');
  await settle();
  const source = blocked.source('w2');
  check('no key yet: the form knows it is blocked, not loading', source, { data: null, failed: false, blocked: true });
  check('no key yet: the team list names what to connect', registry.schema('linear-mine', () => [], source)[0].needs, 'Linear');
  blocked.dispose();

  h = harness({ connections: [{ id: 'k1', label: 'Work' }], fails: true });
  h.runtime.start('w1');
  await settle();
  check('failing: the reason is shown', h.last().markdown.includes('Work: link not found (404)'), true);
  check('failing: the connection is marked unhealthy', h.reports, { k1: 'link not found (404)' });
  check('failing: the footer knows', h.last().failed, true);
  h.runtime.dispose();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

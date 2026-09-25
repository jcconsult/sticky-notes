/* The Linear extension: its views over made-up responses, its error wording,
 * and its fetch through a fake Linear — no network, no key.
 *
 *   npm test
 */
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'main');
const views = require(path.join(src, 'extensions', 'linear', 'views.js'));
const linear = require(path.join(src, 'extensions', 'linear'));
const format = require(path.join(src, 'widgets', 'format.js'));

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

// Wed 23 Sep 2026, 11:40 local.
const NOW = new Date(2026, 8, 23, 11, 40).getTime();
const HOUR = 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

const TEAMS = [{ id: 'acme', name: 'Acme', key: 'ACM' }, { id: 'glx', name: 'Globex', key: 'GLX' }];
const state = (name, type, position) => ({ name, type, position });
const issue = (over) => ({
  identifier: 'ACM-1', title: 'Something', url: 'https://linear.app/x/issue/ACM-1', priority: 3,
  dueDate: null, completedAt: null, state: state('Todo', 'unstarted', 1), team: TEAMS[0],
  attachments: { nodes: [] }, ...over,
});

const MINE = {
  teams: TEAMS,
  issues: [
    issue({ identifier: 'ACM-142', title: 'Invoice export times out', priority: 1, dueDate: '2026-09-23', state: state('In Progress', 'started', 2) }),
    issue({ identifier: 'ACM-139', title: 'Retry webhooks', priority: 2, state: state('In Review', 'started', 3),
      attachments: { nodes: [{ url: 'https://github.com/acme/app/pull/212' }, { url: 'https://acme.slack.com/x' }] } }),
    issue({ identifier: 'GLX-9', title: 'Move DNS', team: TEAMS[1], dueDate: '2026-09-25', state: state('Todo', 'unstarted', 1) }),
    issue({ identifier: 'GLX-4', title: 'Old idea', team: TEAMS[1], state: state('Backlog', 'backlog', 0) }),
    issue({ identifier: 'ACM-120', title: 'Shipped it', state: state('Done', 'completed', 5), completedAt: iso(NOW - 2 * HOUR) }),
  ],
};
const mineSettings = (over) => ({ teams: [], groupBy: 'status', backlog: false, doneToday: false, ...over });

// --- My issues ---------------------------------------------------------------

let v = views.mine(MINE, mineSettings(), NOW, 'en-GB');
check('mine: grouped by the teams’ own status names, doing first',
  v.sections.map((s) => s.heading), ['In Progress', 'In Review', 'Todo']);
check('mine: urgent and due today is marked now', v.sections[0].items[0].state, 'now');
check('mine: meta names the team, priority and due date',
  v.sections[0].items[0].meta.filter(Boolean), ['Acme', 'Urgent', 'due today']);
check('mine: a linked pull request becomes an action',
  v.sections[1].items[0].actions, [{ label: 'PR #212', target: { url: 'https://github.com/acme/app/pull/212' } }]);
check('mine: a due date this week reads as its day', v.sections[2].items[0].meta.filter(Boolean), ['Globex', 'Medium', 'due Fri']);
check('mine: backlog and finished stay out by default', v.sections.flatMap((s) => s.items).length, 3);
check('mine: summary and glance count what is open',
  [v.summary, v.glance], ['3 open issues · 1 urgent · 1 due', { value: '3', caption: '1 urgent · 1 due' }]);

v = views.mine(MINE, mineSettings({ backlog: true, doneToday: true }), NOW, 'en-GB');
check('mine: backlog and done today when asked',
  v.sections.map((s) => s.heading), ['In Progress', 'In Review', 'Todo', 'Backlog', 'Done today']);
check('mine: done today is struck', v.sections[4].items[0].state, 'done');

v = views.mine(MINE, mineSettings({ groupBy: 'team' }), NOW, 'en-GB');
check('mine: by team, without repeating the team', [v.sections.map((s) => s.heading), v.sections[0].items[0].meta.filter(Boolean)],
  [['Acme', 'Globex'], ['Urgent', 'due today']]);

v = views.mine(MINE, mineSettings({ groupBy: 'priority' }), NOW, 'en-GB');
check('mine: by priority, urgent first', v.sections.map((s) => s.heading), ['Urgent', 'High', 'Medium']);

v = views.mine(MINE, mineSettings({ teams: ['glx'] }), NOW, 'en-GB');
check('mine: an unticked team is left out, and one team needs no team name',
  [v.sections.flatMap((s) => s.items.map((i) => i.lead)), v.sections[0].items[0].meta.filter(Boolean)],
  [['ACM-142', 'ACM-139'], ['Urgent', 'due today']]);

v = views.mine(MINE, mineSettings({ teams: ['acme', 'glx'] }), NOW);
check('mine: every team unticked asks to choose', [v.message.text, v.message.action.target], ['No teams selected for this widget.', { command: 'settings' }]);

v = views.mine({ teams: TEAMS, issues: [] }, mineSettings(), NOW);
check('mine: nothing assigned says so', [v.message.text, v.glance.value], ['Nothing assigned to you.', '0']);

const parked = { teams: TEAMS, issues: [MINE.issues[3], issue({ identifier: 'ACM-7', state: state('Backlog', 'backlog', 0) })] };
v = views.mine(parked, mineSettings(), NOW);
check('mine: only backlog, hidden — says what is there and offers it',
  [v.message.text, v.message.detail, v.message.action.label, v.glance], ['Nothing in progress or to do.', '2 in your backlog.', 'Show backlog…', { value: '0', caption: '2 in backlog' }]);
v = views.mine(parked, mineSettings({ backlog: true }), NOW);
check('mine: …and shows it when asked, without fetching again', v.sections.map((s) => s.heading), ['Backlog']);

check('due: overdue', views.dueText('2026-09-20', NOW), 'overdue 3 days');
check('due: tomorrow', views.dueText('2026-09-24', NOW), 'due tomorrow');
check('due: far off gets a date', views.dueText('2026-10-10', NOW, 'en-GB'), 'due 10 Oct');
check('due: a date is local, not UTC midnight', new Date(views.localDate('2026-09-23')).getDate(), 23);

// Through the real formatter: rows become the Markdown the window draws.
const md = format.render(views.mine(MINE, mineSettings(), NOW, 'en-GB')).markdown;
check('mine: renders with leads and a PR link', [md.includes('`ACM-142`'), /\[PR #212\]\(sticky:\/\/act\/a\d+\)/.test(md)], [true, true]);

// --- Triage ------------------------------------------------------------------

const TRIAGE = {
  me: 'u-me',
  teams: [{ id: 'acme', name: 'Acme', triageEnabled: true }, { id: 'glx', name: 'Globex', triageEnabled: true }],
  issues: [
    { title: 'Wrong currency', url: 'u2', priority: 0, createdAt: iso(NOW - 26 * HOUR), team: TEAMS[1], creator: { id: 'u-sam', name: 'Sam' } },
    { title: 'SSO fails on Safari', url: 'u1', priority: 2, createdAt: iso(NOW - 75 * HOUR), team: TEAMS[0], creator: { id: 'u-me', name: 'Jo' } },
    { title: 'Crash on HEIC', url: 'u3', priority: 1, createdAt: iso(NOW - 5 * HOUR), team: TEAMS[0], creator: { id: 'u-kim', name: 'Kim' } },
    { title: 'CSV import', url: 'u4', priority: 0, createdAt: iso(NOW - 20 * 60 * 1000), team: TEAMS[1], creator: null },
  ],
};
const triageSettings = (over) => ({ teams: [], sort: 'oldest', stale: 2, ...over });

v = views.triage(TRIAGE, triageSettings(), NOW);
check('triage: oldest first, aged', v.sections[0].items.map((i) => i.lead), ['3 d', '1 d', '5 h', '20 m']);
check('triage: the heading counts and says the order', v.sections[0].heading, '4 waiting · oldest first');
check('triage: waiting over the limit is marked', v.sections[0].items.map((i) => i.state || ''), ['now', '', '', '']);
check('triage: meta says team, a high priority, and who raised it — unless it was you',
  v.sections[0].items.map((i) => i.meta.filter(Boolean)), [['Acme', 'High'], ['Globex', 'from Sam'], ['Acme', 'Urgent', 'from Kim'], ['Globex']]);
check('triage: glance has a badge for the stale ones', v.glance, { value: '4', caption: 'oldest waiting 3 days', badge: 1 });
check('triage: summary', v.summary, '4 waiting in triage · 1 over 2 days');

v = views.triage(TRIAGE, triageSettings({ sort: 'priority' }), NOW);
check('triage: by priority, none last', v.sections[0].items.map((i) => i.text), ['Crash on HEIC', 'SSO fails on Safari', 'Wrong currency', 'CSV import']);

v = views.triage(TRIAGE, triageSettings({ teams: ['glx'], stale: 1 }), NOW);
check('triage: one team, no team names, a tighter limit',
  [v.sections[0].items.map((i) => [i.lead, i.state || '', i.meta.filter(Boolean)]), v.summary],
  [[['3 d', 'now', ['High']], ['5 h', '', ['Urgent', 'from Kim']]], '2 waiting in triage · 1 over 1 day']);

v = views.triage({ teams: [], issues: [] }, triageSettings(), NOW);
check('triage: no team uses it', v.message.text, 'None of your teams use Triage.');
v = views.triage({ teams: TRIAGE.teams, issues: [] }, triageSettings(), NOW);
check('triage: empty is good news', [v.message.text, v.glance], ['Triage is empty.', { value: '0', caption: 'all triaged' }]);

// --- fetch, through a fake Linear -------------------------------------------

const mineDef = linear.widgets.find((w) => w.type === 'linear-mine');
const triageDef = linear.widgets.find((w) => w.type === 'linear-triage');
const conn = linear.connections[0];

function fakeHost(respond) {
  const calls = [];
  const reports = {};
  return {
    calls,
    reports,
    fetch: async (url, opts) => {
      calls.push({ url, auth: opts.headers.Authorization, body: JSON.parse(opts.body) });
      return respond(calls[calls.length - 1]);
    },
    connections: () => [{ id: 'c1', label: 'Acme Inc', values: { apiKey: 'lin_api_test' } }],
    report: (id, error) => { reports[id] = error; },
  };
}

(async () => {
  let host = fakeHost(() => JSON.stringify({ data: { viewer: { teams: { nodes: TEAMS }, assignedIssues: { nodes: MINE.issues } } } }));
  const data = await mineDef.fetch({ backlog: false }, host);
  check('fetch: one POST to Linear with the key', [host.calls.length, host.calls[0].url, host.calls[0].auth],
    [1, 'https://api.linear.app/graphql', 'lin_api_test']);
  check('fetch: open work by status type, backlog always included', host.calls[0].body.variables.filter.or[0].state.type.in, ['started', 'unstarted', 'backlog']);
  check('fetch: data and a working key', [data.teams.length, data.issues.length, host.reports], [2, 5, { c1: null }]);

  host = fakeHost((call) => (call.body.variables.teams
    ? JSON.stringify({ data: { issues: { nodes: TRIAGE.issues } } })
    : JSON.stringify({ data: { viewer: { id: 'u-me', teams: { nodes: [...TRIAGE.teams, { id: 'int', name: 'Internal', triageEnabled: false }] } } } })));
  const t = await triageDef.fetch({}, host);
  check('triage fetch: only teams that use Triage, then their issues, and who you are',
    [host.calls.length, host.calls[1].body.variables.teams, t.teams.map((x) => x.id), t.me], [2, ['acme', 'glx'], ['acme', 'glx'], 'u-me']);

  // Linear answers a bad key with HTTP 400 and an errors list in the body.
  host = fakeHost(() => {
    const err = new Error('server error (400)');
    err.status = 400;
    err.body = JSON.stringify({ errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }] });
    throw err;
  });
  let message = null;
  try { await mineDef.fetch({}, host); } catch (err) { message = err.message; }
  check('errors: a revoked key says so, and how to replace it', /didn’t accept the API key.*remove it and add a new one/.test(message), true);
  check('errors: …and marks the connection broken', host.reports.c1, 'key not accepted — remove it and add a new one');

  // A wrong field comes back with HTTP 200 and Linear's own words.
  host = fakeHost(() => JSON.stringify({ errors: [{ message: 'Cannot query field "nope" on type "Issue".' }] }));
  message = null;
  try { await mineDef.fetch({}, host); } catch (err) { message = err.message; }
  check('errors: a query error shows Linear’s words, and the key stays healthy',
    [message, host.reports.c1], ['Linear said: Cannot query field "nope" on type "Issue".', undefined]);

  host = fakeHost(() => { throw new Error('timed out'); });
  message = null;
  try { await mineDef.fetch({}, host); } catch (err) { message = err.message; }
  check('errors: no network', message, 'couldn’t reach Linear: timed out');

  // Adding the key: named after the workspace, a "Bearer " prefix forgiven.
  host = fakeHost(() => JSON.stringify({ data: { viewer: { name: 'Jo' }, organization: { name: 'Acme Inc' } } }));
  const values = conn.normalise({ apiKey: '  Bearer lin_api_abc ' });
  check('connection: normalised key', values, { apiKey: 'lin_api_abc' });
  check('connection: named after the workspace', await conn.check(values, host), { label: 'Acme Inc', detail: 'Jo' });
  message = null;
  try { await conn.check({ apiKey: '' }, host); } catch (err) { message = err.message; }
  check('connection: an empty key is refused', message, 'Paste an API key.');
  host = fakeHost(() => JSON.stringify({ errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }] }));
  message = null;
  try { await conn.check({ apiKey: 'lin_api_wrong' }, host); } catch (err) { message = err.message; }
  check('connection: a wrong key is refused, plainly', message, 'Linear didn’t accept that key. Check it was copied whole, and that it has Read access.');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

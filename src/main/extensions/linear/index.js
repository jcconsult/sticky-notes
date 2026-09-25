/* Linear extension: a workspace connection (a personal API key) and two
 * widgets — My issues and Triage.
 *
 * The framework reads only this manifest. Everything Linear-specific — the
 * queries, what an error means, how issues become rows — lives in this folder,
 * and reaches the network only through `host`.
 */
const { request } = require('./api');
const views = require('./views');

// The key is the only secret; the workspace and person are its label.
const linear = {
  type: 'linear',
  name: 'Linear',
  noun: 'Linear workspace',
  multiple: false,
  fields: [
    { key: 'apiKey', label: 'API key', type: 'text', secret: true, placeholder: 'Paste a personal API key (lin_api_…)' },
  ],
  icon: 'key',
  help: [
    { label: 'Linear', text: 'Settings → Account → Security & access → Personal API keys → New key. Read access is all it needs.' },
  ],

  // A key copied with its "Bearer " prefix still works.
  normalise(values) {
    return { apiKey: String(values.apiKey || '').trim().replace(/^Bearer\s+/i, '') };
  },

  async check(values, host) {
    if (!values.apiKey) throw new Error('Paste an API key.');
    let data;
    try {
      data = await request(host, values.apiKey, 'query { viewer { name } organization { name } }');
    } catch (err) {
      if (err.auth) throw new Error('Linear didn’t accept that key. Check it was copied whole, and that it has Read access.');
      throw err;
    }
    return { label: data.organization.name, detail: data.viewer.name };
  },
};

// The one connected workspace, and whether its key worked — so Settings →
// Connections shows a revoked key as broken. Its card offers no Add while a
// key is stored, so the way out is to remove it first.
async function withWorkspace(host, run) {
  const [workspace] = host.connections('linear');
  try {
    const result = await run(workspace.values.apiKey);
    host.report(workspace.id, null);
    return result;
  } catch (err) {
    if (!err.auth) throw err;
    host.report(workspace.id, 'key not accepted — remove it and add a new one');
    throw new Error(`${err.message} — it may have been revoked. In Settings → Connections, remove it and add a new one`);
  }
}

const TEAMS = 'teams(first: 100) { nodes { id name key } }';

const MINE = `
  query MyIssues($filter: IssueFilter) {
    viewer {
      ${TEAMS}
      assignedIssues(first: 150, filter: $filter, orderBy: updatedAt) {
        nodes {
          identifier title url priority dueDate completedAt
          state { name type position }
          team { id name }
          attachments(first: 5) { nodes { url } }
        }
      }
    }
  }`;

const mine = {
  type: 'linear-mine',
  name: 'My issues',
  color: 'purple',
  icon: 'issues',
  uses: ['linear'],
  refreshMinutes: 5,
  settings: [
    { key: 'teams', label: 'Teams', type: 'checklist', noun: 'team', options: (data) => data.teams.map((t) => ({ id: t.id, label: t.name })) },
    {
      key: 'groupBy', label: 'Group by', type: 'choice', default: 'status',
      options: [['status', 'Status'], ['team', 'Team'], ['priority', 'Priority']],
    },
    { key: 'backlog', label: 'Include backlog', type: 'toggle', default: false },
    { key: 'doneToday', label: 'Show what I finished today', type: 'toggle', default: false },
  ],

  // Open work by status type — the same filter in every team — backlog
  // included, plus anything finished since yesterday. Every setting then only
  // filters what is shown: changing one is instant, and an empty view can
  // still say what is in the backlog.
  async fetch(_settings, host) {
    const filter = {
      or: [
        { state: { type: { in: ['started', 'unstarted', 'backlog'] } } },
        { completedAt: { gte: '-P1D' } },
      ],
    };
    return withWorkspace(host, async (key) => {
      const data = await request(host, key, MINE, { filter });
      return {
        teams: data.viewer.teams.nodes,
        issues: data.viewer.assignedIssues.nodes,
        sources: ['Linear'],
      };
    });
  },

  view(data, settings, now) {
    return views.mine(data, settings, now);
  },
};

const TRIAGE_TEAMS = 'query { viewer { id teams(first: 100) { nodes { id name key triageEnabled } } } }';
const TRIAGE_ISSUES = `
  query Triage($teams: [ID!]) {
    issues(first: 100, orderBy: createdAt, filter: { state: { type: { eq: "triage" } }, team: { id: { in: $teams } } }) {
      nodes {
        title url priority createdAt
        team { id name }
        creator { id name }
      }
    }
  }`;

const triage = {
  type: 'linear-triage',
  name: 'Triage',
  color: 'rose',
  icon: 'inbox',
  uses: ['linear'],
  refreshMinutes: 5,
  settings: [
    { key: 'teams', label: 'Teams', type: 'checklist', noun: 'team', options: (data) => data.teams.map((t) => ({ id: t.id, label: t.name })) },
    {
      key: 'sort', label: 'Order', type: 'choice', default: 'oldest',
      options: [['oldest', 'Oldest first'], ['priority', 'Priority'], ['newest', 'Newest']],
    },
    {
      key: 'stale', label: 'Highlight items waiting over', type: 'choice', default: 2,
      options: [[1, '1 day'], [2, '2 days'], [7, '1 week']],
    },
  ],

  // Two requests: which of your teams use Triage, then what waits in them.
  // Every such team is fetched, so ticking teams only redraws.
  async fetch(_settings, host) {
    return withWorkspace(host, async (key) => {
      const { viewer } = await request(host, key, TRIAGE_TEAMS);
      const teams = viewer.teams.nodes.filter((t) => t.triageEnabled);
      const issues = teams.length
        ? (await request(host, key, TRIAGE_ISSUES, { teams: teams.map((t) => t.id) })).issues.nodes
        : [];
      return { me: viewer.id, teams, issues, sources: ['Linear'] };
    });
  },

  view(data, settings, now) {
    return views.triage(data, settings, now);
  },
};

module.exports = {
  id: 'linear',
  name: 'Linear',
  connections: [linear],
  widgets: [mine, triage],
};

/* My issues and Triage: Linear's data → rows. Pure — no network, no clock of
 * their own — so the minute tick keeps "due today" and "3 d" right, and the
 * tests can stand at any moment.
 *
 * Linear gives every status one of a few fixed types (triage, backlog,
 * unstarted, started, completed, canceled); teams name and order their own.
 * So what is fetched is chosen by type, which works across teams, and what
 * is shown is grouped by the team's own names — "In progress" and "In review"
 * are both "started", and stay apart.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Where each status type sits: what you are doing first.
const TYPE_RANK = { started: 0, unstarted: 1, backlog: 2 };

// Linear's priorities: 1 Urgent … 4 Low, 0 none — which sorts last.
const PRIORITY_NAMES = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low', 0: 'No priority' };
const priorityRank = (p) => (p >= 1 && p <= 4 ? p : 5);

function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// A due date is a calendar date ("2026-09-25"), not an instant: read as
// local midnight, not UTC, or it lands on the wrong day west of Greenwich.
function localDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

function daysUntil(due, now) {
  return Math.round((due - startOfDay(now)) / DAY_MS);
}

function dueText(dueDate, now, locale) {
  const due = localDate(dueDate);
  if (due === null) return null;
  const days = daysUntil(due, now);
  if (days < 0) return days === -1 ? 'overdue since yesterday' : `overdue ${-days} days`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 7) return `due ${new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(due)}`;
  return `due ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(due)}`;
}

// How long something has waited, as a short lead: 20 m, 5 h, 3 d.
function age(since, now) {
  const minutes = Math.max(0, Math.floor((now - since) / 60000));
  if (minutes < 60) return `${minutes} m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}

function ageWords(since, now) {
  const minutes = Math.max(0, Math.floor((now - since) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  const days = Math.floor(minutes / (24 * 60));
  return days === 1 ? '1 day' : `${days} days`;
}

// Pull requests linked to an issue, as "PR #212" actions.
function pullRequests(issue) {
  const seen = new Set();
  const out = [];
  for (const a of (issue.attachments && issue.attachments.nodes) || []) {
    const m = /\/(?:pull|merge_requests)\/(\d+)/.exec(a.url || '');
    if (m && !seen.has(a.url)) {
      seen.add(a.url);
      out.push({ label: `PR #${m[1]}`, target: { url: a.url } });
    }
  }
  return out;
}

const byPriorityThenDue = (a, b) => priorityRank(a.priority) - priorityRank(b.priority)
  || (localDate(a.dueDate) ?? Infinity) - (localDate(b.dueDate) ?? Infinity)
  || String(a.identifier).localeCompare(String(b.identifier), undefined, { numeric: true });

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Every team unticked: the same answer the framework gives for connections.
function noneSelected(noun) {
  return {
    message: {
      text: `No ${noun}s selected for this widget.`,
      action: { label: `Choose ${noun}s…`, target: { command: 'settings' } },
    },
    summary: `No ${noun}s selected`,
  };
}

// ------------------------------------------------------------- My issues

/**
 * @param {{ teams: object[], issues: object[] }} data
 * @param {{ teams: string[], groupBy: string, backlog: boolean, doneToday: boolean }} settings
 * @param {number} now
 * @param {string} [locale]
 */
function mine(data, settings, now, locale) {
  const skip = new Set(settings.teams);
  if (data.teams.length && data.teams.every((t) => skip.has(t.id))) return noneSelected('team');

  const today = startOfDay(now);
  const shown = data.issues.filter((i) => !(i.team && skip.has(i.team.id)));
  const open = shown.filter((i) => i.state && (i.state.type === 'started' || i.state.type === 'unstarted'
    || (settings.backlog && i.state.type === 'backlog')));
  const done = settings.doneToday
    ? shown.filter((i) => i.state && i.state.type === 'completed' && i.completedAt && Date.parse(i.completedAt) >= today)
    : [];

  const overdueOrToday = (i) => {
    const due = localDate(i.dueDate);
    return due !== null && daysUntil(due, now) <= 0;
  };
  const manyTeams = new Set(open.map((i) => i.team && i.team.id)).size > 1;

  const row = (i) => ({
    lead: i.identifier,
    text: i.title,
    open: { url: i.url },
    state: i.priority === 1 || overdueOrToday(i) ? 'now' : undefined,
    meta: [
      settings.groupBy !== 'team' && manyTeams && i.team ? i.team.name : null,
      settings.groupBy !== 'priority' && i.priority >= 1 && i.priority <= 4 ? PRIORITY_NAMES[i.priority] : null,
      dueText(i.dueDate, now, locale),
    ],
    actions: pullRequests(i),
  });

  // Groups, in the order that reads as a to-do list.
  const groups = new Map();
  for (const i of open) {
    let key;
    let heading;
    let order;
    if (settings.groupBy === 'team') {
      heading = i.team ? i.team.name : 'No team';
      key = heading;
      order = [heading];
    } else if (settings.groupBy === 'priority') {
      heading = PRIORITY_NAMES[i.priority] || PRIORITY_NAMES[0];
      key = heading;
      order = [priorityRank(i.priority)];
    } else {
      heading = i.state.name;
      key = `${i.state.type}|${heading.toLowerCase()}`;
      order = [TYPE_RANK[i.state.type] ?? 9, i.state.position ?? 0];
    }
    if (!groups.has(key)) groups.set(key, { heading, order, items: [] });
    const g = groups.get(key);
    // A status name shared by several teams sits where its earliest team puts it.
    if (settings.groupBy === 'status' && order[1] < g.order[1]) g.order = order;
    g.items.push(i);
  }
  const compare = (a, b) => {
    for (let n = 0; n < a.order.length; n += 1) {
      if (a.order[n] < b.order[n]) return -1;
      if (a.order[n] > b.order[n]) return 1;
    }
    return 0;
  };
  const sections = [...groups.values()].sort(compare).map((g) => ({
    heading: g.heading,
    items: g.items.sort(byPriorityThenDue).map(row),
  }));

  if (done.length) {
    sections.push({
      heading: 'Done today',
      items: done.map((i) => ({ lead: i.identifier, text: i.title, open: { url: i.url }, state: 'done', meta: manyTeams && i.team ? i.team.name : null })),
    });
  }

  const urgent = open.filter((i) => i.priority === 1).length;
  const due = open.filter(overdueOrToday).length;
  const summary = open.length
    ? [plural(open.length, 'open issue'), urgent ? `${urgent} urgent` : null, due ? `${due} due` : null].filter(Boolean).join(' · ')
    : 'Nothing assigned';
  const glance = {
    value: String(open.length),
    caption: [urgent ? `${urgent} urgent` : null, due ? `${due} due` : null].filter(Boolean).join(' · ') || 'nothing urgent',
  };

  if (!sections.length) {
    // Empty, but not idle: a backlog this widget hides is worth a mention.
    const parked = settings.backlog ? 0 : shown.filter((i) => i.state && i.state.type === 'backlog').length;
    if (parked) {
      return {
        message: {
          text: 'Nothing in progress or to do.',
          detail: `${parked} in your backlog.`,
          action: { label: 'Show backlog…', target: { command: 'settings' } },
        },
        summary: `Nothing in progress · ${parked} in backlog`,
        glance: { value: '0', caption: `${parked} in backlog` },
      };
    }
    return {
      message: { text: 'Nothing assigned to you.', detail: 'In the teams this widget shows. Enjoy it.' },
      summary,
      glance,
    };
  }
  return { sections, summary, glance };
}

// ----------------------------------------------------------------- Triage

const ORDER_WORDS = { oldest: 'oldest first', newest: 'newest first', priority: 'by priority' };

/**
 * @param {{ me: string, teams: object[], issues: object[] }} data   teams: those using Triage; me: your user id
 * @param {{ teams: string[], sort: string, stale: number }} settings
 * @param {number} now
 */
function triage(data, settings, now) {
  if (!data.teams.length) {
    return {
      message: {
        text: 'None of your teams use Triage.',
        detail: 'A team turns it on in Linear, under the team’s settings → Triage.',
      },
      summary: 'No teams use Triage',
    };
  }
  const skip = new Set(settings.teams);
  const teams = data.teams.filter((t) => !skip.has(t.id));
  if (!teams.length) return noneSelected('team');

  const created = (i) => Date.parse(i.createdAt);
  const waiting = data.issues.filter((i) => i.team && !skip.has(i.team.id));
  const sorted = [...waiting].sort((a, b) => {
    if (settings.sort === 'newest') return created(b) - created(a);
    if (settings.sort === 'priority') return priorityRank(a.priority) - priorityRank(b.priority) || created(a) - created(b);
    return created(a) - created(b);
  });

  const staleMs = settings.stale * DAY_MS;
  const isStale = (i) => now - created(i) >= staleMs;
  const stale = waiting.filter(isStale).length;
  const staleWords = settings.stale === 7 ? 'a week' : plural(settings.stale, 'day');

  const oldest = waiting.length ? Math.min(...waiting.map(created)) : null;
  const summary = waiting.length
    ? [`${waiting.length} waiting in triage`, stale ? `${stale} over ${staleWords}` : null].filter(Boolean).join(' · ')
    : 'Triage is empty';
  const glance = waiting.length
    ? { value: String(waiting.length), caption: `oldest waiting ${ageWords(oldest, now)}`, badge: stale || undefined }
    : { value: '0', caption: 'all triaged' };

  if (!waiting.length) {
    return {
      message: { text: 'Triage is empty.', detail: 'Nothing is waiting in the teams this widget shows.' },
      summary,
      glance,
    };
  }

  return {
    sections: [{
      heading: `${waiting.length} waiting · ${ORDER_WORDS[settings.sort] || ORDER_WORDS.oldest}`,
      items: sorted.map((i) => ({
        lead: age(created(i), now),
        text: i.title,
        open: { url: i.url },
        state: isStale(i) ? 'now' : undefined,
        meta: [
          teams.length > 1 && i.team ? i.team.name : null,
          i.priority === 1 || i.priority === 2 ? PRIORITY_NAMES[i.priority] : null,
          // Who raised it — unless it was you, which tells you nothing.
          i.creator && i.creator.name && i.creator.id !== data.me ? `from ${i.creator.name}` : null,
        ],
      })),
    }],
    summary,
    glance,
  };
}

module.exports = { mine, triage, dueText, age, localDate, pullRequests };

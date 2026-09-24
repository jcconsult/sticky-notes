/* Rows → Markdown: the one place a widget's look is decided.
 *
 * Providers return data, never markup, and every widget goes through this
 * file — so a new widget cannot drift from the others, because it has no way
 * to say anything different.
 *
 * It is also where untrusted text is made inert. Event titles and the like
 * come from other people; an invite titled "[Join](https://…)" must render as
 * those characters, not as a link. Only this file makes links, and each one is
 * an opaque id — the URL or command behind it goes into the returned action
 * table, which the main process keeps and looks clicks up in. A forged
 * sticky:// link carries an id that is not in the table, so it does nothing.
 *
 * The whole vocabulary:
 *
 *   #### Section                 group heading
 *   - `lead` Title               one row; the lead is a time or an id
 *     *meta · meta*              second line, muted
 *   - `lead` **Title**           the row that needs you now
 *   - `lead` ~~Title~~           a row that is over
 *   [Title](sticky://open/id)    the row opens something
 *   [Join](sticky://act/id)      a secondary action, in the note's accent
 *   _Nothing else today_         an empty section
 */

// Characters that begin inline syntax anywhere in a line.
const INLINE = /[\\`*_[\]<>~|!]/g;

function escape(text) {
  return String(text == null ? '' : text)
    .replace(/\s+/g, ' ') // a newline would end the row, or start a new block
    .trim()
    .replace(INLINE, '\\$&')
    // Block syntax only matters at the start of the text: "# x", "- x",
    // "> x" and "1. x" would otherwise become a heading, list or quote.
    .replace(/^([#>+-])/, '\\$1')
    .replace(/^(\d+)([.)])/, '$1\\$2');
}

// A backtick would close the code span early; nothing else in one matters.
function lead(text) {
  return `\`${String(text).replace(/`/g, "'")}\``;
}

/**
 * @param {{ message?: object, sections?: object[] }} view
 * @returns {{ markdown: string, actions: Record<string, {url?: string, command?: string}> }}
 */
function render(view) {
  const actions = {};
  let next = 0;

  // `target` is { url } or { command }; the text only ever gets the id.
  function link(label, kind, target) {
    next += 1;
    const id = `a${next}`;
    actions[id] = target;
    return `[${label}](sticky://${kind}/${id})`;
  }

  function row(item) {
    let title = escape(item.text);
    if (item.open) title = link(title, 'open', item.open);
    if (item.state === 'now') title = `**${title}**`;
    if (item.state === 'done') title = `~~${title}~~`;

    const first = `- ${item.lead ? `${lead(item.lead)} ` : ''}${title}`;

    const meta = [].concat(item.meta || []).filter(Boolean).map(escape);
    const extra = (item.actions || []).map((a) => link(escape(a.label), 'act', a.target));
    const second = [...meta, ...extra].join(' · ');

    // `breaks` is on in the renderer, so the indented line becomes a <br>
    // inside the same list item rather than a paragraph of its own.
    return second ? `${first}\n  *${second}*` : first;
  }

  function section(s) {
    const head = `#### ${escape(s.heading)}`;
    if (!s.items || !s.items.length) return `${head}\n\n_${escape(s.empty || 'Nothing here')}_`;
    return `${head}\n\n${s.items.map(row).join('\n')}`;
  }

  // A view with no sections is a message: not connected, or first run.
  function message(m) {
    const parts = [`_${escape(m.text)}_`];
    if (m.detail) parts.push(`*${escape(m.detail)}*`);
    if (m.action) parts.push(link(escape(m.action.label), 'act', m.action.target));
    return parts.join('\n\n');
  }

  const blocks = [];
  if (view.message) blocks.push(message(view.message));
  for (const s of view.sections || []) blocks.push(section(s));
  return { markdown: `${blocks.join('\n\n')}\n`, actions };
}

module.exports = { render, escape };

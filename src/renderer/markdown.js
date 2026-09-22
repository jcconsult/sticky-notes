/* Markdown rendering + the checkbox/source round-trip.
 *
 * The important idea: a rendered checkbox remembers the *source line* it came
 * from. Toggling it flips three characters in the original text and nothing
 * else — we never re-serialise the document from the parse tree, so the user's
 * own formatting, spacing and indentation survive untouched.
 */
(function () {
  const TASK = /^\[([ xX])\]\s+/;

  function taskLists(md) {
    md.core.ruler.push('sticky_task_lists', (state) => {
      const tokens = state.tokens;
      for (let i = 2; i < tokens.length; i += 1) {
        const inline = tokens[i];
        if (inline.type !== 'inline') continue;

        const paragraph = tokens[i - 1];
        const item = tokens[i - 2];
        // In a tight list the paragraph token is still emitted, just hidden.
        if (!paragraph || paragraph.type !== 'paragraph_open') continue;
        if (!item || item.type !== 'list_item_open') continue;

        const match = TASK.exec(inline.content);
        if (!match) continue;

        const line = paragraph.map ? paragraph.map[0] : item.map && item.map[0];
        if (line === null || line === undefined) continue;

        inline.content = inline.content.slice(match[0].length);
        const first = inline.children.find((c) => c.type === 'text');
        if (first) first.content = first.content.replace(TASK, '');

        const checked = match[1].toLowerCase() === 'x';
        const box = new state.Token('html_inline', '', 0);
        // Safe to inject: this string is built here, never from user input.
        box.content =
          `<input type="checkbox" class="task" data-line="${line}"${checked ? ' checked' : ''}>`;
        inline.children.unshift(box);

        item.attrJoin('class', checked ? 'task done' : 'task');
      }
    });
  }

  const md = window
    .markdownit({ html: false, linkify: true, breaks: true })
    .use(taskLists);

  // Every link leaves the app; the main process decides what is safe to open.
  const defaultLink = md.renderer.rules.link_open ||
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    return defaultLink(tokens, idx, opts, env, self);
  };

  function render(markdown) {
    return md.render(normalise(markdown || ''));
  }

  // Line numbers from the parser only line up if newlines are normalised the
  // same way before rendering and before editing.
  function normalise(text) {
    return text.replace(/\r\n?/g, '\n');
  }

  function toggleLine(markdown, lineNo) {
    const lines = normalise(markdown).split('\n');
    const line = lines[lineNo];
    if (line === undefined) return markdown;
    lines[lineNo] = line.replace(/\[([ xX])\]/, (_m, c) => (c === ' ' ? '[x]' : '[ ]'));
    return lines.join('\n');
  }

  window.NoteMarkdown = { render, toggleLine, normalise };
})();

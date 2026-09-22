/* Note window controller: one note, two views of the same text. */
(function () {
  const $ = (id) => document.getElementById(id);
  const el = {
    bar: $('bar'),
    preview: $('preview'),
    source: $('source'),
    palette: $('palette'),
    swatch: $('swatch'),
    btnNew: $('btn-new'),
    btnColor: $('btn-color'),
    btnPin: $('btn-pin'),
    btnMode: $('btn-mode'),
    btnClose: $('btn-close'),
    tools: $('tools'),
  };

  let note = null;
  let palette = [];
  let themes = {};

  // ------------------------------------------------------------------ state

  const save = debounce((patch) => window.notes.update(patch), 250);

  // --------------------------------------------------------- selection tools

  const COMMANDS = {
    bold: (ta) => window.NoteFormat.toggleWrap(ta, '**'),
    italic: (ta) => window.NoteFormat.toggleWrap(ta, '*'),
    strike: (ta) => window.NoteFormat.toggleWrap(ta, '~~'),
    code: (ta) => window.NoteFormat.toggleWrap(ta, '`'),
    link: (ta) => window.NoteFormat.insertLink(ta),
    heading: (ta) => window.NoteFormat.cycleHeading(ta),
    task: (ta) => window.NoteFormat.toggleTask(ta),
  };

  function runCommand(name) {
    const command = COMMANDS[name];
    if (!command || note.mode !== 'edit') return;
    // The edit fires an input event of its own, which is what saves it; all
    // that is left is to re-anchor the toolbar to the new selection.
    command(el.source);
    showTools();
  }

  function hideTools() {
    el.tools.hidden = true;
  }

  // Anchored above the start of the selection, flipped below when it would
  // collide with the title bar, and clamped inside the window — note windows
  // get narrow enough that an unclamped toolbar would hang off the edge.
  function showTools() {
    if (note.mode !== 'edit') return hideTools();
    const { selectionStart, selectionEnd } = el.source;
    if (selectionStart === selectionEnd) return hideTools();

    el.tools.hidden = false;
    const caret = window.NoteFormat.caretRect(el.source, selectionStart);
    const tools = el.tools.getBoundingClientRect();
    const margin = 6;
    const barHeight = el.bar.getBoundingClientRect().height;

    let top = caret.top - tools.height - margin;
    if (top < barHeight + 2) top = caret.top + caret.height + margin;

    const maxLeft = window.innerWidth - tools.width - margin;
    const left = Math.min(Math.max(caret.left - tools.width / 2, margin), Math.max(margin, maxLeft));

    el.tools.style.top = `${Math.round(top)}px`;
    el.tools.style.left = `${Math.round(left)}px`;
    return undefined;
  }

  el.tools.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus
  el.tools.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-cmd]');
    if (button) runCommand(button.dataset.cmd);
  });

  function setMarkdown(text, { rerender = true } = {}) {
    note.markdown = text;
    save({ markdown: text });
    if (rerender && note.mode !== 'edit') render();
  }

  function render() {
    const top = el.preview.scrollTop;
    el.preview.innerHTML = window.NoteMarkdown.render(note.markdown);
    el.preview.scrollTop = top; // keep the reading position across re-renders
  }

  function applyColor(id) {
    const colour = palette.find((c) => c.id === id) || palette[0];
    note.color = colour.id;
    document.documentElement.style.setProperty('--bar', colour.bar);
    document.documentElement.style.setProperty('--dot', colour.dot);
    for (const button of el.palette.children) {
      button.setAttribute('aria-checked', String(button.dataset.color === colour.id));
    }
  }

  function applyTheme(name) {
    // A theme change can arrive before note:get resolves, so there may be no
    // palette to look the name up in yet; the initial load applies it anyway.
    const theme = themes[name] || themes.dark;
    if (!theme) return;
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(`--${key}`, value);
    }
  }

  function setMode(mode, { focus = true } = {}) {
    note.mode = mode;
    const editing = mode === 'edit';
    document.body.classList.toggle('mode-edit', editing);
    el.preview.hidden = editing;
    el.source.hidden = !editing;
    el.btnMode.title = editing ? 'Rendered view (Ctrl+E)' : 'Edit source (Ctrl+E)';
    el.btnMode.setAttribute('aria-label', el.btnMode.title);

    if (editing) {
      el.source.value = note.markdown;
      if (focus) {
        el.source.focus();
        el.source.setSelectionRange(el.source.value.length, el.source.value.length);
      }
    } else {
      hideTools();
      render();
    }
    save({ mode });
  }

  function setPinned(pinned) {
    note.pinned = pinned;
    el.btnPin.setAttribute('aria-pressed', String(pinned));
    el.btnPin.title = pinned ? 'Keep on top (on)' : 'Keep on top (off)';
    window.notes.setPinned(pinned);
  }

  // ------------------------------------------------------------------- wiring

  function buildPalette() {
    el.palette.replaceChildren(...palette.map((colour) => {
      const button = document.createElement('button');
      button.dataset.color = colour.id;
      button.style.background = colour.dot;
      button.title = colour.name;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', colour.name);
      button.addEventListener('click', () => {
        applyColor(colour.id);
        window.notes.update({ color: colour.id });
        togglePalette(false);
      });
      return button;
    }));
  }

  function togglePalette(show) {
    const open = show === undefined ? el.palette.hidden : show;
    el.palette.hidden = !open;
    el.btnColor.setAttribute('aria-expanded', String(open));
  }

  el.btnNew.addEventListener('click', () => window.notes.create());
  el.btnClose.addEventListener('click', () => window.notes.hide());
  el.btnPin.addEventListener('click', () => setPinned(!note.pinned));
  el.btnMode.addEventListener('click', () => setMode(note.mode === 'edit' ? 'view' : 'edit'));
  el.btnColor.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePalette();
  });

  document.addEventListener('click', (e) => {
    if (!el.palette.hidden && !el.palette.contains(e.target)) togglePalette(false);
  });

  el.bar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.notes.menu();
  });

  // Checkbox toggles rewrite the source line in place, then re-render.
  el.preview.addEventListener('click', (e) => {
    const box = e.target.closest('input.task');
    if (box) {
      const line = Number(box.dataset.line);
      setMarkdown(window.NoteMarkdown.toggleLine(note.markdown, line));
      return;
    }
    const link = e.target.closest('a[href]');
    if (link) {
      e.preventDefault();
      window.notes.openExternal(link.href);
    }
  });

  // Double-clicking the rendered view enters edit mode, and carries the word
  // you double-clicked with it. That is what makes "double-click a word to
  // bold it" work without double-click having to mean two different things.
  el.preview.addEventListener('dblclick', (e) => {
    if (e.target.closest('input.task, a[href]')) return;

    const selection = window.getSelection();
    const word = selection ? selection.toString().trim() : '';
    const block = e.target.closest('[data-line]');
    const line = block ? Number(block.dataset.line) : null;

    // The same word can appear several times in one block, so count how many
    // times it occurs before the click and match that occurrence in the source.
    let occurrence = 0;
    if (word && block && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      const prefix = document.createRange();
      prefix.setStart(block, 0);
      prefix.setEnd(range.startContainer, range.startOffset);
      occurrence = countOccurrences(prefix.toString(), word);
    }

    setMode('edit', { focus: false });
    el.source.focus();
    if (word && Number.isInteger(line)) selectInSource(word, line, occurrence);
    else el.source.setSelectionRange(el.source.value.length, el.source.value.length);
    showTools();
  });

  function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    let count = 0;
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      count += 1;
      at = haystack.indexOf(needle, at + needle.length);
    }
    return count;
  }

  function selectInSource(word, line, occurrence) {
    const value = el.source.value;
    const lines = value.split('\n');
    const lineStart = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);

    let at = lineStart - 1;
    for (let i = 0; i <= occurrence; i += 1) {
      at = value.indexOf(word, at + 1);
      if (at === -1) break;
    }

    if (at === -1) el.source.setSelectionRange(lineStart, lineStart);
    else el.source.setSelectionRange(at, at + word.length);
    revealSelection();
  }

  // setSelectionRange does not scroll, so a word below the fold would land
  // selected but invisible.
  function revealSelection() {
    const caret = window.NoteFormat.caretRect(el.source, el.source.selectionStart);
    const box = el.source.getBoundingClientRect();
    if (caret.top < box.top || caret.top + caret.height > box.bottom) {
      el.source.scrollTop += caret.top - box.top - box.height / 3;
    }
  }

  el.source.addEventListener('input', () => {
    setMarkdown(el.source.value, { rerender: false });
    hideTools();
  });

  el.source.addEventListener('select', showTools);
  el.source.addEventListener('mouseup', showTools);
  el.source.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key.startsWith('Arrow') || e.ctrlKey) showTools();
  });
  el.source.addEventListener('scroll', hideTools);
  el.source.addEventListener('blur', hideTools);

  // Pasting into the rendered view appends to the source and re-renders, so
  // "copy Markdown from somewhere, paste it into a note" just works.
  //
  // Listen on the document, not on #preview: a paste event fires at the
  // focused element, and a freshly opened note has focus on <body>, which is
  // not inside #preview. Bound to the preview, Ctrl+V would be silently
  // dropped unless the user had first clicked into the text.
  document.addEventListener('paste', (e) => {
    if (note.mode === 'edit') return; // the textarea handles its own paste
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const current = note.markdown.replace(/\s+$/, '');
    setMarkdown(current ? `${current}\n\n${text}` : text);
  });

  const EDIT_KEYS = { b: 'bold', i: 'italic', k: 'link' };

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (ctrl && e.key === 'Enter') {
      // "Done": the note is already saved, so this just commits the edit and
      // shows the result. Esc and Ctrl+E do the same without the emphasis.
      e.preventDefault();
      if (note.mode === 'edit') {
        save.flush();
        setMode('view');
      }
    } else if (ctrl && note.mode === 'edit' && EDIT_KEYS[key] && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      runCommand(EDIT_KEYS[key]);
    } else if (ctrl && key === 'e') {
      e.preventDefault();
      setMode(note.mode === 'edit' ? 'view' : 'edit');
    } else if (ctrl && key === 'n') {
      e.preventDefault();
      window.notes.create();
    } else if (e.key === 'Escape') {
      if (!el.tools.hidden) hideTools();
      else if (!el.palette.hidden) togglePalette(false);
      else if (note.mode === 'edit') setMode('view');
    }
  });

  window.addEventListener('resize', hideTools);

  window.notes.onTheme(applyTheme);

  // ------------------------------------------------------------------- start

  window.notes.get().then((state) => {
    if (!state) return;
    note = state.note;
    palette = state.palette;
    themes = state.themes;

    buildPalette();
    applyTheme(state.theme);
    applyColor(note.color);
    setPinned(note.pinned !== false);
    setMode(note.mode === 'edit' ? 'edit' : 'view', { focus: note.mode === 'edit' });
  });

  function debounce(fn, ms) {
    let timer = null;
    let merged = {};

    function send() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!Object.keys(merged).length) return;
      const payload = merged;
      merged = {};
      fn(payload);
    }

    const queue = (patch) => {
      merged = { ...merged, ...patch };
      if (timer) clearTimeout(timer);
      timer = setTimeout(send, ms);
    };
    queue.flush = send; // Ctrl+Enter should not wait out the debounce
    return queue;
  }
})();

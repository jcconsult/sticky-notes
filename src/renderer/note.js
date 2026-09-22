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
  };

  let note = null;
  let palette = [];
  let themes = {};

  // ------------------------------------------------------------------ state

  const save = debounce((patch) => window.notes.update(patch), 250);

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

  el.preview.addEventListener('dblclick', (e) => {
    if (e.target.closest('input.task, a[href]')) return;
    setMode('edit');
  });

  el.source.addEventListener('input', () => setMarkdown(el.source.value, { rerender: false }));

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

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      setMode(note.mode === 'edit' ? 'view' : 'edit');
    } else if (ctrl && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      window.notes.create();
    } else if (e.key === 'Escape') {
      if (!el.palette.hidden) togglePalette(false);
      else if (note.mode === 'edit') setMode('view');
    }
  });

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
    return (patch) => {
      merged = { ...merged, ...patch };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const payload = merged;
        merged = {};
        fn(payload);
      }, ms);
    };
  }
})();

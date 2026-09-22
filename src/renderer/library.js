/* The note index: every note, whether its window is open or closed. */
(function () {
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  const count = document.getElementById('count');

  const ICONS = {
    show: '<path d="M1.6 8S4 3.9 8 3.9 14.4 8 14.4 8 12 12.1 8 12.1 1.6 8 1.6 8Z"/><circle cx="8" cy="8" r="1.9"/>',
    hide: '<path d="M2.5 2.5l11 11"/><path d="M6.3 6.4A2 2 0 0 0 8 10a2 2 0 0 0 1.7-1"/><path d="M4.2 4.5A8.4 8.4 0 0 0 1.6 8S4 12.1 8 12.1c1 0 1.9-.3 2.7-.6M12.2 10A8.6 8.6 0 0 0 14.4 8S12 3.9 8 3.9c-.5 0-1 .1-1.4.2"/>',
    trash: '<path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8"/>',
  };

  function icon(paths) {
    return `<svg viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;
  }

  function when(ts) {
    const date = new Date(ts);
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay
      ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function button(className, label, paths) {
    const el = document.createElement('button');
    el.className = className;
    el.title = label;
    el.setAttribute('aria-label', label);
    el.innerHTML = icon(paths);
    return el;
  }

  function row(note) {
    const li = document.createElement('li');
    li.className = note.visible ? 'row' : 'row hidden-note';
    li.style.setProperty('--row-color', note.dot);

    const open = document.createElement('button');
    open.className = 'open';
    open.innerHTML = '<span class="name"></span><span class="meta"></span>';
    // textContent, never innerHTML: note text is user content and must never
    // be parsed as markup here.
    open.querySelector('.name').textContent = note.title;
    open.querySelector('.meta').textContent =
      `${when(note.createdAt)}${note.snippet ? ` · ${note.snippet}` : ''}`;
    open.title = 'Open this note';
    open.addEventListener('click', () => window.library.open(note.id));

    const tools = document.createElement('div');
    tools.className = 'tools';

    const visibility = button(
      'tool',
      note.visible ? 'Close the note window' : 'Show the note',
      note.visible ? ICONS.hide : ICONS.show,
    );
    visibility.addEventListener('click', () => window.library.toggleVisible(note.id));

    const remove = button('tool danger', 'Delete note', ICONS.trash);
    remove.addEventListener('click', () => window.library.remove(note.id));

    tools.append(visibility, remove);
    li.append(open, tools);
    return li;
  }

  function render(notes) {
    list.replaceChildren(...notes.map(row));
    const none = notes.length === 0;
    // A note change can arrive while Settings is open; it must not yank the
    // list back into view underneath it.
    const settingsOpen = document.body.classList.contains('showing-settings');
    empty.hidden = settingsOpen || !none;
    list.hidden = settingsOpen || none;
    count.textContent = none ? '' : `${notes.length} note${notes.length === 1 ? '' : 's'}`;
  }

  function applyTheme(theme) {
    if (!theme) return;
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(`--${key}`, value);
    }
  }

  // -------------------------------------------------------------- settings

  const panel = document.getElementById('settings');
  const gear = document.getElementById('btn-settings');
  const opacity = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacity-value');
  const swatches = document.getElementById('default-color');
  const newPinned = document.getElementById('new-pinned');
  const autostart = document.getElementById('autostart');

  // Stored as opacity (1 = solid) but shown as transparency, which is what
  // the slider label promises.
  const toPercent = (value) => Math.round((1 - value) * 100);
  const fromPercent = (percent) => 1 - percent / 100;

  function fillSettings(state) {
    if (!state) return;
    opacity.value = String(toPercent(state.opacity));
    opacityValue.textContent = `${toPercent(state.opacity)}%`;
    newPinned.checked = !!state.newNotesPinned;
    autostart.checked = !!state.autoStart;

    swatches.replaceChildren(...state.palette.map((colour) => {
      const button = document.createElement('button');
      button.style.background = colour.dot;
      button.title = colour.name;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', colour.name);
      button.setAttribute('aria-checked', String(colour.id === state.defaultColor));
      button.addEventListener('click', () => {
        window.library.setSettings({ defaultColor: colour.id }).then(fillSettings);
      });
      return button;
    }));
  }

  function showSettings(show) {
    const open = show === undefined ? panel.hidden : show;
    panel.hidden = !open;
    list.hidden = open || list.children.length === 0;
    empty.hidden = open || list.children.length > 0;
    document.body.classList.toggle('showing-settings', open);
    gear.setAttribute('aria-pressed', String(open));
    gear.title = open ? 'Back to notes' : 'Settings';
    document.getElementById('title').textContent = open ? 'Settings' : 'Sticky Notes';
    if (open) window.library.getSettings().then(fillSettings);
  }

  gear.addEventListener('click', () => showSettings());

  // Applied live on every slider step so the effect is visible while dragging;
  // the store debounces its own writes, so this does not thrash the disk.
  opacity.addEventListener('input', () => {
    opacityValue.textContent = `${opacity.value}%`;
    window.library.setSettings({ opacity: fromPercent(Number(opacity.value)) });
  });
  newPinned.addEventListener('change', () => {
    window.library.setSettings({ newNotesPinned: newPinned.checked }).then(fillSettings);
  });
  autostart.addEventListener('change', () => {
    window.library.setSettings({ autoStart: autostart.checked }).then(fillSettings);
  });

  // --------------------------------------------------------------- actions

  document.getElementById('btn-new').addEventListener('click', () => window.library.create());
  document.getElementById('btn-min').addEventListener('click', () => window.library.minimise());
  document.getElementById('btn-close').addEventListener('click', () => window.library.close());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      window.library.create();
    } else if (e.key === 'Escape') {
      if (document.body.classList.contains('showing-settings')) showSettings(false);
      else window.library.close();
    }
  });

  window.library.onChange(render);
  window.library.onTheme(applyTheme);
  window.library.list().then((state) => {
    applyTheme(state.theme);
    render(state.notes);
  });
})();

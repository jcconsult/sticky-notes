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
    const meta = open.querySelector('.meta');
    if (note.widget) {
      // A widget's meta line is its live summary, not a creation date.
      const live = document.createElement('span');
      live.className = 'live';
      live.textContent = 'Live';
      meta.append(live, document.createTextNode(note.snippet || 'Widget'));
    } else {
      meta.textContent = `${when(note.createdAt)}${note.snippet ? ` · ${note.snippet}` : ''}`;
    }
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
  const autoShow = document.getElementById('auto-show');

  // Stored as opacity (1 = solid) but shown as transparency, which is what
  // the slider label promises.
  const toPercent = (value) => Math.round((1 - value) * 100);
  const fromPercent = (percent) => 1 - percent / 100;

  // ------------------------------------------------------ shortcut capture

  const DEFAULT_PEEK = 'F1';
  const HOW_IT_WORKS = 'Press to hide or show every note; hold it to hide them only while held.';
  const peek = {
    row: null, keys: null, set: null, reset: null, hint: null, listening: false,
  };

  // Electron accelerators use 'Control+Alt+H'; people read 'Ctrl + Alt + H'.
  function prettyAccelerator(accelerator) {
    if (!accelerator) return 'None';
    return accelerator
      .replace(/CommandOrControl|Control/g, 'Ctrl')
      .replace(/Super|Meta/g, 'Win')
      .split('+')
      .join(' + ');
  }

  // Only letters, digits and function keys — enough to express any sane
  // chord, and it keeps us clear of keys whose Electron names differ by layout.
  // F12 is left out: Windows reserves it for debuggers.
  function keyName(event) {
    const { code } = event;
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^F([1-9]|1[013-9]|2[0-4])$/.test(code)) return code;
    return null;
  }

  function acceleratorFrom(event) {
    const key = keyName(event);
    if (!key) return null;
    const parts = [];
    if (event.ctrlKey) parts.push('Control');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');
    // A bare letter or digit would swallow that key for every app on the
    // machine; a function key on its own types nothing, so it may stand alone.
    if (!parts.length && !/^F\d+$/.test(key)) return null;
    parts.push(key);
    return parts.join('+');
  }

  function stopListening() {
    peek.listening = false;
    peek.row.classList.remove('listening');
    peek.set.textContent = 'Change';
    window.library.recording(false);
  }

  function onCapture(event) {
    if (!peek.listening) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      stopListening();
      window.library.getSettings().then(fillSettings);
      return;
    }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      peek.keys.textContent = prettyAccelerator(
        [
          event.ctrlKey && 'Control', event.altKey && 'Alt',
          event.shiftKey && 'Shift', event.metaKey && 'Super',
        ].filter(Boolean).join('+'),
      ) || '…';
      return;
    }

    const accelerator = acceleratorFrom(event);
    if (!accelerator) {
      peek.hint.textContent = 'Use an F-key, or a modifier plus a letter or number.';
      return;
    }

    stopListening();
    window.library.setSettings({ peekShortcut: accelerator }).then(fillSettings);
  }

  function setupPeek() {
    peek.row = document.querySelector('.shortcut');
    peek.keys = document.getElementById('peek-keys');
    peek.set = document.getElementById('peek-set');
    peek.reset = document.getElementById('peek-reset');
    peek.hint = document.getElementById('peek-hint');

    peek.set.addEventListener('click', () => {
      if (peek.listening) {
        stopListening();
        window.library.getSettings().then(fillSettings);
        return;
      }
      peek.listening = true;
      peek.row.classList.add('listening');
      peek.row.classList.remove('failed');
      peek.set.textContent = 'Cancel';
      peek.keys.textContent = 'Press keys…';
      peek.hint.textContent = 'Press the key or combination you want. Esc to cancel.';
      window.library.recording(true);
    });

    peek.reset.addEventListener('click', () => {
      stopListening();
      window.library.setSettings({ peekShortcut: DEFAULT_PEEK }).then(fillSettings);
    });

    // Capture phase, so the chord never reaches the window's own shortcuts.
    window.addEventListener('keydown', onCapture, true);

    // Keys stop arriving once the window loses focus, so recording ends too.
    window.addEventListener('blur', () => {
      if (!peek.listening) return;
      stopListening();
      window.library.getSettings().then(fillSettings);
    });
  }

  function fillPeek(state) {
    if (peek.listening) return;
    peek.keys.textContent = prettyAccelerator(state.peekShortcut);
    peek.row.classList.toggle('failed', state.peekOk === false);
    const alone = state.peekShortcut && !state.peekShortcut.includes('+');
    peek.hint.textContent = state.peekOk === false
      ? 'Another app already owns that key. Pick a different one.'
      : `${HOW_IT_WORKS}${alone ? ` Other apps won’t receive ${state.peekShortcut} while Sticky Notes runs.` : ''}`;
  }

  function fillSettings(state) {
    if (!state) return;
    opacity.value = String(toPercent(state.opacity));
    opacityValue.textContent = `${toPercent(state.opacity)}%`;
    newPinned.checked = !!state.newNotesPinned;
    autostart.checked = !!state.autoStart;
    autoShow.value = String(state.autoShowAfter);
    fillPeek(state);

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

  // --------------------------------------------------------- connections

  // One section per connection type any extension contributes, drawn by the
  // same fields.js that draws widget settings. Labels, details and health
  // only: secrets never reach this window.
  const connectionsEl = document.getElementById('connections');

  function fillConnections({ types, connections }) {
    connectionsEl.replaceChildren(...types.map((type) => window.Fields.connectionType(
      type,
      connections.filter((c) => c.type === type.type),
      {
        onAdd: (values) => window.library.addConnection(type.type, values).then((result) => {
          if (result.ok) fillConnections(result.state);
          return result;
        }),
        onRemove: (c) => window.library.removeConnection(c.id).then((state) => state && fillConnections(state)),
      },
    )));
  }

  function loadConnections() {
    return window.library.connections().then(fillConnections);
  }

  // A widget's "Connect a calendar…" lands here, on that type's section.
  window.library.onShowConnections((type) => {
    showSettings(true);
    loadConnections().then(() => {
      const section = connectionsEl.querySelector(`[data-type="${CSS.escape(type || '')}"]`)
        || document.getElementById('connections-head');
      section.scrollIntoView({ block: 'start' });
      const input = section.querySelector('input');
      if (input) input.focus();
    });
  });

  function showSettings(show) {
    const open = show === undefined ? panel.hidden : show;
    // Leaving mid-recording must hand the shortcut back, or it stays dead.
    if (!open && peek.listening) stopListening();
    panel.hidden = !open;
    list.hidden = open || list.children.length === 0;
    empty.hidden = open || list.children.length > 0;
    document.body.classList.toggle('showing-settings', open);
    gear.setAttribute('aria-pressed', String(open));
    gear.title = open ? 'Back to notes' : 'Settings';
    document.getElementById('title').textContent = open ? 'Settings' : 'Sticky Notes';
    if (open) {
      window.library.getSettings().then(fillSettings);
      loadConnections();
    }
  }

  setupPeek();
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
  autoShow.addEventListener('change', () => {
    window.library.setSettings({ autoShowAfter: Number(autoShow.value) }).then(fillSettings);
  });

  // --------------------------------------------------------------- actions

  document.getElementById('btn-new').addEventListener('click', () => window.library.create());
  document.getElementById('btn-new-widget').addEventListener('click', () => window.library.newWidget());
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

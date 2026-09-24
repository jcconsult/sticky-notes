/* Widget window controller: one widget — read-only content, a settings form,
 * and a footer that says how fresh the content is.
 *
 * The main process fetches, formats and sends Markdown; this only draws it.
 * There is no path from here to the widget's content: the gear edits
 * settings, links are opaque ids main looks up, and typing does nothing.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const el = {
    bar: $('bar'),
    label: $('label'),
    preview: $('preview'),
    settings: $('settings'),
    palette: $('palette'),
    foot: $('foot'),
    footText: $('foot-text'),
    footSrc: $('foot-src'),
    btnNew: $('btn-new'),
    btnColor: $('btn-color'),
    btnPin: $('btn-pin'),
    btnSettings: $('btn-settings'),
    btnClose: $('btn-close'),
  };

  let state = null;   // from widget:get
  let last = null;    // last widget:update payload
  let themes = {};
  let palette = [];

  // ---------------------------------------------------------------- content

  function render(payload) {
    last = payload;
    if (payload.loading) {
      el.preview.innerHTML = '<p class="loading">Loading…</p>';
    } else {
      const top = el.preview.scrollTop;
      el.preview.innerHTML = window.NoteMarkdown.renderWidget(payload.markdown);
      el.preview.scrollTop = top;
      sizeLeads();
    }
    renderFoot();
  }

  // A code span that opens a list item is its lead. Size one gutter to the
  // widest lead, so every title in the widget starts at the same place.
  function sizeLeads() {
    let widest = 0;
    for (const code of el.preview.querySelectorAll('li > code:first-child')) {
      if (code.previousSibling) continue; // text before it: inline code, not a lead
      code.classList.add('lead');
      code.parentElement.parentElement.classList.add('has-leads');
      widest = Math.max(widest, code.getBoundingClientRect().width);
    }
    const root = document.documentElement.style;
    root.setProperty('--lead-width', `${Math.ceil(widest)}px`);
    root.setProperty('--lead-gutter', `${Math.ceil(widest) + 8}px`);
  }

  function ago(ms) {
    const minutes = Math.floor((Date.now() - ms) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h ago`;
  }

  function clock(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderFoot() {
    const p = last || { loading: true };
    let text;
    if (p.refreshing) text = 'Refreshing…';
    else if (p.failed) text = 'Couldn’t load · click to try again';
    else if (p.error) text = p.fetchedAt ? `${p.error} · showing ${clock(p.fetchedAt)}` : p.error;
    else if (p.fetchedAt) text = `Updated ${ago(p.fetchedAt)}${p.warning ? ` · ${p.warning}` : ''}`;
    else text = 'Loading…';
    el.footText.textContent = text;
    el.footSrc.textContent = (p.sources || []).join(' · ');
    el.foot.classList.toggle('stale', !!p.error || !!p.failed);
    el.foot.classList.toggle('busy', !!p.refreshing);
  }

  // "Updated 2 min ago" has to keep counting between refreshes.
  setInterval(renderFoot, 30 * 1000);

  // --------------------------------------------------------------- settings

  function showSettings(open) {
    el.settings.hidden = !open;
    el.preview.hidden = open;
    el.btnSettings.setAttribute('aria-pressed', String(open));
    el.btnSettings.title = open ? 'Back to the widget' : 'Widget settings';
    if (open) buildSettings();
  }

  // The widget describes its settings; the form is drawn here, the same way
  // for every widget.
  function buildSettings() {
    const fields = state.schema.map((field) => {
      const row = document.createElement('div');
      row.className = `field ${field.type}`;
      const label = document.createElement('span');
      label.className = 'field-label';
      label.textContent = field.label;

      if (field.type === 'toggle') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!state.settings[field.key];
        input.setAttribute('aria-label', field.label);
        input.addEventListener('change', () => change(field.key, input.checked));
        row.append(label, input);
        return row;
      }

      const choices = document.createElement('div');
      choices.className = 'choices';
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-label', field.label);
      for (const [value, text] of field.options) {
        const button = document.createElement('button');
        button.textContent = text;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', String(state.settings[field.key] === value));
        button.addEventListener('click', () => change(field.key, value));
        choices.append(button);
      }
      row.append(label, choices);
      return row;
    });

    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = 'Changes apply straight away. Accounts and calendar links live in All Notes → Settings.';
    el.settings.replaceChildren(...fields, hint);
  }

  function change(key, value) {
    window.widget.setSettings({ [key]: value }).then((settings) => {
      state.settings = settings;
      buildSettings();
    });
  }

  // ------------------------------------------------------------ appearance

  function applyTheme(name) {
    const theme = themes[name] || themes.dark;
    if (!theme) return;
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(`--${key}`, value);
    }
  }

  function applyColor(id) {
    const colour = palette.find((c) => c.id === id) || palette[0];
    document.documentElement.style.setProperty('--bar', colour.bar);
    document.documentElement.style.setProperty('--dot', colour.dot);
    for (const button of el.palette.children) {
      button.setAttribute('aria-checked', String(button.dataset.color === colour.id));
    }
  }

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
        window.widget.setColor(colour.id);
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

  function setPinned(pinned) {
    el.btnPin.setAttribute('aria-pressed', String(pinned));
    el.btnPin.title = pinned ? 'Keep on top (on)' : 'Keep on top (off)';
  }

  // ----------------------------------------------------------------- wiring

  el.btnNew.addEventListener('click', () => window.widget.create());
  el.btnClose.addEventListener('click', () => window.widget.hide());
  el.btnSettings.addEventListener('click', () => showSettings(el.settings.hidden));
  el.btnPin.addEventListener('click', () => {
    const pinned = el.btnPin.getAttribute('aria-pressed') !== 'true';
    setPinned(pinned);
    window.widget.setPinned(pinned);
  });
  el.btnColor.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePalette();
  });
  el.foot.addEventListener('click', () => window.widget.refresh());

  document.addEventListener('click', (e) => {
    if (!el.palette.hidden && !el.palette.contains(e.target)) togglePalette(false);
  });

  // Links are ids from this render; main decides what, if anything, they do.
  el.preview.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    e.preventDefault();
    const match = /^sticky:\/\/(?:open|act)\/(a\d+)$/.exec(link.getAttribute('href'));
    if (match) window.widget.action(match[1]);
  });

  for (const target of [el.bar, el.preview]) {
    target.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.widget.menu();
    });
  }

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      window.widget.create();
    } else if (e.key === 'Escape') {
      if (!el.palette.hidden) togglePalette(false);
      else if (!el.settings.hidden) showSettings(false);
    }
  });

  window.widget.onUpdate(render);
  window.widget.onSettings(() => showSettings(true));
  window.widget.onTheme(applyTheme);

  // ------------------------------------------------------------------ start

  window.widget.get().then((initial) => {
    if (!initial) return;
    state = initial;
    themes = initial.themes;
    palette = initial.palette;
    el.label.textContent = initial.name;
    document.title = initial.name;
    buildPalette();
    applyTheme(initial.theme);
    applyColor(initial.color);
    setPinned(initial.pinned !== false);
    if (initial.update) render(initial.update);
  });
})();

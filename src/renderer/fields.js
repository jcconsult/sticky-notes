/* Forms drawn from extension schemas — the one renderer for both places a
 * schema becomes UI:
 *
 *   Fields.settings(schema, values, handlers)   a widget's ⚙ settings
 *   Fields.connectionType(type, list, handlers) one section of Settings →
 *                                               Connections
 *
 * Extensions never build UI; they declare fields and this draws them, the
 * same way everywhere. Text from extensions and connections goes in through
 * textContent only.
 */
(function () {
  function h(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function healthText(health) {
    if (!health) return '';
    return health.ok ? 'Working' : health.message || 'Not working';
  }

  // ------------------------------------------------------ widget settings

  function toggle(field, value, onChange) {
    const row = h('div', 'field toggle');
    const input = h('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.setAttribute('aria-label', field.label);
    input.addEventListener('change', () => onChange(field.key, input.checked));
    row.append(h('span', 'field-label', field.label), input);
    return row;
  }

  function choice(field, value, onChange) {
    const row = h('div', 'field choice');
    const group = h('div', 'choices');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', field.label);
    for (const [option, text] of field.options) {
      const button = h('button', null, text);
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(value === option));
      button.addEventListener('click', () => onChange(field.key, option));
      group.append(button);
    }
    row.append(h('span', 'field-label', field.label), group);
    return row;
  }

  // Ticked = shown in this widget. The value is the list of unticked ids.
  function checkboxes(field, excluded, onChange) {
    const list = h('ul', 'checklist');
    for (const option of field.options) {
      const li = h('li', option.health && !option.health.ok ? 'broken' : '');
      const label = h('label');
      const input = h('input');
      input.type = 'checkbox';
      input.checked = !excluded.includes(option.id);
      input.addEventListener('change', () => {
        const next = input.checked
          ? excluded.filter((id) => id !== option.id)
          : [...excluded, option.id];
        onChange(field.key, next);
      });
      const name = h('span', 'name', option.label);
      const meta = h('small', null, [option.detail, option.health && !option.health.ok ? healthText(option.health) : '']
        .filter(Boolean).join(' · '));
      label.append(input, name, meta);
      li.append(label);
      list.append(li);
    }
    return list;
  }

  function connections(field, excluded, onChange, onManage) {
    const row = h('div', 'field connections');
    const manage = h('button', 'link', `Manage ${field.noun}s…`);
    manage.addEventListener('click', () => onManage(field.of));
    row.append(h('span', 'field-label', field.label), checkboxes(field, excluded, onChange), manage);
    return row;
  }

  // Options from the widget's own data. Before its first fetch there are none
  // yet; after a failed one, or with nothing connected to fetch from, there
  // are none to be had — say which.
  function checklist(field, excluded, onChange) {
    const row = h('div', 'field connections');
    row.append(h('span', 'field-label', field.label));
    if (!field.options) {
      let note = `Loading your ${field.noun}s…`;
      if (field.needs) note = `Your ${field.noun}s appear here once ${field.needs} is connected, in All Notes → Settings → Connections.`;
      else if (field.failed) note = `Couldn’t load your ${field.noun}s — the widget says why.`;
      row.append(h('p', 'field-note', note));
    } else if (!field.options.length) {
      row.append(h('p', 'field-note', `No ${field.noun}s to choose from.`));
    } else {
      row.append(checkboxes(field, excluded, onChange));
    }
    return row;
  }

  /**
   * @param {object[]} schema    from registry.schema()
   * @param {object} values      the widget's cleaned settings
   * @param {{ onChange(key, value), onManage(type) }} handlers
   */
  function settings(schema, values, { onChange, onManage }) {
    return schema.map((field) => {
      if (field.type === 'toggle') return toggle(field, values[field.key], onChange);
      if (field.type === 'choice') return choice(field, values[field.key], onChange);
      if (field.type === 'connections') return connections(field, values[field.key] || [], onChange, onManage);
      if (field.type === 'checklist') return checklist(field, values[field.key] || [], onChange);
      return h('div');
    });
  }

  // ----------------------------------------------------------- connections

  // The renderer's own icons. An extension names one; it never supplies
  // markup, so nothing it declares can inject HTML here.
  const ICONS = {
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    key: '<circle cx="5.5" cy="10.5" r="3"/><path d="M7.6 8.4 13 3M11 5l1.5 1.5"/>',
    plug: '<path d="M6 2v3M10 2v3M4.5 5h7v2.5a3.5 3.5 0 0 1-7 0V5ZM8 11v3"/>',
  };
  const BIN = '<path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8"/>';
  const PLUS = '<path d="M8 3.5v9M3.5 8h9"/>';

  function icon(paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths; // constants above only
    return svg;
  }

  /**
   * One connection type's card: what is connected, and — behind + Add — a
   * form to add another, with the help folded away until asked for.
   * @param {object} type        from registry.connectionList()
   * @param {object[]} list      this type's connections (label, detail, health)
   * @param {{ onAdd(values): Promise<{ok, error}>, onRemove(c), open?: boolean }} handlers
   */
  function connectionType(type, list, { onAdd, onRemove, open = false }) {
    const card = h('section', 'card conn-card');
    card.dataset.type = type.type;

    const head = h('div', 'conn-head');
    const title = h('span', 'conn-title');
    title.append(icon(ICONS[type.icon] || ICONS.plug), document.createTextNode(type.name));
    head.append(title);
    card.append(head);

    if (list.length) {
      const rows = h('ul', 'conn-list');
      for (const c of list) {
        const broken = c.health && !c.health.ok;
        const li = h('li', `conn-row${broken ? ' broken' : ''}`);
        const dot = h('span', `health ${broken ? 'bad' : 'ok'}`);
        dot.title = broken ? 'Not working' : 'Working';
        const text = h('span', 'conn-text');
        text.append(
          h('span', 'conn-name', c.label),
          h('span', 'conn-meta', [c.detail, healthText(c.health) || 'Working'].filter(Boolean).join(' · ')),
        );
        const remove = h('button', 'icon-btn');
        remove.title = `Remove ${c.label}`;
        remove.setAttribute('aria-label', `Remove ${c.label}`);
        remove.append(icon(BIN));
        remove.addEventListener('click', () => onRemove(c));
        li.append(dot, text, remove);
        rows.append(li);
      }
      card.append(rows);
    } else {
      card.append(h('p', 'conn-empty', `No ${type.noun}s yet.`));
    }

    // A single-account type (an API key) offers Add only until it is set.
    if (!type.multiple && list.length) return card;

    const addButton = h('button', 'add-btn');
    addButton.append(icon(PLUS), document.createTextNode('Add'));
    addButton.setAttribute('aria-expanded', 'false');
    head.append(addButton);

    const form = h('div', 'conn-add');
    form.hidden = true;
    const line = h('div', 'add-line');
    const inputs = type.fields.map((field) => {
      const input = h('input', 'text-input');
      // A secret that is a link is still better seen while pasting it.
      input.type = field.secret && field.type !== 'url' ? 'password' : 'text';
      input.placeholder = field.placeholder || field.label;
      input.spellcheck = false;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', field.label);
      input.dataset.key = field.key;
      return input;
    });
    const submitButton = h('button', 'primary', 'Add');
    line.append(...inputs, submitButton);
    const status = h('p', 'add-status');
    status.hidden = true;
    form.append(line, status);

    if (type.help.length) {
      const help = h('details', 'help');
      // "Calendar link" → "calendar link", but "API key" stays "API key".
      const thing = (type.fields[0].label || 'details').replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase());
      help.append(h('summary', null, `Where do I find the ${thing}?`));
      const steps = h('dl');
      for (const step of type.help) steps.append(h('dt', null, step.label), h('dd', null, step.text));
      help.append(steps);
      form.append(help);
    }
    card.append(form);

    const say = (text, error = false) => {
      status.hidden = !text;
      status.textContent = text || '';
      status.classList.toggle('error', error);
    };

    const toggle = (show) => {
      form.hidden = !show;
      addButton.setAttribute('aria-expanded', String(show));
      if (show) inputs[0].focus();
    };
    addButton.addEventListener('click', () => toggle(form.hidden));

    const submit = () => {
      const values = Object.fromEntries(inputs.map((input) => [input.dataset.key, input.value.trim()]));
      if (Object.values(values).every((v) => !v) || submitButton.disabled) return;
      submitButton.disabled = true;
      say(`Checking the ${type.noun}…`);
      onAdd(values).then((result) => {
        submitButton.disabled = false;
        if (!result.ok) say(result.error, true); // on success the page redraws with it listed
      });
    };
    submitButton.addEventListener('click', submit);
    for (const input of inputs) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') { e.stopPropagation(); toggle(false); }
      });
      input.addEventListener('input', () => say(''));
    }

    if (open) toggle(true);
    return card;
  }

  window.Fields = { settings, connectionType };
})();

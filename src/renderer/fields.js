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
  function connections(field, excluded, onChange, onManage) {
    const row = h('div', 'field connections');
    row.append(h('span', 'field-label', field.label));
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
    const manage = h('button', 'link', `Manage ${field.noun}s…`);
    manage.addEventListener('click', () => onManage(field.of));
    row.append(list, manage);
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
      return h('div');
    });
  }

  // ----------------------------------------------------------- connections

  /**
   * One connection type's section: what is connected, and a form to add.
   * @param {object} type        from registry.connectionList()
   * @param {object[]} list      this type's connections (label, detail, health)
   * @param {{ onAdd(values): Promise<{ok, error}>, onRemove(id) }} handlers
   */
  function connectionType(type, list, { onAdd, onRemove }) {
    const section = h('div', 'setting connection-type');
    section.dataset.type = type.type;
    const head = h('div', 'setting-head');
    head.append(h('label', null, type.name));
    section.append(head);

    const rows = h('ul', 'conns');
    for (const c of list) {
      const li = h('li', `conn${c.health && !c.health.ok ? ' broken' : ''}`);
      const name = h('span', 'conn-name', c.label);
      name.append(h('small', null, [c.detail, healthText(c.health)].filter(Boolean).join(' · ')));
      const remove = h('button', 'ghost', 'Remove');
      remove.addEventListener('click', () => onRemove(c));
      li.append(name, remove);
      rows.append(li);
    }
    section.append(rows);

    // A single-account type (an API key) shows its form only until it is set.
    if (type.multiple || !list.length) {
      const form = h('div', 'conn-add');
      const inputs = type.fields.map((field) => {
        const input = h('input', 'text-input');
        input.type = field.secret ? 'password' : 'text';
        input.placeholder = field.placeholder || field.label;
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.setAttribute('aria-label', field.label);
        input.dataset.key = field.key;
        return input;
      });
      // A secret field that is a link is still better seen while pasting.
      for (const [i, field] of type.fields.entries()) {
        if (field.type === 'url') inputs[i].type = 'text';
      }
      const add = h('button', 'ghost', 'Add');
      const hint = h('p', 'hint', type.help);

      const submit = () => {
        const values = Object.fromEntries(inputs.map((input) => [input.dataset.key, input.value.trim()]));
        if (Object.values(values).every((v) => !v) || add.disabled) return;
        add.disabled = true;
        hint.classList.remove('error');
        hint.textContent = `Checking the ${type.noun}…`;
        onAdd(values).then((result) => {
          add.disabled = false;
          if (result.ok) return; // the page redraws with it listed
          hint.textContent = result.error;
          hint.classList.add('error');
        });
      };
      add.addEventListener('click', submit);
      for (const input of inputs) {
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        input.addEventListener('input', () => {
          hint.textContent = type.help;
          hint.classList.remove('error');
        });
      }
      form.append(...inputs, add);
      section.append(form, hint);
    }
    return section;
  }

  window.Fields = { settings, connectionType };
})();

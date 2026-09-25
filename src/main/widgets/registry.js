/* The registry: what every extension contributes, and the rules they share.
 *
 * Extensions declare; the framework draws and enforces. A widget type lists
 * its settings as data, and this file is what turns that list into defaults,
 * cleans every stored or submitted value against it, and describes it to the
 * renderers — which never see a function from an extension, only data.
 *
 * Field types a widget setting can use:
 *   toggle        true / false
 *   choice        one of `options: [[value, label], …]`
 *   connections   which connections of type `of` this widget shows; stored as
 *                 the ids it *excludes*, so a connection added later appears
 *                 in every widget until someone unticks it
 *   checklist     which of a list the widget's own data supplies (teams, say)
 *                 it shows: `options(data) → [{ id, label }]`, `noun` for the
 *                 wording. Stored as excluded ids, for the same reason.
 *
 * Changing which connections a widget uses fetches again; every other change
 * only redraws, so a widget should fetch everything its settings can show.
 *
 * A widget type names an `icon` from ICONS — the app's own set, drawn by the
 * renderer — so every tile looks like it belongs, whoever wrote the widget.
 */
const extensions = require('../extensions');

const ICONS = ['calendar', 'issues', 'inbox', 'bars'];

const connectionTypes = new Map();
const widgetTypes = new Map();

for (const extension of extensions) {
  for (const type of extension.connections || []) connectionTypes.set(type.type, type);
  for (const type of extension.widgets || []) widgetTypes.set(type.type, type);
}

const widget = (type) => widgetTypes.get(type) || null;
const connection = (type) => connectionTypes.get(type) || null;

// ------------------------------------------------------------ descriptions

function widgetList() {
  return [...widgetTypes.values()].map(({ type, name, color, icon }) => ({ type, name, color, icon }));
}

// A connection type as Settings → Connections draws it. `secret` fields are
// write-only: the form can set them, nothing can read them back. `help` is
// a list of { label, text } steps; `icon` names one of the renderer's own
// icons — an extension never supplies markup.
function connectionList() {
  return [...connectionTypes.values()].map(({ type, name, noun, multiple, fields, help, icon }) => ({
    type, name, noun, multiple: !!multiple, icon: icon || null,
    help: Array.isArray(help) ? help.map(({ label, text }) => ({ label, text })) : [],
    fields: fields.map(({ key, label, type: kind, secret, placeholder }) => ({
      key, label, type: kind, secret: !!secret, placeholder: placeholder || '',
    })),
  }));
}

// A checklist's options from a widget's data; null until there is data.
function checklistOptions(field, data) {
  if (!data) return null;
  const list = field.options(data);
  return Array.isArray(list) ? list.map(({ id, label, detail }) => ({ id, label, detail: detail || '' })) : [];
}

// Every checklist's options, to notice when they change. Undefined for a
// widget without checklists.
function dataOptions(type, data) {
  const def = widget(type);
  const fields = def ? def.settings.filter((f) => f.type === 'checklist') : [];
  if (!fields.length) return undefined;
  return fields.map((f) => checklistOptions(f, data));
}

// A widget's settings form. A connections field carries its options — the
// connections that exist right now, by label and health — because a static
// schema can't know them; a checklist carries what the widget last fetched,
// or null with `failed` when there is nothing to offer yet.
function schema(type, available, source = { data: null, failed: false, blocked: false }) {
  const def = widget(type);
  if (!def) return [];
  return def.settings.map((field) => {
    const out = { key: field.key, label: field.label, type: field.type };
    if (field.type === 'choice') out.options = field.options;
    if (field.type === 'connections') {
      const kind = connection(field.of);
      out.of = field.of;
      out.noun = kind ? kind.noun : field.of;
      out.options = available(field.of).map(({ id, label, detail, health }) => ({ id, label, detail, health }));
    }
    if (field.type === 'checklist') {
      out.noun = field.noun;
      out.options = checklistOptions(field, source.data);
      out.failed = !out.options && !!source.failed;
      // Nothing to fetch from yet: name what to connect, not "Loading…".
      const needs = (def.uses || []).map(connection).find(Boolean);
      out.needs = !out.options && source.blocked && needs ? needs.name : null;
    }
    return out;
  });
}

// --------------------------------------------------------------- settings

function defaultFor(field) {
  if (field.type === 'connections' || field.type === 'checklist') return [];
  return field.default;
}

function defaults(type) {
  const def = widget(type);
  return def ? Object.fromEntries(def.settings.map((f) => [f.key, defaultFor(f)])) : {};
}

// Stored or submitted settings, merged over the defaults. Anything unknown,
// of the wrong type or pointing at a connection that no longer exists is
// dropped — a widget can rely on every value it is given.
function clean(type, settings, exists = () => true) {
  const def = widget(type);
  const result = defaults(type);
  if (!def || !settings || typeof settings !== 'object') return result;
  for (const field of def.settings) {
    const value = settings[field.key];
    if (field.type === 'toggle' && typeof value === 'boolean') result[field.key] = value;
    if (field.type === 'choice' && field.options.some(([option]) => option === value)) result[field.key] = value;
    if (field.type === 'connections' && Array.isArray(value)) {
      result[field.key] = value.filter((id) => typeof id === 'string' && exists(id));
    }
    // Checklist ids come from data the settings can't see, so only their
    // shape is checked; one that no longer exists simply matches nothing.
    if (field.type === 'checklist' && Array.isArray(value)) {
      result[field.key] = value.filter((id) => typeof id === 'string' && id.length <= 200).slice(0, 500);
    }
  }
  return result;
}

// Does going from `before` to `after` change what the widget fetches?
function refetches(type, before, after) {
  const def = widget(type);
  if (!def) return false;
  return def.settings.some((f) => f.type === 'connections'
    && JSON.stringify(before[f.key]) !== JSON.stringify(after[f.key]));
}

// The connections of `type` a widget's settings leave ticked.
function excluded(type, widgetType, settings) {
  const def = widget(widgetType);
  if (!def) return [];
  return def.settings
    .filter((f) => f.type === 'connections' && f.of === type)
    .flatMap((f) => settings[f.key] || []);
}

module.exports = {
  ICONS, widget, connection, widgetList, connectionList, schema, dataOptions, defaults, clean, refetches, excluded,
  widgetTypes: () => [...widgetTypes.values()],
  connectionTypes: () => [...connectionTypes.values()],
};

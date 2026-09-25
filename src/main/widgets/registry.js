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
 */
const extensions = require('../extensions');

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
  return [...widgetTypes.values()].map(({ type, name, color }) => ({ type, name, color }));
}

// A connection type as Settings → Connections draws it. `secret` fields are
// write-only: the form can set them, nothing can read them back.
function connectionList() {
  return [...connectionTypes.values()].map(({ type, name, noun, multiple, fields, help }) => ({
    type, name, noun, multiple: !!multiple, help: help || '',
    fields: fields.map(({ key, label, type: kind, secret, placeholder }) => ({
      key, label, type: kind, secret: !!secret, placeholder: placeholder || '',
    })),
  }));
}

// A widget's settings form. A connections field carries its options — the
// connections that exist right now, by label and health — because a static
// schema can't know them.
function schema(type, available) {
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
    return out;
  });
}

// --------------------------------------------------------------- settings

function defaultFor(field) {
  if (field.type === 'connections') return [];
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
  }
  return result;
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
  widget, connection, widgetList, connectionList, schema, defaults, clean, excluded,
  widgetTypes: () => [...widgetTypes.values()],
  connectionTypes: () => [...connectionTypes.values()],
};

/* The widget registry: every widget type, and the rules all of them share.
 *
 * Adding a widget means adding a definition here. A definition declares its
 * settings; it never builds UI. The framework draws the form from the list
 * and checks every value before a widget sees it, so a widget can rely on
 * its settings being valid.
 */
const agenda = require('./agenda');

const TYPES = { [agenda.type]: agenda };

function definition(type) {
  return TYPES[type] || null;
}

function types() {
  return Object.values(TYPES).map(({ type, name, color }) => ({ type, name, color }));
}

// What the renderer needs to draw a settings form, and nothing else.
function schema(type) {
  const def = definition(type);
  return def ? def.settings.map(({ key, label, type: kind, options }) => ({ key, label, type: kind, options })) : [];
}

function defaults(type) {
  const def = definition(type);
  return def ? Object.fromEntries(def.settings.map((field) => [field.key, field.default])) : {};
}

function valid(field, value) {
  if (field.type === 'toggle') return typeof value === 'boolean';
  if (field.type === 'choice') return field.options.some(([option]) => option === value);
  return false;
}

// Stored settings merged over the defaults; anything unknown or invalid is
// dropped. The same function cleans what comes back from the settings form.
function clean(type, settings) {
  const def = definition(type);
  const result = defaults(type);
  if (!def || !settings || typeof settings !== 'object') return result;
  for (const field of def.settings) {
    if (valid(field, settings[field.key])) result[field.key] = settings[field.key];
  }
  return result;
}

module.exports = { definition, types, schema, defaults, clean };

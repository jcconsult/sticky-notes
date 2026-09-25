/* The built-in extensions. Each one is a folder that exports a manifest:
 *
 *   {
 *     id, name,
 *     connections: [ConnectionType],   // accounts → Settings → Connections
 *     widgets:     [WidgetType],       // widget types → the + menu
 *   }
 *
 * The framework (src/main/widgets/registry.js) reads these and nothing else
 * about them. Adding an integration is adding a folder here.
 */
module.exports = [
  require('./calendar'),
];

/* Copies the markdown-it browser bundle into src/vendor.
 *
 * The renderer is sandboxed with no Node access, so it loads markdown-it as a
 * plain <script>. Vendoring keeps that path stable whether the app is running
 * from source or from inside a packaged asar.
 */
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js');
const to = path.join(__dirname, '..', 'src', 'vendor', 'markdown-it.min.js');

// Failing loudly here matters: src/vendor is gitignored, electron-builder
// globs src/**/* without complaining about an absent file, and a packaged app
// with no parser renders blank notes. The only acceptable outcome of a missing
// source is that a usable copy is already in place.
if (!fs.existsSync(from)) {
  if (fs.existsSync(to)) {
    console.warn('markdown-it not installed; keeping the existing vendored copy.');
    process.exit(0);
  }
  console.error(
    'markdown-it is not installed and there is no vendored copy.\n' +
    'The renderer would ship without a Markdown parser. Run `npm install`.',
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log(`Vendored ${path.relative(process.cwd(), to)}`);

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

if (!fs.existsSync(from)) {
  console.warn('markdown-it not installed; keeping the existing vendored copy.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log(`Vendored ${path.relative(process.cwd(), to)}`);

/* Parses every source file with `node --check`.
 *
 * There is no test suite and no bundler, so nothing else would catch a syntax
 * error before it reached a running window. This is the cheap floor: it runs
 * in about a second and fails CI loudly.
 *
 *   node tools/check.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const roots = ['src', 'tools', 'test'];
const skip = new Set(['vendor', 'node_modules']);

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue; // vendored bundles are not ours to lint
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile() && entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

const files = roots
  .map((r) => path.join(root, r))
  .filter((d) => fs.existsSync(d))
  .flatMap((d) => walk(d));

let failed = 0;
for (const file of files) {
  const rel = path.relative(root, file);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`  ok  ${rel}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${rel}`);
    console.error(result.stderr.trim());
  }
}

console.log(`\n${files.length - failed}/${files.length} files parsed.`);
process.exit(failed ? 1 : 0);

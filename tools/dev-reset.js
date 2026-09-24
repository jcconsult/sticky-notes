/* Discards the dev build's copy of your notes, so the next `npm run dev`
 * starts again from a fresh copy of the real ones. The real notes are never
 * touched. Quit the dev build first, or it will write its copy straight back.
 *
 *   npm run dev:reset
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(process.env.APPDATA, 'sticky-notes-dev');
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. The next \`npm run dev\` copies your real notes again.`);

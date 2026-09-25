/* Tests for notes.json migrations: each one turns an old shape into the new
 * one, runs once, and leaves a current file alone.
 *
 *   npm test
 */
const path = require('path');

const { migrate, CURRENT } = require(path.join(__dirname, '..', 'src', 'main', 'migrations.js'));

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}`);
    console.log(`         got:  ${a}`);
    console.log(`         want: ${b}`);
  }
}

// v1.2.0 with "Never" chosen: autoShowAfter 0, and no version field.
let data = { notes: [{ id: 'n1', markdown: 'hi' }], ui: { settings: { opacity: 1, autoShowAfter: 0 } } };
let result = migrate(data);
check('an unversioned file counts as version 1', result.from, 1);
check('it is brought up to the current version', [result.to, data.version], [CURRENT, CURRENT]);
check('v1 "never" becomes the idle rule switched off', data.ui.settings, { opacity: 1, autoShowAfter: 30, autoShowIdle: false });
check('notes are untouched', data.notes, [{ id: 'n1', markdown: 'hi' }]);

// v1.2.0 with a real idle time: kept as it was.
data = { notes: [], ui: { settings: { autoShowAfter: 60 } } };
migrate(data);
check('a real idle time is kept', data.ui.settings, { autoShowAfter: 60 });

// Someone who never opened Settings has no settings object at all.
data = { notes: [], ui: {} };
migrate(data);
check('no settings: nothing to change', data.ui, {});

// Running again changes nothing: migrations happen once.
data = { version: CURRENT, notes: [], ui: { settings: { autoShowAfter: 0 } } };
result = migrate(data);
check('a current file is left alone', [result.from === result.to, data.ui.settings], [true, { autoShowAfter: 0 }]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

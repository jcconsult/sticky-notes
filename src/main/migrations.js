/* Versioned migrations for notes.json.
 *
 * The file records the version of its shape. At startup, store.js runs every
 * migration newer than that version, once, in order — after backing the
 * original up — and writes the result with the new version. Everything else
 * in the app only ever sees the current shape; no compatibility code lives
 * anywhere but here.
 *
 * To change the shape: add a migration with the next `to`, describe what it
 * turns into what, and add a case to test/migrations.test.js. Never edit a
 * migration that has shipped — someone's file may be halfway through it.
 */

const MIGRATIONS = [
  {
    to: 2, // v1.3.0
    // "Never bring hidden notes back" used to be autoShowAfter: 0. It is now
    // its own switch, so autoShowAfter always holds a real number of seconds.
    run(data) {
      const settings = data.ui && data.ui.settings;
      if (settings && settings.autoShowAfter === 0) {
        settings.autoShowIdle = false;
        settings.autoShowAfter = 30;
      }
    },
  },
];

const CURRENT = MIGRATIONS[MIGRATIONS.length - 1].to;

// A file without a version predates versioning: version 1.
function versionOf(data) {
  return Number.isInteger(data.version) ? data.version : 1;
}

/**
 * Brings `data` up to the current shape, in place.
 * @returns {{ from: number, to: number }} what it did; equal when nothing ran
 */
function migrate(data) {
  const from = versionOf(data);
  let version = from;
  for (const migration of MIGRATIONS) {
    if (version < migration.to) {
      migration.run(data);
      version = migration.to;
    }
  }
  data.version = version;
  return { from, to: version };
}

module.exports = { migrate, CURRENT };

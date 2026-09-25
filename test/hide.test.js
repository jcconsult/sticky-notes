/* Tests for the hide shortcut: tap to toggle, hold to peek, idle auto-show.
 *
 * hide.js takes its timers and idle clock as arguments, so a small fake clock
 * is enough to play out key presses, repeats and idle time in plain Node.
 *
 *   npm test
 */
const path = require('path');

const { createHider } = require(path.join(__dirname, '..', 'src', 'main', 'hide.js'));

// ------------------------------------------------------------ fake clock

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map(); // id → { at, fn, every }

  const timers = {
    setTimeout(fn, ms) { const id = nextId++; tasks.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    setInterval(fn, ms) { const id = nextId++; tasks.set(id, { at: now + ms, fn, every: ms }); return id; },
    clearInterval(id) { tasks.delete(id); },
  };

  // Run everything due up to `ms` from now, in time order.
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      let dueId = null;
      let due = null;
      for (const [id, task] of tasks) {
        if (task.at <= end && (!due || task.at < due.at)) { dueId = id; due = task; }
      }
      if (!due) break;
      now = due.at;
      if (due.every) due.at += due.every;
      else tasks.delete(dueId);
      due.fn();
    }
    now = end;
  }

  return { timers, advance, now: () => now };
}

// A hider wired to the fake clock, recording every hide and show.
function setup({ autoShowAfter = 30, limitSeconds = 0, presenting = () => false } = {}) {
  const clock = fakeClock();
  const log = [];
  let lastInput = 0;
  const hider = createHider({
    hide: () => log.push('hide'),
    show: (reason) => log.push(`show:${reason}`),
    idleSeconds: () => Math.floor((clock.now() - lastInput) / 1000),
    autoShowAfter: () => autoShowAfter,
    limitSeconds: () => limitSeconds,
    presenting,
    now: () => clock.now(),
    timers: clock.timers,
  });
  // A key press is also input, as far as the idle clock is concerned.
  const press = () => { lastInput = clock.now(); hider.press(); };
  const input = () => { lastInput = clock.now(); };
  return { hider, clock, log, press, input };
}

// Hold the key: the first repeat after `delay`, then one every 33ms.
function hold(t, ms, delay = 500) {
  t.press();
  t.clock.advance(delay);
  for (let held = delay; held < ms; held += 33) {
    t.press();
    t.clock.advance(33);
  }
}

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

// --- tap -------------------------------------------------------------------

let t = setup();
t.press();
check('tap: hides at once', t.log, ['hide']);
t.clock.advance(5000);
check('tap: stays hidden after the key is let go', [t.hider.isHidden(), t.log], [true, ['hide']]);
t.press();
check('tap again: shows', [t.hider.isHidden(), t.log], [false, ['hide', 'show:pressed']]);

// --- hold ------------------------------------------------------------------

t = setup();
hold(t, 3000);
check('hold: hidden while held', [t.hider.isHidden(), t.log], [true, ['hide']]);
t.clock.advance(300);
check('hold: shows again once released', [t.hider.isHidden(), t.log], [false, ['hide', 'show:released']]);

t = setup();
hold(t, 1500, 250);
t.clock.advance(300);
check('hold with the fastest repeat delay', t.log, ['hide', 'show:released']);

t = setup();
hold(t, 1500, 1000);
t.clock.advance(300);
check('hold with the slowest repeat delay', t.log, ['hide', 'show:released']);

// --- idle auto-show --------------------------------------------------------

t = setup({ autoShowAfter: 30 });
t.press();
t.clock.advance(29000);
check('idle: still hidden before the limit', t.hider.isHidden(), true);
t.clock.advance(2000);
check('idle: shows once idle long enough', [t.hider.isHidden(), t.log], [false, ['hide', 'show:idle']]);

t = setup({ autoShowAfter: 30 });
t.press();
for (let i = 0; i < 24; i += 1) {
  t.clock.advance(5000);
  t.input(); // working in the app behind the notes
}
check('idle: never shows while the user is working', [t.hider.isHidden(), t.log], [true, ['hide']]);

t = setup({ autoShowAfter: 0 });
t.press();
t.clock.advance(10 * 60 * 1000);
check('idle: "Never" keeps them hidden', t.hider.isHidden(), true);

// --- time limit ------------------------------------------------------------

// Idle return off, a 10-minute limit, and the user typing every second.
t = setup({ autoShowAfter: 0, limitSeconds: 600 });
t.press();
for (let s = 0; s < 610; s += 1) {
  t.clock.advance(1000);
  t.input();
}
check('limit: still hidden while the user keeps working past it', t.hider.isHidden(), true);
t.clock.advance(3000); // a short pause
check('limit: returns at the first pause after it', t.log, ['hide', 'show:limit']);

t = setup({ autoShowAfter: 0, limitSeconds: 600 });
t.press();
for (let s = 0; s < 300; s += 1) {
  t.clock.advance(1000);
  t.input();
}
t.clock.advance(5000);
check('limit: a pause before the limit does nothing', t.hider.isHidden(), true);

t = setup({ autoShowAfter: 30, limitSeconds: 600 });
t.press();
t.clock.advance(31000);
check('both rules: whichever comes first', t.log, ['hide', 'show:idle']);

// --- presenting --------------------------------------------------------------

let showing = true;
t = setup({ autoShowAfter: 30, presenting: () => showing });
t.press();
t.clock.advance(5 * 60 * 1000);
check('presenting: idle return is held off', t.hider.isHidden(), true);
showing = false;
t.clock.advance(2000);
check('presenting ends: the held rule applies', t.log, ['hide', 'show:idle']);

showing = true;
t = setup({ autoShowAfter: 0, limitSeconds: 60, presenting: () => showing });
t.press();
t.clock.advance(5 * 60 * 1000);
check('presenting: the time limit is held off too', t.hider.isHidden(), true);
t.press();
check('presenting: the shortcut still shows them', t.log, ['hide', 'show:pressed']);

// --- presses that show -----------------------------------------------------

t = setup();
t.press();
t.clock.advance(2000);
hold(t, 2000);
check('holding the key to show does not hide again', [t.hider.isHidden(), t.log], [false, ['hide', 'show:pressed']]);
t.clock.advance(2000);
t.press();
check('after that, the next press hides', t.log, ['hide', 'show:pressed', 'hide']);

t = setup();
t.press();
t.clock.advance(300);
t.press();
t.clock.advance(300);
check('a quick double tap ends shown', [t.hider.isHidden(), t.log], [false, ['hide', 'show:released']]);

// Found by pressing F1 for real: a tap soon after showing was swallowed.
t = setup();
t.press();
t.clock.advance(2000);
t.press(); // show
t.clock.advance(500);
t.press(); // hide again, 0.5 s later
t.clock.advance(300);
check('a tap soon after showing hides again', [t.hider.isHidden(), t.log], [true, ['hide', 'show:pressed', 'hide']]);

// --- tray and reset --------------------------------------------------------

t = setup();
t.hider.toggle();
check('toggle hides', [t.hider.isHidden(), t.log], [true, ['hide']]);
t.hider.toggle();
check('toggle shows', [t.hider.isHidden(), t.log], [false, ['hide', 'show:pressed']]);

t = setup();
t.press();
t.clock.advance(2000);
t.hider.reset();
check('reset shows hidden notes', t.log, ['hide', 'show:reset']);
t.hider.reset();
check('reset while shown does nothing', t.log, ['hide', 'show:reset']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

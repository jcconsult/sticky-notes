/* Hiding every note from one shortcut: tap to toggle, hold to peek.
 *
 * Electron's globalShortcut reports presses but never releases. Windows does,
 * however, repeat a held hotkey, so the pattern of presses tells us which one
 * the user meant:
 *
 *   first press     hide at once, then wait to see whether repeats follow
 *   repeats follow  a hold: show again as soon as they stop (peek)
 *   no repeat       a tap: stay hidden until the next press, or until the
 *                   user has been idle for `autoShowAfter()` seconds
 *
 * Idle means no mouse or keyboard input anywhere, so hidden notes never
 * reappear while someone is working in the app behind them.
 *
 * No Electron in here: the caller injects what hiding, showing and idle time
 * mean, which is also what lets the tests drive it with a fake clock.
 */

// Windows waits out an initial delay before it starts repeating a held key —
// a user setting, anywhere from 250ms to 1000ms — so deciding "that was a tap"
// has to clear the slowest possible delay. Once repeats are flowing, a much
// shorter gap means the key was let go.
const FIRST_REPEAT_MS = 1100;
const REPEAT_GAP_MS = 250;
const IDLE_POLL_MS = 1000;

function createHider({
  hide,
  show,
  idleSeconds,
  autoShowAfter,
  timers = { setTimeout, clearTimeout, setInterval, clearInterval },
}) {
  // shown      notes visible
  // deciding   hidden by a press; tap or hold not known yet
  // held       hidden while the key is held
  // hidden     hidden by a tap; stays that way
  // releasing  shown by a press; a held key's repeats must not hide them
  // lone       one press arrived while releasing: a new tap, unless more
  //            follow at repeat speed
  // repeating  releasing, and the key is confirmed held
  let state = 'shown';
  let timer = null;
  let poll = null;

  function clearTimer() {
    if (timer) timers.clearTimeout(timer);
    timer = null;
  }

  function stopPoll() {
    if (poll) timers.clearInterval(poll);
    poll = null;
  }

  function after(ms, fn) {
    clearTimer();
    timer = timers.setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }

  function reveal(reason) {
    clearTimer();
    stopPoll();
    state = 'shown';
    show(reason);
  }

  // A tap: stay hidden, and start watching for the user to go idle.
  function stick() {
    state = 'hidden';
    const seconds = autoShowAfter();
    if (seconds > 0) {
      poll = timers.setInterval(() => {
        if (idleSeconds() >= seconds) reveal('idle');
      }, IDLE_POLL_MS);
    }
  }

  function press() {
    switch (state) {
      case 'shown':
        state = 'deciding';
        hide();
        after(FIRST_REPEAT_MS, stick);
        break;
      case 'deciding':
      case 'held':
        // A second press inside the tap window lands here too, and ends the
        // same way a released hold does — shown again, which is what a
        // quick double tap means anyway.
        state = 'held';
        after(REPEAT_GAP_MS, () => reveal('released'));
        break;
      case 'hidden':
        stopPoll();
        state = 'releasing';
        show('pressed');
        after(FIRST_REPEAT_MS, () => { state = 'shown'; });
        break;
      case 'releasing':
        // Either the first repeat of a held key or a quick second tap — and
        // a held key's repeats come every ~30ms. So wait one repeat gap: if
        // nothing follows, it was a tap, and taps hide.
        state = 'lone';
        after(REPEAT_GAP_MS, () => {
          state = 'shown';
          press();
        });
        break;
      case 'lone':
      case 'repeating':
        state = 'repeating';
        after(REPEAT_GAP_MS, () => { state = 'shown'; });
        break;
      default:
        break;
    }
  }

  // The tray icon, or opening a note while hidden: no key involved.
  function toggle() {
    if (isHidden()) {
      reveal('pressed');
    } else {
      clearTimer();
      hide();
      stick();
    }
  }

  function isHidden() {
    return state === 'deciding' || state === 'held' || state === 'hidden';
  }

  // Show now if hidden — for anything that needs the notes back regardless.
  function reset() {
    if (isHidden()) reveal('reset');
    else {
      clearTimer();
      state = 'shown';
    }
  }

  return { press, toggle, reset, isHidden };
}

module.exports = { createHider, FIRST_REPEAT_MS, REPEAT_GAP_MS, IDLE_POLL_MS };

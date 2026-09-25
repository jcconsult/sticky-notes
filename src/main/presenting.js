/* Is the user presenting? Asks Windows, the same way it decides whether to
 * hold back its own notifications: SHQueryUserNotificationState.
 *
 * Presenting here means a slideshow in presentation mode, a full-screen app
 * or game, or a full-screen Store app. Screen sharing in a normal window
 * (Teams, Zoom) sets none of these, so it can't be detected.
 *
 * The call goes through koffi, a foreign-function library with prebuilt
 * binaries. If it cannot load — another platform, a broken install — the
 * answer is simply "not presenting", and the rule that uses it does nothing.
 */

// QUERY_USER_NOTIFICATION_STATE values that mean "someone is watching".
const QUNS_BUSY = 2;                    // a full-screen app
const QUNS_RUNNING_D3D_FULL_SCREEN = 3; // a full-screen game or video
const QUNS_PRESENTATION_MODE = 4;       // presentation settings / a slideshow
const QUNS_APP = 7;                     // a full-screen Store app
const PRESENTING = new Set([QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE, QUNS_APP]);

let query = null;
let unavailable = false;

function load() {
  if (query || unavailable) return query;
  try {
    // eslint-disable-next-line global-require -- loaded on first use only
    const koffi = require('koffi');
    query = koffi.load('shell32.dll').func('long __stdcall SHQueryUserNotificationState(_Out_ int *pquns)');
  } catch {
    unavailable = true;
  }
  return query;
}

function isPresenting() {
  if (process.platform !== 'win32' || !load()) return false;
  try {
    const state = [0];
    return query(state) === 0 && PRESENTING.has(state[0]);
  } catch {
    return false;
  }
}

module.exports = { isPresenting };

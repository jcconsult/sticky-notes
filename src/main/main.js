const fs = require('fs');
const path = require('path');
const {
  app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, screen, shell, dialog,
  globalShortcut, powerMonitor,
} = require('electron');

const store = require('./store');
const { createHider } = require('./hide');
const { PALETTE, THEMES, DEFAULT_COLOR, colorOf } = require('../shared/palette');

const DEFAULT_SETTINGS = {
  opacity: 1,               // 1 is solid; the slider offers down to 0.4
  defaultColor: DEFAULT_COLOR,
  newNotesPinned: true,
  // F1 is Help almost everywhere, and a duplicate of Ctrl+Shift+P in VS Code
  // and Cursor, so taking it costs nothing. Ctrl+Alt chords are avoided: on
  // many European layouts Ctrl+Alt is AltGr, which types @, £, $ and braces.
  peekShortcut: 'F1',
  autoShowAfter: 30,        // seconds idle before tapped-away notes return; 0 = never
};

const AUTO_SHOW_CHOICES = [0, 15, 30, 60, 300];

// A key on its own is only allowed if nothing types with it. F12 is excluded
// outright: Windows reserves it for debuggers and RegisterHotKey refuses it.
const LONE_KEY = /^F([1-9]|1[013-9]|2[0-4])$/;

const SHOW_FADE_MS = 200;

// `npm run dev` runs this checkout as a separate app beside the installed
// one. Its data folder — which is also where the single-instance lock lives —
// is its own, and on first run it starts from a copy of the real notes. The
// real notes file is never written. `npm run dev:reset` discards the copy.
const DEV = !app.isPackaged && process.argv.includes('--dev');
const DEV_DATA = 'sticky-notes-dev';

function useDevData() {
  const real = path.join(app.getPath('userData'), 'notes.json');
  const dir = path.join(app.getPath('appData'), DEV_DATA);
  app.setPath('userData', dir);
  const copy = path.join(dir, 'notes.json');
  if (!fs.existsSync(copy) && fs.existsSync(real)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(real, copy);
  }
}

const NOTE_MIN = { width: 240, height: 180 };
const NOTE_DEFAULT = { width: 340, height: 380 };
const LIBRARY_DEFAULT = { width: 340, height: 520 };

const WELCOME = `# Welcome

Paste Markdown here and it renders. Click the pencil to edit the source.

- [ ] Tick a box — it writes straight back to the Markdown
- [ ] Try the colour dot in the title bar
- [ ] Unpin this note if you do not want it on top

The tray icon opens **All Notes**, where you can reopen or delete any note.
`;

/** @type {Map<string, BrowserWindow>} */
const windows = new Map();
let library = null;
let tray = null;
let quitting = false;
let cascade = 0;

// ---------------------------------------------------------------------------
// Theme

function themeName() {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function theme() {
  return THEMES[themeName()];
}

// ---------------------------------------------------------------------------
// Settings (global, not per note)

function settings() {
  return { ...DEFAULT_SETTINGS, ...(store.ui('settings') || {}) };
}

// Transparency is a window-level property, so it is applied to the frame
// rather than to any CSS inside the note.
function applyOpacity(win, value) {
  if (!win || win.isDestroyed()) return;
  win.setOpacity(Math.min(Math.max(value, 0.2), 1));
}

function applySettings(next) {
  if (hider.isHidden()) return; // showing the notes again applies it
  for (const win of windows.values()) applyOpacity(win, next.opacity);
}

// ---------------------------------------------------------------------------
// Hiding every note — one shortcut: tap to toggle, hold to peek
//
// hide.js decides *when*; this is *how*. Opacity rather than hide(): hide()
// churns focus and window state and flickers, where opacity is instant and
// reversible. A window at zero opacity still swallows clicks, hence
// setIgnoreMouseEvents — the whole point is reaching the app behind.

let fadeTimer = null;

function devLog(message) {
  if (!app.isPackaged) console.log(`${new Date().toTimeString().slice(0, 8)}.${String(Date.now() % 1000).padStart(3, '0')} ${message}`);
}

function stopFade() {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
}

// Focus is deliberately left alone. setFocusable() and blur() on Windows
// hand focus to whichever window is next in the z-order — measured landing on
// Teams, Outlook or another hidden note — so the user's next keys went
// somewhere they never chose. Keystrokes into a hidden note are blocked
// instead, in createNoteWindow.
function hideAllNotes() {
  stopFade();
  for (const win of windows.values()) {
    if (win.isDestroyed()) continue;
    win.setIgnoreMouseEvents(true);
    win.setOpacity(0);
  }
  refreshTray();
  devLog(`[hide] hidden (${windows.size} notes)`);
}

// Back to the configured transparency, not to solid — hiding and the
// transparency setting share the same window property. Hiding is instant;
// notes that come back on their own fade in, so their return is noticed
// without being jarring.
function showAllNotes(reason) {
  stopFade();
  const target = Math.min(Math.max(settings().opacity, 0.2), 1);
  const live = () => [...windows.values()].filter((win) => !win.isDestroyed());
  for (const win of live()) win.setIgnoreMouseEvents(false);
  refreshTray();
  devLog(`[hide] shown (${reason})`);

  if (reason !== 'idle') {
    for (const win of live()) win.setOpacity(target);
    return;
  }
  const start = Date.now();
  fadeTimer = setInterval(() => {
    const t = Math.min((Date.now() - start) / SHOW_FADE_MS, 1);
    for (const win of live()) win.setOpacity(target * t);
    if (t === 1) stopFade();
  }, 16);
}

const hider = createHider({
  hide: hideAllNotes,
  show: showAllNotes,
  idleSeconds: () => powerMonitor.getSystemIdleTime(),
  autoShowAfter: () => settings().autoShowAfter,
});

function validShortcut(accelerator) {
  return typeof accelerator === 'string' &&
    (accelerator.includes('+') || LONE_KEY.test(accelerator));
}

function registerPeek(accelerator) {
  globalShortcut.unregisterAll();
  hider.reset();
  if (!accelerator) return true;
  if (!validShortcut(accelerator)) return false;
  try {
    return globalShortcut.register(accelerator, () => {
      devLog(`[hide] ${accelerator} pressed`);
      hider.press();
    });
  } catch {
    return false; // malformed accelerator
  }
}

// ---------------------------------------------------------------------------
// Note summaries (shared by the tray menu and the All Notes window)

// Strip the Markdown scaffolding so the list reads as prose rather than
// source: heading hashes, bullets, checkboxes, quote marks, code fences and
// table rules all carry no meaning once the text is one line in a list.
function plainLines(markdown) {
  return (markdown || '')
    .split('\n')
    .filter((l) => !/^\s*(```|~~~)/.test(l))
    .filter((l) => !/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l))
    .map((l) => l
      .replace(/^[#>\s*+-]+/, '')
      .replace(/^\[[ xX]\]\s*/, '')
      .replace(/^\d+\.\s+/, '')
      .trim())
    .filter((l) => l.length > 0);
}

function clamp(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function noteTitle(note) {
  const [first] = plainLines(note.markdown);
  return first ? clamp(first, 60) : 'Empty note';
}

function noteSnippet(note) {
  return clamp(plainLines(note.markdown).slice(1).join(' '), 70);
}

function summarise() {
  return store.all().map((note) => ({
    id: note.id,
    title: noteTitle(note),
    snippet: noteSnippet(note),
    dot: colorOf(note.color).dot,
    visible: note.visible !== false,
    createdAt: note.createdAt,
  }));
}

// Anything that changes a note has to reach both indexes.
function notifyChanged() {
  refreshTray();
  if (library && !library.isDestroyed()) {
    library.webContents.send('library:changed', summarise());
  }
}

// ---------------------------------------------------------------------------
// Note windows

function defaultBounds(size) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const step = 28 * (cascade % 8);
  cascade += 1;
  return {
    x: Math.round(area.x + area.width - size.width - 48 - step),
    y: Math.round(area.y + 64 + step),
    ...size,
  };
}

function createNoteWindow(note) {
  const existing = windows.get(note.id);
  if (existing && !existing.isDestroyed()) {
    showWindow(existing);
    return existing;
  }

  const win = new BrowserWindow({
    ...(note.bounds || defaultBounds(NOTE_DEFAULT)),
    minWidth: NOTE_MIN.width,
    minHeight: NOTE_MIN.height,
    frame: false,
    show: false,
    skipTaskbar: true, // eight notes should not mean eight taskbar buttons
    backgroundColor: theme().bg,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windows.set(note.id, win);
  win.loadFile(path.join(__dirname, '../renderer/note.html'), { query: { id: note.id } });

  win.once('ready-to-show', () => {
    applyPin(win, note.pinned);
    applyOpacity(win, settings().opacity);
    // A window that finishes loading while notes are hidden joins them.
    if (hider.isHidden()) {
      win.setIgnoreMouseEvents(true);
      win.setOpacity(0);
    }
    if (note.visible !== false) win.show();
  });

  const persistBounds = debounce(() => {
    if (win.isDestroyed() || win.isMinimized()) return;
    store.update(note.id, { bounds: win.getNormalBounds() });
  }, 300);
  win.on('move', persistBounds);
  win.on('resize', persistBounds);

  // Closing a note hides it; the note itself lives on in All Notes.
  // Deleting is deliberate and separate.
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    hideNote(note.id);
  });

  win.on('closed', () => {
    if (windows.get(note.id) === win) windows.delete(note.id);
  });

  if (!app.isPackaged) {
    win.webContents.on('console-message', ({ message, lineNumber, sourceId }) => {
      console.log(`[note] ${message}  (${sourceId}:${lineNumber})`);
    });
  }

  // A note typed in just before hiding keeps focus; its keystrokes and pastes
  // must not land in text nobody can see.
  win.webContents.on('before-input-event', (event) => {
    if (hider.isHidden()) event.preventDefault();
  });

  // Links in a note open in the real browser, never inside the note.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

// 'screen-saver' is the level that actually floats above fullscreen windows.
// The plain setAlwaysOnTop(true) default loses to them silently, which would
// break the one feature the app exists for.
function applyPin(win, pinned) {
  if (!win || win.isDestroyed()) return;
  if (pinned) win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(false);
}

function showWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// Asking for a note while every note is hidden means wanting them back.
function showNote(id) {
  const note = store.get(id);
  if (!note) return;
  hider.reset();
  store.update(id, { visible: true });
  const win = windows.get(id);
  if (win && !win.isDestroyed()) showWindow(win);
  else createNoteWindow(note);
  notifyChanged();
}

function hideNote(id) {
  store.update(id, { visible: false });
  const win = windows.get(id);
  if (win && !win.isDestroyed()) win.hide();
  notifyChanged();
}

function newNote(nearId) {
  hider.reset();
  const near = nearId ? store.get(nearId) : null;
  const prefs = settings();
  // A note made from another note inherits its colour; anything else uses the
  // configured default.
  const note = store.create({
    color: near ? near.color : prefs.defaultColor,
    pinned: prefs.newNotesPinned,
  });
  createNoteWindow(note);
  notifyChanged();
  return note;
}

function deleteNote(id) {
  const win = windows.get(id);
  windows.delete(id);
  if (win && !win.isDestroyed()) win.destroy();
  store.remove(id);
  notifyChanged();
}

// Empty notes go without ceremony; anything with text asks first.
async function confirmDelete(parent, id) {
  const note = store.get(id);
  if (!note) return;
  if ((note.markdown || '').trim()) {
    const { response } = await dialog.showMessageBox(parent, {
      type: 'warning',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Delete note',
      message: `Delete “${noteTitle(note)}”?`,
      detail: 'This cannot be undone.',
    });
    if (response !== 0) return;
  }
  deleteNote(id);
}

// ---------------------------------------------------------------------------
// All Notes window

function createLibraryWindow() {
  if (library && !library.isDestroyed()) return library;

  library = new BrowserWindow({
    ...(store.ui('libraryBounds') || defaultBounds(LIBRARY_DEFAULT)),
    minWidth: 280,
    minHeight: 320,
    frame: false,
    show: false,
    title: 'Sticky Notes',
    backgroundColor: theme().bg,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-library.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  library.loadFile(path.join(__dirname, '../renderer/library.html'));
  library.once('ready-to-show', () => showWindow(library));

  const persistBounds = debounce(() => {
    if (library.isDestroyed() || library.isMinimized()) return;
    store.setUi('libraryBounds', library.getNormalBounds());
  }, 300);
  library.on('move', persistBounds);
  library.on('resize', persistBounds);

  library.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    library.hide();
  });

  // Belt and braces for the renderer's own cleanup: a window hidden while
  // recording a shortcut must not leave the hotkey unregistered.
  library.on('hide', endRecording);

  if (!app.isPackaged) {
    library.webContents.on('console-message', ({ message, lineNumber, sourceId }) => {
      console.log(`[library] ${message}  (${sourceId}:${lineNumber})`);
    });
  }

  return library;
}

function showLibrary() {
  if (library && !library.isDestroyed()) {
    showWindow(library);
    library.webContents.send('library:changed', summarise());
  } else {
    createLibraryWindow();
  }
}

// ---------------------------------------------------------------------------
// Start with Windows

function autoStartOn() {
  return app.getLoginItemSettings().openAtLogin;
}

function setAutoStart(enabled) {
  // In development process.execPath is electron.exe, which needs the app
  // directory passed through or the login item would launch a blank Electron.
  const options = { openAtLogin: enabled };
  if (!app.isPackaged) {
    options.path = process.execPath;
    options.args = [path.resolve(app.getAppPath())];
  }
  app.setLoginItemSettings(options);
  refreshTray();
}

// ---------------------------------------------------------------------------
// Tray

// Drawn in code so the app ships with no image assets: a rounded square in
// the default note colour, anti-aliased via a rounded-rect distance field.
// `dim` draws it faded, which is how the tray shows the notes are hidden.
function trayImage(dim = false) {
  const size = 32;
  const pad = 3;
  const radius = 7;
  const { dot } = colorOf(DEV ? 'purple' : 'amber'); // purple: the dev build
  const r = parseInt(dot.slice(1, 3), 16);
  const g = parseInt(dot.slice(3, 5), 16);
  const b = parseInt(dot.slice(5, 7), 16);

  const buf = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const inner = half - pad - radius;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const qx = Math.abs(x + 0.5 - half) - inner;
      const qy = Math.abs(y + 0.5 - half) - inner;
      const d =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        radius;
      const a = Math.min(Math.max(0.5 - d, 0), 1) * (dim ? 0.35 : 1);
      const i = (y * size + x) * 4;
      buf[i] = Math.round(b * a); // BGRA, premultiplied
      buf[i + 1] = Math.round(g * a);
      buf[i + 2] = Math.round(r * a);
      buf[i + 3] = Math.round(255 * a);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 });
}

const trayImages = {};

function prettyShortcut(accelerator) {
  return (accelerator || '').replace(/Control/g, 'Ctrl').replace(/Super/g, 'Win');
}

function refreshTray() {
  if (!tray) return;
  const hidden = hider.isHidden();
  const key = hidden ? 'dim' : 'full';
  if (!trayImages[key]) trayImages[key] = trayImage(hidden);
  tray.setImage(trayImages[key]);

  const notes = store.all();
  const shortcut = prettyShortcut(settings().peekShortcut);
  const items = notes.slice(0, 12).map((note) => ({
    label: noteTitle(note),
    type: 'checkbox',
    checked: note.visible !== false,
    click: () => (note.visible === false ? showNote(note.id) : hideNote(note.id)),
  }));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'All notes…', click: showLibrary },
    { label: 'New note', click: () => newNote() },
    {
      label: `${hidden ? 'Show' : 'Hide'} notes`,
      // Shown beside the item only; the global shortcut does the real work.
      accelerator: settings().peekShortcut || undefined,
      registerAccelerator: false,
      click: () => hider.toggle(),
    },
    { type: 'separator' },
    ...(items.length ? items : [{ label: 'No notes yet', enabled: false }]),
    ...(notes.length > items.length
      ? [{ label: `…and ${notes.length - items.length} more`, enabled: false }]
      : []),
    { type: 'separator' },
    // Opening and closing windows — distinct from "Hide notes" above, which
    // only makes the open ones invisible for a while.
    { label: 'Open all notes', click: () => store.all().forEach((n) => showNote(n.id)) },
    { label: 'Close all notes', click: () => store.all().forEach((n) => hideNote(n.id)) },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: autoStartOn(),
      click: (item) => setAutoStart(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit Sticky Notes', click: () => app.quit() },
  ]));
  const name = DEV ? 'Sticky Notes (dev)' : 'Sticky Notes';
  tray.setToolTip(hidden
    ? `${name} — notes hidden${shortcut ? ` (${shortcut} to show)` : ''}`
    : `${name} — ${notes.length} note${notes.length === 1 ? '' : 's'}`);
}

function createTray() {
  tray = new Tray(trayImage());
  // The discoverable way back to everything — including hidden notes.
  tray.on('click', () => (hider.isHidden() ? hider.reset() : showLibrary()));
  refreshTray();
}

// ---------------------------------------------------------------------------
// Helpers

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
}

// Markdown can carry arbitrary links, so only ever hand real web schemes to
// the OS — never file:, ms-msdt:, or anything else the shell would act on.
function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      shell.openExternal(url);
    }
  } catch { /* not a URL we can act on */ }
}

function ownerId(event) {
  for (const [id, win] of windows) {
    if (!win.isDestroyed() && win.webContents.id === event.sender.id) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// IPC — note windows

ipcMain.handle('note:get', (event) => {
  const id = ownerId(event);
  const note = id ? store.get(id) : null;
  if (!note) return null;
  return { note, theme: themeName(), palette: PALETTE, themes: THEMES };
});

ipcMain.handle('note:update', (event, patch) => {
  const id = ownerId(event);
  if (!id) return;
  const allowed = {};
  for (const key of ['markdown', 'color', 'mode']) {
    if (key in patch) allowed[key] = patch[key];
  }
  store.update(id, allowed);
  if ('markdown' in allowed || 'color' in allowed) notifyChanged();
});

ipcMain.handle('note:setPinned', (event, pinned) => {
  const id = ownerId(event);
  if (!id) return;
  store.update(id, { pinned: !!pinned });
  applyPin(windows.get(id), !!pinned);
});

ipcMain.handle('note:new', (event) => {
  newNote(ownerId(event));
});

ipcMain.handle('note:hide', (event) => {
  const id = ownerId(event);
  if (id) hideNote(id);
});

ipcMain.handle('note:menu', (event) => {
  const id = ownerId(event);
  const win = id && windows.get(id);
  if (!win || win.isDestroyed()) return;
  const note = store.get(id);

  Menu.buildFromTemplate([
    { label: 'New note', click: () => newNote(id) },
    {
      label: 'Duplicate note',
      click: () => {
        createNoteWindow(store.create({ markdown: note.markdown, color: note.color }));
        notifyChanged();
      },
    },
    { type: 'separator' },
    { label: 'All notes…', click: showLibrary },
    { label: 'Close note (keeps it in All Notes)', click: () => hideNote(id) },
    { type: 'separator' },
    { label: 'Delete note…', click: () => confirmDelete(win, id) },
  ]).popup({ window: win });
});

ipcMain.handle('open-external', (_event, url) => openExternal(url));

// ---------------------------------------------------------------------------
// IPC — All Notes window

ipcMain.handle('library:list', () => ({ notes: summarise(), theme: theme() }));

ipcMain.handle('library:open', (_event, id) => showNote(id));

ipcMain.handle('library:toggleVisible', (_event, id) => {
  const note = store.get(id);
  if (!note) return;
  if (note.visible === false) showNote(id);
  else hideNote(id);
});

ipcMain.handle('library:delete', (_event, id) => confirmDelete(library, id));

ipcMain.handle('library:new', () => newNote());

let peekOk = true;

ipcMain.handle('settings:get', () => ({
  ...settings(),
  autoStart: autoStartOn(),
  peekOk,
  palette: PALETTE,
}));

ipcMain.handle('settings:set', (_event, patch) => {
  if ('autoStart' in patch) setAutoStart(!!patch.autoStart);

  const next = { ...settings() };

  if ('peekShortcut' in patch) {
    const accelerator = typeof patch.peekShortcut === 'string' ? patch.peekShortcut : null;
    peekOk = registerPeek(accelerator);
    // Keep a rejected accelerator out of the store so a shortcut another app
    // owns cannot wedge the setting permanently.
    if (peekOk) next.peekShortcut = accelerator;
    else registerPeek(next.peekShortcut);
  }

  if (typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)) {
    next.opacity = Math.min(Math.max(patch.opacity, 0.2), 1);
  }
  if (typeof patch.defaultColor === 'string' && PALETTE.some((c) => c.id === patch.defaultColor)) {
    next.defaultColor = patch.defaultColor;
  }
  if ('newNotesPinned' in patch) next.newNotesPinned = !!patch.newNotesPinned;
  if (AUTO_SHOW_CHOICES.includes(patch.autoShowAfter)) next.autoShowAfter = patch.autoShowAfter;

  store.setUi('settings', next);
  applySettings(next);
  refreshTray(); // the menu shows the shortcut
  return { ...next, autoStart: autoStartOn(), peekOk, palette: PALETTE };
});

// While Settings records a new shortcut, the current one must not fire:
// the global hotkey would swallow the very keys being recorded.
let recordingShortcut = false;

function endRecording() {
  if (!recordingShortcut) return;
  recordingShortcut = false;
  peekOk = registerPeek(settings().peekShortcut);
}

ipcMain.handle('settings:recording', (_event, recording) => {
  if (recording) {
    recordingShortcut = true;
    registerPeek(null);
  } else {
    endRecording();
  }
});

ipcMain.handle('library:minimise', () => {
  if (library && !library.isDestroyed()) library.minimize();
});

ipcMain.handle('library:close', () => {
  if (library && !library.isDestroyed()) library.hide();
});

// ---------------------------------------------------------------------------
// Lifecycle

if (DEV) useDevData();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Launching the app again should surface what is already running.
  app.on('second-instance', showLibrary);

  app.whenReady().then(() => {
    // Dev-only escape hatch for checking both themes without changing the
    // Windows setting: STICKY_THEME=dark npm start
    if (!app.isPackaged && process.env.STICKY_THEME) {
      nativeTheme.themeSource = process.env.STICKY_THEME === 'dark' ? 'dark' : 'light';
    }

    const notes = store.load();
    createTray();
    peekOk = registerPeek(settings().peekShortcut);
    if (!app.isPackaged) {
      console.log(`[peek] ${settings().peekShortcut} registered: ${peekOk}`);
    }

    if (!notes.length) {
      createNoteWindow(store.create({ markdown: WELCOME, mode: 'view' }));
    } else {
      notes.forEach((note) => {
        if (note.visible !== false) createNoteWindow(note);
      });
      // Every note closed would otherwise mean a silent launch with nothing
      // on screen but a tray icon.
      if (!notes.some((note) => note.visible !== false)) showLibrary();
    }
    notifyChanged();

    nativeTheme.on('updated', () => {
      const name = themeName();
      for (const win of windows.values()) {
        if (win.isDestroyed()) continue;
        win.setBackgroundColor(THEMES[name].bg);
        win.webContents.send('theme', name);
      }
      if (library && !library.isDestroyed()) {
        library.setBackgroundColor(THEMES[name].bg);
        library.webContents.send('library:theme', THEMES[name]);
      }
    });
  });

  // The app lives in the tray: closing every window is not quitting.
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    quitting = true;
    store.saveNow();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}

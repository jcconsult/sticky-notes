<div align="center">

# Sticky Notes

**Markdown sticky notes for Windows that stay above every other window.**

[![Release](https://img.shields.io/github/v/release/jcconsult/sticky-notes?style=flat-square)](https://github.com/jcconsult/sticky-notes/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/jcconsult/sticky-notes/total?style=flat-square)](https://github.com/jcconsult/sticky-notes/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/jcconsult/sticky-notes/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/jcconsult/sticky-notes/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

[**Download for Windows**](https://github.com/jcconsult/sticky-notes/releases/latest) · [Features](#features) · [Screenshots](#screenshots) · [Development](#development)

<img src="docs/screenshots/hero.png" alt="Sticky Notes on the Windows desktop: three coloured notes and the All Notes window" width="100%">

</div>

---

Paste Markdown into a note and it renders. Tick a checkbox in the rendered view
and it writes straight back into the Markdown source, leaving your formatting
untouched. Pin any note above every other window and it stays there — including
over fullscreen apps.

No account, no sync, no subscription. Your notes are one JSON file on your disk.

## Features

- **Markdown rendering** — headings, lists, tables, code blocks, quotes, links.
  Paste from anywhere and it renders immediately.
- **Working checklists** — `- [ ]` items become real checkboxes. Ticking one
  rewrites a single line of the source, so nothing else about your text changes.
- **Always on top** — pin per note. Uses the window level that actually beats
  fullscreen windows, not the one that quietly loses to them.
- **Custom colours** — six-colour palette, one colour per note, so a wall of
  notes stays scannable.
- **Source view** — flip between rendered Markdown and the raw text with one
  click or `Ctrl+E`. Double-click a word in the rendered view and you land in
  the source with that word already selected.
- **Formatting toolbar** — select text while editing and a small toolbar
  appears: bold, italic, strikethrough, code, link, heading, checklist.
- **Hide notes** — press `F1` to hide every note and reach the app behind them;
  press again to bring them back, or they return on their own once you stop
  using the mouse and keyboard. Hold the key instead to hide them only while
  it is held. Rebindable.
- **All Notes** — every note in one list, open or closed. Reopen, close or
  delete from there.
- **Adjustable transparency** — let the desktop show through as much as you like.
- **Starts with Windows** — optional, lives in the tray.

## Install

Download the installer `.exe` from the
[releases page](https://github.com/jcconsult/sticky-notes/releases/latest) and
run it.

It is a per-user install, so it needs no administrator rights. It creates
desktop and Start Menu shortcuts, and uninstalls from **Settings → Apps** like
anything else. Uninstalling does not delete your notes.

> [!NOTE]
> The installer is not code-signed, so SmartScreen shows a warning the first
> time. Click **More info → Run anyway**. Signing requires a paid certificate.

**Requirements:** Windows 10 or 11, 64-bit.

## Screenshots

| Rendered | Markdown source |
| :--: | :--: |
| <img src="docs/screenshots/note.png" alt="A note rendering a heading, checklist, code and a blockquote" width="380"> | <img src="docs/screenshots/source.png" alt="The same note showing its raw Markdown source" width="380"> |
| Checkboxes are live — tick one and the source updates. | One click, or `Ctrl+E`, switches between the two. |

| All Notes | Settings | Colours |
| :--: | :--: | :--: |
| <img src="docs/screenshots/all-notes.png" alt="The All Notes window listing five notes with coloured stripes" width="300"> | <img src="docs/screenshots/settings.png" alt="Settings showing transparency, default colour, pinning and autostart" width="300"> | <img src="docs/screenshots/colours.png" alt="A note with the six-colour palette open" width="300"> |

## Usage

Each note's title bar carries its controls:

| Control | Action |
| :--: | --- |
| `+` | New note |
| ● | Note colour |
| 📌 | Keep this note above other windows |
| ✎ / 👁 | Rendered view ↔ Markdown source |
| `✕` | Close the note — it stays in **All Notes** |

Right-click a note's title bar for duplicate, delete, and All Notes.

**The tray icon** (notification area, by the clock) opens **All Notes**, which
lists every note whether its window is open or not. Right-click it for a quick
menu including *Start with Windows*. While notes are hidden the icon fades,
and clicking it brings them back.

> [!TIP]
> On Windows 11 a new tray icon starts hidden under the `^` chevron. Drag it
> out onto the tray so it is always one click away.

**Settings** live behind the gear in the All Notes title bar: note
transparency, default colour for new notes, whether new notes start pinned,
starting with Windows, the hide shortcut, and how long hidden notes wait
before coming back. Click **Change** next to the shortcut and press the key or
combination you want — if another app already owns it, it says so instead of
failing quietly. An F-key can be used on its own; while Sticky Notes runs,
other apps no longer receive it.

### Keyboard

| Shortcut | Action |
| --- | --- |
| `F1` | **Hide notes** — press to hide or show every note; hold to hide only while held (rebindable) |
| `Ctrl+N` | New note |
| `Ctrl+E` | Toggle rendered / source |
| `Ctrl+Enter` | Done editing — saves and shows the rendered view |
| `Ctrl+B` `Ctrl+I` `Ctrl+K` | Bold, italic, link (in the source view) |
| `Ctrl+V` | Paste Markdown — appends to the note and renders |
| `Esc` | Leave the source view |

Nothing needs saving — notes save as you type. `Ctrl+Enter` and `Esc` just
commit the edit and show you the result.

### Formatting

Select any text in the source view and a toolbar appears above it with
**B**, *I*, ~~S~~, `code`, link, heading and checklist. Every button toggles, so
pressing **B** on bold text unbolds it.

To format a word you can see in the rendered view, double-click it — that opens
the source with the word selected and the toolbar up, ready for `Ctrl+B`.

### Where notes are stored

`%APPDATA%\sticky-notes\notes.json` — a single plain JSON file holding the
Markdown, colour, window position and pin state of every note, plus your
settings. Copy it to back up or move your notes between machines.

If the file is ever unreadable it is renamed aside rather than overwritten, so
a bad edit cannot cost you your notes.

## Development

```bash
git clone https://github.com/jcconsult/sticky-notes.git
cd sticky-notes
npm install
npm run dev
```

`npm run dev` runs your checkout as **Sticky Notes (dev)** — a separate app
with a purple tray icon that runs beside an installed copy, so there is nothing
to quit first. It keeps its own data in `%APPDATA%\sticky-notes-dev`, starting
from a copy of your real notes on first run; your real notes file is never
written. `npm run dev:reset` discards that copy (quit the dev app first).

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the checkout beside the installed app, on a copy of your notes |
| `npm run dev:reset` | Throw the dev copy away; the next `dev` run copies your notes again |
| `npm start` | Run the checkout as the real app, on your real notes (quit the installed one first) |
| `npm run check` | Parse every source file |
| `npm test` | Run the formatting-engine and hide-shortcut tests |
| `npm run pack:dir` | Package to `dist/win-unpacked` without an installer |
| `npm run dist` | Build the installer into `dist/` |

### Layout

```
src/main/main.js          windows, tray, settings — all OS-facing behaviour
src/main/store.js         the JSON file, debounced and written atomically
src/main/hide.js          the hide shortcut: tap, hold and idle return
src/preload/              the two IPC bridges (a note, and All Notes)
src/renderer/note.js      one note window
src/renderer/markdown.js  markdown-it plus the checkbox/source round-trip
src/renderer/format.js    Markdown formatting operations on the textarea
src/renderer/library.js   the All Notes list and Settings
src/shared/palette.js     colours and themes, shared by main and renderers
tools/make-icon.js        draws build/icon.ico, so no binaries are committed
```

No bundler and no frontend framework — plain HTML, CSS and JavaScript on
Electron. `markdown-it` is the only runtime dependency, vendored into
`src/vendor/` at install time so the sandboxed renderer can load it as a script.

### Details worth knowing

- **Always on top** uses `setAlwaysOnTop(true, 'screen-saver')`. The plain
  `setAlwaysOnTop(true)` default silently loses to fullscreen windows.
- **Checkbox toggles** rewrite one line of the source using the line number
  `markdown-it` records on each token, rather than re-serialising the document
  from its parse tree. That is what keeps your formatting intact.
- **Formatting edits** go through `document.execCommand('insertText')`, which
  is deprecated but is the only way to change a textarea's value while keeping
  Chromium's native undo stack. `setRangeText()` silently destroys it.
- **Hide notes** rides on the fact that Windows repeats a held hotkey:
  Electron's `globalShortcut` has no key-up event, so repeats arriving means
  the key is held, and a gap in them stands in for the release. A press with
  no repeats is a tap. The logic lives in `src/main/hide.js`, free of Electron,
  so `test/hide.test.js` plays out taps, holds and idle time on a fake clock.
- **Hidden notes come back** only after the machine has been idle
  (`powerMonitor.getSystemIdleTime()`), never on a plain timer, so they cannot
  reappear under a click in the app behind them.
- **Toggle keys can't be the shortcut.** Registering Caps Lock, Num Lock or
  Scroll Lock as a hotkey still flips the lock, so they are not offered; F12 is
  reserved by Windows for debuggers.

### Security

Renderers run sandboxed with `contextIsolation` enabled and no Node access.
`markdown-it` runs with `html: false`, so pasted content cannot inject markup.
Links are opened by the main process, and only `http`, `https` and `mailto`.

## Releasing

Releases are cut by tagging. CI does the rest — builds the installer on a
Windows runner and publishes it to a GitHub Release with generated notes.

```bash
npm version patch      # or minor / major — bumps package.json and tags
git push --follow-tags
```

Watch it at [Actions → Release](https://github.com/jcconsult/sticky-notes/actions/workflows/release.yml).

## License

[MIT](LICENSE) © Jonathan Cummins

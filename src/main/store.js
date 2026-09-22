const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_COLOR } = require('../shared/palette');

// One JSON file in %APPDATA%/Sticky Notes. No database: a few hundred notes of
// plain text is kilobytes, and a single file is trivially backed up or synced
// by whatever the user already uses.
let file = null;
let data = { notes: [], ui: {} };
let writeTimer = null;

function notesPath() {
  if (!file) file = path.join(app.getPath('userData'), 'notes.json');
  return file;
}

function load() {
  try {
    // Strip a UTF-8 BOM: Notepad and PowerShell's Set-Content both add one,
    // and JSON.parse rejects it. Someone hand-editing their notes file should
    // not be treated as having corrupted it.
    const raw = fs.readFileSync(notesPath(), 'utf8').replace(/^﻿/, '');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.notes)) data = { ui: {}, ...parsed };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // A corrupt file must never cost the user their notes silently.
      try {
        fs.renameSync(notesPath(), `${notesPath()}.corrupt-${Date.now()}`);
      } catch { /* nothing further we can do */ }
    }
  }
  return data.notes;
}

function flush() {
  const target = notesPath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, target); // atomic-ish: never leaves a half-written file
  } catch (err) {
    console.error('Failed to save notes:', err);
  }
}

// Coalesce the bursts that typing and window-dragging produce.
function save() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush();
  }, 400);
}

function saveNow() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  flush();
}

function all() {
  return data.notes;
}

function get(id) {
  return data.notes.find((n) => n.id === id) || null;
}

function create(patch = {}) {
  // Drop undefined keys: spreading them would overwrite the defaults below
  // with undefined rather than leaving them alone.
  const given = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const note = {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    markdown: '',
    color: DEFAULT_COLOR,
    pinned: true,
    mode: 'edit', // a brand new note opens ready to type
    bounds: null,
    visible: true,
    createdAt: Date.now(),
    ...given,
  };
  data.notes.push(note);
  save();
  return note;
}

function update(id, patch) {
  const note = get(id);
  if (!note) return null;
  Object.assign(note, patch);
  save();
  return note;
}

function remove(id) {
  const i = data.notes.findIndex((n) => n.id === id);
  if (i !== -1) data.notes.splice(i, 1);
  save();
}

// Window state that belongs to the app rather than to any one note.
function ui(key) {
  return data.ui ? data.ui[key] : undefined;
}

function setUi(key, value) {
  if (!data.ui) data.ui = {};
  data.ui[key] = value;
  save();
}

module.exports = {
  load, all, get, create, update, remove, save, saveNow, notesPath, ui, setUi,
};

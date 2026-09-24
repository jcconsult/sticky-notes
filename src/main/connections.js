/* Calendar links, kept apart from the notes.
 *
 * A Google "secret address" or a published Outlook link is a credential:
 * anyone holding it can read the calendar. So links live in their own file,
 * never in notes.json (which people copy between machines), encrypted with
 * Electron's safeStorage — Windows DPAPI, tied to this Windows account. The
 * renderer only ever sees a label and the host.
 *
 * safeStorage works only after the app is ready; every function here is
 * called from IPC handlers or widget refreshes, which are all later.
 */
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

let file = null;
let data = null;

function connectionsPath() {
  if (!file) file = path.join(app.getPath('userData'), 'connections.json');
  return file;
}

function load() {
  if (data) return data;
  try {
    const parsed = JSON.parse(fs.readFileSync(connectionsPath(), 'utf8').replace(/^﻿/, ''));
    data = { calendars: Array.isArray(parsed.calendars) ? parsed.calendars : [] };
  } catch {
    data = { calendars: [] };
  }
  return data;
}

function save() {
  const target = connectionsPath();
  const tmp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

// Calendar apps hand out webcal:// links; they are plain HTTPS underneath.
function normalise(input) {
  const text = String(input || '').trim().replace(/^webcal:\/\//i, 'https://');
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  return url.protocol === 'https:' ? url : null;
}

function labelFor(host) {
  if (/(^|\.)google\.com$/i.test(host)) return 'Google Calendar';
  if (/(^|\.)(outlook\.office365\.com|outlook\.office\.com|outlook\.live\.com)$/i.test(host)) return 'Outlook';
  return host;
}

// What the renderer may see: no URL, no path, no token.
function list() {
  return load().calendars.map(({ id, label, host }) => ({ id, label, host }));
}

const INVALID = 'That doesn’t look like a calendar link. It should start with https:// or webcal://.';

/** @returns {{ ok: boolean, error?: string }} */
function addCalendar(input) {
  const url = normalise(input);
  if (!url) return { ok: false, error: INVALID };
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'Windows can’t encrypt the link on this account, so it was not saved.' };
  }
  const calendars = load().calendars;
  const secret = safeStorage.encryptString(url.href).toString('base64');
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  calendars.push({ id, label: labelFor(url.hostname), host: url.hostname, secret });
  save();
  return { ok: true };
}

function removeCalendar(id) {
  const d = load();
  d.calendars = d.calendars.filter((c) => c.id !== id);
  save();
}

// Main process only. A link encrypted on another machine or account cannot
// be read here; it is skipped and reported, not fatal.
function calendarUrls() {
  const urls = [];
  let unreadable = 0;
  for (const c of load().calendars) {
    try {
      urls.push({ label: c.label, url: safeStorage.decryptString(Buffer.from(c.secret, 'base64')) });
    } catch {
      unreadable += 1;
    }
  }
  return { urls, unreadable };
}

module.exports = { list, addCalendar, removeCalendar, calendarUrls, normalise, INVALID };

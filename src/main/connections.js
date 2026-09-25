/* Connections: the accounts extensions contribute — calendar links, API keys.
 *
 * One store for every connection type, kept apart from the notes. Fields an
 * extension marks `secret` (a calendar's secret address, an API key) are
 * credentials, so they are encrypted with Electron's safeStorage (Windows
 * DPAPI, tied to this Windows account) and live in connections.json — never
 * in notes.json, which people copy between machines. The renderer only ever
 * sees a label, a detail line and whether the connection is working.
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

function encrypt(values) {
  return safeStorage.encryptString(JSON.stringify(values)).toString('base64');
}

function decrypt(secret) {
  return JSON.parse(safeStorage.decryptString(Buffer.from(secret, 'base64')));
}

function load() {
  if (data) return data;
  try {
    const parsed = JSON.parse(fs.readFileSync(connectionsPath(), 'utf8').replace(/^﻿/, ''));
    data = { version: 2, connections: Array.isArray(parsed.connections) ? parsed.connections : [] };
  } catch {
    data = { version: 2, connections: [] };
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

// What the renderer may see: no secret, no link, no token.
function list(type) {
  return load().connections
    .filter((c) => !type || c.type === type)
    .map(({ id, type: kind, label, detail, health }) => ({ id, type: kind, label, detail, health }));
}

const exists = (id) => load().connections.some((c) => c.id === id);

/**
 * @param {string} type
 * @param {object} secretValues  encrypted at rest
 * @param {object} publicValues  stored as-is
 * @param {{label: string, detail?: string}} names
 */
function add(type, secretValues, publicValues, names) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows can’t encrypt secrets on this account, so nothing was saved.');
  }
  const id = `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  load().connections.push({
    id, type,
    label: names.label,
    detail: names.detail || '',
    secret: encrypt(secretValues),
    public: publicValues,
    health: { ok: true, message: null, at: Date.now() },
  });
  save();
  return id;
}

function remove(id) {
  const d = load();
  d.connections = d.connections.filter((c) => c.id !== id);
  save();
}

// Main process only: a type's connections with their values decrypted. One
// encrypted on another machine or account can't be read here; it is marked
// unhealthy and skipped, not fatal.
function values(type) {
  const out = [];
  for (const c of load().connections.filter((x) => x.type === type)) {
    try {
      out.push({ id: c.id, label: c.label, values: { ...c.public, ...decrypt(c.secret) } });
    } catch {
      report(c.id, 'saved on another PC — remove it and add it again');
    }
  }
  return out;
}

// Health is whatever the last use found. Written only when it changes, so a
// working calendar refreshing every five minutes never touches the disk.
function report(id, error) {
  const c = load().connections.find((x) => x.id === id);
  if (!c) return;
  const ok = !error;
  if (c.health && c.health.ok === ok && c.health.message === (error || null)) return;
  c.health = { ok, message: error || null, at: Date.now() };
  save();
}

module.exports = { list, exists, add, remove, values, report };

const { contextBridge, ipcRenderer } = require('electron');

// A widget window renders text other people wrote (calendar invites), so it
// runs sandboxed like a note — and gets less than a note does: there is no
// way to write its content, only to change its colour and settings.
contextBridge.exposeInMainWorld('widget', {
  get: () => ipcRenderer.invoke('widget:get'),
  setSettings: (patch) => ipcRenderer.invoke('widget:setSettings', patch),
  refresh: () => ipcRenderer.invoke('widget:refresh'),
  action: (id) => ipcRenderer.invoke('widget:action', id),
  menu: () => ipcRenderer.invoke('widget:menu'),
  setColor: (color) => ipcRenderer.invoke('note:update', { color }),
  setPinned: (pinned) => ipcRenderer.invoke('note:setPinned', pinned),
  create: () => ipcRenderer.invoke('note:new'),
  hide: () => ipcRenderer.invoke('note:hide'),
  onUpdate: (cb) => ipcRenderer.on('widget:update', (_e, payload) => cb(payload)),
  onSettings: (cb) => ipcRenderer.on('widget:showSettings', () => cb()),
  onTheme: (cb) => ipcRenderer.on('theme', (_e, theme) => cb(theme)),
});

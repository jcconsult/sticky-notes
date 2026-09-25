const { contextBridge, ipcRenderer } = require('electron');

// A widget window renders text other people wrote (calendar invites), so it
// runs sandboxed like a note — and gets less than a note does: there is no
// way to write its content, only to change its colour, title and settings.
contextBridge.exposeInMainWorld('widget', {
  get: () => ipcRenderer.invoke('widget:get'),
  form: () => ipcRenderer.invoke('widget:form'),
  setSettings: (patch) => ipcRenderer.invoke('widget:setSettings', patch),
  refresh: () => ipcRenderer.invoke('widget:refresh'),
  action: (id) => ipcRenderer.invoke('widget:action', id),
  manage: (type) => ipcRenderer.invoke('widget:manage', type),
  menu: () => ipcRenderer.invoke('widget:menu'),
  addMenu: () => ipcRenderer.invoke('note:addMenu'),
  setColor: (color) => ipcRenderer.invoke('note:update', { color }),
  setTitle: (title) => ipcRenderer.invoke('note:update', { title }),
  setPinned: (pinned) => ipcRenderer.invoke('note:setPinned', pinned),
  create: () => ipcRenderer.invoke('note:new'),
  hide: () => ipcRenderer.invoke('note:hide'),
  onUpdate: (cb) => ipcRenderer.on('widget:update', (_e, payload) => cb(payload)),
  onSettings: (cb) => ipcRenderer.on('widget:showSettings', () => cb()),
  onFormChanged: (cb) => ipcRenderer.on('widget:formChanged', () => cb()),
  onTitleEdit: (cb) => ipcRenderer.on('title:edit', () => cb()),
  onTheme: (cb) => ipcRenderer.on('theme', (_e, theme) => cb(theme)),
});

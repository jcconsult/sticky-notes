const { contextBridge, ipcRenderer } = require('electron');

// The renderer handles pasted content from arbitrary sources, so it runs
// sandboxed with no Node access. This is the entire surface it gets.
contextBridge.exposeInMainWorld('notes', {
  get: () => ipcRenderer.invoke('note:get'),
  update: (patch) => ipcRenderer.invoke('note:update', patch),
  setPinned: (pinned) => ipcRenderer.invoke('note:setPinned', pinned),
  create: () => ipcRenderer.invoke('note:new'),
  addMenu: () => ipcRenderer.invoke('note:addMenu'),
  onTitleEdit: (cb) => ipcRenderer.on('title:edit', () => cb()),
  hide: () => ipcRenderer.invoke('note:hide'),
  menu: () => ipcRenderer.invoke('note:menu'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onTheme: (cb) => ipcRenderer.on('theme', (_e, theme) => cb(theme)),
});

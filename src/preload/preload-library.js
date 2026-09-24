const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('library', {
  list: () => ipcRenderer.invoke('library:list'),
  open: (id) => ipcRenderer.invoke('library:open', id),
  toggleVisible: (id) => ipcRenderer.invoke('library:toggleVisible', id),
  remove: (id) => ipcRenderer.invoke('library:delete', id),
  create: () => ipcRenderer.invoke('library:new'),
  newWidget: () => ipcRenderer.invoke('library:newWidget'),
  calendars: () => ipcRenderer.invoke('connections:list'),
  addCalendar: (url) => ipcRenderer.invoke('connections:add', url),
  removeCalendar: (id) => ipcRenderer.invoke('connections:remove', id),
  onShowConnections: (cb) => ipcRenderer.on('library:showConnections', () => cb()),
  minimise: () => ipcRenderer.invoke('library:minimise'),
  close: () => ipcRenderer.invoke('library:close'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  recording: (on) => ipcRenderer.invoke('settings:recording', !!on),
  onChange: (cb) => ipcRenderer.on('library:changed', (_e, notes) => cb(notes)),
  onTheme: (cb) => ipcRenderer.on('library:theme', (_e, theme) => cb(theme)),
});

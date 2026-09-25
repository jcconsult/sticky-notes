const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('library', {
  list: () => ipcRenderer.invoke('library:list'),
  open: (id) => ipcRenderer.invoke('library:open', id),
  toggleVisible: (id) => ipcRenderer.invoke('library:toggleVisible', id),
  remove: (id) => ipcRenderer.invoke('library:delete', id),
  create: () => ipcRenderer.invoke('library:new'),
  newWidget: () => ipcRenderer.invoke('library:newWidget'),
  connections: () => ipcRenderer.invoke('connections:state'),
  addConnection: (type, values) => ipcRenderer.invoke('connections:add', type, values),
  removeConnection: (id) => ipcRenderer.invoke('connections:remove', id),
  onShowConnections: (cb) => ipcRenderer.on('library:showConnections', (_e, type) => cb(type)),
  minimise: () => ipcRenderer.invoke('library:minimise'),
  close: () => ipcRenderer.invoke('library:close'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  recording: (on) => ipcRenderer.invoke('settings:recording', !!on),
  onChange: (cb) => ipcRenderer.on('library:changed', (_e, notes) => cb(notes)),
  onTheme: (cb) => ipcRenderer.on('library:theme', (_e, theme) => cb(theme)),
});

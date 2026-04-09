import { contextBridge, ipcRenderer } from 'electron'

const api = {
  mods: {
    getAll: () => ipcRenderer.invoke('mods:getAll'),
    get: (identifier: string) => ipcRenderer.invoke('mods:get', identifier),
    search: (query: string) => ipcRenderer.invoke('mods:search', query),
    getVersions: (identifier: string) => ipcRenderer.invoke('mods:getVersions', identifier),
    getCount: () => ipcRenderer.invoke('mods:getCount'),
  },
  spacedock: {
    fetch: (identifier: string) => ipcRenderer.invoke('spacedock:fetch', identifier),
  },
  resolver: {
    resolve: (identifiers: string[], kspVersion: string, profileId?: string) =>
      ipcRenderer.invoke('resolver:resolve', identifiers, kspVersion, profileId),
  },
  installer: {
    install: (item: any, kspPath: string, profileId: string) =>
      ipcRenderer.invoke('installer:install', item, kspPath, profileId),
    uninstall: (profileId: string, identifier: string, kspPath: string) =>
      ipcRenderer.invoke('installer:uninstall', profileId, identifier, kspPath),
  },
  profiles: {
    getAll: () => ipcRenderer.invoke('profiles:getAll'),
    get: (id: string) => ipcRenderer.invoke('profiles:get', id),
    create: (name: string, kspPath: string) => ipcRenderer.invoke('profiles:create', name, kspPath),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
    clone: (sourceId: string, newName: string) => ipcRenderer.invoke('profiles:clone', sourceId, newName),
    export: (profileId: string) => ipcRenderer.invoke('profiles:export', profileId),
    validatePath: (kspPath: string) => ipcRenderer.invoke('profiles:validatePath', kspPath),
    getInstalled: (profileId: string) => ipcRenderer.invoke('profiles:getInstalled', profileId),
    autoDetect: () => ipcRenderer.invoke('profiles:autoDetect') as Promise<{ path: string; source: string; version: string }[]>,
  },
  meta: {
    sync: () => ipcRenderer.invoke('meta:sync'),
    getLastSync: () => ipcRenderer.invoke('meta:getLastSync'),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },
}

export type ElectronAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electronAPI = api
}

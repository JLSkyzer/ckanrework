import { contextBridge, ipcRenderer } from 'electron'

const api = {
  mods: {
    getAll: () => ipcRenderer.invoke('mods:getAll'),
    get: (identifier: string) => ipcRenderer.invoke('mods:get', identifier),
    search: (query: string) => ipcRenderer.invoke('mods:search', query),
    getVersions: (identifier: string) => ipcRenderer.invoke('mods:getVersions', identifier),
    getCount: () => ipcRenderer.invoke('mods:getCount'),
    kspVersions: () => ipcRenderer.invoke('mods:kspVersions') as Promise<string[]>,
  },
  spacedock: {
    fetch: (identifier: string) => ipcRenderer.invoke('spacedock:fetch', identifier),
    fetchBatch: (identifiers: string[]) => ipcRenderer.invoke('spacedock:fetchBatch', identifiers) as Promise<Record<string, any>>,
    getCachedImageUrl: (identifier: string) => ipcRenderer.invoke('spacedock:getCachedImageUrl', identifier) as Promise<string | null>,
  },
  images: {
    scrape: (identifier: string) => ipcRenderer.invoke('images:scrape', identifier) as Promise<string[]>,
    forumDescription: (identifier: string) => ipcRenderer.invoke('images:forumDescription', identifier) as Promise<string | null>,
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
    onProgress: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('installer:progress', handler)
      return () => ipcRenderer.removeListener('installer:progress', handler)
    },
  },
  profiles: {
    getAll: () => ipcRenderer.invoke('profiles:getAll'),
    get: (id: string) => ipcRenderer.invoke('profiles:get', id),
    create: (name: string, kspPath: string) => ipcRenderer.invoke('profiles:create', name, kspPath),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
    clone: (sourceId: string, newName: string) => ipcRenderer.invoke('profiles:clone', sourceId, newName),
    export: (profileId: string) => ipcRenderer.invoke('profiles:export', profileId),
    exportToFile: (profileId: string) => ipcRenderer.invoke('profiles:exportToFile', profileId) as Promise<{ success: boolean; path?: string }>,
    importFromFile: () => ipcRenderer.invoke('profiles:importFromFile') as Promise<{ name: string; ksp_version: string; mods: Array<{ identifier: string; version: string }> } | null>,
    validatePath: (kspPath: string) => ipcRenderer.invoke('profiles:validatePath', kspPath),
    getInstalled: (profileId: string) => ipcRenderer.invoke('profiles:getInstalled', profileId),
    autoDetect: () => ipcRenderer.invoke('profiles:autoDetect') as Promise<{ path: string; source: string; version: string }[]>,
    scanInstalled: (profileId: string) => ipcRenderer.invoke('profiles:scanInstalled', profileId) as Promise<{ found: number; mods: string[] }>,
    switch: (fromId: string, toId: string) => ipcRenderer.invoke('profiles:switch', fromId, toId) as Promise<{ removed: string[]; restored: string[]; needsDownload: string[] }>,
  },
  modCache: {
    getSize: () => ipcRenderer.invoke('modcache:getSize') as Promise<number>,
    clear: () => ipcRenderer.invoke('modcache:clear') as Promise<{ success: boolean }>,
  },
  meta: {
    sync: () => ipcRenderer.invoke('meta:sync'),
    getLastSync: () => ipcRenderer.invoke('meta:getLastSync'),
    resetAll: () => ipcRenderer.invoke('meta:resetAll'),
    onSyncProgress: (callback: (data: { current: number; total: number; phase: string }) => void) => {
      const handler = (_event: any, data: { current: number; total: number; phase: string }) => callback(data)
      ipcRenderer.on('meta:sync-progress', handler)
      return () => ipcRenderer.removeListener('meta:sync-progress', handler)
    },
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

import { create } from 'zustand'
import { api } from '../lib/ipc'
import type { ModRow, ModVersionRow, SpaceDockCacheRow } from '../../electron/types'

interface ModState {
  mods: ModRow[]
  modCount: number
  loading: boolean
  syncing: boolean
  syncStatus: string
  syncProgress: number
  syncError: string | null
  spacedockCache: Map<string, SpaceDockCacheRow>

  kspVersions: string[]
  fetchMods: () => Promise<void>
  searchMods: (query: string) => Promise<void>
  fetchSpaceDockData: (identifier: string) => Promise<SpaceDockCacheRow | null>
  fetchSpaceDockBatch: (identifiers: string[]) => Promise<void>
  fetchModVersions: (identifier: string) => Promise<ModVersionRow[]>
  fetchKspVersions: () => Promise<void>
  syncMeta: () => Promise<void>
  syncIfNeeded: () => Promise<void>
  retrySyncIfNeeded: () => Promise<void>
}

export const useModStore = create<ModState>((set, get) => ({
  mods: [],
  modCount: 0,
  loading: false,
  syncing: false,
  syncStatus: '',
  syncProgress: 0,
  syncError: null,
  kspVersions: [],
  spacedockCache: new Map(),

  fetchMods: async () => {
    set({ loading: true })
    try {
      const [mods, modCount] = await Promise.all([
        api.mods.getAll(),
        api.mods.getCount(),
      ])
      set({ mods: mods ?? [], modCount: modCount ?? 0 })
    } finally {
      set({ loading: false })
    }
  },

  searchMods: async (query) => {
    set({ loading: true })
    try {
      const mods = await api.mods.search(query)
      set({ mods: mods ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  fetchSpaceDockData: async (identifier) => {
    const { spacedockCache } = get()
    if (spacedockCache.has(identifier)) {
      return spacedockCache.get(identifier) ?? null
    }
    try {
      const data: SpaceDockCacheRow | null = await api.spacedock.fetch(identifier)
      if (data) {
        set((state) => {
          const next = new Map(state.spacedockCache)
          next.set(identifier, data)
          return { spacedockCache: next }
        })
      }
      return data
    } catch {
      return null
    }
  },

  fetchSpaceDockBatch: async (identifiers: string[]) => {
    // Filter out already cached
    const { spacedockCache } = get()
    const toFetch = identifiers.filter(id => !spacedockCache.has(id))
    if (toFetch.length === 0) return

    try {
      const results = await api.spacedock.fetchBatch(toFetch)
      set((state) => {
        const next = new Map(state.spacedockCache)
        for (const [k, v] of Object.entries(results)) {
          next.set(k, v as SpaceDockCacheRow)
        }
        return { spacedockCache: next }
      })
    } catch { /* ignore */ }
  },

  fetchModVersions: async (identifier) => {
    try {
      const versions: ModVersionRow[] = await api.mods.getVersions(identifier)
      return versions ?? []
    } catch {
      return []
    }
  },

  syncMeta: async () => {
    set({ syncing: true, syncStatus: 'Downloading CKAN mod registry...', syncProgress: 0, syncError: null })

    // Listen for progress updates from main process
    const cleanup = api.meta.onSyncProgress(({ current, total, phase }) => {
      const progress = total > 0 ? Math.round((current / total) * 100) : 0
      const status = phase === 'downloading'
        ? 'Downloading CKAN mod registry...'
        : `Indexing mods... ${current} / ${total}`
      set({ syncStatus: status, syncProgress: progress })
    })

    try {
      await api.meta.sync()
      await get().fetchMods()
      set({ syncStatus: '', syncProgress: 100 })
    } catch (err: any) {
      const message = err?.message ?? 'Unknown error during sync'
      console.error('[mod-store] syncMeta failed:', err)
      set({ syncError: message, syncStatus: '' })
    } finally {
      cleanup()
      set({ syncing: false })
    }
  },

  fetchKspVersions: async () => {
    try {
      const versions = await api.mods.kspVersions()
      set({ kspVersions: versions ?? [] })
    } catch { /* ignore */ }
  },

  syncIfNeeded: async () => {
    try {
      const count = await api.mods.getCount()
      if (count === 0) {
        await get().syncMeta()
      } else {
        await get().fetchMods()
      }
      await get().fetchKspVersions()
    } catch (err: any) {
      const message = err?.message ?? 'Unknown error'
      console.error('[mod-store] syncIfNeeded failed:', err)
      set({ syncError: message, syncing: false })
    }
  },

  retrySyncIfNeeded: async () => {
    set({ syncError: null })
    await get().syncIfNeeded()
  },
}))

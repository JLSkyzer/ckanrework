import { create } from 'zustand'
import { api } from '../lib/ipc'
import type { ModRow, ModVersionRow, SpaceDockCacheRow } from '../../electron/types'

interface ModState {
  mods: ModRow[]
  modCount: number
  loading: boolean
  spacedockCache: Map<string, SpaceDockCacheRow>

  fetchMods: () => Promise<void>
  searchMods: (query: string) => Promise<void>
  fetchSpaceDockData: (identifier: string) => Promise<SpaceDockCacheRow | null>
  fetchModVersions: (identifier: string) => Promise<ModVersionRow[]>
  syncMeta: () => Promise<void>
}

export const useModStore = create<ModState>((set, get) => ({
  mods: [],
  modCount: 0,
  loading: false,
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

  fetchModVersions: async (identifier) => {
    try {
      const versions: ModVersionRow[] = await api.mods.getVersions(identifier)
      return versions ?? []
    } catch {
      return []
    }
  },

  syncMeta: async () => {
    set({ loading: true })
    try {
      await api.meta.sync()
      await get().fetchMods()
    } finally {
      set({ loading: false })
    }
  },
}))

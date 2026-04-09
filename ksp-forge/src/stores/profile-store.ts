import { create } from 'zustand'
import { api } from '../lib/ipc'
import type { ProfileRow, InstalledModRow } from '../../electron/types'

interface ProfileState {
  profiles: ProfileRow[]
  activeProfileId: string | null
  installedMods: InstalledModRow[]

  fetchProfiles: () => Promise<void>
  setActiveProfile: (id: string) => void
  createProfile: (name: string, kspPath: string) => Promise<ProfileRow | null>
  deleteProfile: (id: string) => Promise<void>
  cloneProfile: (sourceId: string, newName: string) => Promise<ProfileRow | null>
  fetchInstalledMods: (profileId: string) => Promise<void>
  getActiveProfile: () => ProfileRow | undefined
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  installedMods: [],

  fetchProfiles: async () => {
    try {
      const profiles: ProfileRow[] = await api.profiles.getAll()
      set((state) => ({
        profiles: profiles ?? [],
        activeProfileId:
          state.activeProfileId ??
          (profiles && profiles.length > 0 ? profiles[0].id : null),
      }))
    } catch {
      // silently ignore
    }
  },

  setActiveProfile: (id) => set({ activeProfileId: id }),

  createProfile: async (name, kspPath) => {
    try {
      const profile: ProfileRow = await api.profiles.create(name, kspPath)
      if (profile) {
        set((state) => ({ profiles: [...state.profiles, profile] }))
      }
      return profile ?? null
    } catch {
      return null
    }
  },

  deleteProfile: async (id) => {
    try {
      await api.profiles.delete(id)
      set((state) => ({
        profiles: state.profiles.filter((p) => p.id !== id),
        activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
      }))
    } catch {
      // silently ignore
    }
  },

  cloneProfile: async (sourceId, newName) => {
    try {
      const profile: ProfileRow = await api.profiles.clone(sourceId, newName)
      if (profile) {
        set((state) => ({ profiles: [...state.profiles, profile] }))
      }
      return profile ?? null
    } catch {
      return null
    }
  },

  fetchInstalledMods: async (profileId) => {
    try {
      const mods: InstalledModRow[] = await api.profiles.getInstalled(profileId)
      set({ installedMods: mods ?? [] })
    } catch {
      set({ installedMods: [] })
    }
  },

  getActiveProfile: () => {
    const { profiles, activeProfileId } = get()
    return profiles.find((p) => p.id === activeProfileId)
  },
}))

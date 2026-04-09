import { create } from 'zustand'
import { api } from '../lib/ipc'
import type { ProfileRow, InstalledModRow } from '../../electron/types'

export interface ProfileSwitchResult {
  removed: string[]
  restored: string[]
  needsDownload: string[]
}

interface ProfileState {
  profiles: ProfileRow[]
  activeProfileId: string | null
  installedMods: InstalledModRow[]
  switching: boolean
  switchResult: ProfileSwitchResult | null

  fetchProfiles: () => Promise<void>
  setActiveProfile: (id: string) => Promise<void>
  createProfile: (name: string, kspPath: string) => Promise<ProfileRow | null>
  deleteProfile: (id: string) => Promise<void>
  cloneProfile: (sourceId: string, newName: string) => Promise<ProfileRow | null>
  fetchInstalledMods: (profileId: string) => Promise<void>
  getActiveProfile: () => ProfileRow | undefined
  clearSwitchResult: () => void
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  installedMods: [],
  switching: false,
  switchResult: null,

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

  setActiveProfile: async (id) => {
    const { activeProfileId } = get()

    // If no previous profile or same profile, just set it
    if (!activeProfileId || activeProfileId === id) {
      set({ activeProfileId: id })
      return
    }

    set({ switching: true, switchResult: null })
    try {
      const result: ProfileSwitchResult = await api.profiles.switch(activeProfileId, id)
      set({ activeProfileId: id, switching: false, switchResult: result })

      // Auto-queue mods that need downloading
      if (result.needsDownload.length > 0) {
        // Dynamically import to avoid circular dependency
        const { useInstallStore } = await import('./install-store')
        useInstallStore.getState().requestInstall(result.needsDownload)
      }

      // Auto-clear switch result after 5 seconds
      setTimeout(() => {
        set((state) => {
          if (state.switchResult === result) return { switchResult: null }
          return {}
        })
      }, 5000)
    } catch {
      // If switch fails, still change the active profile ID
      set({ activeProfileId: id, switching: false })
    }
  },

  clearSwitchResult: () => set({ switchResult: null }),

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

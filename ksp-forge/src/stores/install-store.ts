import { create } from 'zustand'
import { api } from '../lib/ipc'
import { useProfileStore } from './profile-store'
import type { ResolutionResult, ResolvedMod } from '../../electron/services/resolver'

export interface InstallProgress {
  active: boolean
  current: number
  total: number
  currentName: string
  failed: string[]
}

interface InstallState {
  resolution: ResolutionResult | null
  showDialog: boolean
  installing: boolean
  progress: InstallProgress

  requestInstall: (identifiers: string[]) => Promise<void>
  confirmInstall: () => Promise<void>
  cancelInstall: () => void
}

export const useInstallStore = create<InstallState>((set, get) => ({
  resolution: null,
  showDialog: false,
  installing: false,
  progress: { active: false, current: 0, total: 0, currentName: '', failed: [] },

  requestInstall: async (identifiers: string[]) => {
    const profile = useProfileStore.getState().getActiveProfile()
    if (!profile) return

    try {
      const result: ResolutionResult = await api.resolver.resolve(
        identifiers,
        profile.ksp_version,
        profile.id,
      )
      set({ resolution: result, showDialog: true })
    } catch (err) {
      console.error('Resolution failed:', err)
    }
  },

  confirmInstall: async () => {
    const { resolution } = get()
    if (!resolution) return
    const profile = useProfileStore.getState().getActiveProfile()
    if (!profile) return

    const mods: ResolvedMod[] = resolution.toInstall
    set({
      installing: true,
      showDialog: false,
      progress: { active: true, current: 0, total: mods.length, currentName: '', failed: [] },
    })

    const failed: string[] = []

    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i]
      set(s => ({ progress: { ...s.progress, current: i, currentName: mod.identifier } }))
      try {
        await api.installer.install(mod, profile.ksp_path, profile.id)
      } catch (err) {
        console.error(`Failed to install ${mod.identifier}:`, err)
        failed.push(mod.identifier)
      }
    }

    set(s => ({ progress: { ...s.progress, current: mods.length, currentName: '', failed } }))
    await useProfileStore.getState().fetchInstalledMods(profile.id)

    setTimeout(() => {
      set({
        progress: { active: false, current: 0, total: 0, currentName: '', failed: [] },
        installing: false,
        resolution: null,
      })
    }, 3000)
  },

  cancelInstall: () => {
    set({ showDialog: false, resolution: null })
  },
}))

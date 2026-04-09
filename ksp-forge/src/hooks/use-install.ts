import { useState, useCallback } from 'react'
import { api } from '../lib/ipc'
import { useProfileStore } from '../stores/profile-store'
import type { ResolutionResult, ResolvedMod } from '../../electron/services/resolver'

export interface InstallProgress {
  current: number
  total: number
  currentName: string
}

export function useInstall() {
  const { activeProfileId, getActiveProfile, fetchInstalledMods } = useProfileStore()

  const [resolution, setResolution] = useState<ResolutionResult | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number; currentName: string }>({
    current: 0,
    total: 0,
    currentName: '',
  })

  const requestInstall = useCallback(
    async (identifiers: string[]) => {
      const profile = getActiveProfile()
      if (!profile) return

      try {
        const result: ResolutionResult = await api.resolver.resolve(
          identifiers,
          profile.ksp_version,
          profile.id,
        )
        setResolution(result)
        setShowDialog(true)
      } catch (err) {
        console.error('Resolution failed:', err)
      }
    },
    [getActiveProfile],
  )

  const confirmInstall = useCallback(async () => {
    if (!resolution || !activeProfileId) return
    const profile = getActiveProfile()
    if (!profile) return

    const mods: ResolvedMod[] = resolution.toInstall
    setInstalling(true)
    setShowDialog(false)
    setProgress({ current: 0, total: mods.length, currentName: '' })

    try {
      for (let i = 0; i < mods.length; i++) {
        const mod = mods[i]
        setProgress({ current: i, total: mods.length, currentName: mod.identifier })
        await api.installer.install(mod, profile.ksp_path, profile.id)
      }
      setProgress({ current: mods.length, total: mods.length, currentName: '' })
      await fetchInstalledMods(profile.id)
    } catch (err) {
      console.error('Install failed:', err)
    } finally {
      setInstalling(false)
      setResolution(null)
    }
  }, [resolution, activeProfileId, getActiveProfile, fetchInstalledMods])

  const cancelInstall = useCallback(() => {
    setShowDialog(false)
    setResolution(null)
  }, [])

  return {
    resolution,
    showDialog,
    installing,
    progress,
    requestInstall,
    confirmInstall,
    cancelInstall,
  }
}

import { useState, useCallback } from 'react'
import { api } from '../lib/ipc'
import { useProfileStore } from '../stores/profile-store'
import type { ResolutionResult, ResolvedMod } from '../../electron/services/resolver'

export interface InstallProgress {
  active: boolean
  current: number
  total: number
  currentName: string
  failed: string[]
}

export function useInstall() {
  const { activeProfileId, getActiveProfile, fetchInstalledMods } = useProfileStore()

  const [resolution, setResolution] = useState<ResolutionResult | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<InstallProgress>({
    active: false,
    current: 0,
    total: 0,
    currentName: '',
    failed: [],
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
    setProgress({ active: true, current: 0, total: mods.length, currentName: '', failed: [] })

    const failed: string[] = []

    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i]
      setProgress(p => ({ ...p, current: i, currentName: mod.identifier }))
      try {
        await api.installer.install(mod, profile.ksp_path, profile.id)
      } catch (err) {
        console.error(`Failed to install ${mod.identifier}:`, err)
        failed.push(mod.identifier)
      }
    }

    setProgress(p => ({ ...p, current: mods.length, currentName: '', failed }))
    await fetchInstalledMods(profile.id)

    // Keep overlay visible for 2s to show completion
    setTimeout(() => {
      setProgress({ active: false, current: 0, total: 0, currentName: '', failed: [] })
      setInstalling(false)
      setResolution(null)
    }, 2000)
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

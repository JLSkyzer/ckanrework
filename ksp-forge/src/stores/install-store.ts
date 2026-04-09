import { create } from 'zustand'
import { api } from '../lib/ipc'
import { useProfileStore } from './profile-store'
import type { ResolutionResult, ResolvedMod } from '../../electron/services/resolver'

export interface InstallProgress {
  active: boolean
  current: number
  total: number
  currentName: string
  currentStatus: string // 'downloading' | 'verifying' | 'extracting' | ''
  currentBytes: number
  currentTotalBytes: number | null
  failed: string[]
  queue: number
}

interface InstallState {
  resolution: ResolutionResult | null
  showDialog: boolean
  installing: boolean
  progress: InstallProgress
  _queue: ResolvedMod[][]
  _processing: boolean

  requestInstall: (identifiers: string[]) => Promise<void>
  confirmInstall: () => Promise<void>
  cancelInstall: () => void
}

export const useInstallStore = create<InstallState>((set, get) => ({
  resolution: null,
  showDialog: false,
  installing: false,
  progress: { active: false, current: 0, total: 0, currentName: '', currentStatus: '', currentBytes: 0, currentTotalBytes: null, failed: [], queue: 0 },
  _queue: [],
  _processing: false,

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
    const { resolution, _queue } = get()
    if (!resolution) return

    set({ showDialog: false })

    // Add to queue
    const newQueue = [..._queue, resolution.toInstall]
    set({ _queue: newQueue, resolution: null })

    // Process queue if not already processing
    processQueue()
  },

  cancelInstall: () => {
    set({ showDialog: false, resolution: null })
  },
}))

async function processQueue() {
  const state = useInstallStore.getState()
  if (state._processing) return

  useInstallStore.setState({ _processing: true })

  // Listen for per-mod download/extract progress from main process
  const cleanup = api.installer.onProgress((data: any) => {
    if (data.type === 'download-progress') {
      useInstallStore.setState(s => ({
        progress: { ...s.progress, currentStatus: 'downloading', currentBytes: data.downloaded, currentTotalBytes: data.total },
      }))
    } else if (data.type === 'status') {
      useInstallStore.setState(s => ({
        progress: { ...s.progress, currentStatus: data.status, currentBytes: 0, currentTotalBytes: null },
      }))
    }
  })

  while (true) {
    const { _queue } = useInstallStore.getState()
    if (_queue.length === 0) break

    const mods = _queue[0]
    const remaining = _queue.slice(1)
    useInstallStore.setState({
      _queue: remaining,
      installing: true,
      progress: { active: true, current: 0, total: mods.length, currentName: '', currentStatus: '', currentBytes: 0, currentTotalBytes: null, failed: [], queue: remaining.length },
    })

    const profile = useProfileStore.getState().getActiveProfile()
    if (!profile) break

    const failed: string[] = []

    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i]
      useInstallStore.setState(s => ({
        progress: { ...s.progress, current: i, currentName: mod.identifier, currentStatus: 'downloading', currentBytes: 0, currentTotalBytes: null, queue: s._queue.length },
      }))

      try {
        await api.installer.install(mod, profile.ksp_path, profile.id)
      } catch (err) {
        console.error(`Failed to install ${mod.identifier}:`, err)
        failed.push(mod.identifier)
      }
    }

    useInstallStore.setState(s => ({
      progress: { ...s.progress, current: mods.length, currentName: '', currentStatus: '', currentBytes: 0, currentTotalBytes: null, failed, queue: s._queue.length },
    }))

    await useProfileStore.getState().fetchInstalledMods(profile.id)
  }

  cleanup()

  // Done — show completion for 3s
  setTimeout(() => {
    useInstallStore.setState({
      progress: { active: false, current: 0, total: 0, currentName: '', currentStatus: '', currentBytes: 0, currentTotalBytes: null, failed: [], queue: 0 },
      installing: false,
      _processing: false,
    })
  }, 3000)
}

import { create } from 'zustand'
import { api } from '../lib/ipc'
import { useProfileStore } from './profile-store'
import { useUiStore } from './ui-store'
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

export interface InstallHistoryEntry {
  identifier: string
  status: 'completed' | 'failed'
  timestamp: number
}

const QUEUE_KEY = 'ksp-forge-install-queue'

function saveQueueToStorage(queue: ResolvedMod[][]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch { /* ignore */ }
}

function loadQueueFromStorage(): ResolvedMod[][] | null {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* ignore */ }
  return null
}

function clearQueueFromStorage() {
  try { localStorage.removeItem(QUEUE_KEY) } catch { /* ignore */ }
}

interface InstallState {
  resolution: ResolutionResult | null
  showDialog: boolean
  installing: boolean
  progress: InstallProgress
  _queue: ResolvedMod[][]
  _processing: boolean
  history: InstallHistoryEntry[]
  pendingRecovery: ResolvedMod[][] | null

  requestInstall: (identifiers: string[]) => Promise<void>
  confirmInstall: () => Promise<void>
  cancelInstall: () => void
  checkRecovery: () => void
  resumeRecovery: () => void
  dismissRecovery: () => void
}

export const useInstallStore = create<InstallState>((set, get) => ({
  resolution: null,
  showDialog: false,
  installing: false,
  progress: { active: false, current: 0, total: 0, currentName: '', currentStatus: '', currentBytes: 0, currentTotalBytes: null, failed: [], queue: 0 },
  _queue: [],
  _processing: false,
  history: [],
  pendingRecovery: null,

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
    saveQueueToStorage(newQueue)

    // Process queue if not already processing
    processQueue()
  },

  cancelInstall: () => {
    set({ showDialog: false, resolution: null })
  },

  checkRecovery: () => {
    const saved = loadQueueFromStorage()
    if (saved && saved.length > 0) {
      set({ pendingRecovery: saved })
    }
  },

  resumeRecovery: () => {
    const { pendingRecovery, _queue } = get()
    if (!pendingRecovery) return
    const newQueue = [..._queue, ...pendingRecovery]
    set({ _queue: newQueue, pendingRecovery: null })
    saveQueueToStorage(newQueue)
    processQueue()
  },

  dismissRecovery: () => {
    set({ pendingRecovery: null })
    clearQueueFromStorage()
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
    saveQueueToStorage(remaining)

    const profile = useProfileStore.getState().getActiveProfile()
    if (!profile) break

    const failed: string[] = []
    const concurrency = useUiStore.getState().concurrentDownloads || 1

    // Process mods in batches of N
    for (let i = 0; i < mods.length; i += concurrency) {
      const batch = mods.slice(i, i + concurrency)

      useInstallStore.setState(s => ({
        progress: { ...s.progress, current: i, currentName: batch.map(m => m.identifier).join(', '), currentStatus: 'downloading', currentBytes: 0, currentTotalBytes: null, queue: s._queue.length },
      }))

      const results = await Promise.allSettled(
        batch.map(mod =>
          api.installer.install(mod, profile.ksp_path, profile.id).then(() => mod.identifier)
        )
      )

      const now = Date.now()
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        const mod = batch[j]
        if (result.status === 'fulfilled') {
          useInstallStore.setState(s => ({
            history: [...s.history, { identifier: mod.identifier, status: 'completed', timestamp: now }],
          }))
        } else {
          console.error(`Failed to install ${mod.identifier}:`, result.reason)
          failed.push(mod.identifier)
          useInstallStore.setState(s => ({
            history: [...s.history, { identifier: mod.identifier, status: 'failed', timestamp: now }],
          }))
        }
      }
    }

    useInstallStore.setState(s => ({
      progress: { ...s.progress, current: mods.length, currentName: '', currentStatus: '', currentBytes: 0, currentTotalBytes: null, failed, queue: s._queue.length },
    }))

    await useProfileStore.getState().fetchInstalledMods(profile.id)
  }

  cleanup()
  clearQueueFromStorage()

  // Done — show completion for 3s
  setTimeout(() => {
    useInstallStore.setState({
      progress: { active: false, current: 0, total: 0, currentName: '', currentStatus: '', currentBytes: 0, currentTotalBytes: null, failed: [], queue: 0 },
      installing: false,
      _processing: false,
    })
  }, 3000)
}

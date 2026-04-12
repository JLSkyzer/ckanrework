import { create } from 'zustand'

export type ViewName = 'discover' | 'installed' | 'downloads' | 'profiles' | 'settings' | 'mod-detail'

interface FilterState {
  sortBy: 'name' | 'downloads' | 'updated'
  filterKspVersionMin: string
  filterKspVersionMax: string
  filterCompatibleOnly: boolean
  concurrentDownloads: number
}

const FILTERS_KEY = 'ksp-forge-filters'

function loadFilters(): FilterState {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { sortBy: 'downloads', filterKspVersionMin: '', filterKspVersionMax: '', filterCompatibleOnly: false, concurrentDownloads: 1 }
}

function saveFilters(f: FilterState) {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}

interface UiState extends FilterState {
  currentView: ViewName
  previousView: ViewName | null
  selectedModId: string | null
  searchQuery: string
  discoverScrollPosition: number

  setView: (view: ViewName) => void
  setSelectedMod: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sort: 'name' | 'downloads' | 'updated') => void
  setFilterKspVersionMin: (v: string) => void
  setFilterKspVersionMax: (v: string) => void
  setFilterCompatibleOnly: (v: boolean) => void
  setConcurrentDownloads: (n: number) => void
  resetFilters: () => void
  openModDetail: (id: string) => void
  goBack: () => void
  setDiscoverScrollPosition: (pos: number) => void
}

const savedFilters = loadFilters()

export const useUiStore = create<UiState>((set, get) => ({
  currentView: 'discover',
  previousView: null,
  selectedModId: null,
  searchQuery: '',
  discoverScrollPosition: 0,
  ...savedFilters,

  setView: (view) =>
    set((state) => ({
      currentView: view,
      previousView: state.currentView,
    })),

  setSelectedMod: (id) => set({ selectedModId: id }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSortBy: (sort) => {
    set({ sortBy: sort })
    const s = get()
    saveFilters({ sortBy: sort, filterKspVersionMin: s.filterKspVersionMin, filterKspVersionMax: s.filterKspVersionMax, filterCompatibleOnly: s.filterCompatibleOnly, concurrentDownloads: s.concurrentDownloads })
  },

  setFilterKspVersionMin: (v) => {
    set({ filterKspVersionMin: v })
    const s = get()
    saveFilters({ sortBy: s.sortBy, filterKspVersionMin: v, filterKspVersionMax: s.filterKspVersionMax, filterCompatibleOnly: s.filterCompatibleOnly, concurrentDownloads: s.concurrentDownloads })
  },

  setFilterKspVersionMax: (v) => {
    set({ filterKspVersionMax: v })
    const s = get()
    saveFilters({ sortBy: s.sortBy, filterKspVersionMin: s.filterKspVersionMin, filterKspVersionMax: v, filterCompatibleOnly: s.filterCompatibleOnly, concurrentDownloads: s.concurrentDownloads })
  },

  setFilterCompatibleOnly: (v) => {
    set({ filterCompatibleOnly: v })
    const s = get()
    saveFilters({ sortBy: s.sortBy, filterKspVersionMin: s.filterKspVersionMin, filterKspVersionMax: s.filterKspVersionMax, filterCompatibleOnly: v, concurrentDownloads: s.concurrentDownloads })
  },

  setConcurrentDownloads: (n) => {
    const clamped = Math.max(1, Math.min(5, n))
    set({ concurrentDownloads: clamped })
    const s = get()
    saveFilters({ sortBy: s.sortBy, filterKspVersionMin: s.filterKspVersionMin, filterKspVersionMax: s.filterKspVersionMax, filterCompatibleOnly: s.filterCompatibleOnly, concurrentDownloads: clamped })
  },

  resetFilters: () => {
    const defaults: FilterState = { sortBy: 'downloads', filterKspVersionMin: '', filterKspVersionMax: '', filterCompatibleOnly: false, concurrentDownloads: 1 }
    set({ searchQuery: '', ...defaults })
    saveFilters(defaults)
  },

  openModDetail: (id) =>
    set((state) => ({
      selectedModId: id,
      currentView: 'mod-detail',
      previousView: state.currentView,
    })),

  goBack: () => {
    const { previousView } = get()
    set({
      currentView: previousView ?? 'discover',
      previousView: null,
    })
  },

  setDiscoverScrollPosition: (pos) => set({ discoverScrollPosition: pos }),
}))

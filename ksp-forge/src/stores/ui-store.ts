import { create } from 'zustand'

export type ViewName = 'discover' | 'installed' | 'profiles' | 'settings' | 'mod-detail'

interface FilterState {
  sortBy: 'name' | 'downloads' | 'updated'
  filterKspVersionMin: string
  filterKspVersionMax: string
  filterCompatibleOnly: boolean
}

const FILTERS_KEY = 'ksp-forge-filters'

function loadFilters(): FilterState {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { sortBy: 'downloads', filterKspVersionMin: '', filterKspVersionMax: '', filterCompatibleOnly: false }
}

function saveFilters(f: FilterState) {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}

interface UiState extends FilterState {
  currentView: ViewName
  previousView: ViewName | null
  selectedModId: string | null
  searchQuery: string

  setView: (view: ViewName) => void
  setSelectedMod: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sort: 'name' | 'downloads' | 'updated') => void
  setFilterKspVersionMin: (v: string) => void
  setFilterKspVersionMax: (v: string) => void
  setFilterCompatibleOnly: (v: boolean) => void
  resetFilters: () => void
  openModDetail: (id: string) => void
  goBack: () => void
}

const savedFilters = loadFilters()

export const useUiStore = create<UiState>((set, get) => ({
  currentView: 'discover',
  previousView: null,
  selectedModId: null,
  searchQuery: '',
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
    saveFilters({ sortBy: sort, filterKspVersionMin: s.filterKspVersionMin, filterKspVersionMax: s.filterKspVersionMax, filterCompatibleOnly: s.filterCompatibleOnly })
  },

  setFilterKspVersionMin: (v) => {
    set({ filterKspVersionMin: v })
    const s = get()
    saveFilters({ sortBy: s.sortBy, filterKspVersionMin: v, filterKspVersionMax: s.filterKspVersionMax, filterCompatibleOnly: s.filterCompatibleOnly })
  },

  setFilterKspVersionMax: (v) => {
    set({ filterKspVersionMax: v })
    const s = get()
    saveFilters({ sortBy: s.sortBy, filterKspVersionMin: s.filterKspVersionMin, filterKspVersionMax: v, filterCompatibleOnly: s.filterCompatibleOnly })
  },

  setFilterCompatibleOnly: (v) => {
    set({ filterCompatibleOnly: v })
    const s = get()
    saveFilters({ sortBy: s.sortBy, filterKspVersionMin: s.filterKspVersionMin, filterKspVersionMax: s.filterKspVersionMax, filterCompatibleOnly: v })
  },

  resetFilters: () => {
    const defaults: FilterState = { sortBy: 'downloads', filterKspVersionMin: '', filterKspVersionMax: '', filterCompatibleOnly: false }
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
}))

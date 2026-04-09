import { create } from 'zustand'

export type ViewName = 'discover' | 'installed' | 'profiles' | 'settings' | 'mod-detail'

interface UiState {
  currentView: ViewName
  previousView: ViewName | null
  selectedModId: string | null
  searchQuery: string
  sortBy: 'name' | 'downloads' | 'updated'
  filterKspVersionMin: string
  filterKspVersionMax: string
  filterCompatibleOnly: boolean

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

export const useUiStore = create<UiState>((set, get) => ({
  currentView: 'discover',
  previousView: null,
  selectedModId: null,
  searchQuery: '',
  sortBy: 'downloads',
  filterKspVersionMin: '',
  filterKspVersionMax: '',
  filterCompatibleOnly: false,

  setView: (view) =>
    set((state) => ({
      currentView: view,
      previousView: state.currentView,
    })),

  setSelectedMod: (id) => set({ selectedModId: id }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSortBy: (sort) => set({ sortBy: sort }),

  setFilterKspVersionMin: (v) => set({ filterKspVersionMin: v }),
  setFilterKspVersionMax: (v) => set({ filterKspVersionMax: v }),
  setFilterCompatibleOnly: (v) => set({ filterCompatibleOnly: v }),
  resetFilters: () => set({ searchQuery: '', sortBy: 'downloads', filterKspVersionMin: '', filterKspVersionMax: '', filterCompatibleOnly: false }),

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

import { create } from 'zustand'

export type ViewName = 'discover' | 'installed' | 'profiles' | 'settings' | 'mod-detail'

interface UiState {
  currentView: ViewName
  previousView: ViewName | null
  selectedModId: string | null
  searchQuery: string
  sortBy: 'name' | 'downloads' | 'updated'
  filterKspVersion: string | null

  setView: (view: ViewName) => void
  setSelectedMod: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sort: 'name' | 'downloads' | 'updated') => void
  setFilterKspVersion: (version: string | null) => void
  openModDetail: (id: string) => void
  goBack: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  currentView: 'discover',
  previousView: null,
  selectedModId: null,
  searchQuery: '',
  sortBy: 'downloads',
  filterKspVersion: null,

  setView: (view) =>
    set((state) => ({
      currentView: view,
      previousView: state.currentView,
    })),

  setSelectedMod: (id) => set({ selectedModId: id }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSortBy: (sort) => set({ sortBy: sort }),

  setFilterKspVersion: (version) => set({ filterKspVersion: version }),

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

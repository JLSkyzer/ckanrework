import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../stores/ui-store'
import { useModStore } from '../../stores/mod-store'

const KSP_VERSIONS = [
  '1.12', '1.11', '1.10', '1.9', '1.8', '1.7', '1.6', '1.5', '1.4', '1.3', '1.2', '1.1', '1.0',
  '0.90', '0.25', '0.24', '0.23',
]

export function SearchBar() {
  const {
    searchQuery, sortBy, filterKspVersionMin, filterKspVersionMax,
    filterCompatibleOnly, setSearchQuery, setSortBy,
    setFilterKspVersionMin, setFilterKspVersionMax,
    setFilterCompatibleOnly, resetFilters,
  } = useUiStore()
  const { searchMods, fetchMods } = useModStore()

  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [showFilters, setShowFilters] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setLocalQuery(searchQuery) }, [searchQuery])

  const handleChange = (value: string) => {
    setLocalQuery(value)
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (value.trim()) searchMods(value.trim())
      else fetchMods()
    }, 300)
  }

  const activeFilterCount =
    (filterKspVersionMin ? 1 : 0) +
    (filterKspVersionMax ? 1 : 0) +
    (filterCompatibleOnly ? 1 : 0)

  return (
    <div className="border-b border-space-border bg-space-surface/50">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Search input */}
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-space-text-muted text-sm select-none">
            🔍
          </span>
          <input
            type="text"
            value={localQuery}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search mods..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-space-bg border border-space-border text-space-text placeholder:text-space-text-muted text-sm focus:outline-none focus:border-space-accent/50 transition-colors"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer flex-shrink-0 ${
            showFilters || activeFilterCount > 0
              ? 'bg-[rgba(99,102,241,0.15)] border-[rgba(99,102,241,0.3)] text-[#a78bfa]'
              : 'bg-space-bg border-space-border text-space-text-muted hover:border-space-accent/30'
          }`}
        >
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-[#6366f1] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort dropdown */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-space-bg border border-space-border text-space-text text-sm rounded-lg px-2 py-2 focus:outline-none focus:border-space-accent/50 cursor-pointer"
          >
            <option value="downloads">Most Downloaded</option>
            <option value="name">Name A-Z</option>
            <option value="updated">Recently Updated</option>
          </select>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="px-4 pb-3 flex items-center gap-4 flex-wrap">
          {/* KSP Version Range */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-space-text-muted">KSP Version:</span>
            <select
              value={filterKspVersionMin}
              onChange={(e) => setFilterKspVersionMin(e.target.value)}
              className="bg-space-bg border border-space-border text-space-text text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-space-accent/50 cursor-pointer"
            >
              <option value="">Min</option>
              {KSP_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <span className="text-xs text-space-text-muted">to</span>
            <select
              value={filterKspVersionMax}
              onChange={(e) => setFilterKspVersionMax(e.target.value)}
              className="bg-space-bg border border-space-border text-space-text text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-space-accent/50 cursor-pointer"
            >
              <option value="">Max</option>
              {KSP_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Compatible only toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterCompatibleOnly}
              onChange={(e) => setFilterCompatibleOnly(e.target.checked)}
              className="accent-[#6366f1] w-3.5 h-3.5"
            />
            <span className="text-xs text-space-text-secondary">Compatible with active profile only</span>
          </label>

          {/* Reset */}
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-xs text-[#ef4444] hover:text-[#f87171] transition-colors cursor-pointer ml-auto"
            >
              Reset filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

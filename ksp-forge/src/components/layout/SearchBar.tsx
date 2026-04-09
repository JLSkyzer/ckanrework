import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../stores/ui-store'
import { useModStore } from '../../stores/mod-store'

export function SearchBar() {
  const { searchQuery, sortBy, setSearchQuery, setSortBy } = useUiStore()
  const { searchMods, fetchMods } = useModStore()

  const [localQuery, setLocalQuery] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalQuery(searchQuery)
  }, [searchQuery])

  const handleChange = (value: string) => {
    setLocalQuery(value)
    setSearchQuery(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        searchMods(value.trim())
      } else {
        fetchMods()
      }
    }, 300)
  }

  const handleSortChange = (sort: 'name' | 'downloads' | 'updated') => {
    setSortBy(sort)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-space-border bg-space-surface/50">
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

      {/* Sort dropdown */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <label className="text-xs text-space-text-muted">Sort:</label>
        <select
          value={sortBy}
          onChange={(e) => handleSortChange(e.target.value as 'name' | 'downloads' | 'updated')}
          className="bg-space-bg border border-space-border text-space-text text-sm rounded-lg px-2 py-2 focus:outline-none focus:border-space-accent/50 cursor-pointer"
        >
          <option value="downloads">Downloads</option>
          <option value="name">Name</option>
          <option value="updated">Updated</option>
        </select>
      </div>
    </div>
  )
}

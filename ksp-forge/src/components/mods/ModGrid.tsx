import { useEffect } from 'react'
import { useModStore } from '../../stores/mod-store'
import { useProfileStore } from '../../stores/profile-store'
import { useUiStore } from '../../stores/ui-store'
import { SearchBar } from '../layout/SearchBar'
import { ModCard } from './ModCard'

interface ModGridProps {
  filter?: 'all' | 'installed'
}

export function ModGrid({ filter = 'all' }: ModGridProps) {
  const { mods, loading } = useModStore()
  const { installedMods, activeProfileId, fetchInstalledMods } = useProfileStore()
  const { currentView } = useUiStore()

  const isInstalledView = currentView === 'installed' || filter === 'installed'

  useEffect(() => {
    if (activeProfileId) {
      fetchInstalledMods(activeProfileId)
    }
  }, [activeProfileId])

  const installedSet = new Set(installedMods.map((m) => m.identifier))

  const displayedMods = isInstalledView
    ? mods.filter((m) => installedSet.has(m.identifier))
    : mods

  const title = isInstalledView ? 'Installed Mods' : 'Discover Mods'

  return (
    <div className="flex flex-col h-full">
      <SearchBar />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          {!loading && (
            <span className="text-sm text-[rgba(148,163,184,0.6)]">
              {displayedMods.length} mod{displayedMods.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-4xl mb-4">🚀</div>
              <p className="text-[rgba(99,102,241,0.9)] font-medium animate-pulse">
                Syncing mods...
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && displayedMods.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-4xl mb-4">{isInstalledView ? '📦' : '🔭'}</div>
              <p className="text-[rgba(148,163,184,0.7)] text-lg font-medium">
                {isInstalledView
                  ? 'No mods installed yet'
                  : 'No mods found'}
              </p>
              <p className="text-[rgba(100,116,139,0.7)] text-sm mt-1">
                {isInstalledView
                  ? 'Browse the Discover tab to find and install mods'
                  : 'Try adjusting your search query'}
              </p>
            </div>
          </div>
        )}

        {/* Mod grid */}
        {!loading && displayedMods.length > 0 && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
          >
            {displayedMods.map((mod) => (
              <ModCard
                key={mod.identifier}
                mod={mod}
                isInstalled={installedSet.has(mod.identifier)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useModStore } from '../../stores/mod-store'
import { useProfileStore } from '../../stores/profile-store'
import { useUiStore } from '../../stores/ui-store'
import { SearchBar } from '../layout/SearchBar'
import { ModCard } from './ModCard'

interface ModGridProps {
  filter?: 'all' | 'installed'
}

const CARD_MIN_WIDTH = 240
const CARD_HEIGHT = 230
const GAP = 16

export function ModGrid({ filter = 'all' }: ModGridProps) {
  const { mods, loading } = useModStore()
  const { installedMods, activeProfileId, fetchInstalledMods } = useProfileStore()
  const { currentView } = useUiStore()
  const parentRef = useRef<HTMLDivElement>(null)

  const isInstalledView = currentView === 'installed' || filter === 'installed'

  useEffect(() => {
    if (activeProfileId) {
      fetchInstalledMods(activeProfileId)
    }
  }, [activeProfileId])

  const installedSet = useMemo(
    () => new Set(installedMods.map((m) => m.identifier)),
    [installedMods]
  )

  const displayedMods = useMemo(
    () => isInstalledView ? mods.filter((m) => installedSet.has(m.identifier)) : mods,
    [mods, isInstalledView, installedSet]
  )

  // Calculate columns based on container width
  const containerWidth = parentRef.current?.clientWidth ?? 900
  const columns = Math.max(1, Math.floor((containerWidth + GAP) / (CARD_MIN_WIDTH + GAP)))
  const rowCount = Math.ceil(displayedMods.length / columns)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: 3,
  })

  const title = isInstalledView ? 'Installed Mods' : 'Discover Mods'

  return (
    <div className="flex flex-col h-full">
      <SearchBar />

      <div ref={parentRef} className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between sticky top-0 bg-[#0d0d1a] pt-4 pb-2 z-10">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          {!loading && (
            <span className="text-sm text-[rgba(148,163,184,0.6)]">
              {displayedMods.length} mod{displayedMods.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <p className="text-[rgba(99,102,241,0.9)] font-medium animate-pulse">Loading mods...</p>
          </div>
        )}

        {!loading && displayedMods.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <p className="text-[rgba(148,163,184,0.7)] text-lg font-medium">
                {isInstalledView ? 'No mods installed yet' : 'No mods found'}
              </p>
              <p className="text-[rgba(100,116,139,0.7)] text-sm mt-1">
                {isInstalledView
                  ? 'Browse the Discover tab to find and install mods'
                  : 'Try adjusting your search query'}
              </p>
            </div>
          </div>
        )}

        {!loading && displayedMods.length > 0 && (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * columns
              const rowMods = displayedMods.slice(startIndex, startIndex + columns)

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: CARD_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columns}, 1fr)`,
                    gap: `${GAP}px`,
                  }}
                >
                  {rowMods.map((mod) => (
                    <ModCard
                      key={mod.identifier}
                      mod={mod}
                      isInstalled={installedSet.has(mod.identifier)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

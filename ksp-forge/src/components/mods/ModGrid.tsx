import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useModStore } from '../../stores/mod-store'
import { useProfileStore } from '../../stores/profile-store'
import { useUiStore } from '../../stores/ui-store'
import { SearchBar } from '../layout/SearchBar'
import { ModCard } from './ModCard'
import { InstallDialog } from '../install/InstallDialog'
import { useInstall } from '../../hooks/use-install'

interface ModGridProps {
  filter?: 'all' | 'installed'
}

const CARD_HEIGHT = 220
const GAP = 16

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}

function getModKspVersion(mod: { ksp_version: string | null; ksp_version_min: string | null; ksp_version_max: string | null }): string {
  return mod.ksp_version || mod.ksp_version_min || mod.ksp_version_max || ''
}

export function ModGrid({ filter = 'all' }: ModGridProps) {
  const { mods, loading, fetchSpaceDockBatch, spacedockCache } = useModStore()
  const { installedMods, activeProfileId, fetchInstalledMods } = useProfileStore()
  const { currentView, filterKspVersionMin, filterKspVersionMax, filterCompatibleOnly } = useUiStore()
  const { getActiveProfile } = useProfileStore()
  const { resolution, showDialog, installing, confirmInstall, cancelInstall, requestInstall } = useInstall()
  const parentRef = useRef<HTMLDivElement>(null)

  const handleCardInstall = useCallback((identifier: string) => {
    requestInstall([identifier])
  }, [requestInstall])

  const isInstalledView = currentView === 'installed' || filter === 'installed'

  useEffect(() => {
    if (activeProfileId) fetchInstalledMods(activeProfileId)
  }, [activeProfileId])

  const installedSet = useMemo(
    () => new Set(installedMods.map((m) => m.identifier)),
    [installedMods]
  )

  const displayedMods = useMemo(() => {
    let result = isInstalledView
      ? mods.filter((m) => installedSet.has(m.identifier))
      : mods.filter((m) => !installedSet.has(m.identifier)) // hide installed from Discover

    // KSP version range filter
    if (filterKspVersionMin) {
      result = result.filter((m) => {
        const v = getModKspVersion(m)
        if (!v) return true // show mods with no version info
        return compareVersions(v, filterKspVersionMin) >= 0
      })
    }
    if (filterKspVersionMax) {
      result = result.filter((m) => {
        const v = getModKspVersion(m)
        if (!v) return true
        return compareVersions(v, filterKspVersionMax) <= 0
      })
    }

    // Compatible with active profile
    if (filterCompatibleOnly) {
      const profile = getActiveProfile()
      if (profile && profile.ksp_version !== 'unknown') {
        const pv = profile.ksp_version
        result = result.filter((m) => {
          if (!m.ksp_version && !m.ksp_version_min && !m.ksp_version_max) return true
          if (m.ksp_version === 'any') return true
          if (m.ksp_version) {
            // Match major.minor
            const modParts = m.ksp_version.split('.')
            const profParts = pv.split('.')
            return modParts[0] === profParts[0] && modParts[1] === profParts[1]
          }
          if (m.ksp_version_min && compareVersions(pv, m.ksp_version_min) < 0) return false
          if (m.ksp_version_max && compareVersions(pv, m.ksp_version_max) > 0) return false
          return true
        })
      }
    }

    return result
  }, [mods, isInstalledView, installedSet, filterKspVersionMin, filterKspVersionMax, filterCompatibleOnly])

  const containerWidth = parentRef.current?.clientWidth ?? 900
  const columns = Math.max(1, Math.floor((containerWidth + GAP) / (240 + GAP)))
  const rowCount = Math.ceil(displayedMods.length / columns)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: 3,
  })

  // Batch-prefetch SpaceDock data for visible cards
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibleItems = virtualizer.getVirtualItems()

  useEffect(() => {
    if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current)
    prefetchTimeoutRef.current = setTimeout(() => {
      const ids: string[] = []
      for (const row of visibleItems) {
        const start = row.index * columns
        const rowMods = displayedMods.slice(start, start + columns)
        for (const m of rowMods) {
          if (m.spacedock_id && !spacedockCache.has(m.identifier)) {
            ids.push(m.identifier)
          }
        }
      }
      if (ids.length > 0) fetchSpaceDockBatch(ids)
    }, 150) // debounce scroll
  }, [visibleItems.length > 0 ? visibleItems[0]?.index : -1, columns])

  const title = isInstalledView ? 'Installed Mods' : 'Discover Mods'

  return (
    <div className="flex flex-col h-full">
      <SearchBar />

      <div ref={parentRef} className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="mb-4 flex items-center justify-between pt-4">
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
          <div className="flex items-center justify-center py-20 text-center">
            <div>
              <p className="text-[rgba(148,163,184,0.7)] text-lg font-medium">
                {isInstalledView ? 'No mods installed yet' : 'No mods found'}
              </p>
              <p className="text-[rgba(100,116,139,0.7)] text-sm mt-1">
                {isInstalledView ? 'Browse the Discover tab to find and install mods' : 'Try adjusting your search or filters'}
              </p>
            </div>
          </div>
        )}

        {!loading && displayedMods.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
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
                    <ModCard key={mod.identifier} mod={mod} isInstalled={installedSet.has(mod.identifier)} onInstall={handleCardInstall} />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showDialog && resolution && (
        <InstallDialog resolution={resolution} installing={installing} onConfirm={confirmInstall} onCancel={cancelInstall} />
      )}
    </div>
  )
}

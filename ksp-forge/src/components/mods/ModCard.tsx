import { useEffect, useState } from 'react'
import type { ModRow, SpaceDockCacheRow } from '../../../electron/types'
import { useModStore } from '../../stores/mod-store'
import { useUiStore } from '../../stores/ui-store'
import { formatDownloads } from '../../lib/format'

interface ModCardProps {
  mod: ModRow
  isInstalled: boolean
}

export function ModCard({ mod, isInstalled }: ModCardProps) {
  const { fetchSpaceDockData } = useModStore()
  const { openModDetail } = useUiStore()
  const [sdData, setSdData] = useState<SpaceDockCacheRow | null>(null)

  useEffect(() => {
    if (mod.spacedock_id) {
      fetchSpaceDockData(mod.identifier).then(setSdData)
    }
  }, [mod.identifier, mod.spacedock_id])

  const bannerUrl = sdData?.background_url ?? null
  const downloads = sdData?.downloads ?? null
  const abstract = mod.abstract ?? 'No description available.'

  const authorList = Array.isArray(mod.author) ? mod.author.join(', ') : mod.author

  return (
    <div
      onClick={() => openModDetail(mod.identifier)}
      className="
        group relative flex flex-col rounded-xl overflow-hidden cursor-pointer
        bg-[rgba(255,255,255,0.03)]
        border border-[rgba(99,102,241,0.1)]
        transition-all duration-200
        hover:scale-[1.02] hover:border-[rgba(99,102,241,0.3)]
        hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]
      "
    >
      {/* Banner */}
      <div className="relative h-[120px] overflow-hidden flex-shrink-0">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt={mod.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(139,92,246,0.2) 50%, rgba(14,14,26,0.9) 100%)`,
            }}
          />
        )}

        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(13,13,26,0.8)] to-transparent" />

        {/* Installed badge */}
        {isInstalled && (
          <div className="absolute top-2 right-2 bg-[rgba(99,102,241,0.9)] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Installed
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-3 gap-1.5">
        <h3
          className="text-sm font-semibold text-white leading-tight truncate"
          title={mod.name}
        >
          {mod.name}
        </h3>

        <p className="text-xs text-[rgba(148,163,184,0.8)] leading-relaxed line-clamp-2 flex-1">
          {abstract}
        </p>

        {/* Footer row */}
        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-[rgba(99,102,241,0.08)]">
          <span className="text-[11px] text-space-text-muted truncate max-w-[60%]" title={authorList}>
            {authorList}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {downloads != null && (
              <span className="text-[10px] text-[rgba(148,163,184,0.6)]">
                ↓ {formatDownloads(downloads)}
              </span>
            )}
            <span className="text-[10px] bg-[rgba(99,102,241,0.12)] text-[rgba(99,102,241,0.9)] px-1.5 py-0.5 rounded">
              {mod.latest_version}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

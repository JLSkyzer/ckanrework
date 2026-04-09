import { memo } from 'react'
import type { ModRow } from '../../../electron/types'
import { useUiStore } from '../../stores/ui-store'
import { formatDownloads } from '../../lib/format'

interface ModCardProps {
  mod: ModRow
  isInstalled: boolean
}

export const ModCard = memo(function ModCard({ mod, isInstalled }: ModCardProps) {
  const { openModDetail } = useUiStore()

  const abstract = mod.abstract ?? 'No description available.'
  const authorList = mod.author ?? ''

  return (
    <div
      onClick={() => openModDetail(mod.identifier)}
      className="
        group relative flex flex-col rounded-xl overflow-hidden cursor-pointer
        bg-[rgba(255,255,255,0.03)]
        border border-[rgba(99,102,241,0.1)]
        transition-all duration-200
        hover:border-[rgba(99,102,241,0.3)]
        hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]
      "
    >
      {/* Banner placeholder */}
      <div className="relative h-[100px] overflow-hidden flex-shrink-0">
        <div
          className="w-full h-full"
          style={{
            background: `linear-gradient(135deg, hsl(${hashCode(mod.identifier) % 360}, 40%, 20%) 0%, rgba(14,14,26,0.95) 100%)`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(13,13,26,0.8)] to-transparent" />

        {isInstalled && (
          <div className="absolute top-2 right-2 bg-[rgba(99,102,241,0.9)] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Installed
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-3 gap-1.5">
        <h3 className="text-sm font-semibold text-white leading-tight truncate" title={mod.name}>
          {mod.name}
        </h3>

        <p className="text-xs text-[rgba(148,163,184,0.8)] leading-relaxed line-clamp-2 flex-1">
          {abstract}
        </p>

        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-[rgba(99,102,241,0.08)]">
          <span className="text-[11px] text-space-text-muted truncate max-w-[60%]" title={authorList}>
            {authorList}
          </span>
          <span className="text-[10px] bg-[rgba(99,102,241,0.12)] text-[rgba(99,102,241,0.9)] px-1.5 py-0.5 rounded">
            {mod.latest_version}
          </span>
        </div>
      </div>
    </div>
  )
})

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

interface DownloadProgressProps {
  current: number
  total: number
  currentName: string
}

export function DownloadProgress({ current, total, currentName }: DownloadProgressProps) {
  if (total === 0) return null

  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div
      className="
        fixed bottom-5 right-5 z-50
        w-72 rounded-xl
        bg-[#12122a] border border-[rgba(99,102,241,0.3)]
        shadow-[0_0_30px_rgba(99,102,241,0.2)]
        px-4 py-3
        flex flex-col gap-2
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[rgba(196,181,253,0.9)] uppercase tracking-wider">
          Installing
        </span>
        <span className="text-xs text-[rgba(148,163,184,0.6)]">
          {current} / {total}
        </span>
      </div>

      {/* Current mod name */}
      {currentName && (
        <p className="text-sm text-white font-medium truncate" title={currentName}>
          {currentName}
        </p>
      )}

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #7c3aed 0%, #6366f1 100%)',
          }}
        />
      </div>

      {/* Percentage */}
      <p className="text-[11px] text-[rgba(148,163,184,0.5)] text-right">{pct}%</p>
    </div>
  )
}

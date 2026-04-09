import type { InstallProgress } from '../../stores/install-store'
import { formatSize } from '../../lib/format'

const STATUS_LABELS: Record<string, string> = {
  downloading: 'Downloading',
  verifying: 'Verifying hash',
  extracting: 'Extracting',
}

export function DownloadProgress({ progress }: { progress: InstallProgress }) {
  if (!progress.active) return null

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  const done = progress.current >= progress.total && progress.total > 0
  const hasFailed = progress.failed.length > 0

  // Per-mod download progress
  const dlPct = progress.currentTotalBytes && progress.currentTotalBytes > 0
    ? Math.round((progress.currentBytes / progress.currentTotalBytes) * 100)
    : null

  const statusLabel = STATUS_LABELS[progress.currentStatus] || ''

  return (
    <div
      className="
        fixed bottom-5 right-5 z-50
        w-80 rounded-xl
        bg-[#12122a] border border-[rgba(99,102,241,0.3)]
        shadow-[0_0_30px_rgba(99,102,241,0.2)]
        px-4 py-3
        flex flex-col gap-2
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wider ${
          done ? (hasFailed ? 'text-[rgba(245,158,11,0.9)]' : 'text-[rgba(74,222,128,0.9)]')
            : 'text-[rgba(196,181,253,0.9)]'
        }`}>
          {done ? (hasFailed ? 'Installed with errors' : 'Installation complete') : 'Installing mods...'}
        </span>
        <span className="text-xs text-[rgba(148,163,184,0.6)]">
          {progress.current} / {progress.total}
        </span>
      </div>

      {/* Current mod + status */}
      {progress.currentName && !done && (
        <div>
          <p className="text-sm text-white font-medium truncate" title={progress.currentName}>
            {progress.currentName}
          </p>
          {statusLabel && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-[rgba(148,163,184,0.6)]">{statusLabel}</span>
              {progress.currentStatus === 'downloading' && progress.currentTotalBytes && (
                <span className="text-[11px] text-[rgba(148,163,184,0.5)]">
                  {formatSize(progress.currentBytes)} / {formatSize(progress.currentTotalBytes)}
                </span>
              )}
              {progress.currentStatus === 'downloading' && !progress.currentTotalBytes && progress.currentBytes > 0 && (
                <span className="text-[11px] text-[rgba(148,163,184,0.5)]">
                  {formatSize(progress.currentBytes)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Per-mod download bar */}
      {!done && progress.currentStatus === 'downloading' && (
        <div className="h-1 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{
              width: dlPct != null ? `${dlPct}%` : '100%',
              background: 'rgba(99,102,241,0.5)',
              animation: dlPct == null ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
        </div>
      )}

      {/* Overall progress bar */}
      <div className="h-2 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: done
              ? (hasFailed ? 'linear-gradient(90deg, #f59e0b, #eab308)' : 'linear-gradient(90deg, #22c55e, #16a34a)')
              : 'linear-gradient(90deg, #7c3aed, #6366f1)',
          }}
        />
      </div>

      {progress.queue > 0 && !done && (
        <p className="text-[11px] text-[rgba(148,163,184,0.5)]">
          +{progress.queue} more in queue
        </p>
      )}

      {hasFailed && done && (
        <p className="text-xs text-[rgba(252,165,165,0.8)]">
          Failed: {progress.failed.join(', ')}
        </p>
      )}
    </div>
  )
}

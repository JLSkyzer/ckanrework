import { useInstallStore } from '../../stores/install-store'
import { formatSize } from '../../lib/format'

const STATUS_LABELS: Record<string, string> = {
  downloading: 'Downloading',
  verifying: 'Verifying hash',
  extracting: 'Extracting',
}

export function DownloadsView() {
  const { progress, _queue, history } = useInstallStore()

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  const done = progress.current >= progress.total && progress.total > 0
  const statusLabel = STATUS_LABELS[progress.currentStatus] || ''

  const dlPct = progress.currentTotalBytes && progress.currentTotalBytes > 0
    ? Math.round((progress.currentBytes / progress.currentTotalBytes) * 100)
    : null

  // Estimate speed (simple display of current bytes)
  const speedEstimate = progress.currentStatus === 'downloading' && progress.currentBytes > 0
    ? formatSize(progress.currentBytes)
    : null

  const completedHistory = history.filter(h => h.status === 'completed')
  const failedHistory = history.filter(h => h.status === 'failed')

  const hasActivity = progress.active || _queue.length > 0 || history.length > 0

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        {/* Page title */}
        <div>
          <h2 className="text-2xl font-bold text-white">Downloads</h2>
          <p className="text-sm text-[rgba(148,163,184,0.6)] mt-0.5">
            Track mod installation progress
          </p>
        </div>

        {!hasActivity && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-4xl mb-4">⬇</span>
            <p className="text-[rgba(148,163,184,0.7)] text-lg font-medium">
              No downloads in progress
            </p>
            <p className="text-[rgba(100,116,139,0.7)] text-sm mt-1">
              Install mods from the Discover tab to see them here
            </p>
          </div>
        )}

        {/* Current download */}
        {progress.active && !done && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[rgba(99,102,241,0.12)]">
              <h3 className="text-base font-semibold text-white">Current Download</h3>
              <span className="text-xs text-[rgba(148,163,184,0.6)]">
                {progress.current} / {progress.total}
              </span>
            </div>

            <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.12)] p-5 flex flex-col gap-3">
              {progress.currentName && (
                <div>
                  <p className="text-sm text-white font-medium truncate" title={progress.currentName}>
                    {progress.currentName}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {statusLabel && (
                      <span className="text-xs text-[rgba(148,163,184,0.6)]">{statusLabel}</span>
                    )}
                    {progress.currentStatus === 'downloading' && progress.currentTotalBytes && (
                      <span className="text-xs text-[rgba(148,163,184,0.5)]">
                        {formatSize(progress.currentBytes)} / {formatSize(progress.currentTotalBytes)}
                      </span>
                    )}
                    {speedEstimate && !progress.currentTotalBytes && (
                      <span className="text-xs text-[rgba(148,163,184,0.5)]">
                        {speedEstimate} downloaded
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Per-mod download bar */}
              {progress.currentStatus === 'downloading' && (
                <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
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
              <div className="h-2.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, #7c3aed, #6366f1)',
                  }}
                />
              </div>
              <p className="text-xs text-[rgba(148,163,184,0.5)]">{pct}% overall</p>
            </div>
          </section>
        )}

        {/* Completion state */}
        {progress.active && done && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[rgba(99,102,241,0.12)]">
              <h3 className="text-base font-semibold text-white">
                {progress.failed.length > 0 ? 'Installed with errors' : 'Installation complete'}
              </h3>
            </div>
            <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.12)] p-5">
              <p className="text-sm text-[rgba(74,222,128,0.9)]">
                {progress.total - progress.failed.length} mod{progress.total - progress.failed.length !== 1 ? 's' : ''} installed successfully
              </p>
              {progress.failed.length > 0 && (
                <p className="text-sm text-[rgba(252,165,165,0.8)] mt-2">
                  Failed: {progress.failed.join(', ')}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Queue */}
        {_queue.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[rgba(99,102,241,0.12)]">
              <h3 className="text-base font-semibold text-white">Queue</h3>
              <span className="text-xs text-[rgba(148,163,184,0.6)]">
                {_queue.reduce((acc, batch) => acc + batch.length, 0)} pending
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {_queue.map((batch, batchIdx) =>
                batch.map((mod) => (
                  <div
                    key={`${batchIdx}-${mod.identifier}`}
                    className="rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(99,102,241,0.08)] px-4 py-2.5 flex items-center gap-3"
                  >
                    <span className="text-xs text-[rgba(148,163,184,0.4)]">Pending</span>
                    <span className="text-sm text-white truncate flex-1">{mod.identifier}</span>
                    {mod.version && (
                      <span className="text-xs text-[rgba(148,163,184,0.5)]">v{mod.version}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* History */}
        {history.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[rgba(99,102,241,0.12)]">
              <h3 className="text-base font-semibold text-white">Session History</h3>
              <span className="text-xs text-[rgba(148,163,184,0.6)]">
                {completedHistory.length} completed, {failedHistory.length} failed
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {[...history].reverse().map((entry, i) => (
                <div
                  key={`${entry.identifier}-${entry.timestamp}-${i}`}
                  className="rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(99,102,241,0.08)] px-4 py-2 flex items-center gap-3"
                >
                  <span className={`text-xs font-medium ${
                    entry.status === 'completed'
                      ? 'text-[rgba(74,222,128,0.8)]'
                      : 'text-[rgba(252,165,165,0.8)]'
                  }`}>
                    {entry.status === 'completed' ? 'OK' : 'FAIL'}
                  </span>
                  <span className="text-sm text-[rgba(148,163,184,0.8)] truncate flex-1">
                    {entry.identifier}
                  </span>
                  <span className="text-[11px] text-[rgba(100,116,139,0.5)]">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

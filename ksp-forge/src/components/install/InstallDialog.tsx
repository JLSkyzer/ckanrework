import type { ResolutionResult } from '../../../electron/services/resolver'
import { formatSize } from '../../lib/format'

interface InstallDialogProps {
  resolution: ResolutionResult
  onConfirm: () => void
  onCancel: () => void
}

export function InstallDialog({ resolution, onConfirm, onCancel }: InstallDialogProps) {
  const { success, toInstall, conflicts, missing, warnings } = resolution

  const directMods = toInstall.filter((m) => !m.isDependency)
  const depMods = toInstall.filter((m) => m.isDependency)

  const totalSize = toInstall.reduce((sum, m) => sum + (m.download_size ?? 0), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onCancel}
    >
      <div
        className="
          relative w-full max-w-lg mx-4 rounded-2xl
          bg-[#12122a] border border-[rgba(99,102,241,0.25)]
          shadow-[0_0_40px_rgba(99,102,241,0.15)]
          flex flex-col max-h-[80vh]
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[rgba(99,102,241,0.12)] flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Install Mods</h2>
          <p className="text-sm text-[rgba(148,163,184,0.7)] mt-0.5">
            Review the following changes before installing
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] px-4 py-3">
              <p className="text-sm font-semibold text-[rgba(252,165,165,1)] mb-2">
                Conflicts Detected
              </p>
              <ul className="space-y-1">
                {conflicts.map((c) => (
                  <li key={c} className="text-xs text-[rgba(252,165,165,0.85)]">
                    • {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing */}
          {missing.length > 0 && (
            <div className="rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] px-4 py-3">
              <p className="text-sm font-semibold text-[rgba(253,230,138,1)] mb-2">
                Missing Dependencies
              </p>
              <ul className="space-y-1">
                {missing.map((m) => (
                  <li key={m} className="text-xs text-[rgba(253,230,138,0.85)]">
                    • {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="rounded-lg bg-[rgba(251,191,36,0.07)] border border-[rgba(251,191,36,0.2)] px-4 py-3">
              <p className="text-sm font-semibold text-[rgba(253,230,138,0.9)] mb-2">
                Warnings
              </p>
              <ul className="space-y-1">
                {warnings.map((w) => (
                  <li key={w} className="text-xs text-[rgba(253,230,138,0.7)]">
                    • {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mods to install */}
          {toInstall.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[rgba(148,163,184,0.6)] uppercase tracking-wider mb-2">
                Mods to Install ({toInstall.length})
              </p>
              <div className="rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(99,102,241,0.1)] overflow-hidden">
                {directMods.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-[rgba(99,102,241,0.06)] border-b border-[rgba(99,102,241,0.08)]">
                      <span className="text-[11px] font-semibold text-[rgba(196,181,253,0.8)] uppercase tracking-wider">
                        Direct
                      </span>
                    </div>
                    {directMods.map((mod) => (
                      <ModRow key={mod.identifier} identifier={mod.identifier} version={mod.version} size={mod.download_size} />
                    ))}
                  </>
                )}
                {depMods.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-[rgba(255,255,255,0.02)] border-b border-[rgba(99,102,241,0.08)] border-t border-[rgba(99,102,241,0.08)]">
                      <span className="text-[11px] font-semibold text-[rgba(148,163,184,0.6)] uppercase tracking-wider">
                        Auto-Dependencies
                      </span>
                    </div>
                    {depMods.map((mod) => (
                      <ModRow key={mod.identifier} identifier={mod.identifier} version={mod.version} size={mod.download_size} />
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Total download size */}
          {totalSize > 0 && (
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-[rgba(148,163,184,0.6)]">Total download size</span>
              <span className="text-white font-semibold">{formatSize(totalSize)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[rgba(99,102,241,0.12)] flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onCancel}
            className="
              px-4 py-2 rounded-lg text-sm font-medium
              text-[rgba(148,163,184,0.8)] hover:text-white
              bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)]
              border border-[rgba(255,255,255,0.08)]
              transition-colors cursor-pointer
            "
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!success}
            className={`
              px-5 py-2 rounded-lg text-sm font-semibold
              transition-colors
              ${
                success
                  ? 'bg-[rgba(99,102,241,0.9)] hover:bg-[rgba(99,102,241,1)] text-white border border-[rgba(99,102,241,0.4)] cursor-pointer'
                  : 'bg-[rgba(99,102,241,0.2)] text-[rgba(148,163,184,0.4)] border border-[rgba(99,102,241,0.15)] cursor-not-allowed'
              }
            `}
          >
            Install
          </button>
        </div>
      </div>
    </div>
  )
}

function ModRow({
  identifier,
  version,
  size,
}: {
  identifier: string
  version: string
  size: number | null
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(99,102,241,0.06)] last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-[rgba(226,232,240,0.9)] truncate font-medium">
          {identifier}
        </span>
        <span className="text-xs text-[rgba(99,102,241,0.7)] bg-[rgba(99,102,241,0.1)] px-1.5 py-0.5 rounded flex-shrink-0">
          v{version}
        </span>
      </div>
      {size != null && (
        <span className="text-xs text-[rgba(100,116,139,0.7)] flex-shrink-0 ml-3">
          {formatSize(size)}
        </span>
      )}
    </div>
  )
}

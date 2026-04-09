import { useState, useEffect } from 'react'
import { useModStore } from '../../stores/mod-store'
import { useUiStore } from '../../stores/ui-store'
import { api } from '../../lib/ipc'
import { formatDate } from '../../lib/format'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function SettingsView() {
  const { modCount, loading, syncMeta } = useModStore()
  const { concurrentDownloads, setConcurrentDownloads } = useUiStore()
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [cacheSize, setCacheSize] = useState<number | null>(null)
  const [clearingCache, setClearingCache] = useState(false)

  useEffect(() => {
    api.meta.getLastSync().then((ts: number | null) => setLastSync(ts))
    api.modCache.getSize().then((size: number) => setCacheSize(size))
  }, [])

  const handleClearCache = async () => {
    setClearingCache(true)
    try {
      await api.modCache.clear()
      setCacheSize(0)
    } finally {
      setClearingCache(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncMeta()
      const ts: number | null = await api.meta.getLastSync()
      setLastSync(ts)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        {/* Page title */}
        <div>
          <h2 className="text-2xl font-bold text-white">Settings</h2>
          <p className="text-sm text-[rgba(148,163,184,0.6)] mt-0.5">
            Configure KSP Forge
          </p>
        </div>

        {/* Mod Registry section */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[rgba(99,102,241,0.12)]">
            <span className="text-base">📦</span>
            <h3 className="text-base font-semibold text-white">Mod Registry</h3>
          </div>

          <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.12)] p-5 flex flex-col gap-4">
            {/* Stats row */}
            <div className="flex items-start gap-8">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[rgba(100,116,139,0.8)] uppercase tracking-wider">
                  Indexed Mods
                </span>
                <span className="text-2xl font-bold text-white">
                  {loading ? (
                    <span className="text-base text-[rgba(99,102,241,0.7)] animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    modCount.toLocaleString()
                  )}
                </span>
              </div>
              {lastSync != null && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-[rgba(100,116,139,0.8)] uppercase tracking-wider">
                    Last Synced
                  </span>
                  <span className="text-sm text-[rgba(148,163,184,0.8)]">
                    {formatDate(lastSync)}
                  </span>
                </div>
              )}
            </div>

            {/* Sync button + description */}
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-[rgba(100,116,139,0.7)] leading-relaxed flex-1">
                Sync the CKAN mod registry to get the latest mods and updates.
                This downloads metadata for all available KSP mods.
              </p>
              <button
                onClick={handleSync}
                disabled={syncing || loading}
                className={`
                  flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold
                  transition-colors
                  ${
                    syncing || loading
                      ? 'bg-[rgba(99,102,241,0.2)] text-[rgba(148,163,184,0.4)] border border-[rgba(99,102,241,0.15)] cursor-not-allowed'
                      : 'bg-[rgba(99,102,241,0.9)] hover:bg-[rgba(99,102,241,1)] text-white border border-[rgba(99,102,241,0.4)] cursor-pointer'
                  }
                `}
              >
                {syncing ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />
                    Syncing...
                  </span>
                ) : (
                  'Sync Now'
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Downloads section */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[rgba(99,102,241,0.12)]">
            <span className="text-base">⬇</span>
            <h3 className="text-base font-semibold text-white">Downloads</h3>
          </div>

          <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.12)] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white font-medium">Simultaneous downloads</p>
                <p className="text-xs text-[rgba(148,163,184,0.6)] mt-0.5">
                  Number of mods to download and install at the same time (1-5).
                </p>
              </div>
              <input
                type="number"
                min={1}
                max={5}
                value={concurrentDownloads}
                onChange={(e) => setConcurrentDownloads(parseInt(e.target.value, 10) || 1)}
                className="w-16 px-3 py-1.5 rounded-lg text-sm text-white bg-[rgba(255,255,255,0.05)] border border-[rgba(99,102,241,0.2)] focus:border-[rgba(99,102,241,0.5)] focus:outline-none text-center"
              />
            </div>
          </div>
        </section>

        {/* Mod Cache section */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[rgba(99,102,241,0.12)]">
            <span className="text-base">&#128451;</span>
            <h3 className="text-base font-semibold text-white">Mod Cache</h3>
          </div>

          <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.12)] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white font-medium">
                  Cache size: {cacheSize !== null ? formatBytes(cacheSize) : '...'}
                </p>
                <p className="text-xs text-[rgba(148,163,184,0.6)] mt-0.5">
                  Mod files are cached locally so profile switching can restore mods without re-downloading.
                </p>
              </div>
              <button
                onClick={handleClearCache}
                disabled={clearingCache || cacheSize === 0}
                className={`
                  flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold
                  transition-colors
                  ${
                    clearingCache || cacheSize === 0
                      ? 'bg-[rgba(99,102,241,0.2)] text-[rgba(148,163,184,0.4)] border border-[rgba(99,102,241,0.15)] cursor-not-allowed'
                      : 'bg-[rgba(239,68,68,0.15)] hover:bg-[rgba(239,68,68,0.3)] text-[#ef4444] border border-[rgba(239,68,68,0.2)] cursor-pointer'
                  }
                `}
              >
                {clearingCache ? 'Clearing...' : 'Clear Cache'}
              </button>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[rgba(239,68,68,0.2)]">
            <span className="text-base">⚠</span>
            <h3 className="text-base font-semibold text-[#ef4444]">Danger Zone</h3>
          </div>

          <div className="rounded-xl bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.15)] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white font-medium">Reset all data</p>
                <p className="text-xs text-[rgba(148,163,184,0.6)] mt-0.5">
                  Deletes all profiles, cached data, and mod index. You will need to set up again from scratch.
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm('Are you sure? This will delete all profiles and cached data. The app will restart.')) return
                  try {
                    await api.meta.resetAll()
                  } catch { /* ignore */ }
                  window.location.reload()
                }}
                className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold bg-[rgba(239,68,68,0.15)] hover:bg-[rgba(239,68,68,0.3)] text-[#ef4444] border border-[rgba(239,68,68,0.2)] transition-colors cursor-pointer"
              >
                Reset Everything
              </button>
            </div>
          </div>
        </section>

        {/* About section */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[rgba(99,102,241,0.12)]">
            <span className="text-base">★</span>
            <h3 className="text-base font-semibold text-white">About</h3>
          </div>

          <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.12)] p-5 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(139,92,246,0.2) 100%)',
                  border: '1px solid rgba(99,102,241,0.2)',
                }}
              >
                🚀
              </div>
              <div>
                <h4 className="text-lg font-bold text-white">KSP Forge</h4>
                <p className="text-xs text-[rgba(196,181,253,0.7)]">Version 1.0.0</p>
              </div>
            </div>

            <p className="text-sm text-[rgba(148,163,184,0.7)] leading-relaxed">
              A modern mod manager for Kerbal Space Program, built with Electron and React.
              Powered by the CKAN mod registry.
            </p>

            <div className="pt-1 border-t border-[rgba(99,102,241,0.08)]">
              <p className="text-[10px] text-[rgba(100,116,139,0.6)] uppercase tracking-wider mb-2">
                Credits
              </p>
              <ul className="flex flex-col gap-1.5">
                <CreditRow label="Mod data" value="CKAN — The Comprehensive Kerbal Archive Network" />
                <CreditRow label="Mod pages" value="SpaceDock" />
                <CreditRow label="Built with" value="Electron, React, Vite, Tailwind CSS, better-sqlite3" />
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function CreditRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="text-xs text-[rgba(100,116,139,0.7)] flex-shrink-0">{label}:</span>
      <span className="text-xs text-[rgba(148,163,184,0.8)]">{value}</span>
    </li>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './Sidebar'
import { DownloadProgress } from '../install/DownloadProgress'
import { useInstallStore } from '../../stores/install-store'
import { useUiStore } from '../../stores/ui-store'
import { useModStore } from '../../stores/mod-store'
import { useProfileStore } from '../../stores/profile-store'
import { ModGrid } from '../mods/ModGrid'
import { ModDetail } from '../mods/ModDetail'
import { ProfileList } from '../profiles/ProfileList'
import { SettingsView } from '../settings/SettingsView'
import { DownloadsView } from '../downloads/DownloadsView'

export function AppShell() {
  const { currentView } = useUiStore()
  const { syncIfNeeded, syncing, syncStatus, syncProgress, syncError, retrySyncIfNeeded, modCount } = useModStore()
  const installProgress = useInstallStore(s => s.progress)
  const pendingRecovery = useInstallStore(s => s.pendingRecovery)
  const { resumeRecovery, dismissRecovery, checkRecovery } = useInstallStore()
  const { fetchProfiles, activeProfileId, fetchInstalledMods } = useProfileStore()
  const [overlayCollapsed, setOverlayCollapsed] = useState(true)
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; url: string } | null>(null)
  const wasSyncingRef = useRef(false)

  useEffect(() => {
    syncIfNeeded()
    fetchProfiles()
    // Check for updates
    window.electronAPI?.app?.checkUpdate().then(info => {
      if (info) setUpdateInfo(info)
    }).catch(() => {})
  }, [])

  // Track syncing transitions so scan only fires after sync completes
  useEffect(() => {
    if (syncing) {
      wasSyncingRef.current = true
    }
  }, [syncing])

  // Auto-scan GameData for already installed mods after sync completes
  useEffect(() => {
    // Only run when sync has transitioned from true→false (not on cold start where syncing was never true)
    const syncJustFinished = wasSyncingRef.current && !syncing
    if (syncJustFinished && modCount > 0 && activeProfileId) {
      window.electronAPI?.profiles?.scanInstalled(activeProfileId).then((result) => {
        if (result?.found > 0) {
          console.log(`Auto-detected ${result.found} installed mods:`, result.mods)
          fetchInstalledMods(activeProfileId)
        }
      }).catch(() => {})

      // Check for crash-recovered queue
      checkRecovery()
    }
  }, [syncing, modCount, activeProfileId])

  const renderContent = () => {
    switch (currentView) {
      case 'discover':
        return <ModGrid filter="all" />
      case 'installed':
        return <ModGrid filter="installed" />
      case 'downloads':
        return <DownloadsView />
      case 'mod-detail':
        return <ModDetail />
      case 'profiles':
        return <ProfileList />
      case 'settings':
        return <SettingsView />
      default:
        return <ModGrid filter="all" />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-space-bg text-space-text">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Update banner */}
        {updateInfo && (
          <div className="flex items-center justify-between px-4 py-2 bg-[rgba(99,102,241,0.15)] border-b border-[rgba(99,102,241,0.2)] flex-shrink-0">
            <span className="text-xs text-[rgba(196,181,253,0.9)]">
              KSP Forge <strong>v{updateInfo.latestVersion}</strong> is available!
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => window.electronAPI?.app?.openUrl(updateInfo.url)}
                className="text-xs font-semibold text-white bg-[rgba(99,102,241,0.8)] hover:bg-[rgba(99,102,241,1)] px-3 py-1 rounded-lg cursor-pointer transition-colors"
              >
                Download
              </button>
              <button
                onClick={() => setUpdateInfo(null)}
                className="text-xs text-[rgba(148,163,184,0.6)] hover:text-white cursor-pointer transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Recovery banner */}
        {pendingRecovery && pendingRecovery.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-[rgba(245,158,11,0.1)] border-b border-[rgba(245,158,11,0.2)] flex-shrink-0">
            <span className="text-xs text-[rgba(253,230,138,0.9)]">
              {pendingRecovery.reduce((a, b) => a + b.length, 0)} mods were queued before the app closed.
            </span>
            <div className="flex gap-2">
              <button
                onClick={resumeRecovery}
                className="text-xs font-semibold text-white bg-[rgba(245,158,11,0.8)] hover:bg-[rgba(245,158,11,1)] px-3 py-1 rounded-lg cursor-pointer transition-colors"
              >
                Resume
              </button>
              <button
                onClick={dismissRecovery}
                className="text-xs text-[rgba(148,163,184,0.6)] hover:text-white cursor-pointer transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-hidden">
          {syncing ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 px-8">
              <h1
                className="text-3xl font-bold"
                style={{
                  background: 'linear-gradient(135deg, #a78bfa, #818cf8)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                ★ KSP Forge
              </h1>
              <p className="text-[#a78bfa] font-medium text-sm">{syncStatus || 'Syncing...'}</p>
              <div className="w-full max-w-md">
                <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#6366f1] to-[#a78bfa] rounded-full transition-all duration-300"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
                {syncProgress > 0 && (
                  <p className="text-xs text-[rgba(148,163,184,0.4)] text-right mt-1">{syncProgress}%</p>
                )}
              </div>
              <p className="text-xs text-[rgba(148,163,184,0.4)] text-center max-w-sm">
                First launch — downloading and indexing the CKAN mod registry. This only happens once.
              </p>
            </div>
          ) : syncError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
              <p className="text-[rgba(248,113,113,0.9)] font-semibold text-lg">Failed to load mod registry</p>
              <p className="text-[rgba(148,163,184,0.7)] text-sm text-center max-w-sm">{syncError}</p>
              <button
                onClick={retrySyncIfNeeded}
                className="mt-2 px-5 py-2 rounded-lg bg-[rgba(99,102,241,0.8)] hover:bg-[rgba(99,102,241,1)] text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            renderContent()
          )}
        </main>
      </div>
      <DownloadProgress progress={installProgress} collapsed={overlayCollapsed} onToggleCollapse={() => setOverlayCollapsed(c => !c)} onViewDetails={() => { useUiStore.getState().setView('downloads'); setOverlayCollapsed(true) }} />
    </div>
  )
}

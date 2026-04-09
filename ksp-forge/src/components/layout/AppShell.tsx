import { useEffect, useState } from 'react'
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
  const { syncIfNeeded, syncing, syncStatus, syncProgress, modCount } = useModStore()
  const installProgress = useInstallStore(s => s.progress)
  const pendingRecovery = useInstallStore(s => s.pendingRecovery)
  const { resumeRecovery, dismissRecovery, checkRecovery } = useInstallStore()
  const { fetchProfiles, activeProfileId, fetchInstalledMods } = useProfileStore()
  const [overlayCollapsed, setOverlayCollapsed] = useState(true)

  useEffect(() => {
    syncIfNeeded()
    fetchProfiles()
  }, [])

  // Auto-scan GameData for already installed mods after sync completes
  useEffect(() => {
    if (!syncing && modCount > 0 && activeProfileId) {
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
          ) : (
            renderContent()
          )}
        </main>
      </div>
      {/* Recovery banner */}
      {pendingRecovery && pendingRecovery.length > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.6)]">
          <div className="bg-[#12122a] border border-[rgba(99,102,241,0.3)] rounded-xl px-6 py-4 shadow-[0_0_30px_rgba(99,102,241,0.2)] max-w-md w-full flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white">Resume pending downloads?</h3>
            <p className="text-xs text-[rgba(148,163,184,0.7)]">
              {pendingRecovery.reduce((acc, batch) => acc + batch.length, 0)} mod{pendingRecovery.reduce((acc, batch) => acc + batch.length, 0) !== 1 ? 's were' : ' was'} queued before the app closed.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={dismissRecovery}
                className="px-3 py-1.5 rounded-lg text-xs text-[rgba(148,163,184,0.7)] hover:bg-white/5 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={resumeRecovery}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[rgba(99,102,241,0.9)] hover:bg-[rgba(99,102,241,1)] text-white transition-colors cursor-pointer"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      <DownloadProgress progress={installProgress} collapsed={overlayCollapsed} onToggleCollapse={() => setOverlayCollapsed(c => !c)} onViewDetails={() => { useUiStore.getState().setView('downloads'); setOverlayCollapsed(true) }} />
    </div>
  )
}

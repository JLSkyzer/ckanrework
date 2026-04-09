import { useEffect } from 'react'
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

export function AppShell() {
  const { currentView } = useUiStore()
  const { syncIfNeeded, syncing, syncStatus, syncProgress, modCount } = useModStore()
  const installProgress = useInstallStore(s => s.progress)
  const { fetchProfiles, activeProfileId, fetchInstalledMods } = useProfileStore()

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
    }
  }, [syncing, modCount, activeProfileId])

  const renderContent = () => {
    switch (currentView) {
      case 'discover':
        return <ModGrid filter="all" />
      case 'installed':
        return <ModGrid filter="installed" />
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
      <DownloadProgress progress={installProgress} />
    </div>
  )
}

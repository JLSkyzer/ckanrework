import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { useUiStore } from '../../stores/ui-store'
import { useModStore } from '../../stores/mod-store'
import { useProfileStore } from '../../stores/profile-store'
import { ModGrid } from '../mods/ModGrid'
import { ModDetail } from '../mods/ModDetail'
import { ProfileList } from '../profiles/ProfileList'
import { SettingsView } from '../settings/SettingsView'

export function AppShell() {
  const { currentView } = useUiStore()
  const { syncIfNeeded, syncing, syncStatus } = useModStore()
  const { fetchProfiles } = useProfileStore()

  useEffect(() => {
    syncIfNeeded()
    fetchProfiles()
  }, [])

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
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 border-4 border-[rgba(99,102,241,0.2)] border-t-[#6366f1] rounded-full animate-spin" />
              <p className="text-[#a78bfa] font-medium">{syncStatus || 'Syncing...'}</p>
              <p className="text-xs text-[rgba(148,163,184,0.5)]">
                First sync downloads the CKAN mod registry — this may take a few minutes
              </p>
            </div>
          ) : (
            renderContent()
          )}
        </main>
      </div>
    </div>
  )
}

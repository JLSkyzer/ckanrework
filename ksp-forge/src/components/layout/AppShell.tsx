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
  const { fetchMods } = useModStore()
  const { fetchProfiles } = useProfileStore()

  useEffect(() => {
    fetchMods()
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
        <main className="flex-1 overflow-hidden">{renderContent()}</main>
      </div>
    </div>
  )
}

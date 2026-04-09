import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { SearchBar } from './SearchBar'
import { useUiStore } from '../../stores/ui-store'
import { useModStore } from '../../stores/mod-store'
import { useProfileStore } from '../../stores/profile-store'
import { ModGrid } from '../mods/ModGrid'
import { ModDetail } from '../mods/ModDetail'
import { ProfileList } from '../profiles/ProfileList'
import { SettingsView } from '../settings/SettingsView'

const VIEWS_WITH_SEARCH: string[] = ['discover']

export function AppShell() {
  const { currentView } = useUiStore()
  const { fetchMods } = useModStore()
  const { fetchProfiles } = useProfileStore()

  useEffect(() => {
    fetchMods()
    fetchProfiles()
  }, [])

  const showSearchBar = VIEWS_WITH_SEARCH.includes(currentView)

  const renderContent = () => {
    switch (currentView) {
      case 'discover':
        return <ModGrid />
      case 'installed':
        return <ModGrid />
      case 'mod-detail':
        return <ModDetail />
      case 'profiles':
        return <ProfileList />
      case 'settings':
        return <SettingsView />
      default:
        return <ModGrid />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-space-bg text-space-text">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {showSearchBar && <SearchBar />}
        <main className="flex-1 overflow-y-auto">{renderContent()}</main>
      </div>
    </div>
  )
}

import { useUiStore, type ViewName } from '../../stores/ui-store'
import { useProfileStore } from '../../stores/profile-store'

interface NavItem {
  view: ViewName
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { view: 'discover', label: 'Discover', icon: '🌐' },
  { view: 'installed', label: 'Installed', icon: '📦' },
  { view: 'profiles', label: 'Profiles', icon: '📋' },
  { view: 'settings', label: 'Settings', icon: '⚙️' },
]

export function Sidebar() {
  const { currentView, setView } = useUiStore()
  const { getActiveProfile, installedMods } = useProfileStore()
  const activeProfile = getActiveProfile()

  return (
    <aside className="w-[220px] bg-space-surface border-r border-space-border flex flex-col flex-shrink-0">
      {/* Drag region for frameless window */}
      <div className="app-region-drag h-9 flex-shrink-0" />

      {/* Logo */}
      <div className="px-4 pb-6">
        <h1 className="text-xl font-bold text-[#c4b5fd]">★ KSP Forge</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ view, label, icon }) => {
          const isActive = currentView === view || (currentView === 'mod-detail' && view === 'discover')
          return (
            <button
              key={view}
              onClick={() => setView(view)}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-space-accent/15 text-space-accent'
                  : 'text-space-text-muted hover:bg-white/5'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Active profile info */}
      {activeProfile && (
        <div className="px-4 py-4 border-t border-space-border">
          <p className="text-xs text-space-text-muted uppercase tracking-wide mb-1">
            Active Profile
          </p>
          <p className="text-sm font-medium text-space-text truncate">
            {activeProfile.name}
          </p>
          <p className="text-xs text-space-text-muted">
            KSP {activeProfile.ksp_version}
          </p>
          <p className="text-xs text-space-text-muted">
            {installedMods.length} mod{installedMods.length !== 1 ? 's' : ''} installed
          </p>
        </div>
      )}
    </aside>
  )
}

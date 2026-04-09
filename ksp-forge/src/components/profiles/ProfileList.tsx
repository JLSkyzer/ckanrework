import { useState } from 'react'
import { useProfileStore } from '../../stores/profile-store'
import { formatDate } from '../../lib/format'
import { ProfileWizard } from './ProfileWizard'

export function ProfileList() {
  const { profiles, activeProfileId, setActiveProfile, deleteProfile } = useProfileStore()
  const [showWizard, setShowWizard] = useState(false)

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteProfile(id)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Profiles</h2>
          <p className="text-sm text-[rgba(148,163,184,0.6)] mt-0.5">
            Manage your KSP installation profiles
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="
            flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
            bg-[rgba(99,102,241,0.9)] hover:bg-[rgba(99,102,241,1)]
            text-white border border-[rgba(99,102,241,0.4)]
            transition-colors cursor-pointer
          "
        >
          <span>+</span>
          <span>New Profile</span>
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.1)' }}
            >
              <span className="text-2xl">📋</span>
            </div>
            <div className="text-center">
              <p className="text-white font-semibold">No profiles yet</p>
              <p className="text-sm text-[rgba(148,163,184,0.6)] mt-1">
                Create a profile to start managing your KSP mods
              </p>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="
                px-5 py-2.5 rounded-lg text-sm font-semibold
                bg-[rgba(99,102,241,0.9)] hover:bg-[rgba(99,102,241,1)]
                text-white border border-[rgba(99,102,241,0.4)]
                transition-colors cursor-pointer
              "
            >
              + New Profile
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {profiles.map((profile) => {
              const isActive = profile.id === activeProfileId
              return (
                <div
                  key={profile.id}
                  onClick={() => setActiveProfile(profile.id)}
                  className={`
                    relative rounded-xl p-5 flex flex-col gap-3 cursor-pointer
                    transition-all duration-200
                    ${
                      isActive
                        ? 'border-2 border-[rgba(99,102,241,0.7)] bg-[rgba(99,102,241,0.08)] shadow-[0_0_20px_rgba(99,102,241,0.2)]'
                        : 'border border-[rgba(99,102,241,0.12)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(255,255,255,0.05)]'
                    }
                  `}
                >
                  {/* Active badge */}
                  {isActive && (
                    <div className="absolute top-3 right-3 bg-[rgba(99,102,241,0.9)] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      Active
                    </div>
                  )}

                  {/* Profile icon + name */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isActive
                          ? 'rgba(99,102,241,0.25)'
                          : 'rgba(255,255,255,0.05)',
                      }}
                    >
                      <span className="text-lg">🚀</span>
                    </div>
                    <div className="min-w-0 flex-1 pr-6">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {profile.name}
                      </h3>
                      <p className="text-xs text-[rgba(196,181,253,0.7)] mt-0.5">
                        KSP {profile.ksp_version || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Path */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-[rgba(100,116,139,0.8)] uppercase tracking-wider">
                      Path
                    </span>
                    <p
                      className="text-xs text-[rgba(148,163,184,0.7)] truncate"
                      title={profile.ksp_path}
                    >
                      {profile.ksp_path}
                    </p>
                  </div>

                  {/* Created date */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-[rgba(100,116,139,0.8)] uppercase tracking-wider">
                        Created
                      </span>
                      <span className="text-xs text-[rgba(148,163,184,0.7)]">
                        {formatDate(profile.created_at)}
                      </span>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(e, profile.id)}
                      className="
                        px-3 py-1.5 rounded-lg text-xs font-medium
                        text-[rgba(252,165,165,0.7)] hover:text-[rgba(252,165,165,1)]
                        bg-[rgba(239,68,68,0.06)] hover:bg-[rgba(239,68,68,0.15)]
                        border border-[rgba(239,68,68,0.12)] hover:border-[rgba(239,68,68,0.3)]
                        transition-colors cursor-pointer
                      "
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Profile wizard modal */}
      {showWizard && <ProfileWizard onClose={() => setShowWizard(false)} />}
    </div>
  )
}

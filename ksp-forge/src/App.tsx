import { useEffect, useState } from 'react'
import './styles/globals.css'
import { AppShell } from './components/layout/AppShell'
import { ProfileWizard } from './components/profiles/ProfileWizard'
import { useProfileStore } from './stores/profile-store'

function App() {
  const { profiles, fetchProfiles } = useProfileStore()
  const [loaded, setLoaded] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    fetchProfiles().then(() => {
      setLoaded(true)
    })
  }, [fetchProfiles])

  // After loading, show welcome screen if no profiles
  useEffect(() => {
    if (loaded && profiles.length === 0) {
      setShowWizard(true)
    } else if (loaded && profiles.length > 0) {
      setShowWizard(false)
    }
  }, [loaded, profiles.length])

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-[rgba(148,163,184,0.5)] animate-pulse text-sm">Loading...</p>
      </div>
    )
  }

  if (showWizard) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6">
        <div className="text-center">
          <h1
            className="text-4xl font-bold"
            style={{
              background: 'linear-gradient(135deg, #a78bfa, #818cf8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            ★ KSP Forge
          </h1>
          <p className="text-[rgba(148,163,184,0.7)] mt-2 text-sm">
            Welcome! Let's set up your first profile.
          </p>
        </div>
        <ProfileWizard onClose={() => setShowWizard(false)} />
      </div>
    )
  }

  return <AppShell />
}

export default App

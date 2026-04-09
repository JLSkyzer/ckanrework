import './styles/globals.css'

function App() {
  return (
    <div className="flex h-screen">
      <aside className="w-[220px] bg-space-surface border-r border-space-border flex flex-col p-4">
        <h1 className="text-xl font-bold text-[#c4b5fd] mb-8">★ KSP Forge</h1>
        <nav className="space-y-2">
          <div className="px-3 py-2 rounded-lg bg-space-accent/15 text-space-accent cursor-pointer">
            🌐 Discover
          </div>
          <div className="px-3 py-2 rounded-lg text-space-text-muted hover:bg-white/5 cursor-pointer">
            📦 Installed
          </div>
          <div className="px-3 py-2 rounded-lg text-space-text-muted hover:bg-white/5 cursor-pointer">
            📋 Profiles
          </div>
          <div className="px-3 py-2 rounded-lg text-space-text-muted hover:bg-white/5 cursor-pointer">
            ⚙ Settings
          </div>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <p className="text-space-text-secondary">KSP Forge is loading...</p>
      </main>
    </div>
  )
}

export default App

import { useState, useEffect } from 'react'
import { api } from '../../lib/ipc'
import { useProfileStore } from '../../stores/profile-store'

interface ProfileWizardProps {
  onClose: () => void
}

export function ProfileWizard({ onClose }: ProfileWizardProps) {
  const { createProfile, setActiveProfile } = useProfileStore()

  const [name, setName] = useState('')
  const [kspPath, setKspPath] = useState('')
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    message: string
    kspVersion?: string
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detectedPaths, setDetectedPaths] = useState<{ path: string; source: string; version: string }[]>([])
  const [showDetected, setShowDetected] = useState(false)

  // Validate path whenever it changes (debounced)
  useEffect(() => {
    if (!kspPath.trim()) {
      setValidationResult(null)
      return
    }

    const timer = setTimeout(async () => {
      setValidating(true)
      try {
        const result = await api.profiles.validatePath(kspPath.trim())
        setValidationResult(result)
      } catch {
        setValidationResult({ valid: false, message: 'Validation failed.' })
      } finally {
        setValidating(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [kspPath])

  const handleAutoDetect = async () => {
    setDetecting(true)
    try {
      const paths = await api.profiles.autoDetect()
      setDetectedPaths(paths)
      setShowDetected(true)
      if (paths.length === 1) {
        setKspPath(paths[0].path)
        if (!name.trim()) setName(`KSP ${paths[0].version}`)
      }
    } finally {
      setDetecting(false)
    }
  }

  const handleSelectDetected = (detected: { path: string; source: string; version: string }) => {
    setKspPath(detected.path)
    if (!name.trim()) setName(`KSP ${detected.version}`)
    setShowDetected(false)
  }

  const handleBrowse = async () => {
    const folder = await api.dialog.selectFolder()
    if (folder) {
      setKspPath(folder)
    }
  }

  const handleCreate = async () => {
    if (!name.trim() || !validationResult?.valid) return
    setCreating(true)
    try {
      const profile = await createProfile(name.trim(), kspPath.trim())
      if (profile) {
        setActiveProfile(profile.id)
        onClose()
      }
    } finally {
      setCreating(false)
    }
  }

  const canCreate = name.trim().length > 0 && validationResult?.valid === true && !creating

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="
          relative w-full max-w-md mx-4 rounded-2xl
          bg-[#12122a] border border-[rgba(99,102,241,0.25)]
          shadow-[0_0_40px_rgba(99,102,241,0.15)]
          p-6 flex flex-col gap-5
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-white">New Profile</h2>
          <p className="text-sm text-[rgba(148,163,184,0.6)] mt-0.5">
            Set up a new KSP installation profile
          </p>
        </div>

        {/* Profile name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[rgba(148,163,184,0.7)] uppercase tracking-wider">
            Profile Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My KSP Profile"
            className="
              w-full px-3 py-2 rounded-lg text-sm
              bg-[rgba(255,255,255,0.04)] border border-[rgba(99,102,241,0.2)]
              text-white placeholder-[rgba(100,116,139,0.6)]
              focus:outline-none focus:border-[rgba(99,102,241,0.5)]
              transition-colors
            "
          />
        </div>

        {/* KSP folder picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[rgba(148,163,184,0.7)] uppercase tracking-wider">
            KSP Installation Folder
          </label>

          {/* Auto-detect button */}
          <button
            onClick={handleAutoDetect}
            disabled={detecting}
            className="
              w-full px-3 py-2.5 rounded-lg text-sm font-medium
              bg-[rgba(99,102,241,0.12)] hover:bg-[rgba(99,102,241,0.22)]
              text-[rgba(196,181,253,0.9)] border border-[rgba(99,102,241,0.2)]
              transition-colors cursor-pointer disabled:opacity-50
              flex items-center justify-center gap-2
            "
          >
            {detecting ? (
              <span className="animate-pulse">Searching for KSP...</span>
            ) : (
              <>
                <span>Auto-detect (Steam / GOG / Epic)</span>
              </>
            )}
          </button>

          {/* Detected installations */}
          {showDetected && detectedPaths.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              {detectedPaths.map((d, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectDetected(d)}
                  className="
                    w-full text-left px-3 py-2 rounded-lg text-sm
                    bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.2)]
                    hover:bg-[rgba(74,222,128,0.15)] transition-colors cursor-pointer
                  "
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[rgba(74,222,128,0.9)] font-medium">{d.source}</span>
                    <span className="text-xs text-[rgba(148,163,184,0.6)]">KSP {d.version}</span>
                  </div>
                  <p className="text-xs text-[rgba(148,163,184,0.5)] mt-0.5 truncate">{d.path}</p>
                </button>
              ))}
            </div>
          )}
          {showDetected && detectedPaths.length === 0 && !detecting && (
            <p className="text-xs text-[rgba(252,165,165,0.8)]">
              No KSP installation found automatically. Use Browse to select manually.
            </p>
          )}

          {/* Manual path input */}
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={kspPath}
              onChange={(e) => setKspPath(e.target.value)}
              placeholder="Or enter path manually..."
              className="
                flex-1 min-w-0 px-3 py-2 rounded-lg text-sm
                bg-[rgba(255,255,255,0.04)] border border-[rgba(99,102,241,0.2)]
                text-white placeholder-[rgba(100,116,139,0.6)]
                focus:outline-none focus:border-[rgba(99,102,241,0.5)]
                transition-colors
              "
            />
            <button
              onClick={handleBrowse}
              className="
                px-3 py-2 rounded-lg text-sm font-medium
                bg-[rgba(99,102,241,0.15)] hover:bg-[rgba(99,102,241,0.25)]
                text-[rgba(196,181,253,0.9)] border border-[rgba(99,102,241,0.25)]
                transition-colors cursor-pointer flex-shrink-0
              "
            >
              Browse
            </button>
          </div>

          {/* Validation status */}
          <div className="min-h-[20px]">
            {validating && (
              <p className="text-xs text-[rgba(99,102,241,0.8)] animate-pulse">
                Validating path...
              </p>
            )}
            {!validating && validationResult && kspPath.trim() && (
              validationResult.valid ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[rgba(74,222,128,0.9)]">
                    Valid KSP installation
                  </span>
                  {validationResult.kspVersion && (
                    <span className="text-xs text-[rgba(74,222,128,0.65)]">
                      (KSP {validationResult.kspVersion})
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[rgba(252,165,165,0.9)]">
                  {validationResult.message}
                </p>
              )
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="
              px-4 py-2 rounded-lg text-sm font-medium
              text-[rgba(148,163,184,0.8)] hover:text-white
              bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)]
              border border-[rgba(255,255,255,0.08)]
              transition-colors cursor-pointer
            "
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className={`
              px-5 py-2 rounded-lg text-sm font-semibold
              transition-colors
              ${
                canCreate
                  ? 'bg-[rgba(99,102,241,0.9)] hover:bg-[rgba(99,102,241,1)] text-white border border-[rgba(99,102,241,0.4)] cursor-pointer'
                  : 'bg-[rgba(99,102,241,0.2)] text-[rgba(148,163,184,0.4)] border border-[rgba(99,102,241,0.15)] cursor-not-allowed'
              }
            `}
          >
            {creating ? 'Creating...' : 'Create Profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

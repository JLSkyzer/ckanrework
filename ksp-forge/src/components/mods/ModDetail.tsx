import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { ModVersionRow, SpaceDockCacheRow } from '../../../electron/types'
import { useModStore } from '../../stores/mod-store'
import { useUiStore } from '../../stores/ui-store'
import { useProfileStore } from '../../stores/profile-store'
import { formatDownloads, formatDate } from '../../lib/format'
import { ModDependencies } from './ModDependencies'

type Tab = 'description' | 'changelog' | 'dependencies'

function renderDescription(sdData: SpaceDockCacheRow | null, mod: { abstract: string | null }): string {
  if (sdData?.description_html) {
    return DOMPurify.sanitize(sdData.description_html)
  }
  if (sdData?.description) {
    const result = marked.parse(sdData.description)
    const html = typeof result === 'string' ? result : mod.abstract ?? ''
    return DOMPurify.sanitize(html)
  }
  if (mod.abstract) {
    return DOMPurify.sanitize(`<p>${mod.abstract}</p>`)
  }
  return '<p style="color: rgba(148,163,184,0.6)">No description available.</p>'
}

export function ModDetail() {
  const { selectedModId, goBack } = useUiStore()
  const { mods, fetchSpaceDockData, fetchModVersions } = useModStore()
  const { installedMods, activeProfileId } = useProfileStore()

  const [sdData, setSdData] = useState<SpaceDockCacheRow | null>(null)
  const [versions, setVersions] = useState<ModVersionRow[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('description')
  const [loadingMeta, setLoadingMeta] = useState(true)

  const mod = useMemo(
    () => mods.find((m) => m.identifier === selectedModId) ?? null,
    [mods, selectedModId],
  )

  const isInstalled = installedMods.some((m) => m.identifier === selectedModId)
  const installedVersion = installedMods.find((m) => m.identifier === selectedModId)?.version

  useEffect(() => {
    if (!mod) return
    setLoadingMeta(true)
    setActiveTab('description')
    setSdData(null)
    setVersions([])

    Promise.all([
      mod.spacedock_id ? fetchSpaceDockData(mod.identifier) : Promise.resolve(null),
      fetchModVersions(mod.identifier),
    ]).then(([sd, vers]) => {
      setSdData(sd)
      setVersions(vers)
      setLoadingMeta(false)
    })
  }, [mod?.identifier])

  // Parse resources
  const resources = useMemo(() => {
    if (!mod?.resources) return {}
    try {
      return JSON.parse(mod.resources) as Record<string, string>
    } catch {
      return {}
    }
  }, [mod?.resources])

  const descriptionHtml = useMemo(() => {
    if (!mod) return ''
    return renderDescription(sdData, mod)
  }, [sdData, mod])

  if (!mod) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[rgba(148,163,184,0.6)]">Mod not found.</p>
      </div>
    )
  }

  const authorList = Array.isArray(mod.author) ? mod.author.join(', ') : mod.author
  const bannerUrl = sdData?.background_url ?? null

  const kspVersionDisplay =
    mod.ksp_version ??
    (mod.ksp_version_min && mod.ksp_version_max
      ? `${mod.ksp_version_min} – ${mod.ksp_version_max}`
      : mod.ksp_version_min ?? mod.ksp_version_max ?? '—')

  const downloads = sdData?.downloads ?? null

  const TABS: { id: Tab; label: string }[] = [
    { id: 'description', label: 'Description' },
    { id: 'changelog', label: 'Changelog' },
    { id: 'dependencies', label: 'Dependencies' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Back button */}
      <div className="flex-shrink-0 px-6 pt-5 pb-2">
        <button
          onClick={goBack}
          className="
            flex items-center gap-1.5 text-sm
            text-[rgba(148,163,184,0.7)] hover:text-white
            transition-colors duration-150 cursor-pointer
          "
        >
          <span>←</span>
          <span>Back to mods</span>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero banner */}
        <div className="relative mx-6 rounded-xl overflow-hidden" style={{ height: 200 }}>
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt={mod.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background:
                  'linear-gradient(135deg, rgba(99,102,241,0.4) 0%, rgba(139,92,246,0.25) 60%, rgba(14,14,26,0.95) 100%)',
              }}
            />
          )}
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(13,13,26,0.85)] via-transparent to-transparent" />
          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <h1 className="text-2xl font-bold text-white leading-tight">{mod.name}</h1>
            <p className="text-sm text-[rgba(196,181,253,0.85)] mt-0.5">by {authorList}</p>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex gap-6 px-6 pt-5 pb-8">
          {/* Left: tabs + content */}
          <div className="flex-1 min-w-0">
            {/* Tab navigation */}
            <div className="flex gap-1 mb-4 border-b border-[rgba(99,102,241,0.12)] pb-0">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-4 py-2 text-sm font-medium rounded-t-lg transition-colors duration-150 cursor-pointer
                    ${
                      activeTab === tab.id
                        ? 'text-[rgba(196,181,253,1)] border-b-2 border-[rgba(99,102,241,0.8)] -mb-px bg-[rgba(99,102,241,0.05)]'
                        : 'text-[rgba(148,163,184,0.7)] hover:text-white'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="min-h-[200px]">
              {loadingMeta ? (
                <div className="py-10 text-center">
                  <p className="text-[rgba(99,102,241,0.8)] animate-pulse">Loading...</p>
                </div>
              ) : (
                <>
                  {activeTab === 'description' && (
                    <div
                      className="prose-mod text-sm text-[rgba(226,232,240,0.85)] leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                    />
                  )}

                  {activeTab === 'changelog' && (
                    <div className="flex flex-col gap-3">
                      {versions.length === 0 ? (
                        <p className="text-[rgba(148,163,184,0.6)] text-sm">
                          No changelog available.
                        </p>
                      ) : (
                        versions.map((v) => {
                          const kspVer =
                            v.ksp_version ??
                            (v.ksp_version_min && v.ksp_version_max
                              ? `${v.ksp_version_min}–${v.ksp_version_max}`
                              : v.ksp_version_min ?? v.ksp_version_max ?? null)
                          return (
                            <div
                              key={v.version}
                              className="
                                rounded-lg px-4 py-3
                                bg-[rgba(255,255,255,0.03)]
                                border border-[rgba(99,102,241,0.1)]
                              "
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-white">
                                  v{v.version}
                                </span>
                                {kspVer && (
                                  <span className="text-xs text-[rgba(99,102,241,0.9)] bg-[rgba(99,102,241,0.1)] px-2 py-0.5 rounded">
                                    KSP {kspVer}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}

                  {activeTab === 'dependencies' && (
                    <ModDependencies versions={versions} />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-[220px] flex-shrink-0 flex flex-col gap-4">
            {/* Install / Uninstall button */}
            <div>
              {isInstalled ? (
                <button
                  disabled
                  className="
                    w-full py-2.5 rounded-lg text-sm font-semibold
                    bg-[rgba(99,102,241,0.08)] text-[rgba(99,102,241,0.6)]
                    border border-[rgba(99,102,241,0.2)]
                    cursor-not-allowed
                  "
                >
                  ✓ Installed ({installedVersion})
                </button>
              ) : (
                <button
                  disabled
                  className="
                    w-full py-2.5 rounded-lg text-sm font-semibold
                    bg-[rgba(99,102,241,0.8)] text-white
                    border border-[rgba(99,102,241,0.4)]
                    hover:bg-[rgba(99,102,241,1)] transition-colors
                    cursor-not-allowed opacity-60
                  "
                  title="Install dialog coming soon"
                >
                  Install
                </button>
              )}
              <p className="text-[10px] text-[rgba(100,116,139,0.6)] text-center mt-1">
                Install dialog coming soon
              </p>
            </div>

            {/* Metadata */}
            <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.1)] p-4 flex flex-col gap-3">
              <MetaRow label="Version" value={mod.latest_version} />
              <MetaRow label="KSP Version" value={kspVersionDisplay} />
              <MetaRow
                label="License"
                value={Array.isArray(mod.license) ? mod.license.join(', ') : mod.license}
              />
              {downloads != null && (
                <MetaRow label="Downloads" value={formatDownloads(downloads)} />
              )}
              <MetaRow label="Updated" value={formatDate(mod.updated_at)} />
            </div>

            {/* Links */}
            {(resources.homepage || resources.spacedock || resources.repository || resources.bugtracker) && (
              <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(99,102,241,0.1)] p-4 flex flex-col gap-2">
                <p className="text-xs font-semibold text-[rgba(148,163,184,0.7)] uppercase tracking-wider mb-1">
                  Links
                </p>
                {resources.homepage && (
                  <LinkItem href={resources.homepage} label="Homepage" />
                )}
                {resources.spacedock && (
                  <LinkItem href={resources.spacedock} label="SpaceDock" />
                )}
                {resources.repository && (
                  <LinkItem href={resources.repository} label="Repository" />
                )}
                {resources.bugtracker && (
                  <LinkItem href={resources.bugtracker} label="Bug Tracker" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[rgba(100,116,139,0.8)] uppercase tracking-wider">
        {label}
      </span>
      <span className="text-xs text-[rgba(226,232,240,0.9)] font-medium">
        {value || '—'}
      </span>
    </div>
  )
}

function LinkItem({ href, label }: { href: string; label: string }) {
  const handleClick = () => {
    // Open in external browser via Electron shell - best effort
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).electronAPI) {
      // Will be wired up when shell.openExternal is exposed
    }
    // Fallback: try window.open
    window.open(href, '_blank', 'noopener')
  }

  return (
    <button
      onClick={handleClick}
      className="
        text-left text-xs text-[rgba(99,102,241,0.85)]
        hover:text-[rgba(196,181,253,1)] transition-colors
        cursor-pointer truncate
      "
    >
      {label} ↗
    </button>
  )
}

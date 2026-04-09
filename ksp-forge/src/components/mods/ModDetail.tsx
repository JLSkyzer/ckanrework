import { useEffect, useMemo, useState, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { ModVersionRow, SpaceDockCacheRow } from '../../../electron/types'
import { useModStore } from '../../stores/mod-store'
import { useUiStore } from '../../stores/ui-store'
import { useProfileStore } from '../../stores/profile-store'
import { formatDownloads, formatDate } from '../../lib/format'
import { ModDependencies } from './ModDependencies'
import { useInstallStore } from '../../stores/install-store'
import { InstallDialog } from '../install/InstallDialog'

type Tab = 'description' | 'screenshots' | 'changelog' | 'dependencies'

function extractImages(html: string): string[] {
  const imgs: string[] = []
  const regex = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const src = match[1]
    // Filter out tiny icons, badges, spacers
    if (
      src &&
      !src.includes('badge') &&
      !src.includes('shield.io') &&
      !src.includes('img.shields') &&
      !src.includes('spacer') &&
      !src.includes('1x1') &&
      !src.endsWith('.svg')
    ) {
      imgs.push(src)
    }
  }
  return imgs
}

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
  const { installedMods, activeProfileId, fetchInstalledMods } = useProfileStore()
  const { resolution, showDialog, installing, progress, requestInstall, confirmInstall, cancelInstall } = useInstallStore()

  const [sdData, setSdData] = useState<SpaceDockCacheRow | null>(null)
  const [versions, setVersions] = useState<ModVersionRow[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('description')
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)
  const [scrapedImages, setScrapedImages] = useState<string[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [forumDescription, setForumDescription] = useState<string | null>(null)

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

    setForumDescription(null)

    Promise.all([
      mod.spacedock_id ? fetchSpaceDockData(mod.identifier) : Promise.resolve(null),
      fetchModVersions(mod.identifier),
    ]).then(([sd, vers]) => {
      setSdData(sd)
      setVersions(vers)
      setLoadingMeta(false)

      // Always try to fetch forum description (it's the most complete)
      window.electronAPI?.images?.forumDescription(mod.identifier).then((html) => {
        if (html) {
          console.log(`[ModDetail] Got forum description for ${mod.identifier}: ${html.length} chars`)
          setForumDescription(html)
        }
      }).catch(() => {})
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
    // Prefer forum description (first post, always the most complete)
    if (forumDescription) return DOMPurify.sanitize(forumDescription)
    return renderDescription(sdData, mod)
  }, [sdData, mod, forumDescription])

  // Quick local extraction for tab count (fast, no network)
  const quickImageCount = useMemo(() => {
    let count = 0
    if (sdData?.background_url) count++
    if (sdData?.description_html) count += extractImages(sdData.description_html).length
    return count
  }, [sdData])

  // Full scrape triggered when Screenshots tab is opened
  useEffect(() => {
    if (activeTab === 'screenshots' && mod && scrapedImages.length === 0 && !loadingImages) {
      setLoadingImages(true)
      window.electronAPI.images.scrape(mod.identifier).then((imgs) => {
        setScrapedImages(imgs)
        setLoadingImages(false)
      }).catch(() => setLoadingImages(false))
    }
  }, [activeTab, mod?.identifier])

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

  const screenshotLabel = scrapedImages.length > 0
    ? `Screenshots (${scrapedImages.length})`
    : quickImageCount > 0
      ? `Screenshots (~${quickImageCount}+)`
      : 'Screenshots'

  const TABS: { id: Tab; label: string }[] = [
    { id: 'description', label: 'Description' },
    { id: 'screenshots', label: screenshotLabel },
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

      {/* Install Dialog */}
      {showDialog && resolution && (
        <InstallDialog
          resolution={resolution}
          onConfirm={confirmInstall}
          onCancel={cancelInstall}
        />
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={lightboxImg}
            alt="Screenshot"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

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

                  {activeTab === 'screenshots' && (
                    loadingImages ? (
                      <div className="py-10 text-center">
                        <p className="text-[rgba(99,102,241,0.8)] animate-pulse">
                          Scanning homepage, GitHub, SpaceDock for images...
                        </p>
                      </div>
                    ) : scrapedImages.length === 0 ? (
                      <p className="text-[rgba(148,163,184,0.6)] text-sm py-4">
                        No screenshots found.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {scrapedImages.map((src, i) => (
                          <ScreenshotThumb key={i} src={src} onClick={() => setLightboxImg(src)} />
                        ))}
                      </div>
                    )
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
                  onClick={async () => {
                    if (!activeProfileId) return
                    const prof = useProfileStore.getState().getActiveProfile()
                    if (!prof) return
                    try {
                      await window.electronAPI.installer.uninstall(activeProfileId, mod.identifier, prof.ksp_path)
                      await fetchInstalledMods(activeProfileId)
                    } catch (err) {
                      console.error('Uninstall failed:', err)
                    }
                  }}
                  className="
                    w-full py-2.5 rounded-lg text-sm font-semibold
                    bg-[rgba(239,68,68,0.12)] text-[rgba(252,165,165,0.9)]
                    border border-[rgba(239,68,68,0.25)]
                    hover:bg-[rgba(239,68,68,0.2)] transition-colors cursor-pointer
                  "
                >
                  ✓ Installed ({installedVersion}) — Uninstall
                </button>
              ) : (
                <button
                  disabled={installing || !activeProfileId}
                  onClick={() => requestInstall([mod.identifier])}
                  className={`
                    w-full py-2.5 rounded-lg text-sm font-semibold
                    border transition-colors
                    ${installing
                      ? 'bg-[rgba(99,102,241,0.3)] text-[rgba(148,163,184,0.6)] border-[rgba(99,102,241,0.2)] cursor-not-allowed'
                      : 'bg-[rgba(99,102,241,0.8)] text-white border-[rgba(99,102,241,0.4)] hover:bg-[rgba(99,102,241,1)] cursor-pointer'
                    }
                  `}
                >
                  {installing && progress.currentName === mod.identifier
                    ? `Installing... ${progress.current}/${progress.total}`
                    : installing
                    ? 'Installing...'
                    : 'Install'}
                </button>
              )}
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
              <MetaRow label="Author" value={authorList} />
              {mod.release_date && (
                <MetaRow label="Updated" value={new Date(mod.release_date).toLocaleDateString()} />
              )}
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

const MIN_IMG_WIDTH = 150
const MIN_IMG_HEIGHT = 100

function ScreenshotThumb({ src, onClick }: { src: string; onClick: () => void }) {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <button
      onClick={onClick}
      className="rounded-lg overflow-hidden border border-[rgba(99,102,241,0.1)] hover:border-[rgba(99,102,241,0.4)] transition-colors cursor-pointer group"
    >
      <img
        src={src}
        alt="Screenshot"
        className="w-full h-[180px] object-cover group-hover:scale-105 transition-transform duration-200"
        loading="lazy"
        onLoad={(e) => {
          const img = e.target as HTMLImageElement
          if (img.naturalWidth < MIN_IMG_WIDTH || img.naturalHeight < MIN_IMG_HEIGHT) {
            setVisible(false)
          }
        }}
        onError={() => setVisible(false)}
      />
    </button>
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

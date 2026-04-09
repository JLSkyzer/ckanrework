import type { DatabaseService } from './database'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const FETCH_TIMEOUT = 10000

// Patterns to exclude (badges, icons, avatars, tracking pixels, forum UI)
const EXCLUDE_PATTERNS = [
  /badge/i, /shield\.io/i, /img\.shields/i, /spacer/i,
  /1x1/, /avatar/i, /favicon/i, /\.ico(\?|$)/i,
  /icon/i, /logo/i, /\.svg(\?|$)/i,
  /emoji/i, /smilie/i, /smiley/i, /emoticon/i,
  /pixel\.gif/i, /clear\.gif/i, /blank\.gif/i,
  /gravatar/i, /user_avatar/i, /profile_photo/i,
  /button/i, /banner_ad/i, /ads\//i, /advert/i,
  /spinner/i, /loading/i, /ajax/i,
  // Forum-specific
  /statusicon/i, /rating/i, /rank/i, /star/i,
  /forum.*\/images\//i, /themes\//i, /styles\//i,
  /css\//i, /ui\//i, /assets\/icons/i,
  /arrow/i, /caret/i, /chevron/i, /close/i,
  /attach/i, /paperclip/i, /quote/i,
  /like/i, /dislike/i, /thumb/i, /vote/i,
  /social/i, /share/i, /twitter/i, /facebook/i,
  /discord/i, /patreon/i, /donate/i, /paypal/i,
  /flag_/i, /country/i, /locale/i,
  /\.gif(\?|$)/i, // Most GIFs are reaction images or animations, not screenshots
  /\bx\b.*\bpng/i, // Things like "16x16.png"
  /online_icon/i, /offline_icon/i,
]

// Minimum filename length (to exclude things like "a.png", "bg.jpg")
const MIN_FILENAME_LENGTH = 6

function shouldInclude(src: string): boolean {
  if (EXCLUDE_PATTERNS.some(p => p.test(src))) return false
  // Check filename isn't too short (usually icons)
  try {
    const url = new URL(src)
    const filename = url.pathname.split('/').pop() || ''
    if (filename.length < MIN_FILENAME_LENGTH) return false
  } catch { /* ignore */ }
  return true
}

function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  const imgs: string[] = []
  // Match <img> tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    let src = match[1]
    if (!src) continue
    // Resolve relative URLs
    if (src.startsWith('//')) src = 'https:' + src
    else if (src.startsWith('/')) {
      try {
        const u = new URL(baseUrl)
        src = u.origin + src
      } catch { continue }
    } else if (!src.startsWith('http')) {
      try {
        src = new URL(src, baseUrl).href
      } catch { continue }
    }
    if (shouldInclude(src)) imgs.push(src)
  }

  // Also match markdown images ![alt](url)
  const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g
  while ((match = mdRegex.exec(html)) !== null) {
    let src = match[1]
    if (src && src.startsWith('http') && shouldInclude(src)) imgs.push(src)
  }

  // Match links to image files (common on forums)
  const linkRegex = /href=["']([^"']+\.(?:png|jpg|jpeg|gif|webp))["']/gi
  while ((match = linkRegex.exec(html)) !== null) {
    let src = match[1]
    if (src.startsWith('//')) src = 'https:' + src
    else if (!src.startsWith('http')) {
      try { src = new URL(src, baseUrl).href } catch { continue }
    }
    if (shouldInclude(src)) imgs.push(src)
  }

  return imgs
}

// For GitHub, fetch raw README and extract images
function extractImagesFromGithubReadme(html: string, repoUrl: string): string[] {
  const imgs: string[] = []
  // GitHub renders README in the page, images are often in /blob/ or raw URLs
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    let src = match[1]
    if (!src) continue
    // Convert GitHub blob URLs to raw
    if (src.includes('github.com') && src.includes('/blob/')) {
      src = src.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
    }
    if (src.startsWith('//')) src = 'https:' + src
    else if (!src.startsWith('http')) {
      // Relative to repo
      try {
        const parts = repoUrl.replace(/\/$/, '').split('/')
        const owner = parts[parts.length - 2]
        const repo = parts[parts.length - 1]
        src = `https://raw.githubusercontent.com/${owner}/${repo}/master/${src}`
      } catch { continue }
    }
    if (shouldInclude(src)) imgs.push(src)
  }
  return imgs
}

export class ImageScraperService {
  private db: DatabaseService
  private cache = new Map<string, { images: string[]; fetchedAt: number }>()

  constructor(db: DatabaseService) {
    this.db = db
  }

  async scrapeModImages(modIdentifier: string): Promise<string[]> {
    // Check memory cache
    const cached = this.cache.get(modIdentifier)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.images
    }

    const mod = this.db.getMod(modIdentifier)
    if (!mod) return []

    const resources: Record<string, string> = mod.resources ? JSON.parse(mod.resources) : {}
    const allImages: string[] = []

    // Fetch from SpaceDock description (already cached in spacedock_cache)
    const sdCache = this.db.getSpaceDockCache(modIdentifier)
    if (sdCache?.background_url) allImages.push(sdCache.background_url)
    if (sdCache?.description_html) {
      allImages.push(...extractImagesFromHtml(sdCache.description_html, resources.spacedock || ''))
    }

    // Fetch from each resource URL in parallel
    const fetchPromises: Promise<string[]>[] = []

    if (resources.homepage) {
      fetchPromises.push(this.fetchAndExtract(resources.homepage, 'generic'))
    }
    if (resources.repository) {
      fetchPromises.push(this.fetchAndExtract(resources.repository, 'github'))
    }
    // SpaceDock page itself (may have more images than the API returns)
    if (resources.spacedock) {
      fetchPromises.push(this.fetchAndExtract(resources.spacedock, 'generic'))
    }

    const results = await Promise.allSettled(fetchPromises)
    for (const r of results) {
      if (r.status === 'fulfilled') allImages.push(...r.value)
    }

    // Deduplicate and filter
    const unique = [...new Set(allImages)].filter(url => {
      try { new URL(url); return true } catch { return false }
    })

    this.cache.set(modIdentifier, { images: unique, fetchedAt: Date.now() })
    return unique
  }

  private async fetchAndExtract(url: string, type: 'generic' | 'github'): Promise<string[]> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'KSP-Forge/1.0 (mod manager)' },
        redirect: 'follow',
      })
      clearTimeout(timeout)

      if (!response.ok) return []

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('text/html') && !contentType.includes('application/json')) return []

      const html = await response.text()

      if (type === 'github') {
        return extractImagesFromGithubReadme(html, url)
      }
      return extractImagesFromHtml(html, url)
    } catch {
      return []
    }
  }
}

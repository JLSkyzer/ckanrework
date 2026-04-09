import type { DatabaseService } from './database'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FETCH_TIMEOUT = 10000

// Only keep images that look like actual screenshots/content
const ALLOWED_EXTENSIONS = /\.(png|jpg|jpeg|webp)(\?|$)/i

// Domains known to host actual mod images
const IMAGE_HOST_WHITELIST = [
  'imgur.com', 'i.imgur.com',
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'github.com',
  'spacedock.info/content',
  'i.postimg.cc', 'postimg.cc',
  'ibb.co', 'i.ibb.co',
  'flickr.com', 'staticflickr.com',
  'media.discordapp.net', 'cdn.discordapp.com',
  'drive.google.com',
  'dropbox.com',
  'i.redd.it', 'preview.redd.it',
]

// Patterns that are definitely NOT content images
const EXCLUDE_PATTERNS = [
  /badge/i, /shield\.io/i, /img\.shields/i,
  /avatar/i, /favicon/i, /\.ico(\?|$)/i,
  /\.svg(\?|$)/i, /\.gif(\?|$)/i,
  /emoji/i, /smilie/i, /smiley/i, /emoticon/i,
  /gravatar/i, /user_avatar/i,
  /spinner/i, /loading/i,
  /spacer/i, /blank/i, /pixel/i, /clear\./i,
  /1x1/i, /transparent/i,
  // Social/UI
  /social/i, /share/i, /twitter/i, /facebook/i,
  /discord.*logo/i, /patreon/i, /donate/i, /paypal/i,
  /button/i, /icon/i, /logo/i,
  /arrow/i, /caret/i, /chevron/i,
  // Forum theme/UI
  /themes\//i, /styles\//i, /css\//i,
  /core\/images/i, /js\/tinymce/i,
  /statusicon/i, /rating/i, /rank/i,
  /online_icon/i, /offline_icon/i,
  /flag_/i, /country\//i,
  /monthly_\d/i, // forum award badges
  /announce/i, /sticky/i,
]

function isContentImage(src: string): boolean {
  // Must be a real image extension
  if (!ALLOWED_EXTENSIONS.test(src)) return false
  // Must not match any exclude pattern
  if (EXCLUDE_PATTERNS.some(p => p.test(src))) return false
  return true
}

function isFromTrustedHost(src: string): boolean {
  try {
    const hostname = new URL(src).hostname
    return IMAGE_HOST_WHITELIST.some(h => hostname.includes(h))
  } catch { return false }
}

function extractContentImages(html: string, baseUrl: string): string[] {
  const imgs: string[] = []

  // Strategy 1: Extract images from known content containers
  // KSP Forum: post content is in data-role="commentContent" or class containing "Post" or "entry-content"
  // GitHub: class="markdown-body" or id="readme"
  // SpaceDock: class="mod-desc" or similar
  const contentPatterns = [
    // KSP Forum / Invision
    /data-role="commentContent"[^>]*>([\s\S]*?)<\/div>/gi,
    /class="[^"]*cPost_contentWrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
    /class="[^"]*ipsType_richText[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // GitHub
    /class="[^"]*markdown-body[^"]*"[^>]*>([\s\S]*?)<\/article>/gi,
    /id="readme"[^>]*>([\s\S]*?)<\/article>/gi,
    // SpaceDock
    /class="[^"]*mod-description[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // Generic
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<main[^>]*>([\s\S]*?)<\/main>/gi,
  ]

  let contentHtml = ''
  for (const pattern of contentPatterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      contentHtml += match[1] + '\n'
    }
  }

  // If no content area found, DON'T fall back to full page (that's where the junk comes from)
  // Instead, only extract images from trusted hosts from the full page
  const searchHtml = contentHtml || html
  const useStrictMode = !contentHtml // No content area found = be strict

  // Extract <img> src
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = imgRegex.exec(searchHtml)) !== null) {
    let src = resolveUrl(match[0].includes('data-src') ? '' : match[1], baseUrl)
    if (!src) continue

    // Also check for data-src (lazy loaded images, common on forums)
    const dataSrcMatch = match[0].match(/data-src=["']([^"']+)["']/)
    if (dataSrcMatch) {
      const dataSrc = resolveUrl(dataSrcMatch[1], baseUrl)
      if (dataSrc) src = dataSrc // prefer data-src (actual image URL)
    }

    if (useStrictMode) {
      // Only allow images from trusted hosting sites
      if (isFromTrustedHost(src) && isContentImage(src)) imgs.push(src)
    } else {
      if (isContentImage(src)) imgs.push(src)
    }
  }

  // Also extract markdown images ![](url) from content
  const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g
  while ((match = mdRegex.exec(searchHtml)) !== null) {
    const src = match[1]
    if (src?.startsWith('http') && isContentImage(src)) imgs.push(src)
  }

  return imgs
}

function resolveUrl(src: string, baseUrl: string): string | null {
  if (!src) return null
  if (src.startsWith('data:')) return null
  if (src.startsWith('//')) src = 'https:' + src
  else if (src.startsWith('/')) {
    try { src = new URL(src, baseUrl).href } catch { return null }
  } else if (!src.startsWith('http')) {
    try { src = new URL(src, baseUrl).href } catch { return null }
  }
  // Convert GitHub blob to raw
  if (src.includes('github.com') && src.includes('/blob/')) {
    src = src.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
  }
  return src
}

export class ImageScraperService {
  private db: DatabaseService
  private cache = new Map<string, { images: string[]; fetchedAt: number }>()

  constructor(db: DatabaseService) {
    this.db = db
  }

  async scrapeModImages(modIdentifier: string): Promise<string[]> {
    const cached = this.cache.get(modIdentifier)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.images
    }

    const mod = this.db.getMod(modIdentifier)
    if (!mod) return []

    const resources: Record<string, string> = mod.resources ? JSON.parse(mod.resources) : {}
    const allImages: string[] = []

    // SpaceDock banner
    const sdCache = this.db.getSpaceDockCache(modIdentifier)
    if (sdCache?.background_url) allImages.push(sdCache.background_url)

    // SpaceDock description (already have it, no fetch needed)
    if (sdCache?.description_html) {
      allImages.push(...extractContentImages(sdCache.description_html, resources.spacedock || 'https://spacedock.info'))
    }

    // Fetch each resource URL in parallel
    const urls: { url: string; label: string }[] = []
    if (resources.homepage) urls.push({ url: resources.homepage, label: 'homepage' })
    if (resources.repository) urls.push({ url: resources.repository, label: 'github' })

    const results = await Promise.allSettled(
      urls.map(({ url }) => this.fetchPage(url))
    )

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled' && r.value) {
        allImages.push(...extractContentImages(r.value, urls[i].url))
      }
    }

    // Deduplicate, validate URLs
    const unique = [...new Set(allImages)].filter(url => {
      try { new URL(url); return true } catch { return false }
    })

    this.cache.set(modIdentifier, { images: unique, fetchedAt: Date.now() })
    return unique
  }

  private async fetchPage(url: string): Promise<string | null> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'KSP-Forge/1.0 (mod manager)' },
        redirect: 'follow',
      })
      clearTimeout(timeout)
      if (!response.ok) return null
      const ct = response.headers.get('content-type') || ''
      if (!ct.includes('text/html') && !ct.includes('application/json')) return null
      return response.text()
    } catch {
      return null
    }
  }
}

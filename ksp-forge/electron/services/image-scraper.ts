import fs from 'fs'
import path from 'path'
import { BrowserWindow } from 'electron'
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
  // KSP Forum image hosting
  'forum.kerbalspaceprogram.com/uploads',
  'forum.kerbalspaceprogram.com/applications',
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
    // KSP Forum / Invision Community — first post content
    /data-role="commentContent"[^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>\s*(?:<aside|<ul\s+class="ipsList_reset))/i,
    /class="[^"]*cPost_contentWrap[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
    /class="[^"]*ipsType_richText\s+ipsContained[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
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

  // Extract <img> tags — prefer data-src (lazy-loaded real URL) over src
  const imgRegex = /<img[^>]*>/gi
  let match
  while ((match = imgRegex.exec(searchHtml)) !== null) {
    const tag = match[0]

    // Prefer data-src for lazy-loaded images (common on Invision Community forums)
    const dataSrcMatch = tag.match(/data-src=["']([^"']+)["']/)
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/)

    let src: string | null = null
    if (dataSrcMatch) {
      src = resolveUrl(dataSrcMatch[1], baseUrl)
    }
    if (!src && srcMatch) {
      src = resolveUrl(srcMatch[1], baseUrl)
    }
    if (!src) continue

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
  private descriptionCache = new Map<string, { html: string; fetchedAt: number }>()
  private cacheDir: string

  constructor(db: DatabaseService, cacheDir: string) {
    this.db = db
    this.cacheDir = cacheDir
    fs.mkdirSync(path.join(cacheDir, 'images'), { recursive: true })
    fs.mkdirSync(path.join(cacheDir, 'descriptions'), { recursive: true })
    this.loadDiskCache()
  }

  private loadDiskCache() {
    // Load cached images lists
    const imagesDir = path.join(this.cacheDir, 'images')
    try {
      for (const file of fs.readdirSync(imagesDir)) {
        if (!file.endsWith('.json')) continue
        try {
          const data = JSON.parse(fs.readFileSync(path.join(imagesDir, file), 'utf-8'))
          if (data.images && data.fetchedAt && Date.now() - data.fetchedAt < CACHE_TTL_MS) {
            this.cache.set(file.replace('.json', ''), data)
          }
        } catch { /* skip corrupt */ }
      }
    } catch { /* dir doesn't exist yet */ }

    // Load cached descriptions
    const descDir = path.join(this.cacheDir, 'descriptions')
    try {
      for (const file of fs.readdirSync(descDir)) {
        if (!file.endsWith('.json')) continue
        try {
          const data = JSON.parse(fs.readFileSync(path.join(descDir, file), 'utf-8'))
          if (data.html && data.fetchedAt && Date.now() - data.fetchedAt < CACHE_TTL_MS) {
            this.descriptionCache.set(file.replace('.json', ''), data)
          }
        } catch { /* skip corrupt */ }
      }
    } catch { /* dir doesn't exist yet */ }
  }

  private saveToDisk(type: 'images' | 'descriptions', identifier: string, data: any) {
    try {
      const dir = path.join(this.cacheDir, type)
      fs.writeFileSync(path.join(dir, `${identifier}.json`), JSON.stringify(data))
    } catch { /* ignore write errors */ }
  }

  getCachedImages(modIdentifier: string): string[] | null {
    const cached = this.cache.get(modIdentifier)
    return cached ? cached.images : null
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

    const cacheEntry = { images: unique, fetchedAt: Date.now() }
    this.cache.set(modIdentifier, cacheEntry)
    this.saveToDisk('images', modIdentifier, cacheEntry)
    return unique
  }

  async scrapeForumDescription(modIdentifier: string): Promise<string | null> {
    const cached = this.descriptionCache.get(modIdentifier)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.html
    }

    const mod = this.db.getMod(modIdentifier)
    if (!mod) return null

    const resources: Record<string, string> = mod.resources ? JSON.parse(mod.resources) : {}
    if (!resources.homepage?.includes('forum.kerbalspaceprogram.com')) return null

    // Use browser to extract first post content via DOM selectors (not regex)
    const result = await this.fetchForumFirstPost(resources.homepage)
    if (result) {
      console.log(`[forum-scraper] Description extracted: ${result.description.length} chars, ${result.images.length} images`)
      const descEntry = { html: result.description, fetchedAt: Date.now() }
      this.descriptionCache.set(modIdentifier, descEntry)
      this.saveToDisk('descriptions', modIdentifier, descEntry)
      // Also cache images from this fetch
      if (result.images.length > 0) {
        const existingCache = this.cache.get(modIdentifier)
        const existingImages = existingCache?.images || []
        const allImages = [...new Set([...existingImages, ...result.images])]
        const imgEntry = { images: allImages, fetchedAt: Date.now() }
        this.cache.set(modIdentifier, imgEntry)
        this.saveToDisk('images', modIdentifier, imgEntry)
      }
      return result.description
    }

    return null
  }

  private fetchForumFirstPost(url: string): Promise<{ description: string; images: string[] } | null> {
    return new Promise((resolve) => {
      console.log('[forum-scraper] Loading for description:', url)

      let resolved = false
      const done = (result: { description: string; images: string[] } | null, reason: string) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        console.log('[forum-scraper] Description done:', reason)
        try { win.destroy() } catch {}
        resolve(result)
      }

      const timer = setTimeout(() => done(null, 'timeout'), 25000)

      const win = new BrowserWindow({
        width: 1280,
        height: 900,
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      })

      let pollCount = 0
      const pollForContent = async () => {
        if (resolved) return
        pollCount++

        try {
          const title: string = await win.webContents.executeJavaScript('document.title')
          if (title.includes('Just a moment')) {
            if (pollCount < 12) setTimeout(pollForContent, 2000)
            else done(null, 'stuck on cloudflare')
            return
          }

          // Extract first post content using DOM selectors
          const result = await win.webContents.executeJavaScript(`
            (function() {
              // Invision Community: first post is the first [data-role="commentContent"]
              const selectors = [
                '[data-role="commentContent"]',
                '.ipsType_richText.ipsContained',
                '.ipsType_richText',
                '.cPost_contentWrap',
              ];

              let content = null;
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.innerHTML.length > 100) {
                  content = el.innerHTML;
                  break;
                }
              }

              if (!content) return null;

              // Also extract images from the first post
              const firstPost = document.querySelector('[data-role="commentContent"]') || document.querySelector('.ipsType_richText');
              const images = [];
              if (firstPost) {
                firstPost.querySelectorAll('img').forEach(img => {
                  const src = img.dataset.src || img.src;
                  if (src && src.startsWith('http') && !src.includes('emoji') && !src.includes('icon')) {
                    images.push(src);
                  }
                });
              }

              return { description: content, images: images };
            })()
          `)

          if (result && result.description) {
            done(result, 'extracted via DOM')
          } else if (pollCount < 12) {
            setTimeout(pollForContent, 2000)
          } else {
            done(null, 'no content found after polling')
          }
        } catch (err) {
          if (pollCount < 12) setTimeout(pollForContent, 2000)
          else done(null, 'error: ' + err)
        }
      }

      win.webContents.on('did-finish-load', () => {
        setTimeout(pollForContent, 2000)
      })

      win.loadURL(url).catch(() => done(null, 'loadURL error'))
    })
  }

  private async fetchPage(url: string): Promise<string | null> {
    // KSP Forum uses Cloudflare — must use Electron BrowserWindow
    if (url.includes('forum.kerbalspaceprogram.com')) {
      return this.fetchWithBrowser(url)
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
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

  private fetchWithBrowser(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      console.log('[forum-scraper] Loading:', url)

      let resolved = false
      const done = (result: string | null, reason: string) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        console.log('[forum-scraper] Done:', reason, result ? `(${result.length} chars)` : '(null)')
        try { win.destroy() } catch {}
        resolve(result)
      }

      const timer = setTimeout(() => done(null, 'timeout after 25s'), 25000)

      const win = new BrowserWindow({
        width: 1280,
        height: 900,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })

      // Poll for content every 2s — Cloudflare does JS redirects so
      // did-finish-load fires on the challenge page, not the final page
      let pollCount = 0
      const maxPolls = 10

      const pollForContent = async () => {
        if (resolved) return
        pollCount++
        console.log(`[forum-scraper] Poll ${pollCount}/${maxPolls}`)

        try {
          const html: string = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
          const title: string = await win.webContents.executeJavaScript('document.title')
          console.log(`[forum-scraper] Title: "${title}", HTML: ${html.length} chars`)

          // Check if we're past Cloudflare
          const isChallenge = title.includes('Just a moment') || html.includes('cf-challenge') || html.length < 10000
          if (!isChallenge) {
            // We have the real page
            const hasContent = html.includes('commentContent') || html.includes('ipsType_richText') || html.includes('ipsContained')
            console.log(`[forum-scraper] Real page loaded, hasContent: ${hasContent}`)
            done(html, 'content found')
            return
          }

          if (pollCount < maxPolls) {
            setTimeout(pollForContent, 2000)
          } else {
            done(null, 'max polls reached, still on challenge')
          }
        } catch (err) {
          console.log('[forum-scraper] Poll error:', err)
          if (pollCount < maxPolls) {
            setTimeout(pollForContent, 2000)
          } else {
            done(null, 'poll error after max retries')
          }
        }
      }

      win.webContents.on('did-finish-load', () => {
        console.log('[forum-scraper] did-finish-load fired')
        // Start polling after first load
        setTimeout(pollForContent, 2000)
      })

      win.webContents.on('did-fail-load', (_e, code, desc) => {
        console.log(`[forum-scraper] did-fail-load: ${code} ${desc}`)
        // Don't resolve on fail — Cloudflare sometimes triggers this before redirect
      })

      win.loadURL(url).catch((err) => {
        console.log('[forum-scraper] loadURL error:', err)
        done(null, 'loadURL error')
      })
    })
  }
}

import fs from 'fs'
import path from 'path'
import type { SpaceDockCacheRow } from '../types'
import type { DatabaseService } from './database'

const SPACEDOCK_API = 'https://spacedock.info/api'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CONCURRENT_FETCHES = 5

interface SpaceDockModResponse {
  name: string
  description: string
  description_html: string
  background: string | null
  downloads: number
  followers: number
  versions: Array<{
    friendly_version: string
    game_version: string
    download_path: string
    changelog: string
    created: string
  }>
}

export class SpaceDockService {
  private db: DatabaseService
  private inflight = new Map<string, Promise<SpaceDockCacheRow | null>>()
  private imageCacheDir: string

  constructor(db: DatabaseService, imageCacheDir: string) {
    this.db = db
    this.imageCacheDir = imageCacheDir
    fs.mkdirSync(imageCacheDir, { recursive: true })
  }

  async getCachedImageUrl(modIdentifier: string): Promise<string | null> {
    const cached = this.db.getSpaceDockCache(modIdentifier)
    if (!cached?.background_url) return null

    const fileName = `${cached.spacedock_id}.jpg`
    const filePath = path.join(this.imageCacheDir, fileName)

    if (fs.existsSync(filePath)) {
      return `file://${filePath.replace(/\\/g, '/')}`
    }

    // Download and cache
    try {
      const response = await fetch(cached.background_url)
      if (!response.ok) return cached.background_url
      const buffer = Buffer.from(await response.arrayBuffer())
      fs.writeFileSync(filePath, buffer)
      return `file://${filePath.replace(/\\/g, '/')}`
    } catch {
      return cached.background_url // fallback to remote URL
    }
  }

  async fetchModData(modIdentifier: string): Promise<SpaceDockCacheRow | null> {
    // Return cached if fresh
    const cached = this.db.getSpaceDockCache(modIdentifier)
    if (cached && Date.now() - cached.fetched_at < CACHE_TTL_MS) {
      return cached
    }

    // Deduplicate in-flight requests
    const existing = this.inflight.get(modIdentifier)
    if (existing) return existing

    const promise = this._fetch(modIdentifier, cached)
    this.inflight.set(modIdentifier, promise)
    promise.finally(() => this.inflight.delete(modIdentifier))
    return promise
  }

  private async _fetch(modIdentifier: string, cached: SpaceDockCacheRow | null): Promise<SpaceDockCacheRow | null> {
    const mod = this.db.getMod(modIdentifier)
    if (!mod?.spacedock_id) return null

    try {
      const response = await fetch(`${SPACEDOCK_API}/mod/${mod.spacedock_id}`)
      if (!response.ok) return cached ?? null
      const data: SpaceDockModResponse = await response.json()
      const cacheRow: SpaceDockCacheRow = {
        spacedock_id: mod.spacedock_id,
        mod_identifier: modIdentifier,
        description: data.description,
        description_html: data.description_html,
        background_url: data.background,
        downloads: data.downloads,
        followers: data.followers,
        fetched_at: Date.now()
      }
      this.db.upsertSpaceDockCache(cacheRow)
      return cacheRow
    } catch {
      return cached ?? null
    }
  }

  async fetchBatch(identifiers: string[]): Promise<Map<string, SpaceDockCacheRow>> {
    const results = new Map<string, SpaceDockCacheRow>()

    // Process in parallel chunks
    for (let i = 0; i < identifiers.length; i += CONCURRENT_FETCHES) {
      const chunk = identifiers.slice(i, i + CONCURRENT_FETCHES)
      const promises = chunk.map(async (id) => {
        const data = await this.fetchModData(id)
        if (data) results.set(id, data)
      })
      await Promise.all(promises)
    }

    return results
  }
}

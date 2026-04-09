import type { SpaceDockCacheRow } from '../types'
import type { DatabaseService } from './database'

const SPACEDOCK_API = 'https://spacedock.info/api'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

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

  constructor(db: DatabaseService) {
    this.db = db
  }

  async fetchModData(modIdentifier: string): Promise<SpaceDockCacheRow | null> {
    const cached = this.db.getSpaceDockCache(modIdentifier)
    if (cached && Date.now() - cached.fetched_at < CACHE_TTL_MS) {
      return cached
    }
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

  async fetchBatch(identifiers: string[]): Promise<void> {
    for (const id of identifiers) {
      await this.fetchModData(id)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}

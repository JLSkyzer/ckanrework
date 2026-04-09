import simpleGit, { SimpleGit } from 'simple-git'
import fs from 'fs'
import path from 'path'
import type { CkanMetadata, ModRow, ModVersionRow } from '../types'
import { DatabaseService } from './database'

const CKAN_META_REPO = 'https://github.com/KSP-CKAN/CKAN-meta.git'
const BATCH_SIZE = 200

export function extractSpaceDockId(url: string | undefined): number | null {
  if (!url) return null
  const match = url.match(/spacedock\.info\/mod\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

export function parseCkanFile(ckan: CkanMetadata): { mod: ModRow; version: ModVersionRow } {
  const author = Array.isArray(ckan.author) ? ckan.author.join(', ') : ckan.author
  const license = Array.isArray(ckan.license) ? ckan.license.join(', ') : ckan.license
  const spacedockId = extractSpaceDockId(ckan.resources?.spacedock)

  const mod: ModRow = {
    identifier: ckan.identifier,
    name: ckan.name,
    abstract: ckan.abstract ?? null,
    author,
    license,
    latest_version: ckan.version,
    ksp_version: ckan.ksp_version ?? null,
    ksp_version_min: ckan.ksp_version_min ?? null,
    ksp_version_max: ckan.ksp_version_max ?? null,
    download_url: ckan.download ?? null,
    download_size: ckan.download_size ?? null,
    spacedock_id: spacedockId,
    tags: ckan.tags ? JSON.stringify(ckan.tags) : null,
    resources: ckan.resources ? JSON.stringify(ckan.resources) : null,
    updated_at: Date.now()
  }

  const version: ModVersionRow = {
    identifier: ckan.identifier,
    version: ckan.version,
    ksp_version: ckan.ksp_version ?? null,
    ksp_version_min: ckan.ksp_version_min ?? null,
    ksp_version_max: ckan.ksp_version_max ?? null,
    download_url: ckan.download,
    download_hash: ckan.download_hash?.sha256 ?? ckan.download_hash?.sha1 ?? null,
    download_size: ckan.download_size ?? null,
    depends: ckan.depends ? JSON.stringify(ckan.depends) : null,
    recommends: ckan.recommends ? JSON.stringify(ckan.recommends) : null,
    suggests: ckan.suggests ? JSON.stringify(ckan.suggests) : null,
    conflicts: ckan.conflicts ? JSON.stringify(ckan.conflicts) : null,
    install_directives: JSON.stringify(ckan.install)
  }

  return { mod, version }
}

export class MetaSyncService {
  private git: SimpleGit
  private repoPath: string
  private db: DatabaseService

  constructor(repoPath: string, db: DatabaseService) {
    this.repoPath = repoPath
    this.db = db
    this.git = simpleGit()
  }

  async sync(onProgress?: (current: number, total: number, phase: string) => void): Promise<number> {
    // Phase 1: Git clone or pull
    onProgress?.(0, 1, 'downloading')

    if (!fs.existsSync(path.join(this.repoPath, '.git'))) {
      await this.git.clone(CKAN_META_REPO, this.repoPath, ['--depth', '1'])
    } else {
      this.git.cwd(this.repoPath)
      await this.git.pull()
    }

    // Phase 2: Index in batches (non-blocking)
    return this.indexAllAsync(onProgress)
  }

  private async indexAllAsync(onProgress?: (current: number, total: number, phase: string) => void): Promise<number> {
    const entries = fs.readdirSync(this.repoPath, { withFileTypes: true })
    const modDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))
    const total = modDirs.length
    let indexed = 0

    // Process in batches to avoid blocking the main thread
    for (let i = 0; i < modDirs.length; i += BATCH_SIZE) {
      const batch = modDirs.slice(i, i + BATCH_SIZE)

      // Each batch runs in a single transaction (fast)
      this.db.runInTransaction(() => {
        for (const dir of batch) {
          const modPath = path.join(this.repoPath, dir.name)
          let ckanFiles: string[]
          try {
            ckanFiles = fs.readdirSync(modPath).filter(f => f.endsWith('.ckan'))
          } catch {
            continue
          }
          for (const file of ckanFiles) {
            try {
              const content = fs.readFileSync(path.join(modPath, file), 'utf-8')
              const ckan = JSON.parse(content) as CkanMetadata
              const { mod, version } = parseCkanFile(ckan)
              this.db.upsertMod(mod)
              this.db.upsertModVersion(version)
            } catch { /* skip malformed */ }
          }
        }
      })

      indexed += batch.length
      onProgress?.(indexed, total, 'indexing')

      // Yield to event loop so Electron stays responsive
      await new Promise(resolve => setImmediate(resolve))
    }

    return indexed
  }
}

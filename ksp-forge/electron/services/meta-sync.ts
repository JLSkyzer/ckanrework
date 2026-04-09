import simpleGit from 'simple-git'
import { Worker } from 'worker_threads'
import fs from 'fs'
import path from 'path'
import type { CkanMetadata, ModRow, ModVersionRow } from '../types'
import { DatabaseService } from './database'

const CKAN_META_REPO = 'https://github.com/KSP-CKAN/CKAN-meta.git'

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
  private repoPath: string
  private db: DatabaseService
  private dbPath: string

  constructor(repoPath: string, db: DatabaseService, dbPath?: string) {
    this.repoPath = repoPath
    this.db = db
    // We need the raw DB path for the worker thread
    this.dbPath = dbPath || ''
  }

  setDbPath(dbPath: string) {
    this.dbPath = dbPath
  }

  async sync(onProgress?: (current: number, total: number, phase: string) => void): Promise<number> {
    const git = simpleGit()

    // Phase 1: Git clone or pull
    onProgress?.(0, 1, 'downloading')

    const gitDir = path.join(this.repoPath, '.git')
    const lockFile = path.join(gitDir, 'index.lock')

    // Clean up stale lock file from previous crash
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile)
    }

    if (!fs.existsSync(gitDir)) {
      // No .git = either first time or corrupted. Clean and clone.
      if (fs.existsSync(this.repoPath)) {
        fs.rmSync(this.repoPath, { recursive: true, force: true })
      }
      await git.clone(CKAN_META_REPO, this.repoPath, ['--depth', '1'])
    } else {
      try {
        git.cwd(this.repoPath)
        await git.pull()
      } catch {
        // Corrupted repo — nuke and re-clone
        fs.rmSync(this.repoPath, { recursive: true, force: true })
        await git.clone(CKAN_META_REPO, this.repoPath, ['--depth', '1'])
      }
    }

    // Phase 2: Index in a worker thread (doesn't block main process)
    onProgress?.(0, 1, 'indexing')

    // Close DB connection before worker uses it
    this.db.close()

    const count = await new Promise<number>((resolve, reject) => {
      const workerPath = path.join(__dirname, 'index-worker.js')
      const worker = new Worker(workerPath, {
        workerData: { dbPath: this.dbPath, repoPath: this.repoPath }
      })

      worker.on('message', (msg) => {
        if (msg.type === 'progress') {
          onProgress?.(msg.current, msg.total, 'indexing')
        } else if (msg.type === 'done') {
          resolve(msg.total)
        } else if (msg.type === 'error') {
          reject(new Error(msg.message))
        }
      })

      worker.on('error', reject)
    })

    // Reopen DB connection
    this.db.reopen()

    return count
  }
}

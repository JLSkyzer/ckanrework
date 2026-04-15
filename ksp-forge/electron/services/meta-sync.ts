import { Worker } from 'worker_threads'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { createGunzip } from 'zlib'
import { exec } from 'child_process'
import * as tar from 'tar'
import simpleGit from 'simple-git'
import type { CkanMetadata, ModRow, ModVersionRow } from '../types'
import { DatabaseService } from './database'

const CKAN_META_TARBALL = 'https://github.com/KSP-CKAN/CKAN-meta/archive/refs/heads/master.tar.gz'
const CKAN_META_REPO_GIT = 'https://github.com/KSP-CKAN/CKAN-meta.git'

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
    release_date: ckan.release_date ?? null,
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
    this.dbPath = dbPath || ''
  }

  setDbPath(dbPath: string) {
    this.dbPath = dbPath
  }

  async sync(onProgress?: (current: number, total: number, phase: string) => void): Promise<number> {
    onProgress?.(0, 1, 'downloading')

    // Try git first (fast incremental pull), fallback to tarball download (no git needed)
    let useGit = false
    try {
      const gitDir = path.join(this.repoPath, '.git')
      if (fs.existsSync(gitDir)) {
        // Existing git repo — try to pull
        const lockFile = path.join(gitDir, 'index.lock')
        if (fs.existsSync(lockFile)) {
          try { fs.unlinkSync(lockFile) } catch {}
        }
        const git = simpleGit()
        git.cwd(this.repoPath)
        await git.pull()
        useGit = true
      } else {
        // No existing repo — try git clone first
        const git = simpleGit()
        if (fs.existsSync(this.repoPath)) {
          fs.rmSync(this.repoPath, { recursive: true, force: true })
        }
        await git.clone(CKAN_META_REPO_GIT, this.repoPath, ['--depth', '1'])
        useGit = true
      }
    } catch (gitErr: any) {
      console.log(`[meta-sync] Git failed (${gitErr?.message || gitErr}), falling back to tarball download`)
      // Git not available or failed — download tarball
      await this.downloadTarball(onProgress)
    }

    // Phase 2: Index in a worker thread
    onProgress?.(0, 1, 'indexing')

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

    return count
  }

  private downloadTarball(onProgress?: (current: number, total: number, phase: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean existing directory
      if (fs.existsSync(this.repoPath)) {
        fs.rmSync(this.repoPath, { recursive: true, force: true })
      }
      fs.mkdirSync(this.repoPath, { recursive: true })

      const tmpFile = this.repoPath + '.tar.gz'

      // Download the tarball
      const download = (url: string, redirects = 0): void => {
        if (redirects > 5) { reject(new Error('Too many redirects')); return }

        https.get(url, { headers: { 'User-Agent': 'KSP-Forge' } }, (res) => {
          // Follow redirects
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            download(res.headers.location, redirects + 1)
            return
          }

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} downloading CKAN-meta`))
            return
          }

          const fileStream = fs.createWriteStream(tmpFile)
          const total = res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : null
          let downloaded = 0

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            if (total) onProgress?.(downloaded, total, 'downloading')
          })

          res.pipe(fileStream)
          fileStream.on('finish', () => {
            fileStream.close()
            // Extract tarball
            this.extractTarball(tmpFile).then(() => {
              try { fs.unlinkSync(tmpFile) } catch {}
              resolve()
            }).catch(reject)
          })
          fileStream.on('error', reject)
        }).on('error', reject)
      }

      download(CKAN_META_TARBALL)
    })
  }

  private extractTarball(tarPath: string): Promise<void> {
    // Use tar module or manual extraction
    // The tar.gz contains CKAN-meta-master/ as root folder
    // We need to strip that prefix and extract to this.repoPath
    return tar.x({
      file: tarPath,
      cwd: this.repoPath,
      strip: 1,
    }).catch((tarErr: any) => {
      console.log('[meta-sync] tar module failed, trying child_process:', tarErr?.message)
      return this.extractWithProcess(tarPath)
    })
  }

  private extractWithProcess(tarPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = `tar -xzf "${tarPath}" -C "${this.repoPath}" --strip-components=1`
      exec(cmd, (err) => {
        if (err) reject(new Error(`tar extraction failed: ${err.message}`))
        else resolve()
      })
    })
  }
}

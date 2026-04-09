import { parentPort, workerData } from 'worker_threads'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

interface CkanFile {
  identifier: string
  name: string
  abstract?: string
  author: string | string[]
  license: string | string[]
  version: string
  ksp_version?: string
  ksp_version_min?: string
  ksp_version_max?: string
  depends?: any[]
  recommends?: any[]
  suggests?: any[]
  conflicts?: any[]
  install: any[]
  download: string
  download_size?: number
  download_hash?: { sha1?: string; sha256?: string }
  resources?: { homepage?: string; spacedock?: string; repository?: string; bugtracker?: string }
  tags?: string[]
}

function extractSpaceDockId(url: string | undefined): number | null {
  if (!url) return null
  const match = url.match(/spacedock\.info\/mod\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

const { dbPath, repoPath } = workerData as { dbPath: string; repoPath: string }

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = OFF') // Faster for bulk insert

const upsertMod = db.prepare(`
  INSERT INTO mods (identifier, name, abstract, author, license, latest_version,
    ksp_version, ksp_version_min, ksp_version_max, download_url, download_size,
    spacedock_id, tags, resources, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(identifier) DO UPDATE SET
    name=excluded.name, abstract=excluded.abstract, author=excluded.author,
    license=excluded.license, latest_version=excluded.latest_version,
    ksp_version=excluded.ksp_version, ksp_version_min=excluded.ksp_version_min,
    ksp_version_max=excluded.ksp_version_max, download_url=excluded.download_url,
    download_size=excluded.download_size, spacedock_id=excluded.spacedock_id,
    tags=excluded.tags, resources=excluded.resources, updated_at=excluded.updated_at
`)

const upsertVersion = db.prepare(`
  INSERT INTO mod_versions (identifier, version, ksp_version, ksp_version_min,
    ksp_version_max, download_url, download_hash, download_size, depends,
    recommends, suggests, conflicts, install_directives)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(identifier, version) DO UPDATE SET
    ksp_version=excluded.ksp_version, ksp_version_min=excluded.ksp_version_min,
    ksp_version_max=excluded.ksp_version_max, download_url=excluded.download_url,
    download_hash=excluded.download_hash, download_size=excluded.download_size,
    depends=excluded.depends, recommends=excluded.recommends,
    suggests=excluded.suggests, conflicts=excluded.conflicts,
    install_directives=excluded.install_directives
`)

try {
  const entries = fs.readdirSync(repoPath, { withFileTypes: true })
  const modDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))
  const total = modDirs.length

  const BATCH = 500
  for (let i = 0; i < modDirs.length; i += BATCH) {
    const batch = modDirs.slice(i, i + BATCH)

    const insertBatch = db.transaction(() => {
      for (const dir of batch) {
        const modPath = path.join(repoPath, dir.name)
        let files: string[]
        try { files = fs.readdirSync(modPath).filter(f => f.endsWith('.ckan')) }
        catch { continue }

        for (const file of files) {
          try {
            const raw = fs.readFileSync(path.join(modPath, file), 'utf-8')
            const c: CkanFile = JSON.parse(raw)
            const author = Array.isArray(c.author) ? c.author.join(', ') : c.author
            const license = Array.isArray(c.license) ? c.license.join(', ') : c.license
            const sdId = extractSpaceDockId(c.resources?.spacedock)
            const now = Date.now()

            upsertMod.run(
              c.identifier, c.name, c.abstract ?? null, author, license, c.version,
              c.ksp_version ?? null, c.ksp_version_min ?? null, c.ksp_version_max ?? null,
              c.download ?? null, c.download_size ?? null, sdId,
              c.tags ? JSON.stringify(c.tags) : null,
              c.resources ? JSON.stringify(c.resources) : null,
              now
            )

            upsertVersion.run(
              c.identifier, c.version,
              c.ksp_version ?? null, c.ksp_version_min ?? null, c.ksp_version_max ?? null,
              c.download,
              c.download_hash?.sha256 ?? c.download_hash?.sha1 ?? null,
              c.download_size ?? null,
              c.depends ? JSON.stringify(c.depends) : null,
              c.recommends ? JSON.stringify(c.recommends) : null,
              c.suggests ? JSON.stringify(c.suggests) : null,
              c.conflicts ? JSON.stringify(c.conflicts) : null,
              JSON.stringify(c.install)
            )
          } catch { /* skip malformed */ }
        }
      }
    })
    insertBatch()

    parentPort?.postMessage({ type: 'progress', current: Math.min(i + BATCH, total), total })
  }

  db.close()
  parentPort?.postMessage({ type: 'done', total })
} catch (err: any) {
  db.close()
  parentPort?.postMessage({ type: 'error', message: err.message })
}

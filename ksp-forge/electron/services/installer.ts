import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import crypto from 'crypto'
import unzipper from 'unzip-stream'
import type { InstallDirective } from '../types'
import type { ResolvedMod } from './resolver'
import type { DatabaseService } from './database'

export interface InstallPlanItem {
  identifier: string
  version: string
  downloadUrl: string
  totalSize: number | null
  hash: string | null
  directives: InstallDirective[]
  isDependency: boolean
}

export class InstallerService {
  private db: DatabaseService

  constructor(db: DatabaseService) {
    this.db = db
  }

  buildInstallPlan(mods: ResolvedMod[]): InstallPlanItem[] {
    return mods.map((mod) => ({
      identifier: mod.identifier,
      version: mod.version,
      downloadUrl: mod.download_url,
      totalSize: mod.download_size,
      hash: mod.download_hash,
      directives: this.parseDirectives(mod.install_directives),
      isDependency: mod.isDependency,
    }))
  }

  parseDirectives(json: string): InstallDirective[] {
    try {
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) return []
      return parsed as InstallDirective[]
    } catch {
      return []
    }
  }

  async installMod(
    item: InstallPlanItem,
    kspPath: string,
    profileId: string,
    tempDir: string,
    onProgress?: (bytesDownloaded: number, totalBytes: number | null) => void
  ): Promise<void> {
    fs.mkdirSync(tempDir, { recursive: true })

    const zipPath = path.join(tempDir, `${item.identifier}-${item.version}.zip`)

    // Download
    await this.download(item.downloadUrl, zipPath, onProgress ? (dl, total) => onProgress(dl, total) : undefined)

    // Verify SHA256 hash if provided
    if (item.hash) {
      const actualHash = await this.sha256File(zipPath)
      if (actualHash.toLowerCase() !== item.hash.toLowerCase()) {
        fs.unlinkSync(zipPath)
        throw new Error(
          `Hash mismatch for ${item.identifier}: expected ${item.hash}, got ${actualHash}`
        )
      }
    }

    // Extract and install
    const installedFiles = await this.extractAndInstall(zipPath, kspPath, item.directives)

    // Clean up zip
    try { fs.unlinkSync(zipPath) } catch { /* ignore */ }

    // Track in DB
    this.db.addInstalledMod({
      profile_id: profileId,
      identifier: item.identifier,
      version: item.version,
      installed_files: JSON.stringify(installedFiles),
      installed_at: Date.now(),
    })
  }

  async uninstallMod(profileId: string, identifier: string, kspPath: string): Promise<void> {
    const installed = this.db.getInstalledMods(profileId).find((m) => m.identifier === identifier)
    if (!installed) throw new Error(`Mod ${identifier} is not installed in profile ${profileId}`)

    const files: string[] = JSON.parse(installed.installed_files)

    // Remove files in reverse order (deepest first)
    const sortedFiles = [...files].sort((a, b) => b.length - a.length)
    for (const relPath of sortedFiles) {
      const absPath = path.join(kspPath, relPath)
      try {
        const stat = fs.statSync(absPath)
        if (stat.isDirectory()) {
          // Only remove if empty
          const contents = fs.readdirSync(absPath)
          if (contents.length === 0) fs.rmdirSync(absPath)
        } else {
          fs.unlinkSync(absPath)
        }
      } catch { /* ignore missing files */ }
    }

    // Clean up any empty parent dirs
    const dirs = new Set<string>()
    for (const relPath of files) {
      let dir = path.dirname(path.join(kspPath, relPath))
      while (dir !== kspPath && dir.startsWith(kspPath)) {
        dirs.add(dir)
        dir = path.dirname(dir)
      }
    }
    const sortedDirs = [...dirs].sort((a, b) => b.length - a.length)
    for (const dir of sortedDirs) {
      try {
        const contents = fs.readdirSync(dir)
        if (contents.length === 0) fs.rmdirSync(dir)
      } catch { /* ignore */ }
    }

    this.db.removeInstalledMod(profileId, identifier)
  }

  private download(
    url: string,
    destPath: string,
    onProgress?: (downloaded: number, total: number | null) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith('https') ? https : http
      const file = fs.createWriteStream(destPath)
      let downloaded = 0

      const req = proto.get(url, (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          fs.unlinkSync(destPath)
          this.download(res.headers.location, destPath, onProgress).then(resolve).catch(reject)
          return
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${url}`))
          return
        }

        const total = res.headers['content-length']
          ? parseInt(res.headers['content-length'], 10)
          : null

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          onProgress?.(downloaded, total)
        })

        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
      })

      req.on('error', (err) => {
        file.close()
        try { fs.unlinkSync(destPath) } catch { /* ignore */ }
        reject(err)
      })
    })
  }

  private sha256File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  private extractAndInstall(
    zipPath: string,
    kspPath: string,
    directives: InstallDirective[]
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const installedFiles: string[] = []

      // If no directives, default to installing everything to GameData
      if (directives.length === 0) {
        const defaultDirective: InstallDirective = { install_to: 'GameData' }
        directives = [defaultDirective]
      }

      const entries: { entryPath: string; buffer: Buffer }[] = []

      const stream = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }))

      stream.on('entry', (entry: any) => {
        const entryPath: string = entry.path
        const type: string = entry.type

        if (type === 'Directory') {
          entry.autodrain()
          return
        }

        const chunks: Buffer[] = []
        entry.on('data', (chunk: Buffer) => chunks.push(chunk))
        entry.on('end', () => {
          entries.push({ entryPath, buffer: Buffer.concat(chunks) })
        })
        entry.on('error', reject)
      })

      stream.on('finish', () => {
        try {
          for (const directive of directives) {
            const matchedEntries = this.applyDirective(directive, entries)
            for (const { relDest, buffer } of matchedEntries) {
              const destPath = path.join(kspPath, relDest)
              fs.mkdirSync(path.dirname(destPath), { recursive: true })
              fs.writeFileSync(destPath, buffer)
              installedFiles.push(relDest)
            }
          }
          resolve(installedFiles)
        } catch (err) {
          reject(err)
        }
      })

      stream.on('error', reject)
    })
  }

  private applyDirective(
    directive: InstallDirective,
    entries: { entryPath: string; buffer: Buffer }[]
  ): { relDest: string; buffer: Buffer }[] {
    const results: { relDest: string; buffer: Buffer }[] = []

    for (const entry of entries) {
      const entryPath = entry.entryPath.replace(/\\/g, '/')

      let matched = false
      let matchedPrefix = ''

      if (directive.file) {
        // Exact file or directory match
        const target = directive.file.replace(/\\/g, '/')
        if (entryPath === target || entryPath.startsWith(target + '/')) {
          matched = true
          matchedPrefix = target
        }
      } else if (directive.find) {
        // Match by directory name anywhere in path
        const target = directive.find.replace(/\\/g, '/')
        const parts = entryPath.split('/')
        const idx = parts.indexOf(target)
        if (idx !== -1) {
          matched = true
          matchedPrefix = parts.slice(0, idx + 1).join('/')
        }
      } else if (directive.find_regexp) {
        // Match by regexp on the path
        try {
          const re = new RegExp(directive.find_regexp)
          const parts = entryPath.split('/')
          for (let i = 0; i < parts.length; i++) {
            if (re.test(parts[i])) {
              matched = true
              matchedPrefix = parts.slice(0, i + 1).join('/')
              break
            }
          }
        } catch { /* invalid regexp */ }
      }

      if (!matched) continue

      // Apply filters
      if (directive.filter) {
        const filters = Array.isArray(directive.filter) ? directive.filter : [directive.filter]
        const basename = path.basename(entryPath)
        if (filters.some((f) => basename === f || entryPath.includes(f))) continue
      }
      if (directive.filter_regexp) {
        const filterRegexps = Array.isArray(directive.filter_regexp) ? directive.filter_regexp : [directive.filter_regexp]
        const basename = path.basename(entryPath)
        if (filterRegexps.some((r) => { try { return new RegExp(r).test(basename) } catch { return false } })) continue
      }

      // Compute destination relative to kspPath
      const relative = entryPath.startsWith(matchedPrefix + '/')
        ? entryPath.slice(matchedPrefix.length + 1)
        : path.basename(entryPath)

      const destParts = [directive.install_to]
      if (directive.find || directive.find_regexp) {
        // Include the matched directory name itself
        const matchedName = matchedPrefix.split('/').pop() ?? matchedPrefix
        destParts.push(matchedName)
      }
      if (relative) destParts.push(relative)

      const relDest = destParts.join('/').replace(/\/+/g, '/')

      results.push({ relDest, buffer: entry.buffer })
    }

    return results
  }
}

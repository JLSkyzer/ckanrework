import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import zlib from 'zlib'
import type { ProfileRow, InstalledModRow } from '../types'
import type { DatabaseService } from './database'
import type { ModCacheService } from './mod-cache'

export interface ProfileSwitchResult {
  removed: string[]
  restored: string[]
  needsDownload: string[]
}

export interface ProfileExport {
  profile: ProfileRow
  mods: InstalledModRow[]
}

export class ProfileService {
  private db: DatabaseService

  constructor(db: DatabaseService) {
    this.db = db
  }

  createProfile(name: string, kspPath: string): ProfileRow {
    if (!this.validateKspPath(kspPath)) {
      throw new Error(`Invalid KSP path: ${kspPath} (GameData folder not found)`)
    }

    const kspVersion = this.detectKspVersion(kspPath)
    const now = Date.now()
    const profile: ProfileRow = {
      id: crypto.randomUUID(),
      name,
      ksp_path: kspPath,
      ksp_version: kspVersion,
      created_at: now,
      updated_at: now,
    }

    this.db.createProfile(profile)
    return profile
  }

  getProfiles(): ProfileRow[] {
    return this.db.getProfiles()
  }

  getProfile(id: string): ProfileRow | undefined {
    return this.db.getProfile(id)
  }

  deleteProfile(id: string): void {
    const profile = this.db.getProfile(id)
    if (!profile) throw new Error(`Profile ${id} not found`)
    this.db.deleteProfile(id)
  }

  cloneProfile(sourceId: string, newName: string): ProfileRow {
    const source = this.db.getProfile(sourceId)
    if (!source) throw new Error(`Profile ${sourceId} not found`)

    const now = Date.now()
    const cloned: ProfileRow = {
      id: crypto.randomUUID(),
      name: newName,
      ksp_path: source.ksp_path,
      ksp_version: source.ksp_version,
      created_at: now,
      updated_at: now,
    }

    this.db.createProfile(cloned)

    // Copy installed mods
    const sourceMods = this.db.getInstalledMods(sourceId)
    for (const mod of sourceMods) {
      this.db.addInstalledMod({
        profile_id: cloned.id,
        identifier: mod.identifier,
        version: mod.version,
        installed_files: mod.installed_files,
        installed_at: now,
      })
    }

    return cloned
  }

  exportProfile(profileId: string): ProfileExport {
    const profile = this.db.getProfile(profileId)
    if (!profile) throw new Error(`Profile ${profileId} not found`)
    const mods = this.db.getInstalledMods(profileId)
    return { profile, mods }
  }

  switchProfile(
    fromProfileId: string,
    toProfileId: string,
    kspPath: string,
    modCache: ModCacheService
  ): ProfileSwitchResult {
    const fromProfile = this.db.getProfile(fromProfileId)
    const toProfile = this.db.getProfile(toProfileId)

    if (!fromProfile) throw new Error(`Source profile ${fromProfileId} not found`)
    if (!toProfile) throw new Error(`Target profile ${toProfileId} not found`)

    // If profiles point to different KSP paths, skip file swapping
    if (fromProfile.ksp_path !== toProfile.ksp_path) {
      return { removed: [], restored: [], needsDownload: [] }
    }

    const fromMods = this.db.getInstalledMods(fromProfileId)
    const toMods = this.db.getInstalledMods(toProfileId)

    const fromMap = new Map<string, InstalledModRow>()
    for (const m of fromMods) fromMap.set(m.identifier, m)

    const toMap = new Map<string, InstalledModRow>()
    for (const m of toMods) toMap.set(m.identifier, m)

    // Compute sets
    const toRemove: InstalledModRow[] = []
    for (const m of fromMods) {
      if (!toMap.has(m.identifier)) toRemove.push(m)
    }

    const toAdd: InstalledModRow[] = []
    for (const m of toMods) {
      if (!fromMap.has(m.identifier)) toAdd.push(m)
    }

    // Execute: move out mods not in target profile
    const removed: string[] = []
    for (const mod of toRemove) {
      try {
        const files: string[] = JSON.parse(mod.installed_files)
        modCache.moveToCache(mod.identifier, mod.version, files, kspPath)
        removed.push(mod.identifier)
      } catch {
        // Skip mods that fail to move
      }
    }

    // Execute: restore mods needed by target profile
    const restored: string[] = []
    const needsDownload: string[] = []

    for (const mod of toAdd) {
      if (modCache.isInCache(mod.identifier, mod.version)) {
        try {
          modCache.restoreFromCache(mod.identifier, mod.version, kspPath)
          restored.push(mod.identifier)
        } catch {
          needsDownload.push(mod.identifier)
        }
      } else {
        needsDownload.push(mod.identifier)
      }
    }

    return { removed, restored, needsDownload }
  }

  detectKspVersion(kspPath: string): string {
    // Try readme.txt first
    const readmePath = path.join(kspPath, 'readme.txt')
    if (fs.existsSync(readmePath)) {
      try {
        const content = fs.readFileSync(readmePath, 'utf-8')
        // Look for a line like "Version 1.12.5"
        const match = content.match(/version\s+(\d+\.\d+(?:\.\d+)?)/i)
        if (match) return match[1]
      } catch { /* fallthrough */ }
    }

    // Try buildID.txt
    const buildIdPath = path.join(kspPath, 'buildID.txt')
    if (fs.existsSync(buildIdPath)) {
      try {
        const content = fs.readFileSync(buildIdPath, 'utf-8')
        const match = content.match(/version\s*[=:]\s*(\d+\.\d+(?:\.\d+)?)/i)
        if (match) return match[1]
      } catch { /* fallthrough */ }
    }

    // Try KSP_Data/buildID.txt
    const kspDataBuildIdPath = path.join(kspPath, 'KSP_Data', 'buildID.txt')
    if (fs.existsSync(kspDataBuildIdPath)) {
      try {
        const content = fs.readFileSync(kspDataBuildIdPath, 'utf-8')
        const match = content.match(/version\s*[=:]\s*(\d+\.\d+(?:\.\d+)?)/i)
        if (match) return match[1]
      } catch { /* fallthrough */ }
    }

    return 'unknown'
  }

  autoDetectKspPaths(): { path: string; source: string; version: string }[] {
    const found: { path: string; source: string; version: string }[] = []
    const checked = new Set<string>()

    const tryPath = (p: string, source: string) => {
      const normalized = path.resolve(p)
      if (checked.has(normalized)) return
      checked.add(normalized)
      if (this.validateKspPath(normalized)) {
        found.push({ path: normalized, source, version: this.detectKspVersion(normalized) })
      }
    }

    // Steam default paths (Windows)
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'

    const steamDefaults = [
      path.join(programFilesX86, 'Steam'),
      path.join(programFiles, 'Steam'),
      path.join(process.env['HOME'] || process.env['USERPROFILE'] || '', 'Steam'),
      // Linux
      path.join(process.env['HOME'] || '', '.steam', 'steam'),
      path.join(process.env['HOME'] || '', '.local', 'share', 'Steam'),
      // macOS
      path.join(process.env['HOME'] || '', 'Library', 'Application Support', 'Steam'),
    ]

    // Find all Steam library folders
    const libraryPaths: string[] = []
    for (const steamRoot of steamDefaults) {
      const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
      if (fs.existsSync(vdfPath)) {
        try {
          const content = fs.readFileSync(vdfPath, 'utf-8')
          // Parse "path" entries from VDF — matches lines like: "path"		"D:\\SteamLibrary"
          const pathMatches = content.matchAll(/"path"\s+"([^"]+)"/g)
          for (const match of pathMatches) {
            libraryPaths.push(match[1])
          }
        } catch { /* ignore */ }
        // Also add the root steamapps parent
        libraryPaths.push(steamRoot)
      }
    }

    // Check for KSP in each library
    for (const lib of libraryPaths) {
      tryPath(path.join(lib, 'steamapps', 'common', 'Kerbal Space Program'), 'Steam')
    }

    // Also try the direct steamapps/common under default steam paths
    for (const steamRoot of steamDefaults) {
      tryPath(path.join(steamRoot, 'steamapps', 'common', 'Kerbal Space Program'), 'Steam')
    }

    // GOG default
    tryPath(path.join(programFilesX86, 'GOG Galaxy', 'Games', 'Kerbal Space Program'), 'GOG')
    tryPath(path.join(programFiles, 'GOG Galaxy', 'Games', 'Kerbal Space Program'), 'GOG')

    // Epic Games
    tryPath(path.join(programFiles, 'Epic Games', 'KerbalSpaceProgram'), 'Epic')

    return found
  }

  scanInstalledMods(profileId: string): { found: number; mods: string[]; fromCkan: number } {
    const profile = this.db.getProfile(profileId)
    if (!profile) return { found: 0, mods: [], fromCkan: 0 }

    const gameDataPath = path.join(profile.ksp_path, 'GameData')
    if (!fs.existsSync(gameDataPath)) return { found: 0, mods: [], fromCkan: 0 }

    const foundMods: string[] = []
    const alreadyInstalled = new Set(this.db.getInstalledMods(profileId).map(m => m.identifier))
    let fromCkan = 0

    // --- Phase 1: Import from CKAN registry if it exists ---
    const ckanRegistryMods = this.readCkanRegistry(profile.ksp_path)
    for (const ckanMod of ckanRegistryMods) {
      if (alreadyInstalled.has(ckanMod.identifier)) continue

      // Verify mod exists in our DB
      const dbMod = this.db.getMod(ckanMod.identifier)
      if (!dbMod) continue

      this.db.addInstalledMod({
        profile_id: profileId,
        identifier: ckanMod.identifier,
        version: ckanMod.version,
        installed_files: JSON.stringify(ckanMod.files),
        installed_at: Date.now(),
      })
      alreadyInstalled.add(ckanMod.identifier)
      foundMods.push(ckanMod.identifier)
      fromCkan++
    }

    // --- Phase 2: Scan GameData folders ---
    const stockDirs = new Set(['Squad', 'SquadExpansion'])
    let entries: string[]
    try {
      entries = fs.readdirSync(gameDataPath)
        .filter(e => !stockDirs.has(e) && !e.startsWith('.'))
    } catch { return { found: foundMods.length, mods: foundMods, fromCkan } }

    const allMods = this.db.getAllMods()
    const folderToMod = new Map<string, { identifier: string; version: string }>()

    for (const mod of allMods) {
      const versions = this.db.getModVersions(mod.identifier)
      if (versions.length === 0) continue
      const latest = versions[0]
      try {
        const directives = JSON.parse(latest.install_directives) as Array<{ find?: string; file?: string; install_to?: string }>
        for (const d of directives) {
          if (d.install_to === 'GameData' && d.find) {
            folderToMod.set(d.find, { identifier: mod.identifier, version: latest.version })
          }
        }
      } catch { /* skip */ }
    }

    for (const mod of allMods) {
      if (!folderToMod.has(mod.identifier)) {
        const versions = this.db.getModVersions(mod.identifier)
        if (versions.length > 0) {
          folderToMod.set(mod.identifier, { identifier: mod.identifier, version: versions[0].version })
        }
      }
    }

    for (const entry of entries) {
      const match = folderToMod.get(entry)
      if (match && !alreadyInstalled.has(match.identifier)) {
        // Register as installed
        const entryPath = path.join(gameDataPath, entry)
        const files = this.collectFiles(entryPath, profile.ksp_path)

        this.db.addInstalledMod({
          profile_id: profileId,
          identifier: match.identifier,
          version: match.version,
          installed_files: JSON.stringify(files),
          installed_at: Date.now(),
        })
        foundMods.push(match.identifier)
      }
    }

    return { found: foundMods.length, mods: foundMods, fromCkan }
  }

  private readCkanRegistry(kspPath: string): Array<{ identifier: string; version: string; files: string[] }> {
    const results: Array<{ identifier: string; version: string; files: string[] }> = []

    // CKAN stores its registry in <KSP>/CKAN/registry.json (plain or gzipped)
    const registryPaths = [
      path.join(kspPath, 'CKAN', 'registry.json'),
      path.join(kspPath, 'CKAN', 'registry.json.gz'),
    ]

    let registryData: any = null

    for (const regPath of registryPaths) {
      if (!fs.existsSync(regPath)) continue
      try {
        let content: string
        if (regPath.endsWith('.gz')) {
          const compressed = fs.readFileSync(regPath)
          content = zlib.gunzipSync(compressed).toString('utf-8')
        } else {
          content = fs.readFileSync(regPath, 'utf-8')
        }
        registryData = JSON.parse(content)
        console.log(`[profile] Read CKAN registry from ${regPath}`)
        break
      } catch (err) {
        console.log(`[profile] Failed to read CKAN registry ${regPath}:`, err)
      }
    }

    if (!registryData) return results

    // CKAN registry format: { "installed_modules": { "identifier": { "module": {...}, "files": [...] } } }
    const installedModules = registryData.installed_modules || registryData.InstalledModules || {}

    for (const [identifier, entry] of Object.entries(installedModules)) {
      const modEntry = entry as any
      const modInfo = modEntry.module || modEntry.Module || {}
      const version = modInfo.version || modInfo.Version || 'unknown'
      const files: string[] = modEntry.files || modEntry.Files || modEntry.installed_files || []

      // CKAN files are relative to KSP root
      const normalizedFiles = files.map((f: string) => f.replace(/\\/g, '/'))

      results.push({ identifier, version, files: normalizedFiles })
    }

    console.log(`[profile] Found ${results.length} mods in CKAN registry`)
    return results
  }

  private collectFiles(dirPath: string, basePath: string): string[] {
    const files: string[] = []
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(dirPath, e.name)
        files.push(path.relative(basePath, full))
        if (e.isDirectory()) {
          files.push(...this.collectFiles(full, basePath))
        }
      }
    } catch { /* skip */ }
    return files
  }

  validateKspPath(kspPath: string): boolean {
    try {
      const gamDataPath = path.join(kspPath, 'GameData')
      return fs.existsSync(gamDataPath) && fs.statSync(gamDataPath).isDirectory()
    } catch {
      return false
    }
  }
}

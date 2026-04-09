import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { ProfileRow, InstalledModRow } from '../types'
import type { DatabaseService } from './database'

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

  validateKspPath(kspPath: string): boolean {
    try {
      const gamDataPath = path.join(kspPath, 'GameData')
      return fs.existsSync(gamDataPath) && fs.statSync(gamDataPath).isDirectory()
    } catch {
      return false
    }
  }
}

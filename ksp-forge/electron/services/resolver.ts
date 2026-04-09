import type { ModVersionRow, Relationship } from '../types'
import type { DatabaseService } from './database'

export interface ResolvedMod {
  identifier: string
  version: string
  ksp_version: string | null
  download_url: string
  download_size: number | null
  download_hash: string | null
  install_directives: string
  isDependency: boolean
}

export interface ResolutionResult {
  success: boolean
  toInstall: ResolvedMod[]
  conflicts: string[]
  missing: string[]
  warnings: string[]
}

export class ResolverService {
  private db: DatabaseService

  constructor(db: DatabaseService) {
    this.db = db
  }

  resolve(identifiers: string[], kspVersion: string, profileId?: string): ResolutionResult {
    const toInstall = new Map<string, ResolvedMod>()
    const conflicts: string[] = []
    const missing: string[] = []
    const warnings: string[] = []
    const visited = new Set<string>()

    const installed = new Set<string>()
    if (profileId) {
      for (const mod of this.db.getInstalledMods(profileId)) {
        installed.add(mod.identifier)
      }
    }

    for (const id of identifiers) {
      this.resolveOne(id, kspVersion, toInstall, conflicts, missing, warnings, visited, installed, false)
    }

    const allMods = [...toInstall.values()]
    for (const mod of allMods) {
      const versions = this.db.getModVersions(mod.identifier)
      const ver = versions.find(v => v.version === mod.version)
      if (!ver?.conflicts) continue
      const modConflicts: Relationship[] = JSON.parse(ver.conflicts)
      for (const conflict of modConflicts) {
        if (toInstall.has(conflict.name) || installed.has(conflict.name)) {
          conflicts.push(`${mod.identifier} conflicts with ${conflict.name}`)
        }
      }
    }

    // Only real conflicts block installation. Missing deps and version warnings are non-blocking.
    return { success: conflicts.length === 0, toInstall: allMods, conflicts, missing, warnings }
  }

  private resolveOne(
    identifier: string, kspVersion: string,
    toInstall: Map<string, ResolvedMod>, conflicts: string[], missing: string[],
    warnings: string[], visited: Set<string>, installed: Set<string>, isDependency: boolean
  ) {
    if (visited.has(identifier)) return
    visited.add(identifier)
    if (installed.has(identifier)) return

    const versions = this.db.getModVersions(identifier)
    if (versions.length === 0) { missing.push(identifier); return }

    const compatible = this.findCompatibleVersion(versions, kspVersion)
    const selected = compatible ?? versions[0]

    if (!compatible) {
      warnings.push(`${identifier} v${selected.version} may not be compatible with KSP ${kspVersion}`)
    }

    toInstall.set(identifier, {
      identifier, version: selected.version,
      ksp_version: selected.ksp_version ?? selected.ksp_version_min ?? selected.ksp_version_max ?? null,
      download_url: selected.download_url,
      download_size: selected.download_size, download_hash: selected.download_hash,
      install_directives: selected.install_directives, isDependency
    })

    if (selected.depends) {
      const deps: Relationship[] = JSON.parse(selected.depends)
      for (const dep of deps) {
        this.resolveOne(dep.name, kspVersion, toInstall, conflicts, missing, warnings, visited, installed, true)
      }
    }
  }

  private findCompatibleVersion(versions: ModVersionRow[], kspVersion: string): ModVersionRow | null {
    for (const v of versions) {
      if (this.isKspCompatible(v, kspVersion)) return v
    }
    return null
  }

  private isKspCompatible(version: ModVersionRow, kspVersion: string): boolean {
    if (version.ksp_version && version.ksp_version === kspVersion) return true
    if (version.ksp_version === 'any') return true
    const target = this.parseVersion(kspVersion)
    if (!target) return true
    if (version.ksp_version_min) {
      const min = this.parseVersion(version.ksp_version_min)
      if (min && this.compareVersions(target, min) < 0) return false
    }
    if (version.ksp_version_max) {
      const max = this.parseVersion(version.ksp_version_max)
      if (max && this.compareVersions(target, max) > 0) return false
    }
    if (!version.ksp_version && !version.ksp_version_min && !version.ksp_version_max) return true
    if (version.ksp_version && version.ksp_version !== kspVersion) {
      const mod = this.parseVersion(version.ksp_version)
      if (mod && target && mod[0] === target[0] && mod[1] === target[1]) return true
      return false
    }
    return true
  }

  private parseVersion(v: string): number[] | null {
    const parts = v.split('.').map(Number)
    if (parts.some(isNaN)) return null
    return parts
  }

  private compareVersions(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const av = a[i] ?? 0
      const bv = b[i] ?? 0
      if (av !== bv) return av - bv
    }
    return 0
  }
}

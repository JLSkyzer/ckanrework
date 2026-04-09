import fs from 'fs'
import path from 'path'

export class ModCacheService {
  private cacheDir: string

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    } catch {
      /* ignore */
    }
  }

  /**
   * After installing a mod, copy its files to cache for future profile switches.
   * Uses hard links if possible (same drive), falls back to copy.
   */
  cacheModFiles(
    identifier: string,
    version: string,
    installedFiles: string[],
    kspPath: string
  ): void {
    const modCacheDir = path.join(this.cacheDir, identifier, version)

    for (const relFile of installedFiles) {
      const srcPath = path.join(kspPath, relFile)
      const destPath = path.join(modCacheDir, relFile)

      try {
        const stat = fs.statSync(srcPath)
        if (stat.isDirectory()) continue

        // Skip if already cached
        if (fs.existsSync(destPath)) continue

        fs.mkdirSync(path.dirname(destPath), { recursive: true })

        // Try hard link first, fall back to copy
        try {
          fs.linkSync(srcPath, destPath)
        } catch {
          fs.copyFileSync(srcPath, destPath)
        }
      } catch {
        // Source file missing or inaccessible — skip
      }
    }
  }

  /**
   * Check if a mod version is in the cache (has at least one cached file).
   */
  isInCache(identifier: string, version: string): boolean {
    const modCacheDir = path.join(this.cacheDir, identifier, version)
    try {
      const entries = fs.readdirSync(modCacheDir)
      return entries.length > 0
    } catch {
      return false
    }
  }

  /**
   * Restore mod files from cache to GameData.
   * Returns the list of installed file paths (relative to kspPath).
   */
  restoreFromCache(identifier: string, version: string, kspPath: string): string[] {
    const modCacheDir = path.join(this.cacheDir, identifier, version)
    const restoredFiles: string[] = []

    try {
      const allFiles = this.collectFiles(modCacheDir)
      for (const absPath of allFiles) {
        const relFile = path.relative(modCacheDir, absPath)
        const destPath = path.join(kspPath, relFile)

        try {
          fs.mkdirSync(path.dirname(destPath), { recursive: true })

          // Try hard link first, fall back to copy
          try {
            fs.linkSync(absPath, destPath)
          } catch {
            fs.copyFileSync(absPath, destPath)
          }

          restoredFiles.push(relFile)
        } catch {
          // Skip files that fail to restore
        }
      }
    } catch {
      // Cache dir missing or unreadable
    }

    return restoredFiles
  }

  /**
   * Move mod files from GameData to cache (for profile switch-out).
   * If not already cached, copies to cache first, then deletes from GameData.
   */
  moveToCache(
    identifier: string,
    version: string,
    installedFiles: string[],
    kspPath: string
  ): void {
    // Ensure files are cached first
    this.cacheModFiles(identifier, version, installedFiles, kspPath)

    // Now remove from GameData — files only, not directories (to avoid removing shared dirs)
    const sortedFiles = [...installedFiles].sort((a, b) => b.length - a.length)
    for (const relFile of sortedFiles) {
      const absPath = path.join(kspPath, relFile)
      try {
        const stat = fs.statSync(absPath)
        if (stat.isDirectory()) {
          // Only remove if empty
          const contents = fs.readdirSync(absPath)
          if (contents.length === 0) fs.rmdirSync(absPath)
        } else {
          fs.unlinkSync(absPath)
        }
      } catch {
        // File already gone or inaccessible — skip
      }
    }

    // Clean up empty parent dirs
    const dirs = new Set<string>()
    for (const relFile of installedFiles) {
      let dir = path.dirname(path.join(kspPath, relFile))
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
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Remove from both GameData (if present) and cache.
   */
  purge(identifier: string, version: string): void {
    const modCacheDir = path.join(this.cacheDir, identifier, version)
    try {
      fs.rmSync(modCacheDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }

    // Clean up empty parent dir for this identifier
    const identifierDir = path.join(this.cacheDir, identifier)
    try {
      const contents = fs.readdirSync(identifierDir)
      if (contents.length === 0) fs.rmdirSync(identifierDir)
    } catch {
      /* ignore */
    }
  }

  /**
   * Get total cache size in bytes.
   */
  getCacheSize(): number {
    return this.dirSize(this.cacheDir)
  }

  /**
   * Clear entire cache.
   */
  clearCache(): void {
    try {
      fs.rmSync(this.cacheDir, { recursive: true, force: true })
      fs.mkdirSync(this.cacheDir, { recursive: true })
    } catch {
      /* ignore */
    }
  }

  private collectFiles(dir: string): string[] {
    const files: string[] = []
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          files.push(...this.collectFiles(full))
        } else {
          files.push(full)
        }
      }
    } catch {
      /* ignore */
    }
    return files
  }

  private dirSize(dir: string): number {
    let total = 0
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          total += this.dirSize(full)
        } else {
          try {
            total += fs.statSync(full).size
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
    return total
  }
}

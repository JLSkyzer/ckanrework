import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import type { SpaceDockCacheRow } from './types'
import type { ImageScraperService } from './services/image-scraper'
import type { DatabaseService } from './services/database'
import type { MetaSyncService } from './services/meta-sync'
import type { SpaceDockService } from './services/spacedock'
import type { ResolverService } from './services/resolver'
import type { InstallerService } from './services/installer'
import type { ProfileService } from './services/profile'
import type { ModCacheService } from './services/mod-cache'
import os from 'os'
import path from 'path'

interface Services {
  db: DatabaseService
  metaSync: MetaSyncService
  spaceDock: SpaceDockService
  resolver: ResolverService
  installer: InstallerService
  profile: ProfileService
  imageScraper: ImageScraperService
  modCache: ModCacheService
}

export function registerIpcHandlers(services: Services): void {
  const { db, metaSync, spaceDock, resolver, installer, profile, imageScraper, modCache } = services

  // --- Mods ---
  ipcMain.handle('mods:getAll', () => {
    return db.getAllMods()
  })

  ipcMain.handle('mods:get', (_event, identifier: string) => {
    return db.getMod(identifier) ?? null
  })

  ipcMain.handle('mods:search', (_event, query: string) => {
    return db.searchMods(query)
  })

  ipcMain.handle('mods:getVersions', (_event, identifier: string) => {
    return db.getModVersions(identifier)
  })

  ipcMain.handle('mods:getCount', () => {
    return db.getModCount()
  })

  ipcMain.handle('mods:kspVersions', () => {
    return db.getDistinctKspVersions()
  })

  // --- SpaceDock ---
  ipcMain.handle('spacedock:fetch', (_event, identifier: string) => {
    return spaceDock.fetchModData(identifier)
  })

  ipcMain.handle('spacedock:getCachedImageUrl', async (_event, identifier: string) => {
    return spaceDock.getCachedImageUrl(identifier)
  })

  ipcMain.handle('spacedock:fetchBatch', async (_event, identifiers: string[]) => {
    const map = await spaceDock.fetchBatch(identifiers)
    // Convert Map to plain object for IPC serialization
    const obj: Record<string, SpaceDockCacheRow> = {}
    for (const [k, v] of map) obj[k] = v
    return obj
  })

  // --- Image Scraper ---
  ipcMain.handle('images:scrape', async (_event, identifier: string) => {
    return imageScraper.scrapeModImages(identifier)
  })

  // --- Resolver ---
  ipcMain.handle('resolver:resolve', (_event, identifiers: string[], kspVersion: string, profileId?: string) => {
    return resolver.resolve(identifiers, kspVersion, profileId)
  })

  // --- Installer ---
  ipcMain.handle('installer:install', async (_event, resolvedMod: any, kspPath: string, profileId: string) => {
    const tempDir = path.join(os.tmpdir(), 'ksp-forge-install')
    const plan = installer.buildInstallPlan([resolvedMod])
    const item = plan[0]
    const { Worker } = require('worker_threads')

    const files: string[] = await new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'install-worker.js')
      const worker = new Worker(workerPath, {
        workerData: {
          identifier: item.identifier,
          version: item.version,
          downloadUrl: item.downloadUrl,
          hash: item.hash,
          directives: item.directives,
          kspPath,
          tempDir,
        }
      })

      const win = BrowserWindow.getFocusedWindow()
      worker.on('message', (msg: any) => {
        if (msg.type === 'done') resolve(msg.files)
        else if (msg.type === 'error') reject(new Error(msg.message))
        else if (msg.type === 'download-progress' || msg.type === 'status') {
          win?.webContents.send('installer:progress', { identifier: item.identifier, ...msg })
        }
      })
      worker.on('error', reject)
    })

    // Track in DB (main thread, fast)
    db.addInstalledMod({
      profile_id: profileId,
      identifier: item.identifier,
      version: item.version,
      installed_files: JSON.stringify(files),
      installed_at: Date.now(),
    })

    // Cache mod files for future profile switches
    try {
      modCache.cacheModFiles(item.identifier, item.version, files, kspPath)
    } catch {
      // Non-fatal: caching failure should not break install
    }

    return { success: true }
  })

  ipcMain.handle('installer:uninstall', async (_event, profileId: string, identifier: string, kspPath: string) => {
    await installer.uninstallMod(profileId, identifier, kspPath)
    return { success: true }
  })

  // --- Profiles ---
  ipcMain.handle('profiles:getAll', () => {
    return profile.getProfiles()
  })

  ipcMain.handle('profiles:get', (_event, id: string) => {
    return profile.getProfile(id) ?? null
  })

  ipcMain.handle('profiles:create', (_event, name: string, kspPath: string) => {
    return profile.createProfile(name, kspPath)
  })

  ipcMain.handle('profiles:delete', (_event, id: string) => {
    profile.deleteProfile(id)
    return { success: true }
  })

  ipcMain.handle('profiles:clone', (_event, sourceId: string, newName: string) => {
    return profile.cloneProfile(sourceId, newName)
  })

  ipcMain.handle('profiles:export', (_event, profileId: string) => {
    return profile.exportProfile(profileId)
  })

  ipcMain.handle('profiles:exportToFile', async (_event, profileId: string) => {
    const exportData = profile.exportProfile(profileId)
    const exportJson = {
      name: exportData.profile.name,
      ksp_version: exportData.profile.ksp_version,
      mods: exportData.mods.map((m) => ({ identifier: m.identifier, version: m.version })),
    }

    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showSaveDialog(win, {
          defaultPath: `${exportData.profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
      : await dialog.showSaveDialog({
          defaultPath: `${exportData.profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })

    if (result.canceled || !result.filePath) return { success: false }
    fs.writeFileSync(result.filePath, JSON.stringify(exportJson, null, 2), 'utf-8')
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('profiles:importFromFile', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile'],
        })
      : await dialog.showOpenDialog({
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile'],
        })

    if (result.canceled || result.filePaths.length === 0) return null

    const content = fs.readFileSync(result.filePaths[0], 'utf-8')
    const data = JSON.parse(content) as {
      name: string
      ksp_version: string
      mods: Array<{ identifier: string; version: string }>
    }

    return {
      name: data.name,
      ksp_version: data.ksp_version,
      mods: data.mods,
    }
  })

  ipcMain.handle('profiles:validatePath', (_event, kspPath: string) => {
    const valid = profile.validateKspPath(kspPath)
    if (valid) {
      const kspVersion = profile.detectKspVersion(kspPath)
      return { valid: true, message: 'Valid KSP installation', kspVersion }
    }
    return { valid: false, message: 'No GameData folder found — is this a KSP install?' }
  })

  ipcMain.handle('profiles:scanInstalled', (_event, profileId: string) => {
    return profile.scanInstalledMods(profileId)
  })

  ipcMain.handle('profiles:autoDetect', () => {
    return profile.autoDetectKspPaths()
  })

  ipcMain.handle('profiles:getInstalled', (_event, profileId: string) => {
    return db.getInstalledMods(profileId)
  })

  ipcMain.handle('profiles:switch', (_event, fromProfileId: string, toProfileId: string) => {
    const fromProfile = db.getProfile(fromProfileId)
    if (!fromProfile) throw new Error(`Profile ${fromProfileId} not found`)
    return profile.switchProfile(fromProfileId, toProfileId, fromProfile.ksp_path, modCache)
  })

  // --- Mod Cache ---
  ipcMain.handle('modcache:getSize', () => {
    return modCache.getCacheSize()
  })

  ipcMain.handle('modcache:clear', () => {
    modCache.clearCache()
    return { success: true }
  })

  // --- Meta ---
  ipcMain.handle('meta:sync', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const count = await metaSync.sync((current, total, phase) => {
      win?.webContents.send('meta:sync-progress', { current, total, phase })
    })
    return { count }
  })

  ipcMain.handle('meta:resetAll', () => {
    // Delete all data from DB
    db.close()
    const fs = require('fs')
    const path = require('path')
    const userData = require('electron').app.getPath('userData')
    const dbFile = path.join(userData, 'ksp-forge.db')
    const metaDir = path.join(userData, 'ckan-meta')
    try { fs.unlinkSync(dbFile) } catch {}
    try { fs.unlinkSync(dbFile + '-shm') } catch {}
    try { fs.unlinkSync(dbFile + '-wal') } catch {}
    try { fs.rmSync(metaDir, { recursive: true, force: true }) } catch {}
    // Reopen fresh DB
    db.reopen()
    db.init()
    return { success: true }
  })

  ipcMain.handle('meta:getLastSync', () => {
    // Return null for now — could be persisted in DB later
    return null
  })

  // --- Dialog ---
  ipcMain.handle('dialog:selectFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { SpaceDockCacheRow } from './types'
import type { ImageScraperService } from './services/image-scraper'
import type { DatabaseService } from './services/database'
import type { MetaSyncService } from './services/meta-sync'
import type { SpaceDockService } from './services/spacedock'
import type { ResolverService } from './services/resolver'
import type { InstallerService } from './services/installer'
import type { ProfileService } from './services/profile'
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
}

export function registerIpcHandlers(services: Services): void {
  const { db, metaSync, spaceDock, resolver, installer, profile, imageScraper } = services

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
    // Convert ResolvedMod to InstallPlanItem
    const plan = installer.buildInstallPlan([resolvedMod])
    await installer.installMod(plan[0], kspPath, profileId, tempDir)
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

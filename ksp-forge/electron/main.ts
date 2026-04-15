import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initLogger } from './services/logger'
import { DatabaseService } from './services/database'
import { MetaSyncService } from './services/meta-sync'
import { SpaceDockService } from './services/spacedock'
import { ResolverService } from './services/resolver'
import { InstallerService } from './services/installer'
import { ProfileService } from './services/profile'
import { ImageScraperService } from './services/image-scraper'
import { ModCacheService } from './services/mod-cache'
import { registerIpcHandlers } from './ipc-handlers'

// Force version from package.json (electron-builder PE metadata can be stale)
import pkg from '../package.json'
app.setVersion(pkg.version)

const logger = initLogger(join(app.getPath('userData'), 'logs'))
logger.interceptConsole()

logger.info('KSP Forge starting')
logger.info(`Version: ${app.getVersion()}, Platform: ${process.platform}, Arch: ${process.arch}, Electron: ${process.versions.electron}, Node: ${process.versions.node}`)

process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION: ' + (error.stack || error.message))
  const response = dialog.showMessageBoxSync({
    type: 'error',
    title: 'KSP Forge - Crash',
    message: 'KSP Forge has crashed unexpectedly.',
    detail: `Error: ${error.message}\n\nLogs have been saved to:\n${logger.getLogPath()}`,
    buttons: ['Open Logs Folder', 'Close']
  })
  if (response === 0) {
    shell.openPath(logger.getLogsDir())
  }
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION: ' + String(reason))
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0d1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kspforge')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const userData = app.getPath('userData')
  const dbPath = join(userData, 'ksp-forge.db')
  const repoPath = join(userData, 'ckan-meta')

  logger.info('Initializing database...')
  const db = new DatabaseService(dbPath)
  db.init()

  logger.info('Initializing services...')
  const metaSync = new MetaSyncService(repoPath, db, dbPath)
  const imageCacheDir = join(userData, 'image-cache')
  const spaceDock = new SpaceDockService(db, imageCacheDir)
  const resolver = new ResolverService(db)
  const installer = new InstallerService(db)
  const profile = new ProfileService(db)
  const imageScraper = new ImageScraperService(db, join(userData, 'scraper-cache'))
  const modCache = new ModCacheService(join(userData, 'mod-cache'))

  logger.info('Registering IPC handlers...')
  registerIpcHandlers({ db, metaSync, spaceDock, resolver, installer, profile, imageScraper, modCache })

  logger.info('Creating main window...')
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.info('All windows closed, quitting')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

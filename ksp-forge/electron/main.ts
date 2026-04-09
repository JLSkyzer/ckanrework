import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DatabaseService } from './services/database'
import { MetaSyncService } from './services/meta-sync'
import { SpaceDockService } from './services/spacedock'
import { ResolverService } from './services/resolver'
import { InstallerService } from './services/installer'
import { ProfileService } from './services/profile'
import { ImageScraperService } from './services/image-scraper'
import { registerIpcHandlers } from './ipc-handlers'

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

  const db = new DatabaseService(dbPath)
  db.init()

  const metaSync = new MetaSyncService(repoPath, db, dbPath)
  const spaceDock = new SpaceDockService(db)
  const resolver = new ResolverService(db)
  const installer = new InstallerService(db)
  const profile = new ProfileService(db)
  const imageScraper = new ImageScraperService(db)

  registerIpcHandlers({ db, metaSync, spaceDock, resolver, installer, profile, imageScraper })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

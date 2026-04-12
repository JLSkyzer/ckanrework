import { parentPort, workerData } from 'worker_threads'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import crypto from 'crypto'
import unzipper from 'unzip-stream'

interface InstallJob {
  identifier: string
  version: string
  downloadUrl: string
  hash: string | null
  directives: Array<{ find?: string; file?: string; install_to: string; filter?: string | string[] }>
  kspPath: string
  tempDir: string
}

const job = workerData as InstallJob

function download(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)

    const req = proto.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        try { fs.unlinkSync(destPath) } catch {}
        download(res.headers.location, destPath).then(resolve).catch(reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      const total = res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : null
      let downloaded = 0

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        parentPort?.postMessage({ type: 'download-progress', downloaded, total })
      })

      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    })

    req.on('error', (err) => {
      file.close()
      try { fs.unlinkSync(destPath) } catch {}
      reject(err)
    })
  })
}

function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (d) => hash.update(d))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function extractAndInstall(zipPath: string, kspPath: string, directives: InstallJob['directives']): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const installedFiles: string[] = []
    const entries: { entryPath: string; buffer: Buffer }[] = []

    if (directives.length === 0) {
      directives = [{ install_to: 'GameData' }]
    }

    const stream = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }))

    stream.on('entry', (entry: any) => {
      if (entry.type === 'Directory') { entry.autodrain(); return }
      const chunks: Buffer[] = []
      entry.on('data', (chunk: Buffer) => chunks.push(chunk))
      entry.on('end', () => entries.push({ entryPath: entry.path, buffer: Buffer.concat(chunks) }))
      entry.on('error', reject)
    })

    stream.on('finish', () => {
      try {
        for (const directive of directives) {
          const matched = applyDirective(directive, entries)
          for (const { relDest, buffer } of matched) {
            const destPath = path.join(kspPath, relDest)
            fs.mkdirSync(path.dirname(destPath), { recursive: true })
            fs.writeFileSync(destPath, buffer)
            installedFiles.push(relDest)
          }
        }
        resolve(installedFiles)
      } catch (err) { reject(err) }
    })

    stream.on('error', reject)
  })
}

function applyDirective(
  directive: InstallJob['directives'][0],
  entries: { entryPath: string; buffer: Buffer }[]
): { relDest: string; buffer: Buffer }[] {
  const results: { relDest: string; buffer: Buffer }[] = []
  const installTo = directive.install_to || 'GameData'

  let findPrefix = ''
  if (directive.find) {
    const match = entries.find(e => {
      const parts = e.entryPath.split('/')
      return parts.some(p => p === directive.find)
    })
    if (match) {
      const parts = match.entryPath.split('/')
      const idx = parts.indexOf(directive.find!)
      findPrefix = parts.slice(0, idx).join('/')
      if (findPrefix) findPrefix += '/'
    }
  }

  for (const entry of entries) {
    let entryPath = entry.entryPath

    if (directive.find) {
      if (!entryPath.startsWith(findPrefix + directive.find + '/') && entryPath !== findPrefix + directive.find) continue
      entryPath = entryPath.substring(findPrefix.length)
    } else if (directive.file) {
      if (entryPath !== directive.file && !entryPath.startsWith(directive.file + '/')) continue
    }

    if (directive.filter) {
      const filters = Array.isArray(directive.filter) ? directive.filter : [directive.filter]
      const name = path.basename(entryPath)
      if (filters.some(f => name === f || entryPath.includes(f))) continue
    }

    const relDest = path.join(installTo, entryPath)
    results.push({ relDest, buffer: entry.buffer })
  }

  return results
}

async function run() {
  try {
    fs.mkdirSync(job.tempDir, { recursive: true })
    const zipPath = path.join(job.tempDir, `${job.identifier}-${job.version}.zip`)

    // Download
    parentPort?.postMessage({ type: 'status', status: 'downloading' })
    await download(job.downloadUrl, zipPath)

    // Hash check
    if (job.hash) {
      parentPort?.postMessage({ type: 'status', status: 'verifying' })
      const actual = await sha256(zipPath)
      if (actual.toLowerCase() !== job.hash.toLowerCase()) {
        fs.unlinkSync(zipPath)
        throw new Error(`Hash mismatch: expected ${job.hash}, got ${actual}`)
      }
    }

    // Extract
    parentPort?.postMessage({ type: 'status', status: 'extracting' })
    const files = await extractAndInstall(zipPath, job.kspPath, job.directives)

    // Cleanup
    try { fs.unlinkSync(zipPath) } catch {}

    parentPort?.postMessage({ type: 'done', files })
  } catch (err: any) {
    parentPort?.postMessage({ type: 'error', message: err.message })
  }
}

run()

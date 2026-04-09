import fs from 'fs'
import path from 'path'

class Logger {
  private logsDir: string

  constructor(logsDir: string) {
    this.logsDir = logsDir
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true })
    }
    this.cleanup()
  }

  private getDateString(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  private getTimestamp(): string {
    const now = new Date()
    const y = now.getFullYear()
    const mo = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const mi = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`
  }

  private formatArgs(args: any[]): string {
    if (args.length === 0) return ''
    return ' ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  }

  private write(level: string, message: string, args: any[]): void {
    const line = `[${this.getTimestamp()}] [${level}] ${message}${this.formatArgs(args)}\n`
    try {
      fs.appendFileSync(this.getLogPath(), line, 'utf-8')
    } catch {
      // If we can't write logs, don't crash the app
    }
  }

  info(message: string, ...args: any[]): void {
    this.write('INFO', message, args)
  }

  warn(message: string, ...args: any[]): void {
    this.write('WARN', message, args)
  }

  error(message: string, ...args: any[]): void {
    this.write('ERROR', message, args)
  }

  debug(message: string, ...args: any[]): void {
    this.write('DEBUG', message, args)
  }

  getLogPath(): string {
    return path.join(this.logsDir, `ksp-forge-${this.getDateString()}.log`)
  }

  getLogsDir(): string {
    return this.logsDir
  }

  exportLogs(): string {
    const now = Date.now()
    const threeDays = 3 * 24 * 60 * 60 * 1000
    const parts: string[] = []

    try {
      const files = fs.readdirSync(this.logsDir).filter((f) => f.startsWith('ksp-forge-') && f.endsWith('.log')).sort()
      for (const file of files) {
        const stat = fs.statSync(path.join(this.logsDir, file))
        if (now - stat.mtimeMs <= threeDays) {
          parts.push(`=== ${file} ===\n`)
          parts.push(fs.readFileSync(path.join(this.logsDir, file), 'utf-8'))
          parts.push('\n')
        }
      }
    } catch {
      // If we can't read logs, return empty
    }

    return parts.join('')
  }

  interceptConsole(): void {
    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error

    console.log = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      this.info(msg)
      originalLog.apply(console, args)
    }

    console.warn = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      this.warn(msg)
      originalWarn.apply(console, args)
    }

    console.error = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      this.error(msg)
      originalError.apply(console, args)
    }
  }

  cleanup(): void {
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()

    try {
      const files = fs.readdirSync(this.logsDir)
      for (const file of files) {
        if (!file.startsWith('ksp-forge-') || !file.endsWith('.log')) continue
        const filePath = path.join(this.logsDir, file)
        const stat = fs.statSync(filePath)
        if (now - stat.mtimeMs > sevenDays) {
          fs.unlinkSync(filePath)
        }
      }
    } catch {
      // If cleanup fails, don't crash
    }
  }
}

let _instance: Logger | null = null

export function getLogger(): Logger {
  return _instance!
}

export function initLogger(logsDir: string): Logger {
  _instance = new Logger(logsDir)
  return _instance
}

export { Logger }

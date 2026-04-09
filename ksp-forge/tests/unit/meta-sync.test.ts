import { describe, it, expect } from 'vitest'
import { parseCkanFile, extractSpaceDockId } from '../../electron/services/meta-sync'

const SAMPLE_CKAN = {
  spec_version: 'v1.4',
  identifier: 'TestMod',
  name: 'Test Mod',
  abstract: 'A test mod',
  author: 'TestAuthor',
  license: 'MIT',
  version: '1.2.3',
  ksp_version: '1.12.5',
  depends: [{ name: 'ModuleManager' }],
  conflicts: [{ name: 'OtherMod' }],
  install: [{ find: 'TestMod', install_to: 'GameData' }],
  download: 'https://spacedock.info/mod/9999/download/1.2.3',
  download_size: 50000,
  download_hash: { sha256: 'abc123' },
  resources: {
    spacedock: 'https://spacedock.info/mod/9999/TestMod',
    repository: 'https://github.com/test/testmod'
  },
  tags: ['parts', 'physics']
}

describe('parseCkanFile', () => {
  it('parses a .ckan JSON into ModRow and ModVersionRow', () => {
    const { mod, version } = parseCkanFile(SAMPLE_CKAN)
    expect(mod.identifier).toBe('TestMod')
    expect(mod.name).toBe('Test Mod')
    expect(mod.author).toBe('TestAuthor')
    expect(mod.spacedock_id).toBe(9999)
    expect(mod.latest_version).toBe('1.2.3')
    expect(version.identifier).toBe('TestMod')
    expect(version.version).toBe('1.2.3')
    expect(version.download_url).toBe('https://spacedock.info/mod/9999/download/1.2.3')
    expect(JSON.parse(version.depends!)).toEqual([{ name: 'ModuleManager' }])
    expect(JSON.parse(version.conflicts!)).toEqual([{ name: 'OtherMod' }])
  })

  it('handles array authors', () => {
    const ckan = { ...SAMPLE_CKAN, author: ['Author1', 'Author2'] }
    const { mod } = parseCkanFile(ckan)
    expect(mod.author).toBe('Author1, Author2')
  })
})

describe('extractSpaceDockId', () => {
  it('extracts ID from spacedock URL', () => {
    expect(extractSpaceDockId('https://spacedock.info/mod/2095/SomeMod')).toBe(2095)
  })
  it('returns null for non-spacedock URL', () => {
    expect(extractSpaceDockId('https://github.com/test/mod')).toBeNull()
  })
  it('returns null for undefined', () => {
    expect(extractSpaceDockId(undefined)).toBeNull()
  })
})

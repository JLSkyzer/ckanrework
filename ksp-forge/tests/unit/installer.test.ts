import { describe, it, expect, vi } from 'vitest'
import { InstallerService } from '../../electron/services/installer'
import type { ResolvedMod } from '../../electron/services/resolver'

function makeDb() {
  return {
    addInstalledMod: vi.fn(),
    removeInstalledMod: vi.fn(),
    getInstalledMods: vi.fn(() => []),
  } as any
}

describe('InstallerService', () => {
  it('buildInstallPlan builds correct plan from resolved mods', () => {
    const db = makeDb()
    const service = new InstallerService(db)

    const mods: ResolvedMod[] = [
      {
        identifier: 'ModA',
        version: '1.0.0',
        download_url: 'https://example.com/moda-1.0.0.zip',
        download_size: 1024000,
        download_hash: 'abc123',
        install_directives: JSON.stringify([{ find: 'ModA', install_to: 'GameData' }]),
        isDependency: false,
      },
      {
        identifier: 'ModB',
        version: '2.0.0',
        download_url: 'https://example.com/modb-2.0.0.zip',
        download_size: null,
        download_hash: null,
        install_directives: JSON.stringify([{ file: 'ModB/ModB.dll', install_to: 'GameData/ModB' }]),
        isDependency: true,
      },
    ]

    const plan = service.buildInstallPlan(mods)

    expect(plan).toHaveLength(2)

    expect(plan[0].identifier).toBe('ModA')
    expect(plan[0].version).toBe('1.0.0')
    expect(plan[0].downloadUrl).toBe('https://example.com/moda-1.0.0.zip')
    expect(plan[0].totalSize).toBe(1024000)
    expect(plan[0].hash).toBe('abc123')
    expect(plan[0].isDependency).toBe(false)
    expect(plan[0].directives).toEqual([{ find: 'ModA', install_to: 'GameData' }])

    expect(plan[1].identifier).toBe('ModB')
    expect(plan[1].version).toBe('2.0.0')
    expect(plan[1].downloadUrl).toBe('https://example.com/modb-2.0.0.zip')
    expect(plan[1].totalSize).toBeNull()
    expect(plan[1].hash).toBeNull()
    expect(plan[1].isDependency).toBe(true)
    expect(plan[1].directives).toEqual([{ file: 'ModB/ModB.dll', install_to: 'GameData/ModB' }])
  })

  it('parseDirectives parses valid JSON correctly', () => {
    const db = makeDb()
    const service = new InstallerService(db)

    const json = JSON.stringify([
      { find: 'ModA', install_to: 'GameData', filter: ['CHANGES.txt'] },
      { file: 'ModA/Plugin.dll', install_to: 'GameData/ModA' },
    ])

    const directives = service.parseDirectives(json)

    expect(directives).toHaveLength(2)
    expect(directives[0].find).toBe('ModA')
    expect(directives[0].install_to).toBe('GameData')
    expect(directives[0].filter).toEqual(['CHANGES.txt'])
    expect(directives[1].file).toBe('ModA/Plugin.dll')
    expect(directives[1].install_to).toBe('GameData/ModA')
  })

  it('parseDirectives returns empty array for invalid JSON', () => {
    const db = makeDb()
    const service = new InstallerService(db)

    expect(service.parseDirectives('not-json')).toEqual([])
    expect(service.parseDirectives('')).toEqual([])
    expect(service.parseDirectives('{}')).toEqual([]) // not an array
  })
})

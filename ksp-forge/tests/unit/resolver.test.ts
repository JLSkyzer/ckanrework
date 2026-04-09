import { describe, it, expect, vi } from 'vitest'
import { ResolverService } from '../../electron/services/resolver'

function makeDb(mods: Record<string, any>) {
  return {
    getModVersions: vi.fn((id: string) => {
      const mod = mods[id]
      if (!mod) return []
      return [mod]
    }),
    getInstalledMods: vi.fn(() => []),
  } as any
}

describe('ResolverService', () => {
  it('resolves a mod with no dependencies', () => {
    const db = makeDb({
      ModA: { identifier: 'ModA', version: '1.0.0', download_url: 'https://example.com/a.zip',
        depends: null, conflicts: null, ksp_version: '1.12.5',
        ksp_version_min: null, ksp_version_max: null, install_directives: '[{"find":"ModA","install_to":"GameData"}]' }
    })
    const resolver = new ResolverService(db)
    const result = resolver.resolve(['ModA'], '1.12.5')
    expect(result.success).toBe(true)
    expect(result.toInstall).toHaveLength(1)
    expect(result.toInstall[0].identifier).toBe('ModA')
  })

  it('resolves transitive dependencies', () => {
    const db = makeDb({
      ModA: { identifier: 'ModA', version: '1.0.0', download_url: 'https://example.com/a.zip',
        depends: JSON.stringify([{ name: 'ModB' }]), conflicts: null, ksp_version: '1.12.5',
        ksp_version_min: null, ksp_version_max: null, install_directives: '[]' },
      ModB: { identifier: 'ModB', version: '2.0.0', download_url: 'https://example.com/b.zip',
        depends: JSON.stringify([{ name: 'ModC' }]), conflicts: null, ksp_version: '1.12.5',
        ksp_version_min: null, ksp_version_max: null, install_directives: '[]' },
      ModC: { identifier: 'ModC', version: '3.0.0', download_url: 'https://example.com/c.zip',
        depends: null, conflicts: null, ksp_version: '1.12.5',
        ksp_version_min: null, ksp_version_max: null, install_directives: '[]' },
    })
    const resolver = new ResolverService(db)
    const result = resolver.resolve(['ModA'], '1.12.5')
    expect(result.success).toBe(true)
    expect(result.toInstall).toHaveLength(3)
    const ids = result.toInstall.map(m => m.identifier)
    expect(ids).toContain('ModA')
    expect(ids).toContain('ModB')
    expect(ids).toContain('ModC')
  })

  it('detects conflicts', () => {
    const db = makeDb({
      ModA: { identifier: 'ModA', version: '1.0.0', download_url: 'https://example.com/a.zip',
        depends: null, conflicts: JSON.stringify([{ name: 'ModB' }]), ksp_version: '1.12.5',
        ksp_version_min: null, ksp_version_max: null, install_directives: '[]' },
      ModB: { identifier: 'ModB', version: '1.0.0', download_url: 'https://example.com/b.zip',
        depends: null, conflicts: null, ksp_version: '1.12.5',
        ksp_version_min: null, ksp_version_max: null, install_directives: '[]' },
    })
    const resolver = new ResolverService(db)
    const result = resolver.resolve(['ModA', 'ModB'], '1.12.5')
    expect(result.success).toBe(false)
    expect(result.conflicts.length).toBeGreaterThan(0)
  })

  it('detects missing dependencies', () => {
    const db = makeDb({
      ModA: { identifier: 'ModA', version: '1.0.0', download_url: 'https://example.com/a.zip',
        depends: JSON.stringify([{ name: 'NonExistent' }]), conflicts: null, ksp_version: '1.12.5',
        ksp_version_min: null, ksp_version_max: null, install_directives: '[]' }
    })
    const resolver = new ResolverService(db)
    const result = resolver.resolve(['ModA'], '1.12.5')
    expect(result.success).toBe(false)
    expect(result.missing).toContain('NonExistent')
  })
})

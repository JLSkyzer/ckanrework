import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../electron/services/database'
import type { ModRow, ProfileRow } from '../../electron/types'

function makeMod(overrides: Partial<ModRow> = {}): ModRow {
  return {
    identifier: 'TestMod',
    name: 'Test Mod',
    abstract: 'A test mod',
    author: 'Tester',
    license: 'MIT',
    latest_version: '1.0.0',
    ksp_version: '1.12.5',
    ksp_version_min: null,
    ksp_version_max: null,
    download_url: 'https://example.com/test.zip',
    download_size: 1024,
    spacedock_id: null,
    tags: null,
    resources: null,
    updated_at: Date.now(),
    ...overrides,
  }
}

function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'profile-1',
    name: 'Default',
    ksp_path: '/games/ksp',
    ksp_version: '1.12.5',
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  }
}

describe('DatabaseService', () => {
  let db: DatabaseService

  beforeEach(() => {
    db = new DatabaseService(':memory:')
    db.init()
  })

  afterEach(() => {
    db.close()
  })

  it('creates all tables on init', () => {
    const tables = db.listTables()
    expect(tables).toContain('mods')
    expect(tables).toContain('mod_versions')
    expect(tables).toContain('spacedock_cache')
    expect(tables).toContain('profiles')
    expect(tables).toContain('installed_mods')
    expect(tables).toContain('mods_fts')
  })

  it('upserts and retrieves a mod', () => {
    const mod = makeMod()
    db.upsertMod(mod)

    const retrieved = db.getMod('TestMod')
    expect(retrieved).toBeDefined()
    expect(retrieved!.identifier).toBe('TestMod')
    expect(retrieved!.name).toBe('Test Mod')
    expect(retrieved!.author).toBe('Tester')
    expect(retrieved!.license).toBe('MIT')
    expect(retrieved!.latest_version).toBe('1.0.0')
  })

  it('updates a mod on conflict', () => {
    db.upsertMod(makeMod())
    db.upsertMod(makeMod({ name: 'Updated Test Mod', latest_version: '2.0.0' }))

    const retrieved = db.getMod('TestMod')
    expect(retrieved!.name).toBe('Updated Test Mod')
    expect(retrieved!.latest_version).toBe('2.0.0')
    expect(db.getModCount()).toBe(1)
  })

  it('returns all mods', () => {
    db.upsertMod(makeMod({ identifier: 'ModA', name: 'Mod A' }))
    db.upsertMod(makeMod({ identifier: 'ModB', name: 'Mod B' }))
    db.upsertMod(makeMod({ identifier: 'ModC', name: 'Mod C' }))

    const all = db.getAllMods()
    expect(all).toHaveLength(3)
    expect(all.map((m) => m.identifier)).toContain('ModA')
  })

  it('searches mods by name (FTS5)', () => {
    db.upsertMod(makeMod({ identifier: 'KerbalAlarmClock', name: 'Kerbal Alarm Clock', abstract: 'Set alarms' }))
    db.upsertMod(makeMod({ identifier: 'MechJeb2', name: 'MechJeb 2', abstract: 'Autopilot' }))
    db.upsertMod(makeMod({ identifier: 'ScienceAlert', name: 'Science Alert', abstract: 'Science notifications' }))

    const results = db.searchMods('Kerbal')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].identifier).toBe('KerbalAlarmClock')

    const mechResults = db.searchMods('Autopilot')
    expect(mechResults.length).toBeGreaterThan(0)
    expect(mechResults[0].identifier).toBe('MechJeb2')
  })

  it('returns empty search results for no matches', () => {
    db.upsertMod(makeMod())
    const results = db.searchMods('xyznonexistentxyz')
    expect(results).toHaveLength(0)
  })

  it('manages profiles', () => {
    const profile = makeProfile()
    db.createProfile(profile)

    const profiles = db.getProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].id).toBe('profile-1')
    expect(profiles[0].name).toBe('Default')

    const fetched = db.getProfile('profile-1')
    expect(fetched).toBeDefined()
    expect(fetched!.ksp_path).toBe('/games/ksp')

    db.deleteProfile('profile-1')
    expect(db.getProfiles()).toHaveLength(0)
    expect(db.getProfile('profile-1')).toBeUndefined()
  })

  it('manages installed mods', () => {
    db.createProfile(makeProfile())

    db.addInstalledMod({
      profile_id: 'profile-1',
      identifier: 'ModA',
      version: '1.0.0',
      installed_files: JSON.stringify(['GameData/ModA/']),
      installed_at: Date.now(),
    })

    const installed = db.getInstalledMods('profile-1')
    expect(installed).toHaveLength(1)
    expect(installed[0].identifier).toBe('ModA')

    db.removeInstalledMod('profile-1', 'ModA')
    expect(db.getInstalledMods('profile-1')).toHaveLength(0)
  })

  it('returns mod count', () => {
    expect(db.getModCount()).toBe(0)
    db.upsertMod(makeMod({ identifier: 'Mod1' }))
    db.upsertMod(makeMod({ identifier: 'Mod2' }))
    expect(db.getModCount()).toBe(2)
  })
})

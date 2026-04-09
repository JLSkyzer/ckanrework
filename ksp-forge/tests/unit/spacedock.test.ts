import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpaceDockService } from '../../electron/services/spacedock'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('SpaceDockService', () => {
  let service: SpaceDockService
  const mockDb = {
    getMod: vi.fn(),
    getSpaceDockCache: vi.fn(),
    upsertSpaceDockCache: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    service = new SpaceDockService(mockDb as any)
  })

  it('fetches mod data from SpaceDock API', async () => {
    mockDb.getSpaceDockCache.mockReturnValue(null)
    mockDb.getMod.mockReturnValue({ identifier: 'TestMod', spacedock_id: 123 })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'Test Mod',
        description: 'Full description here',
        description_html: '<p>Full description here</p>',
        background: 'https://spacedock.info/content/test/bg.jpg',
        downloads: 50000,
        followers: 200,
      })
    })
    const result = await service.fetchModData('TestMod')
    expect(result).not.toBeNull()
    expect(result!.description).toBe('Full description here')
    expect(result!.background_url).toBe('https://spacedock.info/content/test/bg.jpg')
    expect(result!.downloads).toBe(50000)
    expect(mockDb.upsertSpaceDockCache).toHaveBeenCalled()
  })

  it('returns cached data if fresh', async () => {
    const cached = {
      spacedock_id: 123, mod_identifier: 'TestMod',
      description: 'Cached desc', description_html: '<p>Cached</p>',
      background_url: 'https://spacedock.info/bg.jpg',
      downloads: 1000, followers: 50, fetched_at: Date.now()
    }
    mockDb.getSpaceDockCache.mockReturnValue(cached)
    const result = await service.fetchModData('TestMod')
    expect(result).toEqual(cached)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when mod has no spacedock_id', async () => {
    mockDb.getMod.mockReturnValue({ identifier: 'TestMod', spacedock_id: null })
    mockDb.getSpaceDockCache.mockReturnValue(null)
    const result = await service.fetchModData('TestMod')
    expect(result).toBeNull()
  })
})

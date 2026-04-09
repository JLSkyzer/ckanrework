import Database from 'better-sqlite3'
import type {
  ModRow,
  ModVersionRow,
  SpaceDockCacheRow,
  ProfileRow,
  InstalledModRow,
} from '../types'

export class DatabaseService {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mods (
        identifier      TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        abstract        TEXT,
        author          TEXT NOT NULL,
        license         TEXT NOT NULL,
        latest_version  TEXT NOT NULL,
        ksp_version     TEXT,
        ksp_version_min TEXT,
        ksp_version_max TEXT,
        download_url    TEXT,
        download_size   INTEGER,
        spacedock_id    INTEGER,
        tags            TEXT,
        resources       TEXT,
        updated_at      INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mod_versions (
        identifier          TEXT NOT NULL,
        version             TEXT NOT NULL,
        ksp_version         TEXT,
        ksp_version_min     TEXT,
        ksp_version_max     TEXT,
        download_url        TEXT NOT NULL,
        download_hash       TEXT,
        download_size       INTEGER,
        depends             TEXT,
        recommends          TEXT,
        suggests            TEXT,
        conflicts           TEXT,
        install_directives  TEXT NOT NULL,
        PRIMARY KEY (identifier, version)
      );

      CREATE TABLE IF NOT EXISTS spacedock_cache (
        spacedock_id      INTEGER PRIMARY KEY,
        mod_identifier    TEXT NOT NULL,
        description       TEXT,
        description_html  TEXT,
        background_url    TEXT,
        downloads         INTEGER,
        followers         INTEGER,
        fetched_at        INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        ksp_path    TEXT NOT NULL,
        ksp_version TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS installed_mods (
        profile_id       TEXT NOT NULL,
        identifier       TEXT NOT NULL,
        version          TEXT NOT NULL,
        installed_files  TEXT NOT NULL,
        installed_at     INTEGER NOT NULL,
        PRIMARY KEY (profile_id, identifier)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS mods_fts USING fts5(
        identifier,
        name,
        abstract,
        author,
        tags,
        content='mods',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS mods_fts_insert AFTER INSERT ON mods BEGIN
        INSERT INTO mods_fts(rowid, identifier, name, abstract, author, tags)
        VALUES (new.rowid, new.identifier, new.name, new.abstract, new.author, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS mods_fts_update AFTER UPDATE ON mods BEGIN
        INSERT INTO mods_fts(mods_fts, rowid, identifier, name, abstract, author, tags)
        VALUES ('delete', old.rowid, old.identifier, old.name, old.abstract, old.author, old.tags);
        INSERT INTO mods_fts(rowid, identifier, name, abstract, author, tags)
        VALUES (new.rowid, new.identifier, new.name, new.abstract, new.author, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS mods_fts_delete AFTER DELETE ON mods BEGIN
        INSERT INTO mods_fts(mods_fts, rowid, identifier, name, abstract, author, tags)
        VALUES ('delete', old.rowid, old.identifier, old.name, old.abstract, old.author, old.tags);
      END;
    `)
  }

  listTables(): string[] {
    const rows = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[]
    return rows.map((r) => r.name)
  }

  upsertMod(mod: ModRow): void {
    this.db
      .prepare(
        `INSERT INTO mods (
          identifier, name, abstract, author, license, latest_version,
          ksp_version, ksp_version_min, ksp_version_max,
          download_url, download_size, spacedock_id, tags, resources, updated_at
        ) VALUES (
          @identifier, @name, @abstract, @author, @license, @latest_version,
          @ksp_version, @ksp_version_min, @ksp_version_max,
          @download_url, @download_size, @spacedock_id, @tags, @resources, @updated_at
        )
        ON CONFLICT(identifier) DO UPDATE SET
          name            = excluded.name,
          abstract        = excluded.abstract,
          author          = excluded.author,
          license         = excluded.license,
          latest_version  = excluded.latest_version,
          ksp_version     = excluded.ksp_version,
          ksp_version_min = excluded.ksp_version_min,
          ksp_version_max = excluded.ksp_version_max,
          download_url    = excluded.download_url,
          download_size   = excluded.download_size,
          spacedock_id    = excluded.spacedock_id,
          tags            = excluded.tags,
          resources       = excluded.resources,
          updated_at      = excluded.updated_at`
      )
      .run(mod)
  }

  getMod(identifier: string): ModRow | undefined {
    return this.db
      .prepare(`SELECT * FROM mods WHERE identifier = @identifier`)
      .get({ identifier }) as ModRow | undefined
  }

  getAllMods(): ModRow[] {
    return this.db
      .prepare(`SELECT * FROM mods ORDER BY name`)
      .all() as ModRow[]
  }

  searchMods(query: string): ModRow[] {
    const sanitized = query.replace(/['"*]/g, ' ').trim()
    if (!sanitized) return this.getAllMods()
    return this.db
      .prepare(
        `SELECT mods.* FROM mods
         JOIN mods_fts ON mods.rowid = mods_fts.rowid
         WHERE mods_fts MATCH @query
         ORDER BY rank`
      )
      .all({ query: sanitized + '*' }) as ModRow[]
  }

  upsertModVersion(version: ModVersionRow): void {
    this.db
      .prepare(
        `INSERT INTO mod_versions (
          identifier, version, ksp_version, ksp_version_min, ksp_version_max,
          download_url, download_hash, download_size,
          depends, recommends, suggests, conflicts, install_directives
        ) VALUES (
          @identifier, @version, @ksp_version, @ksp_version_min, @ksp_version_max,
          @download_url, @download_hash, @download_size,
          @depends, @recommends, @suggests, @conflicts, @install_directives
        )
        ON CONFLICT(identifier, version) DO UPDATE SET
          ksp_version         = excluded.ksp_version,
          ksp_version_min     = excluded.ksp_version_min,
          ksp_version_max     = excluded.ksp_version_max,
          download_url        = excluded.download_url,
          download_hash       = excluded.download_hash,
          download_size       = excluded.download_size,
          depends             = excluded.depends,
          recommends          = excluded.recommends,
          suggests            = excluded.suggests,
          conflicts           = excluded.conflicts,
          install_directives  = excluded.install_directives`
      )
      .run(version)
  }

  getModVersions(identifier: string): ModVersionRow[] {
    return this.db
      .prepare(`SELECT * FROM mod_versions WHERE identifier = @identifier ORDER BY version DESC`)
      .all({ identifier }) as ModVersionRow[]
  }

  upsertSpaceDockCache(entry: SpaceDockCacheRow): void {
    this.db
      .prepare(
        `INSERT INTO spacedock_cache (
          spacedock_id, mod_identifier, description, description_html,
          background_url, downloads, followers, fetched_at
        ) VALUES (
          @spacedock_id, @mod_identifier, @description, @description_html,
          @background_url, @downloads, @followers, @fetched_at
        )
        ON CONFLICT(spacedock_id) DO UPDATE SET
          mod_identifier   = excluded.mod_identifier,
          description      = excluded.description,
          description_html = excluded.description_html,
          background_url   = excluded.background_url,
          downloads        = excluded.downloads,
          followers        = excluded.followers,
          fetched_at       = excluded.fetched_at`
      )
      .run(entry)
  }

  getSpaceDockCache(spacedockId: number): SpaceDockCacheRow | undefined {
    return this.db
      .prepare(`SELECT * FROM spacedock_cache WHERE spacedock_id = @spacedock_id`)
      .get({ spacedock_id: spacedockId }) as SpaceDockCacheRow | undefined
  }

  getStaleSpaceDockEntries(olderThanMs: number): SpaceDockCacheRow[] {
    const cutoff = Date.now() - olderThanMs
    return this.db
      .prepare(`SELECT * FROM spacedock_cache WHERE fetched_at < @cutoff`)
      .all({ cutoff }) as SpaceDockCacheRow[]
  }

  createProfile(profile: ProfileRow): void {
    this.db
      .prepare(
        `INSERT INTO profiles (id, name, ksp_path, ksp_version, created_at, updated_at)
         VALUES (@id, @name, @ksp_path, @ksp_version, @created_at, @updated_at)`
      )
      .run(profile)
  }

  getProfiles(): ProfileRow[] {
    return this.db
      .prepare(`SELECT * FROM profiles ORDER BY name`)
      .all() as ProfileRow[]
  }

  getProfile(id: string): ProfileRow | undefined {
    return this.db
      .prepare(`SELECT * FROM profiles WHERE id = @id`)
      .get({ id }) as ProfileRow | undefined
  }

  deleteProfile(id: string): void {
    this.db.prepare(`DELETE FROM profiles WHERE id = @id`).run({ id })
  }

  addInstalledMod(entry: InstalledModRow): void {
    this.db
      .prepare(
        `INSERT INTO installed_mods (profile_id, identifier, version, installed_files, installed_at)
         VALUES (@profile_id, @identifier, @version, @installed_files, @installed_at)
         ON CONFLICT(profile_id, identifier) DO UPDATE SET
           version         = excluded.version,
           installed_files = excluded.installed_files,
           installed_at    = excluded.installed_at`
      )
      .run(entry)
  }

  removeInstalledMod(profileId: string, identifier: string): void {
    this.db
      .prepare(`DELETE FROM installed_mods WHERE profile_id = @profile_id AND identifier = @identifier`)
      .run({ profile_id: profileId, identifier })
  }

  getInstalledMods(profileId: string): InstalledModRow[] {
    return this.db
      .prepare(`SELECT * FROM installed_mods WHERE profile_id = @profile_id ORDER BY identifier`)
      .all({ profile_id: profileId }) as InstalledModRow[]
  }

  getModCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM mods`).get() as { count: number }
    return row.count
  }

  runInTransaction(fn: () => void): void {
    this.db.transaction(fn)()
  }

  close(): void {
    this.db.close()
  }
}

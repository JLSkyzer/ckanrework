export interface CkanMetadata {
  identifier: string
  name: string
  abstract?: string
  author: string | string[]
  license: string | string[]
  version: string
  ksp_version?: string
  ksp_version_min?: string
  ksp_version_max?: string
  depends?: Relationship[]
  recommends?: Relationship[]
  suggests?: Relationship[]
  conflicts?: Relationship[]
  install: InstallDirective[]
  download: string
  download_size?: number
  download_hash?: { sha1?: string; sha256?: string }
  resources?: {
    homepage?: string
    spacedock?: string
    repository?: string
    bugtracker?: string
  }
  tags?: string[]
}

export interface Relationship {
  name: string
  min_version?: string
  max_version?: string
  version?: string
}

export interface InstallDirective {
  find?: string
  file?: string
  find_regexp?: string
  install_to: string
  filter?: string[]
  filter_regexp?: string[]
}

export interface ModRow {
  identifier: string
  name: string
  abstract: string | null
  author: string
  license: string
  latest_version: string
  ksp_version: string | null
  ksp_version_min: string | null
  ksp_version_max: string | null
  download_url: string | null
  download_size: number | null
  spacedock_id: number | null
  tags: string | null
  resources: string | null
  updated_at: number
}

export interface ModVersionRow {
  identifier: string
  version: string
  ksp_version: string | null
  ksp_version_min: string | null
  ksp_version_max: string | null
  download_url: string
  download_hash: string | null
  download_size: number | null
  depends: string | null
  recommends: string | null
  suggests: string | null
  conflicts: string | null
  install_directives: string
}

export interface SpaceDockCacheRow {
  spacedock_id: number
  mod_identifier: string
  description: string | null
  description_html: string | null
  background_url: string | null
  downloads: number | null
  followers: number | null
  fetched_at: number
}

export interface ProfileRow {
  id: string
  name: string
  ksp_path: string
  ksp_version: string
  created_at: number
  updated_at: number
}

export interface InstalledModRow {
  profile_id: string
  identifier: string
  version: string
  installed_files: string
  installed_at: number
}

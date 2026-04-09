# KSP Mod Manager — Design Spec

## Overview

A modern, visually rich mod manager for Kerbal Space Program 1 that replaces the dated CKAN GUI. It combines CKAN's comprehensive mod registry with a CurseForge-quality user interface, enriched with images and descriptions fetched from SpaceDock.

**Name (working title):** KSP Forge

## Goals

- Provide a beautiful, modern UI for browsing and managing KSP mods
- Leverage CKAN-meta as the mod registry (auto-updated)
- Enrich mod listings with images and descriptions from SpaceDock API
- Full dependency resolution, conflict detection, and version compatibility
- Multi-profile support for managing different mod configurations
- Zero dependency on the CKAN client — fully standalone

## Non-Goals

- KSP 2 support (KSP 1 only)
- Hosting mods (we link to existing sources)
- Replacing SpaceDock/GitHub as mod hosting platforms
- Building a social/community platform

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Desktop shell | Electron | Cross-platform desktop app, mature ecosystem, familiar to users |
| Frontend | React + TypeScript | Component-based UI, strong typing, large ecosystem |
| Styling | Tailwind CSS | Rapid UI development, consistent design system |
| State management | Zustand | Lightweight, minimal boilerplate |
| Local database | SQLite (via better-sqlite3) | Fast local index, no server needed, good for structured queries |
| Build tool | Vite | Fast HMR, good Electron integration via electron-vite |
| Package manager | pnpm | Fast, disk-efficient |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron App                       │
│                                                     │
│  ┌─────────────┐    IPC Bridge    ┌──────────────┐  │
│  │  Renderer    │ <=============> │  Main Process │  │
│  │  (React UI)  │                 │  (Node.js)    │  │
│  │              │                 │               │  │
│  │  - Browse    │                 │  - MetaSync   │  │
│  │  - Search    │                 │  - SpaceDock  │  │
│  │  - Install   │                 │  - Resolver   │  │
│  │  - Profiles  │                 │  - Installer  │  │
│  │  - Settings  │                 │  - FileSystem │  │
│  └─────────────┘                 └──────────────┘  │
│                                       │             │
│                                  ┌────┴─────┐      │
│                                  │  SQLite   │      │
│                                  │  + Cache  │      │
│                                  └──────────┘      │
└─────────────────────────────────────────────────────┘
         │                              │
         │ User sees                    │ Fetches from
         ▼                              ▼
   ┌──────────┐              ┌──────────────────┐
   │  Screen   │              │  CKAN-meta repo  │
   └──────────┘              │  SpaceDock API   │
                             │  GitHub/Download │
                             └──────────────────┘
```

### Main Process Services

1. **MetaSyncService** — Clones/pulls the CKAN-meta GitHub repo, parses `.ckan` JSON files, and indexes them into SQLite. Runs on app startup and periodically (configurable, default every 6 hours). Stores a last-synced timestamp.

2. **SpaceDockService** — Fetches mod details (description, banner image) from `spacedock.info/api/mod/{id}`. The SpaceDock mod ID is extracted from the `resources.spacedock` URL in each `.ckan` file. Results are cached in SQLite with a TTL of 24 hours to avoid hammering the API.

3. **ResolverService** — Dependency resolution engine. Given a set of mods to install, it:
   - Reads `depends`, `recommends`, `suggests`, `conflicts` from .ckan metadata
   - Resolves the full dependency tree
   - Detects conflicts between mods
   - Checks KSP version compatibility (`ksp_version`, `ksp_version_min`, `ksp_version_max`)
   - Presents the user with the resolved plan before proceeding

4. **InstallerService** — Downloads mod archives from their `download` URL (SpaceDock, GitHub, etc.), verifies SHA256 hash, extracts contents to the KSP `GameData` directory following the `install` directives in the .ckan file. Tracks installed files per mod in SQLite for clean uninstallation.

5. **ProfileService** — Manages named profiles, each containing: a KSP game path, a KSP version, and a list of installed mods with their versions. Profiles are stored in the SQLite database. Supports export/import as JSON files for sharing.

### Renderer (React UI)

Communicates with the main process exclusively via Electron IPC. Never accesses the filesystem or network directly.

---

## Data Model

### SQLite Tables

```sql
-- Mod index (parsed from .ckan files)
CREATE TABLE mods (
  identifier TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abstract TEXT,
  author TEXT,
  license TEXT,
  latest_version TEXT NOT NULL,
  ksp_version TEXT,
  ksp_version_min TEXT,
  ksp_version_max TEXT,
  download_url TEXT,
  download_size INTEGER,
  spacedock_id INTEGER,
  tags TEXT, -- JSON array
  resources TEXT, -- JSON object (homepage, spacedock, repository)
  updated_at INTEGER NOT NULL
);

-- All available versions per mod
CREATE TABLE mod_versions (
  identifier TEXT NOT NULL,
  version TEXT NOT NULL,
  ksp_version TEXT,
  ksp_version_min TEXT,
  ksp_version_max TEXT,
  download_url TEXT NOT NULL,
  download_hash TEXT, -- SHA256
  download_size INTEGER,
  depends TEXT, -- JSON array
  recommends TEXT, -- JSON array
  suggests TEXT, -- JSON array
  conflicts TEXT, -- JSON array
  install_directives TEXT, -- JSON array
  PRIMARY KEY (identifier, version),
  FOREIGN KEY (identifier) REFERENCES mods(identifier)
);

-- SpaceDock enrichment cache
CREATE TABLE spacedock_cache (
  spacedock_id INTEGER PRIMARY KEY,
  mod_identifier TEXT NOT NULL,
  description TEXT,
  description_html TEXT,
  background_url TEXT,
  downloads INTEGER,
  followers INTEGER,
  fetched_at INTEGER NOT NULL,
  FOREIGN KEY (mod_identifier) REFERENCES mods(identifier)
);

-- Installed mods per profile
CREATE TABLE installed_mods (
  profile_id TEXT NOT NULL,
  identifier TEXT NOT NULL,
  version TEXT NOT NULL,
  installed_files TEXT NOT NULL, -- JSON array of file paths
  installed_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, identifier),
  FOREIGN KEY (identifier) REFERENCES mods(identifier)
);

-- Profiles
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ksp_path TEXT NOT NULL,
  ksp_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### .ckan File Parsing

Each `.ckan` file is a JSON object. Key fields to extract:

```typescript
interface CkanMetadata {
  identifier: string;
  name: string;
  abstract?: string;
  author: string | string[];
  license: string | string[];
  version: string;
  ksp_version?: string;
  ksp_version_min?: string;
  ksp_version_max?: string;
  depends?: Relationship[];
  recommends?: Relationship[];
  suggests?: Relationship[];
  conflicts?: Relationship[];
  install: InstallDirective[];
  download: string;
  download_size?: number;
  download_hash?: { sha1?: string; sha256?: string };
  resources?: {
    homepage?: string;
    spacedock?: string;
    repository?: string;
    bugtracker?: string;
  };
  tags?: string[];
}

interface Relationship {
  name: string;
  min_version?: string;
  max_version?: string;
  version?: string;
}

interface InstallDirective {
  find?: string;
  file?: string;
  find_regexp?: string;
  install_to: string;
  filter?: string[];
  filter_regexp?: string[];
}
```

### SpaceDock ID Extraction

From the `resources.spacedock` URL (e.g., `https://spacedock.info/mod/2095/AECS_Motion_Suppressor`), extract the numeric ID with:

```typescript
function extractSpaceDockId(url: string): number | null {
  const match = url.match(/spacedock\.info\/mod\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
```

---

## UI Design

### Theme: Space Theme

- **Background:** Deep navy/dark purple (`#0d0d1a`)
- **Surface:** Slightly lighter (`#12122a`)
- **Border:** Subtle purple (`rgba(99, 102, 241, 0.15)`)
- **Primary accent:** Indigo/violet (`#6366f1`)
- **Primary hover:** Lighter violet (`#818cf8`)
- **Text primary:** Light gray (`#e2e8f0`)
- **Text secondary:** Medium gray (`#94a3b8`)
- **Text muted:** Dark gray (`#64748b`)
- **Success:** Green (`#22c55e`)
- **Warning:** Amber (`#f59e0b`)
- **Error:** Red (`#ef4444`)
- **Subtle starfield or nebula background effect** on the main area (CSS, no heavy assets)

### Layout: Sidebar + Grid

```
┌──────────┬─────────────────────────────────┐
│          │  Search bar + Filters           │
│  Logo    ├─────────────────────────────────┤
│          │                                 │
│  Nav:    │  ┌─────┐ ┌─────┐ ┌─────┐      │
│  Discover│  │ Mod │ │ Mod │ │ Mod │      │
│  Installed│  │Card │ │Card │ │Card │      │
│  Profiles│  └─────┘ └─────┘ └─────┘      │
│  Settings│                                 │
│          │  ┌─────┐ ┌─────┐ ┌─────┐      │
│  ────────│  │ Mod │ │ Mod │ │ Mod │      │
│  KSP ver │  │Card │ │Card │ │Card │      │
│  # mods  │  └─────┘ └─────┘ └─────┘      │
│          │                                 │
│          │  Pagination / Infinite scroll   │
└──────────┴─────────────────────────────────┘
```

### Sidebar (fixed, ~220px)

- App logo + name ("KSP Forge") at top
- Navigation items with icons:
  - Discover (browse all mods)
  - Installed (manage installed mods)
  - Profiles (switch/manage profiles)
  - Settings (app configuration)
- Bottom section: active profile info (KSP version, mod count)

### Mod Card

Each card in the grid displays:
- **Banner image** (from SpaceDock `background` field, or gradient placeholder if none)
- **Mod name** (bold)
- **Short description** (abstract from .ckan, 1-2 lines, truncated)
- **Download count** (from SpaceDock cache)
- **Version** badge
- **Installed** indicator (green check if installed in active profile)

Cards use `border-radius: 12px`, subtle border, hover effect (slight scale + glow).

### Mod Detail Page (full page)

Navigated to when clicking a mod card. Back button returns to previous view.

```
┌──────────┬─────────────────────────────────────────┐
│          │  ← Back to mods                         │
│  Sidebar │─────────────────────────────────────────│
│  (same)  │  ┌─────────────────────────────────┐   │
│          │  │       Hero Banner (SpaceDock)     │   │
│          │  │       Mod Name + Author           │   │
│          │  └─────────────────────────────────┘   │
│          │                                         │
│          │  [Description] [Screenshots] [Changelog]│
│          │  [Dependencies]                         │
│          │  ─────────────────────────────────────  │
│          │                              ┌────────┐│
│          │  Full description            │Install ││
│          │  (Markdown rendered)         │button  ││
│          │                              │        ││
│          │  Screenshot gallery          │Version ││
│          │  (from SpaceDock)            │KSP ver ││
│          │                              │License ││
│          │                              │Downloads│
│          │                              │Author  ││
│          │                              └────────┘│
└──────────┴─────────────────────────────────────────┘
```

**Tabs:**
- **Description** — Full description from SpaceDock API, rendered as Markdown/HTML
- **Screenshots** — Banner image from SpaceDock. If available, additional images from the mod's forum thread or README (best effort)
- **Changelog** — Version history from SpaceDock's version list
- **Dependencies** — Visual dependency tree showing required, recommended, and suggested mods (clickable to navigate)

**Right sidebar info panel:**
- Install/Uninstall/Update button (primary action)
- Version selector dropdown
- KSP version compatibility
- License
- Download count
- Author(s)
- Links (SpaceDock, GitHub, Forum)

### Search & Filters

- **Search bar** at top of grid view — searches by mod name, identifier, author, and abstract
- **Filter options:**
  - KSP version compatibility (dropdown)
  - Category/tags (chips)
  - Sort by: Name, Downloads, Recently updated, Newest
  - Show only: Compatible with active profile's KSP version (toggle, on by default)

### Installed Mods View

Same grid layout but showing only installed mods for the active profile. Additional features:
- **Update available** badge on mods with newer versions
- **Update All** button at the top
- **Bulk actions** — select multiple mods for removal
- **Status column** — installed version vs latest version

### Profiles View

- List of profiles as cards
- Each shows: name, KSP path, KSP version, mod count, last used date
- **Create new profile** — wizard: name → select KSP folder (auto-detect version) → done
- **Clone profile** — duplicate an existing profile
- **Export/Import** — export as JSON file, import from file
- **Switch active profile** — click to activate, highlighted with accent color

### Settings View

- **General:** KSP install path(s), auto-update metadata interval, download directory
- **Cache:** Clear SpaceDock cache, clear downloaded archives, cache size display
- **About:** App version, links to CKAN-meta repo, credits

---

## Key Workflows

### First Launch

1. Welcome screen with app branding
2. User selects their KSP install directory (file picker)
3. App auto-detects KSP version from `readme.txt` or `buildID.txt`
4. Creates default profile
5. Initial sync of CKAN-meta repo (progress bar with mod count)
6. Background fetch of SpaceDock data for popular mods
7. Navigate to Discover view

### Installing a Mod

1. User clicks "Install" on a mod card or detail page
2. ResolverService computes full dependency tree
3. **Confirmation dialog** shows:
   - Mods to install (with versions)
   - Dependencies that will be auto-installed
   - Any conflicts detected (blocking if critical)
   - Total download size
4. User confirms → download queue starts
5. Progress bar per mod (download → verify hash → extract)
6. Files extracted to `GameData` per install directives
7. Installed files tracked in SQLite
8. UI updates to show installed state

### Uninstalling a Mod

1. User clicks "Uninstall" on installed mod
2. Check for dependents — warn if other installed mods depend on this one
3. Confirmation dialog with list of files to remove
4. Remove files from `GameData` (tracked in `installed_files`)
5. Optionally remove orphaned dependencies
6. Update SQLite records

### Metadata Auto-Update

1. On app startup + every 6 hours (configurable)
2. `git pull` on the local CKAN-meta clone
3. Parse changed `.ckan` files only (compare git diff)
4. Update SQLite index
5. Check for available updates to installed mods
6. Show notification badge on Installed tab if updates available

---

## Error Handling

- **Network failures:** Graceful degradation — show cached data, retry with exponential backoff, user-visible status indicator
- **Corrupted downloads:** SHA256 hash verification, auto-retry once, then prompt user
- **Missing SpaceDock data:** Fallback to .ckan abstract + gradient placeholder image
- **KSP path invalid:** Validation on profile creation, re-prompt if moved
- **Dependency conflicts:** Clear explanation in UI of what conflicts with what and why, with suggested resolution (e.g., "remove mod X to install mod Y")

## Performance Considerations

- **Metadata sync:** Incremental git pull + parse only changed files, not full re-index
- **SpaceDock API:** Batch requests, cache aggressively (24h TTL), lazy-load on scroll (don't fetch all 3000+ mods at once)
- **Image loading:** Lazy load with intersection observer, blur-up placeholder, cache to disk
- **Search:** SQLite FTS5 (full-text search) for fast mod searching
- **Grid rendering:** Virtual scrolling for large mod lists (react-window or similar)

## Testing Strategy

- **Unit tests:** Resolver logic, .ckan parser, SpaceDock ID extraction, version comparison
- **Integration tests:** MetaSync with real CKAN-meta data, SpaceDock API responses
- **E2E tests:** Playwright for key flows (install mod, create profile, search)
- **Test framework:** Vitest for unit/integration, Playwright for E2E

---

## Project Structure

```
ksp-forge/
├── electron/
│   ├── main.ts                 # Electron main process entry
│   ├── preload.ts              # IPC bridge
│   └── services/
│       ├── meta-sync.ts        # CKAN-meta git sync + parse
│       ├── spacedock.ts        # SpaceDock API client + cache
│       ├── resolver.ts         # Dependency resolution engine
│       ├── installer.ts        # Download + extract + track
│       ├── profile.ts          # Profile CRUD
│       └── database.ts         # SQLite setup + queries
├── src/
│   ├── App.tsx
│   ├── main.tsx                # Renderer entry
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── AppShell.tsx
│   │   ├── mods/
│   │   │   ├── ModCard.tsx
│   │   │   ├── ModGrid.tsx
│   │   │   ├── ModDetail.tsx
│   │   │   ├── ModDescription.tsx
│   │   │   ├── ModScreenshots.tsx
│   │   │   ├── ModDependencies.tsx
│   │   │   └── ModChangelog.tsx
│   │   ├── profiles/
│   │   │   ├── ProfileList.tsx
│   │   │   ├── ProfileCard.tsx
│   │   │   └── ProfileWizard.tsx
│   │   ├── install/
│   │   │   ├── InstallDialog.tsx
│   │   │   ├── DownloadProgress.tsx
│   │   │   └── ConflictWarning.tsx
│   │   └── settings/
│   │       └── SettingsView.tsx
│   ├── stores/
│   │   ├── mod-store.ts        # Mod listing state
│   │   ├── profile-store.ts    # Active profile state
│   │   └── ui-store.ts         # UI state (current view, search, filters)
│   ├── hooks/
│   │   ├── use-mods.ts
│   │   ├── use-profiles.ts
│   │   └── use-install.ts
│   ├── lib/
│   │   ├── ipc.ts              # Typed IPC client
│   │   └── format.ts           # Formatting utils (download counts, dates)
│   └── styles/
│       └── globals.css         # Tailwind + custom space theme
├── package.json
├── electron-builder.yml        # Build/packaging config
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-09-ksp-mod-manager-design.md
```

<p align="center">
  <img src="docs/assets/banner.png" alt="KSP Forge Banner" width="100%" />
</p>

<h1 align="center">KSP Forge</h1>

<p align="center">
  <strong>A modern, beautiful mod manager for Kerbal Space Program 1</strong>
</p>

<p align="center">
  <a href="https://github.com/JLSkyzer/ckanrework/releases/latest"><img src="https://img.shields.io/github/v/release/JLSkyzer/ckanrework?style=for-the-badge&color=6366f1&label=Download" alt="Download" /></a>
  <img src="https://img.shields.io/github/downloads/JLSkyzer/ckanrework/total?style=for-the-badge&color=818cf8&label=Downloads" alt="Total Downloads" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-0d0d1a?style=for-the-badge" alt="Platform" />
  <img src="https://img.shields.io/github/license/JLSkyzer/ckanrework?style=for-the-badge&color=a78bfa" alt="License" />
</p>

<p align="center">
  <em>Tired of CKAN's outdated interface? KSP Forge combines the power of the CKAN mod registry with a CurseForge-quality UI, enriched with images and descriptions from SpaceDock and the KSP Forum.</em>
</p>

---

## Screenshots

<p align="center">
  <img src="docs/assets/screenshot-discover.png" alt="Discover Mods" width="90%" />
  <br />
  <em>Browse thousands of mods with rich previews, images, and one-click install</em>
</p>

<p align="center">
  <img src="docs/assets/screenshot-detail.png" alt="Mod Detail" width="90%" />
  <br />
  <em>Full mod pages with descriptions, screenshots, changelogs, and dependencies</em>
</p>

<p align="center">
  <img src="docs/assets/screenshot-install.png" alt="Install Dialog" width="90%" />
  <br />
  <em>Smart dependency resolution with compatibility warnings</em>
</p>

<p align="center">
  <img src="docs/assets/screenshot-downloads.png" alt="Downloads" width="90%" />
  <br />
  <em>Real-time download progress with queue management</em>
</p>

---

## Features

### Mod Browsing
- **Rich mod cards** with banner images from SpaceDock and KSP Forum
- **Full-text search** across mod names, authors, and descriptions
- **Smart filters** — filter by KSP version range, compatible mods only
- **Virtual scrolling** — smooth performance even with 3000+ mods

### Mod Pages
- **Full descriptions** pulled from SpaceDock and the KSP Forum (first post)
- **Screenshot gallery** scraped from forum posts, SpaceDock, and GitHub
- **Dependency tree** visualization with clickable navigation
- **Version history** and compatibility info

### Installation
- **One-click install** with automatic dependency resolution
- **Install queue** — queue multiple mods, they install sequentially
- **Concurrent downloads** — configure 1-5 simultaneous downloads in settings
- **Real-time progress** — per-mod download speed, extraction status, overall progress
- **Conflict detection** with clear explanations and "Install Anyway" option
- **Crash recovery** — if the app closes during install, resume where you left off

### Profile Management
- **Multiple profiles** for different mod configurations
- **Smart profile switching** — mods are cached and swapped in/out of GameData instantly
- **Shared mod cache** — mods used by multiple profiles are stored only once
- **Auto-detect** existing KSP installations (Steam, GOG, Epic)
- **Auto-scan GameData** to detect already installed mods
- **Export/Import** profiles as JSON files to share with friends

### Performance
- **Worker thread indexing** — CKAN metadata indexed in a background thread, UI never freezes
- **Worker thread installation** — downloads and extraction run off the main thread
- **Image disk cache** — SpaceDock banners cached locally for instant loading
- **SQLite with FTS5** — fast full-text search over all mod metadata
- **Batch SpaceDock API** — parallel requests with deduplication

### Design
- **Space theme** — deep navy background with violet accents and subtle starfield
- **CurseForge-inspired layout** — sidebar navigation + responsive card grid
- **Custom dark dropdowns** and inputs, no jarring white elements
- **Frameless window** with custom title bar
- **Persistent filters** saved across sessions

---

## Installation

### Download

Grab the latest release for your platform:

| Platform | File |
|----------|------|
| **Windows** | `KSP-Forge-Setup-x.x.x.exe` (installer) or `KSP-Forge-x.x.x.exe` (portable) |
| **macOS** | `KSP-Forge-x.x.x.dmg` (Intel) or `KSP-Forge-x.x.x-arm64.dmg` (Apple Silicon) |
| **Linux** | `KSP-Forge-x.x.x.AppImage` or `ksp-forge_x.x.x_amd64.deb` |

**[Download Latest Release](https://github.com/JLSkyzer/ckanrework/releases/latest)**

### First Launch

1. Open KSP Forge
2. Click **Auto-detect** to find your KSP installation (or browse manually)
3. Create your first profile
4. Wait for the mod registry to sync (~1 minute on first launch)
5. Start browsing and installing mods!

---

## How It Works

KSP Forge uses the **[CKAN metadata registry](https://github.com/KSP-CKAN/CKAN-meta)** — the same database that powers CKAN — as its mod index. This means you get access to the same 3000+ mods with accurate dependency and compatibility information.

On top of that, KSP Forge enriches each mod with:
- **Banner images** and **download counts** from the [SpaceDock API](https://spacedock.info)
- **Full descriptions** and **screenshots** from the [KSP Forum](https://forum.kerbalspaceprogram.com) (bypasses Cloudflare via embedded browser)
- **README images** from GitHub repositories

```
CKAN-meta (GitHub)  ──→  Local SQLite Index  ──→  Beautiful UI
SpaceDock API       ──→  Image Cache (disk)  ──→  Rich Mod Cards
KSP Forum           ──→  Description Cache   ──→  Full Mod Pages
```

---

## Building from Source

```bash
# Clone the repository
git clone https://github.com/JLSkyzer/ckanrework.git
cd ckanrework/ksp-forge

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for your platform
pnpm build:win    # Windows
pnpm build:mac    # macOS
pnpm build:linux  # Linux
```

### Requirements
- Node.js 22+
- pnpm 10+
- Git

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop Shell | Electron |
| Frontend | React + TypeScript |
| Styling | Tailwind CSS |
| State Management | Zustand |
| Database | SQLite (better-sqlite3) with FTS5 |
| Build Tool | Vite (electron-vite) |
| Packaging | electron-builder |

---

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

---

## Credits

- **[CKAN](https://github.com/KSP-CKAN/CKAN)** — The Comprehensive Kerbal Archive Network, for the mod metadata registry
- **[SpaceDock](https://spacedock.info)** — For mod hosting, images, and descriptions
- **[KSP Forum](https://forum.kerbalspaceprogram.com)** — For detailed mod descriptions and screenshots
- **[Squad](https://www.kerbalspaceprogram.com)** — For creating Kerbal Space Program

---

<p align="center">
  <strong>Made with love for the KSP community</strong>
  <br />
  <sub>KSP Forge is not affiliated with Squad, Private Division, or Take-Two Interactive.</sub>
</p>

# RealmLister – World of Warcraft realmlist manager

**RealmLister** is a free, open-source desktop app for managing your **World of Warcraft (WoW) realmlist**. Add, edit, and switch between WoW servers (including private servers), check realm status and latency, and set a default game path—all in one simple interface.

![RealmLister app screenshot](https://github.com/user-attachments/assets/c2b07433-7a0d-417a-86e3-779903ebdf04)

## Features

- **Manage realmlist** – Add, edit, and remove WoW realm entries (realmlist.wtf)
- **Check realm status** – See if a server is online and view latency (ping)
- **Quick switch** – Change which server you connect to without editing files by hand
- **Default WoW path** – Set and use your game installation path for launching
- **Locale support** – Choose realmlist locale (e.g. enUS) in settings
- **Cross-platform** – Built with Tauri; runs on Windows, macOS, and Linux

## Why use RealmLister?

If you play **WoW** on multiple **private servers** or different realms, you often have to edit `realmlist.wtf` manually. RealmLister lets you store all your servers, switch between them with one click, and check if a realm is up before connecting.

## Tech stack

- [Tauri](https://tauri.app/) 2 (Rust + web frontend)
- Vanilla TypeScript + Vite
- No heavy frameworks—lightweight and fast

## Getting started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (for the frontend build)
- [pnpm](https://pnpm.io/) (or npm/yarn)

### Install and run

```bash
pnpm install
pnpm tauri dev
```

### Build for production

```bash
pnpm tauri build
```

The built app will be in `src-tauri/target/release/` (or your OS equivalent).

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License and contributing

RealmLister is open source. Contributions and feedback are welcome. If you find it useful for **WoW realmlist** or **private server** switching, consider starring the repo or opening an issue/PR.

---

*RealmLister – realmlist manager for World of Warcraft. Switch WoW servers and manage your realmlist easily.*

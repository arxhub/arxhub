# ArxHub desktop app

The desktop app is built with Tauri. GitHub Actions produces Linux Flatpak and macOS DMG artifacts;
the workflow keeps them as downloadable run artifacts and does not sign or notarize them.

For a local macOS build:

```bash
pnpm --filter app exec tauri build --bundles dmg
```

The Linux Flatpak manifest is [org.arxhub.ArxHub.yml](../../flatpak/org.arxhub.ArxHub.yml). Flatpak
needs a Linux build environment because it packages the native Tauri binary; use the GitHub Actions
workflow or a Linux host for that artifact.

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

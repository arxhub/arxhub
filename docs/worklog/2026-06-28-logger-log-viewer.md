# 2026-06-28

## Focus
Built a Logs feature for the logger plugin: a Pino-backed **structured** logging stack (capture → in-memory buffer → NDJSON file persistence) and a **Log Viewer mini-app** opened from the footer. Added a generic `append` VFS capability and made uikit register all lucide icons automatically.

## Why / what triggered it
- **Log Viewer panel** — user asked to "build a panel for logger plugin". The blocker discovered up front: `@arxhub/logger` only wrote to `console`; nothing buffered/structured logs, so there was nothing to display. Everything below flowed from making logs observable + persistent.
- **Adopt Pino + structured logs** — user direction ("can we adapt pino?", "we prefer structured logs", "line in pino"). Pino's NDJSON line format *is* our file format; its `browser.write` hook is the capture point.
- **`append` VFS capability** — user idea ("we can add appendable feature, like we did with move; make fallback with reread and append"). VFS had no append (`write` overwrites, Node `writable()` truncates), so the log file couldn't grow incrementally. Mirrors the existing `rename` capability/op pattern.
- **dayjs for timestamps** — user preference ("for dates we use dayjs"); already in catalog.
- **Logs as a mini-app, then hidden** — user: first "open like a mini app sidepanel" (not a content tab), then "do not add tab to appsidebar, we open it by logs in footer". Drove a generic `SidebarItem.hidden` flag in the shell.
- **`emitsOptions` null crash on open** — user bug report. Root cause: the panel resolved `PluginVfs` from the root services container, but `PluginVfs` is per-plugin-scoped → threw in setup → Vue crashed the parent patch.
- **`refresh-cw is not registered`** — user bug report; the uikit `lu:` pack was a hand-maintained allow-list. User then asked to register *all* lucide icons without hand-writing the map, and questioned an unnecessary cache (removed).

## What changed
- `packages/logger`: `logger.ts` reshaped `Logger` to Pino's surface (`child(bindings)`, dropped `log()`); kept adapted `ConsoleLogger`. New `buffer.ts` (`LogRecord`, eventemitter3-based `LogBuffer`, `LogBufferKey` DI key), `root.ts` (`createRootLogger` — Pino + `browser.write`→buffer + console mirror). Added `pino` + `eventemitter3` deps. Tests: `buffer.test.ts`, updated `scope.test.ts`.
- `packages/core/arxhub.ts`: root logger is now the Pino instance; holds `logBuffer`, binds it under `LogBufferKey`. `plugin.ts`/`extension.ts` + the three vfs impls now `child({ name })`.
- `packages/vfs`: new `capabilities/append.ts` + `ops/append.ts` (native or read+rewrite-under-lock fallback); `ScopedFileSystem.append` re-dispatch; `vfs-node` native `fs.appendFile`. Test `append.test.ts`.
- `plugins/logger`: `LoggerExtension` (reactive records + session list/load), `LogFileWriter` (debounced append-only NDJSON to `state/logs/session-*.ndjson`, prunes to 10), `LogViewerPanel.vue`, `LogFooter.vue`. Registered as a **hidden** sidebar mini-app; footer focuses it.
- `plugins/shell`: added generic `SidebarItem.hidden` (no rail icon, layout still renders when active) — `types.ts`, `AppSidebar.vue`, `ArxShell.vue`.
- `packages/uikit/core/default-icons.ts`: `lu:` pack now a resolver over lucide's full `icons` set (kebab→PascalCase, exact incl. digits); removed the hand map + `lucideIcons` export.

## State
- Working / verified: vitest green (logger 7/7, vfs 17/17); LSP reports zero type errors on all touched `.ts`; biome clean (only the known Vue-template false-positive "unused" warnings, same as existing `.vue` files).
- In flight: **everything is uncommitted** (see `git status`). Not committed per user instruction ("do not commit").
- Caveat: full `tsc`/`vite build` could NOT run — repo-wide environmental breakage (`@types/node@25.6.0` not materialized in the pnpm store + `rollup-plugin-node-externals`/vite8 incompat; untouched packages fail identically). Logged as `.wolf/buglog.json` bug-232. The two `.vue` components also have no Vue LSP here, so they're unverified by a typechecker — only reasoned + runtime-tested by the user.

## Next steps
- [ ] User to re-test in the dev app: footer "Logs" opens the hidden mini-app; `refresh-cw` icon renders; session selector lists/loads past `state/logger/logs/session-*.ndjson`; file grows via append (not rewrite); prunes to newest 10.
- [ ] Commit when ready (direct to `main`, no Co-Authored-By) — likely split: `@arxhub/logger` Pino, `vfs` append capability, `plugin-logger` UI, `shell` hidden-item, `uikit` icons.
- [ ] Decide whether bundling the full lucide set in uikit is acceptable long-term, or revert to an explicit allow-list if bundle size matters.
- [ ] Resolve the environmental build breakage (repair `@types/node` install / `rollup-plugin-node-externals` vs vite8) so `tsc`/`vite build` can verify again — currently only vitest + LSP work.
- [ ] Consider chunk-rotation for very long sessions (file currently grows unbounded within a session; buffer is a 2000-entry live window).

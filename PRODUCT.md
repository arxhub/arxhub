# Product

## Register

product

## Users

Two audiences that overlap more than they differ:

- **Local-first knowledge workers** (Obsidian-style). People who keep a long-lived, personal knowledge base they fully own — notes, documents, research — and work in it daily. They value owning their data, working offline, and a tool that gets out of the way of thinking and writing. Keyboard-driven workflows are central, not a bonus.
- **Plugin authors / extenders**. Technical users who build on top of ArxHub. Every feature is already a plugin, so the platform must stay neutral and predictable enough that third-party plugins feel native.

**Context of use:** desktop today (Tauri native + web SPA), often a primary daily-driver window kept open for hours. **Mobile is a planned future target** — the design must stay responsive-capable, never desktop-locked, even where mobile isn't built yet.

**Job to be done:** capture, organize, edit, and sync a personal knowledge base in a tool the user fully controls and can extend — fast, offline, and without lock-in.

## Product Purpose

ArxHub is a modular, **offline-first, local-first personal knowledge management system** built as a **plugin platform**. One codebase runs three targets: a Tauri desktop app, a browser SPA, and a headless Node server.

A small Core owns only the plugin lifecycle (`create → configure → start → stop`) and the extension registry. Every real feature — file explorer, ProseMirror/CodeMirror editors, draggable panels, settings, sync — is an independent plugin. Plugins never import one another; they communicate only through typed extensions, so features can be added, swapped, or disabled without touching the rest. Files live in a Virtual File System; an encrypted sync engine (Rabin content-defined chunking + snapshots) reconciles changes when online.

**Success looks like:** a knowledge tool that is fully ownable, genuinely extensible, fast and trustworthy offline, and quiet enough to disappear behind the user's own content.

## Brand Personality

**Linear-crisp.** Three words: **precise, fast, unobtrusive.**

The voice is a confident expert tool — minimal, opinionated, every element earning its place. Restraint is the default: a near-neutral Slate surface with a single Cyan accent used sparingly, tight intentional spacing, sharp edges over soft ones. Personality comes from craft (rhythm, motion, type) rather than ornament.

**Emotional goals:** focus, control, quiet confidence, trust. The tool recedes; the content leads. It should feel like an instrument a serious person reaches for daily — not a product demoing itself.

## Anti-references

This explicitly should NOT look or feel like any of these:

- **Generic SaaS** — gradient heroes, hero-metric templates, identical icon+heading card grids, marketing-landing tropes leaking into the app.
- **Heavy / enterprise** — cluttered ribbons, dense chrome, dialog-on-dialog, the old-Office / legacy-Jira weight.
- **Toy / cute** — playful blobs, emoji-as-UI, oversized friendly illustrations, consumer-app whimsy.
- **Trendy AI-app** — glassmorphism by default, neon gradients, glowing borders, the 2024 AI-startup glow-up.

The common thread: nothing decorative for its own sake, and nothing that reads as "designed to a trend." If a choice can't be justified by the work the user is doing, cut it.

## Design Principles

1. **The tool recedes, content leads.** Chrome stays quiet so notes and editing are the focus. Color, weight, and motion are spent on the user's content and the action at hand — not on the frame around it.
2. **Keyboard-first.** Every primary action is reachable and fast from the keyboard. The mouse is optional, never required. This is the load-bearing accessibility commitment, not a nice-to-have.
3. **Extensible by design, predictable by contract.** The shell stays neutral so third-party plugins feel native. Practice what you preach — the app's own features are plugins built on the same extension points everyone else gets.
4. **Precision over decoration.** Every element earns its place; restraint is the default. When in doubt, remove. Distinction comes from spacing, typography, and motion done well — not from ornament.
5. **One experience, many surfaces.** Desktop now, mobile later, web and native from one codebase. Layouts adapt without forking into a separate "mobile product," and local-first/offline is something the user can *feel*: instant, trustworthy, theirs.

## Accessibility & Inclusion

- **Committed: full keyboard navigation.** Every action is reachable without a mouse — the baseline expectation for an Obsidian/VSCode-class tool and the foundation of the keyboard-first principle (visible focus states, logical tab order, focus traps in dialogs/menus, no mouse-only affordances).
- **Craft baseline** (applied as a quality standard even though not separately mandated): WCAG AA text contrast (≥4.5:1 body, ≥3:1 large, placeholders included — the Radix ramps support this), `prefers-reduced-motion` fallbacks for every animation, and ARIA roles/labels on icon-only controls.
- **Forward-looking:** as mobile support lands, touch-target sizing and pointer/touch parity become first-class concerns.

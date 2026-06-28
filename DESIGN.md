---
name: ArxHub
description: A modular, offline-first personal knowledge workbench — Linear-crisp, keyboard-first, theme-driven.
colors:
  accent: "#00a2c7"          # cyan-9 — the accent ROLE (default theme: Cyan). Themeable.
  accent-hover: "#0797b9"    # cyan-10 (default theme, light)
  accent-text: "#107d98"     # cyan-11 — accent text/icon on light surfaces
  accent-surface: "#def7f9"  # cyan-3 — active/selected background tint
  neutral-bg: "#fcfcfd"      # slate-1 — shell + content surface (default theme is light)
  neutral-surface: "#f9f9fb" # slate-2 — panels, cards, raised regions
  neutral-line: "#d9d9e0"    # slate-6 — hairline structural borders & dividers
  neutral-muted: "#60646c"   # slate-11 — secondary text, resting icons
  neutral-ink: "#1c2024"     # slate-12 — primary text
  danger: "#e5484d"          # red-9
  warning: "#f76b15"         # orange-9
  info: "#0090ff"            # blue-9
  success: "#30a46c"         # green-9
  white: "#ffffff"
  black: "#000000"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
  micro:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  full: "9999px"
spacing:
  # 8px grid + 4px half-step. REFERENCE scale, NOT CSS tokens — write raw on-grid values.
  # Between components / layout -> 8px multiples. Inside a component -> 4px half-step ok. 2px = hairline only.
  "2": "2px"     # hairline only (focus offsets, 1-2px nudges)
  "4": "4px"     # half-step (component internals)
  "8": "8px"
  "12": "12px"   # half-step (component internals)
  "16": "16px"
  "20": "20px"   # half-step (component internals)
  "24": "24px"
  "32": "32px"
  "40": "40px"
  "48": "48px"
  "56": "56px"
  "64": "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 1rem"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 1rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 1rem"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-muted}"
    rounded: "{rounded.sm}"
    height: "32px"
    width: "32px"
  input:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.sm}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 0.75rem"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-muted}"
    rounded: "{rounded.md}"
    height: "40px"
    width: "40px"
  nav-item-active:
    backgroundColor: "{colors.accent-surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    height: "40px"
    width: "40px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink}"
    rounded: "0"
---

# Design System: ArxHub

## 1. Overview

**Creative North Star: "The Workbench"**

ArxHub is a bench of swappable tools, and the interface says so plainly. Every feature — explorer, editors, panels, sync, settings — is a plugin slotted into a neutral, predictable shell, and the visual system exists to keep that shell honest: quiet enough that the tools and the content are the only things speaking, structured enough that a third-party plugin drops in and looks native. This is a working surface, not a showroom. Nothing is decorative; everything is an affordance.

The register is **product** and the personality is **Linear-crisp**: precise, fast, unobtrusive. Surfaces are flat and tonal, separated by hairline borders rather than drop shadows. Type is small and dense — this is a daily-driver kept open for hours, optimized for scanning and recall, not for first-impression spectacle. The single accent is spent only where it carries meaning (a primary action, an active tab, a focused field); the rest of the screen is a calm field of near-neutral gray. The macOS-style traffic-light cluster in the top-left is the one signature flourish, and it reads as native-app chrome, not decoration.

Color is **theme-driven**, and this is the system's load-bearing idea. A *theme* is the unit of choice — the user picks a whole theme, not a light/dark switch — and **each theme declares whether it is light or dark**. A theme maps the abstract roles `--accent-*` and `--gray-*` onto Radix palette hues and carries the matching surface values. The shipped default theme is **Cyan + Slate (light)**. Theming works like VSCode/Obsidian: a theme is a whole swappable unit the user selects (each declares its own brightness) — *not* a global light/dark toggle layered over one palette. The default theme currently supplies the Radix *light* scale; dark or alternate-hue themes are authored as their own theme units (each carrying its full set of surface values) and selected, not toggled. Components never name a hue or a brightness; they bind only to roles, so the same explorer renders correctly under whichever theme is active.

This system explicitly **rejects**: generic-SaaS dashboard tropes (gradient heroes, hero-metric cards, identical icon+heading grids); heavy/enterprise weight (ribbons, dialog-on-dialog, dense chrome); toy/cute consumer whimsy (rounded blobs, emoji-as-UI, mascot illustrations); and the trendy AI-app look (glassmorphism by default, neon gradients, glowing borders).

**Key Characteristics:**
- **Theme-driven, role-bound.** Components reference `--accent-*` / `--gray-*` only; themes own hue + light/dark.
- **Flat and tonal.** Depth from one-step gray shifts and hairline borders, not shadow.
- **Restrained accent.** The accent appears on ≤10% of any screen — primary action, active state, focus.
- **Dense and small.** App-scale type (10–20px), tight control heights (32–40px), no display sizes.
- **8px grid, 4px half-step.** Layout spacing on 8px multiples; component internals may drop to the 4px half-step; 2px is hairline-only.
- **Keyboard-first.** Visible focus, logical order, every action reachable without a mouse.

## 2. Colors: The Workbench Palette

A near-neutral Slate field carrying a single Cyan signal. The palette is the Radix Colors system, consumed through two layers of indirection so it stays swappable: raw Radix scales → semantic roles → the active theme.

### Primary
- **Action Cyan** (`#00a2c7`, cyan-9): the accent *role*, default theme Cyan. Primary buttons, active navigation, focus rings, selected tabs, links. Used sparingly and always to mean "this is the live thing." Hover deepens to `#0797b9` (cyan-10); text/icon-on-surface uses `#107d98` (cyan-11); active/selected backgrounds tint to `#def7f9` (cyan-3).

### Neutral
- **Shell Slate** (`#fcfcfd`, slate-1): the dominant surface — app shell, content area, input wells.
- **Raised Slate** (`#f9f9fb`, slate-2): panels, cards, and any region lifted one step off the shell.
- **Hairline** (`#d9d9e0`, slate-6): structural borders and dividers; the primary tool for separating regions.
- **Muted Ink** (`#60646c`, slate-11): secondary text, resting icons, micro-labels.
- **Ink** (`#1c2024`, slate-12): primary text and active icons.

### Semantic (role-mapped, not theme-mapped)
- **Danger** (`#e5484d`, red-9) · **Warning** (`#f76b15`, orange-9) · **Info** (`#0090ff`, blue-9) · **Success** (`#30a46c`, green-9). Used for status, validation, and the sync footer. Each has a full 12-step + alpha ramp; reach for step 11 when the color must sit as text on a neutral surface.

### Pure
- **White** (`#ffffff`) / **Black** (`#000000`) with a1–a12 alpha ramps, for overlays, scrims, and hairline highlights independent of theme.

### Named Rules
**The Role-Binding Rule.** Components reference roles (`--accent-9`, `--gray-6`, `--danger-9`) only. Never reference a palette hue (`--cyan-9`, `--slate-6`) or a literal hex inside a component. The theme owns the mapping; a component that names a hue has broken theming for every other theme.

**The One Signal Rule.** The accent covers ≤10% of any screen. Its scarcity is the entire point — when everything is calm gray, the one cyan thing is unmistakably the action. A second competing accent on a screen is a bug.

**The Self-Declaring Theme Rule.** A theme is chosen as a whole and states its own brightness; there is no global light/dark toggle layered on top. Build surface decisions against `--gray-*`/`--accent-*`, never against an assumed brightness.

## 3. Typography

**Body / UI Font:** system sans stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, …`)
**Mono Font:** system mono stack (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, …`) — code editor, paths, hashes
**Serif:** available in tokens (`ui-serif, Georgia, …`) but unused in chrome; reserved for rich-text editor content if a document calls for it.

**Character:** One system sans does nearly all the work, distinguished by weight and size rather than by a second face. Native font stacks keep the app feeling like part of the OS (a deliberate desktop-tool choice) and cost zero web-font load. The scale tops out at 20px — there is no display tier, because there is no marketing surface.

### Hierarchy
- **Title** (600, 1rem/16px, line-height 1.375): section and page headings inside content; the largest type most screens show.
- **Body** (400, 0.875rem/14px, line-height 1.5): the shell base size; paragraphs, list rows, descriptions. Cap prose at 65–75ch in document/editor contexts.
- **Label** (500, 0.75rem/12px, line-height 1.25): buttons, inputs, menu items, the dense-control workhorse.
- **Micro** (700, 0.625rem/10px, uppercase, letter-spacing 0.1em): panel/card titles only — the small tracked caps that head a panel (e.g. a card header with its icon). A *functional* label, not a marketing eyebrow.
- **Mono** (400, 0.875rem/14px): code, file paths, content hashes, anything monospaced.

### Named Rules
**The No-Display Rule.** Nothing exceeds 20px in chrome. If a heading wants to shout, it's marketing thinking leaking into a tool. Express hierarchy through weight and tonal contrast, not size.

**The Tracked-Caps-Are-Labels Rule.** Uppercase + wide tracking is reserved for the 10px micro panel-title role. Do not promote it to a section eyebrow above every heading; one tracked-caps role, one purpose.

## 4. Elevation

The system is **flat by default**. Depth is carried by two cheap, crisp signals — a one-step tonal shift (shell `slate-1` → raised `slate-2`) and a hairline `slate-6` border — and shadow is held in reserve. This is what keeps the surface Linear-crisp rather than Material-soft: at rest, almost nothing casts a shadow.

Shadow earns its place in exactly two situations:
1. **Things that genuinely float** — dropdowns, menus, modals, tooltips, popovers. These leave the document plane, so they get a real shadow (and sit on the semantic z-index scale: dropdown → sticky → overlay → modal → popover → toast → tooltip).
2. **A soft hover-lift on liftable surfaces** — a draggable panel tab while dragging, or an interactive card on hover/focus, gains a subtle shadow to signal it can move or respond. Resting controls (buttons, nav items, rows) do **not** lift; they express state through a tonal background change (`gray-3` on hover) instead.

Borders vs. lift, decided by intent: **borders are for structure** (it's always there — panel edges, header/footer rules, the sidebar rail edge, card-header dividers, input resting stroke, separators); **lift is for response or float** (it appears in answer to hover/focus/drag, or because the element has left the plane). If a surface is permanent, border it; if it reacts or floats, lift it.

### Shadow Vocabulary
- **`--shadow-sm`** (`0 2px 4px gray-a4` / dark: `+ black-a8`): hover-lift on cards and liftable surfaces.
- **`--shadow-md`** (`0 4px 8px …`): dropdowns, menus, popovers.
- **`--shadow-lg` / `--shadow-xl`** (`0 8–16px …`): modals and large floating panels.
- **`--shadow-inset`** (`inset 8px 0 12px -8px`): left-edge inset for rail/panel separation where a border would read too hard.

### Named Rules
**The Flat-At-Rest Rule.** A surface that isn't floating and isn't reacting casts no shadow. If you reach for `box-shadow` on a static panel, use a `slate-6` border or a tonal step instead.

## 5. Components

Components live in `@arxhub/uikit/core` and bind exclusively to role tokens. Each leads with character, then shape, color, and states.

### Buttons
Compact, confident, label-weight. Flat fills, 1px transparent border that some variants make visible, `radius-sm` (4px), `200ms` all-transition.
- **Shape:** `radius-sm` (4px); height `36px` (md) / `24px` (sm); icon button `32px` square.
- **Primary:** `accent-9` fill, white label, hover `accent-10`. *(See Don'ts — white-on-accent is fragile under bright accent hues like the default Cyan; prefer an accent-contrast token.)*
- **Secondary:** `gray-3` fill, `gray-6` border, `gray-12` label; hover `gray-6` fill.
- **Ghost:** transparent, `accent-a5` border, `accent-9` label; hover `accent-a3` tint.
- **Danger:** `red-9` fill, white label; hover `red-10`.
- **Icon:** transparent, `gray-11` icon; hover `gray-3` fill + `gray-12` icon.

### Inputs / Fields
- **Style:** full-width, `36px` tall, `gray-1` well, 1px transparent border at rest, `radius-sm`, `label` type, `gray-11` placeholder.
- **Focus:** border shifts to `accent-9` plus a 1px `accent-a2` ring (`box-shadow: 0 0 0 1px`). No glow, no scale.
- **Text color:** must be `gray-12` (ink), bound to the role. *(See Don'ts — currently hardcoded `white`, which fails under light themes.)*

### Navigation (rail items)
- **Style:** `40px` square, `radius-md` (6px), 20px icon, wrapped in a right-placed Tooltip with an `aria-label` (keyboard + screen-reader aware).
- **Default:** transparent, `gray-11` icon. **Hover:** `gray-3` fill, `gray-12` icon. **Active:** `accent-3` fill, `accent-9` icon, `accent-a2` border.

### Cards / Panels
- **Corner:** square (`0`) — cards are structural regions, not floating objects.
- **Background:** `gray-2` body; header `gray-1` with a `gray-6` bottom border.
- **Header:** `36px` tall, a micro tracked-caps title (10px/700, `gray-11`) with a leading icon and trailing icon-button.
- **Elevation:** flat; bordered, not shadowed (see Elevation).
- **Padding:** content `1.5rem`, internal gaps `1rem`.

### Signature: The App Shell
The desktop shell is the canonical surface: full-height `gray-1` flex column, macOS traffic-light cluster top-left, an `AppHeader` / icon `AppSidebar` rail / `content-area` / `AppFooter` frame, hosting VSCode-style draggable panels and tabs. Regions are separated by `gray-6` hairlines; the sidebar rail is resizable. This is the frame every plugin renders into — keep it quiet.

## 6. Do's and Don'ts

### Do:
- **Do** bind components to role tokens — `var(--accent-9)`, `var(--gray-6)`, `var(--danger-9)` — so every theme and brightness renders correctly.
- **Do** keep the accent under ~10% of any screen; let calm gray make the one cyan thing unmistakable.
- **Do** separate regions with `gray-6` hairline borders and one-step tonal shifts (`gray-1` → `gray-2`) before reaching for shadow.
- **Do** reserve shadow for floating layers (menus, modals, tooltips) and a soft hover-lift on liftable surfaces; keep static panels flat.
- **Do** express control state through tonal background change (`gray-3` hover) and visible focus rings (`accent-9` border + `accent-a2`).
- **Do** keep chrome type ≤20px and lean on weight (500/600/700) for hierarchy.
- **Do** follow the 8px grid: **The 8px Grid Rule** — space *between* components in 8px multiples (8/16/24/32/48); inside a component the 4px half-step is allowed (4/12/20); 2px is hairline-only. Ask "between or inside?" — between → 8px multiple, inside → 4px ok. (Control heights use `--size-*`; corner radius is its own scale — neither is bound by this grid.)
- **Do** give every icon-only control an `aria-label` and a tooltip, and ensure full keyboard reachability with a visible focus state.

### Don't:
- **Don't** hardcode `color: white` / `#fff` (or any literal hex) in a component. Bind to `var(--gray-12)` or the semantic role; literal white breaks under light themes and is the current cause of invisible input text. *(Known bug to fix.)*
- **Don't** reference a palette hue (`--cyan-9`, `--slate-6`) inside a component — only roles. Hue-naming breaks every non-default theme.
- **Don't** assume a brightness. There is no global light/dark switch; the theme self-declares. Build against roles, never against "it's dark."
- **Don't** put `box-shadow` on a static, non-floating surface — use a border or a tonal step (violates the Flat-At-Rest Rule).
- **Don't** introduce a second competing accent on one screen, or use gradients / gradient text — emphasis is weight, size, and the single accent.
- **Don't** ship the generic-SaaS hero-metric template, identical icon+heading card grids, glassmorphism, neon gradients, glowing borders, or emoji-as-UI.
- **Don't** add a tracked-caps eyebrow above every section; uppercase + wide tracking is the 10px panel-title role only.
- **Don't** use off-grid spacing — no 6px, 10px, 14px, 18px, 22px, 28px gaps/padding/margins. (Snap the known leaks: Button icon gap 6→8px, the stray 5px, Card min-height 350→352.) Off-grid as spacing breaks the 8px rhythm.
- **Don't** exceed 20px type in chrome or add `border-left`/`border-right` color stripes as accents.

# packages/uikit

Vue 3 component library. Theme-driven, role-bound design tokens (Radix Colors via `@arxhub/theme-preset`). Uses Ark UI (`@ark-ui/vue`) headless primitives for accessibility/interaction; all visual styling is scoped CSS over CSS custom properties. Read the root `DESIGN.md` before any visual work — it is the authoritative spec (theme-driven, role-bound, 8px grid, flat-at-rest, keyboard-first).

Two sub-path entry points — there is **no root `@arxhub/uikit` export**:
- `@arxhub/uikit/core` — UI primitives, overlays, layout blocks, the imperative action-menu + modals systems
- `@arxhub/uikit/hooks` — composables (`useArxHub`, `useFileDocument`, `useMediaQuery`, `toaster`)

## STRUCTURE

```
src/
├── core/                 # @arxhub/uikit/core  (flat — no ui/ or layout/ split)
│   ├── Avatar.vue          # Ark Avatar
│   ├── Badge.vue           # variant: success|warning|danger|info|neutral
│   ├── Button.vue          # variant: primary|secondary|ghost|danger; size: sm|md
│   ├── Card.vue            # generic: title + optional icon prop + #actions slot
│   ├── Checkbox.vue        # Ark Checkbox
│   ├── Dialog.vue          # Ark Dialog (Teleport to body)
│   ├── Dropdown.vue        # thin wrapper over Menu (click trigger)
│   ├── Icon.vue            # prefixed-string icon registry (lu: = lucide)
│   ├── IconButton.vue      # icon-only button (tooltip + aria + focus); size xs|sm|md
│   ├── Input.vue           # text input (v-model, disabled)
│   ├── Menu.vue            # Ark Menu (click or context trigger)
│   ├── MenuItem.vue        # variant: default|danger
│   ├── NavItem.vue         # 40px rail item (tooltip + aria-label)
│   ├── Notification.vue    # variant: success|warning|danger|info (toast body)
│   ├── ProgressBar.vue     # Ark Progress
│   ├── Separator.vue       # horizontal|vertical, optional grow spacer
│   ├── Switch.vue          # Ark Switch
│   ├── Toolbar.vue         # flex strip (gap/wrap/bordered)
│   ├── Tooltip.vue         # Ark Tooltip
│   ├── default-icons.ts    # registers the whole lucide set lazily under `lu:`
│   ├── icons.ts            # registerIconPack / resolveIcon
│   ├── placement.ts        # Placement union (matches @zag-js popper)
│   ├── index.ts            # export-only barrel
│   ├── action-menu/        # imperative context-menu/bottom-sheet (hand-rolled, NOT Ark)
│   │   ├── action-menu.ts    # actionMenu singleton + ActionItem + state
│   │   └── ActionMenuHost.vue # mounted once in ArxShell; pointer/Escape/keyboard driven
│   └── modals/             # imperative modal system (mantine-style)
│       ├── modals.ts         # modals singleton (open/openConfirmModal/close/…)
│       ├── ModalsProvider.vue
│       └── ConfirmModalBody.vue
└── hooks/                 # @arxhub/uikit/hooks
    ├── useArxHub.ts          # inject the ArxHub instance (ARXHUB_KEY)
    ├── useFileDocument.ts    # shared VFS→editor file-load lifecycle (both editors use it)
    ├── useMediaQuery.ts      # reactive window.matchMedia wrapper
    └── useToast.ts           # `toaster` (Ark toaster factory)
```

`package.json` `exports` exposes only `./core` and `./hooks`. There is no `desktop`/`mobile` entry here — the app shell lives in `plugins/shell`.

## IMPORT PATTERNS

```ts
import { Button, IconButton, Icon, Card, Dialog, modals } from '@arxhub/uikit/core'
import { useMediaQuery, toaster, useArxHub } from '@arxhub/uikit/hooks'
```

## DESIGN TOKENS

All CSS custom properties come from `@arxhub/theme-preset`. Never hardcode hex/rgb in component CSS — bind to **role** tokens only.

- `--gray-1` … `--gray-12` (+ `-a*` alpha) — neutral surfaces/text (slate in default theme). Step roles: 1–2 bg · 3/4/5 component bg (normal/hover/pressed) · 6 non-interactive border · 7 interactive border · 8 strong/focus border · 9/10 solid · 11/12 text.
- `--accent-1` … `--accent-12` (+ `-a*`) — brand/interactive (cyan in default theme).
- `--danger-*`, `--warning-*`, `--info-*`, `--success-*` — semantic roles (red/orange/blue/green).
- `--accent-contrast`, `--danger-contrast`, `--info-contrast`, `--success-contrast`, `--gray-contrast` — legible foreground **on the matching step-9 solid fill** (all default to `var(--white)`; theme-overridable for light-foreground accent hues).
- `--white` / `--black` (+ `-a*`) — *literal* colors for scrims/overlays/knobs, theme-independent.
- `--font-sans`/`--font-mono`, `--font-size-*`, `--font-weight-*`, `--radius-*`, `--shadow-*`, `--size-*`, `--duration-*`, `--z-index-*`.

## ARK UI INTEGRATION

Ark provides headless, accessible primitives that render **zero styles**; style anatomy parts via class selectors + `data-*` state attributes in `<style scoped>`.

| File | Ark primitive |
|------|--------------|
| Avatar.vue | `Avatar` (Root/Image/Fallback) |
| Checkbox.vue | `Checkbox` (Root/Control/Indicator/Label/HiddenInput) |
| ProgressBar.vue | `Progress` (Root/Track/Range) |
| Switch.vue | `Switch` (Root/Control/Thumb/Label/HiddenInput) |
| Dialog.vue | `Dialog` (Root/Backdrop/Positioner/Content/Title/CloseTrigger) — wrap in `<Teleport to="body">` (no Portal export) |
| Menu.vue / MenuItem.vue / Dropdown.vue | `Menu` (Root/Trigger/ContextTrigger/Positioner/Content/Item) |
| Tooltip.vue | `Tooltip` (Root/Trigger/Positioner/Content) |

Installed Ark version resolves to 5.x (catalog entry text is misleading — see root cerebrum). The **action-menu and modals are hand-rolled, NOT Ark** (Ark context menus were unreliable; see ADR/cerebrum). Keep Ark for click/state-driven overlays only; do not migrate action-menu/tabs/tree to Ark.

### Toast usage
```ts
import { toaster } from '@arxhub/uikit/hooks'
toaster.create({ title: 'Saved!', type: 'success' })
```
NOTE: no `<Toaster>` is mounted in the shell yet, so `toaster.create()` is currently a no-op at runtime (editors log via `arxhub.logger` instead). `Notification.vue` is the toast body component for when one is mounted.

## CONVENTIONS

- `<script setup lang="ts">` + `defineProps<{…}>()`; `<style scoped>` only.
- CSS **role** vars only — never hardcode hex/`white`/`#fff`; never reference a palette hue (`--cyan-9`, `--slate-6`) or a semantic source hue (`--red-9`) inside a component — use the role (`--accent-9`, `--gray-6`, `--danger-9`).
- Semantic variant vocabulary is unified across components: **`success | warning | danger | info | neutral`** (+ `default` where a neutral baseline is the unnamed case).
- Text/icon on a step-9 fill uses the matching `*-contrast` token, not literal `white`.
- 8px grid: spacing *between* components in 8px multiples; component internals may use the 4px half-step (4/12/20); 2px hairline-only. No off-grid values (6/10/14/18px…).
- Icon-only controls (`IconButton`, `NavItem`) carry an `aria-label` + tooltip and a visible `:focus-visible` ring.
- Icons are prefixed strings (`lu:folder-open`); any `lu:<kebab>` resolves automatically (whole lucide set registered lazily). Unknown/no-prefix strings render as a raw glyph/emoji.

## ANTI-PATTERNS

- Do NOT use Tailwind / Panda / CSS-in-JS / inline styles (dynamic `:style` for computed geometry is the only exception).
- Do NOT hardcode hex/rgba/`white` or reference palette/source hues in components.
- Do NOT add new CSS vars in component files — add them to `@arxhub/theme-preset`.
- Do NOT `:deep()` except for third-party slot content.
- Do NOT add new Ark components, or migrate the hand-rolled action-menu/modals to Ark, without explicit approval.
- Do NOT run `biome check --write --unsafe` on `.vue` files — it deletes template-only imports/identifiers (false "unused" positives; the real check is `vue-tsc`).

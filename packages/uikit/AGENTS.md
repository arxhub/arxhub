# packages/uikit

Vue 3 component library. Dark-theme-first, Radix Colors-based design tokens. Uses Ark UI headless primitives for accessibility and interaction. All styling via scoped CSS using CSS custom properties from theme-preset.

Single package with four sub-path entry points — there is **no root `@arxhub/uikit` export**:
- `@arxhub/uikit/core` — UI primitives (Button, Icon, …) + layout blocks (Card, NavItem)
- `@arxhub/uikit/hooks` — composables (useMediaQuery, toaster)
- `@arxhub/uikit/desktop` — desktop shell layout (header + sidebar + footer)
- `@arxhub/uikit/mobile` — mobile shell layout (top bar + content + bottom nav)

## STRUCTURE

```
src/
├── core/                  # @arxhub/uikit/core
│   ├── ui/                # Reusable UI primitives
│   │   ├── Avatar.vue      # Ark UI Avatar
│   │   ├── Badge.vue
│   │   ├── Button.vue      # variant: primary|secondary|ghost|icon; size: sm|md|icon
│   │   ├── Checkbox.vue    # Ark UI Checkbox
│   │   ├── Icon.vue        # Material Symbols Outlined icon wrapper
│   │   ├── Input.vue
│   │   ├── Notification.vue
│   │   ├── ProgressBar.vue # Ark UI Progress
│   │   └── Switch.vue      # Ark UI Switch
│   └── layout/            # Generic layout blocks
│       ├── Card.vue
│       └── NavItem.vue
├── hooks/                 # @arxhub/uikit/hooks
│   ├── useMediaQuery.ts   # Reactive window.matchMedia wrapper
│   └── useToast.ts        # Ark UI toaster factory
├── desktop/               # @arxhub/uikit/desktop entry
│   ├── index.ts
│   ├── DesktopLayout.vue  # header + sidebar + content slot
│   └── components/
│       ├── AppHeader.vue
│       ├── AppSidebar.vue
│       └── AppFooter.vue
└── mobile/                # @arxhub/uikit/mobile entry
    ├── index.ts
    ├── MobileLayout.vue   # top bar + content + bottom nav
    └── components/
        ├── MobileHeader.vue
        └── BottomNav.vue
```

## IMPORT PATTERNS

There is no root `@arxhub/uikit` export. Always use sub-paths:

```ts
// UI primitives and layout blocks
import { Button, Icon, Card, NavItem } from '@arxhub/uikit/core'

// Composables
import { useMediaQuery, toaster } from '@arxhub/uikit/hooks'

// Desktop shell
import { DesktopLayout } from '@arxhub/uikit/desktop'

// Mobile shell
import { MobileLayout } from '@arxhub/uikit/mobile'
```

## DESIGN TOKENS

All CSS custom properties come from `packages/theme-preset/src/`. Never hardcode hex values in component files.

Key token scales:
- `--gray-1` … `--gray-12` — neutral backgrounds / text (mapped to slate in default theme)
- `--accent-1` … `--accent-12` — brand / interactive color (mapped to cyan in default theme)
- `--danger-*`, `--warning-*`, `--info-*`, `--success-*` — semantic aliases in `semantic.css`
- `--font-sans`, `--font-mono` — font families
- `--radius-xs` … `--radius-full` — border radii
- `--shadow-xs` … `--shadow-xl` — box shadows
- `--size-xs` … `--size-2xl` — sizing tokens (height, width, etc.)
- `--duration-fastest` … `--duration-slowest` — animation durations

## ARK UI INTEGRATION

Ark UI (`@ark-ui/vue`) provides headless, accessible primitives. Components render **zero styles** by default — all visual styling is added via scoped CSS.

### Components in use

| File | Ark primitive | Anatomy parts |
|------|--------------|---------------|
| Avatar.vue | `Avatar` | Root, Image, Fallback |
| Checkbox.vue | `Checkbox` | Root, Control, Indicator, Label, HiddenInput |
| ProgressBar.vue | `Progress` | Root, Track, Range |
| Switch.vue | `Switch` | Root, Control, Thumb, Label, HiddenInput |

### Styling pattern

Ark components use explicit class names for anatomy parts. Target them in `<style scoped>`. State-based styling uses `data-*` attributes provided by Ark.

```css
.control {
  background-color: var(--gray-3);
  border-radius: var(--radius-full);
  transition: background-color var(--duration-normal);
}

.control[data-state='checked'] {
  background-color: var(--accent-9);
}

.control[data-focus-visible] {
  outline: 2px solid var(--accent-9);
  outline-offset: 2px;
}

.root[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Toast usage

```ts
import { toaster } from '@arxhub/uikit'

toaster.create({ title: 'Saved!', type: 'success' })
toaster.create({ title: 'Error', description: 'Try again', type: 'error' })
```

## CONVENTIONS

- All components use `<script setup lang="ts">` with `defineProps<{...}>()`.
- `<style scoped>` for all component styles — no global class pollution.
- CSS vars only — never hardcode hex values or raw pixel/rem values for sizes and durations.
- Ark components: use class selectors for anatomy parts, and `[data-state]`, `[data-disabled]` etc. for state.
- Icon component wraps Material Symbols Outlined (`font-variation-settings` controlled).
- Button sizes: `sm`=h-6 (1.5rem), `md`=h-9 (2.25rem), `icon`=size-8 (2rem).
- Toast is imperative (via `toaster.create()`), not declarative.
- Hooks live in `src/hooks/` — composables that wrap browser APIs or Ark utilities.

## ANTI-PATTERNS

- Do NOT use Tailwind classes — scoped CSS + CSS vars only.
- Do NOT use Panda CSS or any CSS-in-JS.
- Do NOT add inline styles — use CSS vars.
- Do NOT use `v-deep` / `:deep()` except for third-party slot content.
- Do NOT add new CSS vars in component files — add to `packages/theme-preset` instead.
- Do NOT hardcode hex/rgba values anywhere in component files.
- Do NOT use `data-part` selectors for styling — use class names.
- Do NOT add new Ark components outside the ones listed above without explicit approval.
- Do NOT import from `@arxhub/uikit` inside `src/desktop/` or `src/mobile/` — use relative paths to `../core/`.

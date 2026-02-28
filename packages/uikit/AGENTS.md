# packages/uikit

Vue 3 component library. Dark-theme-first, Radix Colors-based design tokens. Uses Ark UI headless primitives for accessibility and interaction. All styling via scoped CSS using CSS custom properties from theme-preset and `global.css`.

## STRUCTURE

```
src/
├── AppLayout.vue          # Root shell: header + sidebar + content slot
├── styles/
│   └── global.css         # Global body/scrollbar styles (CSS vars from theme-preset)
└── components/
    ├── layout/            # Structural components
    │   ├── AppHeader.vue
    │   ├── AppFooter.vue
    │   ├── AppSidebar.vue
    │   ├── Card.vue
    │   └── NavItem.vue
    └── ui/                # Reusable primitives
        ├── Avatar.vue      # Ark UI Avatar
        ├── Badge.vue
        ├── Button.vue      # variant: primary|secondary|ghost|icon; size: sm|md|icon
        ├── Checkbox.vue    # Ark UI Checkbox
        ├── Icon.vue        # Material Symbols Outlined icon wrapper
        ├── Input.vue
        ├── ProgressBar.vue # Ark UI Progress
        ├── Switch.vue      # Ark UI Switch
        ├── Toast.vue       # Ark UI Toast (individual toast template)
        └── Toaster.vue     # Ark UI Toaster (provider, place in app root)
```

Plus composable: `src/composables/useToast.ts` — `createToaster()` factory, exports `{ Toaster, toast }`.

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

Global styles (body reset, scrollbar, Material Symbols) are in `global.css`.

## ARK UI INTEGRATION

Ark UI (`@ark-ui/vue`) provides headless, accessible primitives. Components render **zero styles** by default — all visual styling is added via scoped CSS.

### Components in use

| File | Ark primitive | Anatomy parts |
|------|--------------|---------------|
| Avatar.vue | `Avatar` | Root, Image, Fallback |
| Checkbox.vue | `Checkbox` | Root, Control, Indicator, Label, HiddenInput |
| ProgressBar.vue | `Progress` | Root, Track, Range |
| Switch.vue | `Switch` | Root, Control, Thumb, Label, HiddenInput |
| Toast.vue | `Toast` | Root, Title, Description, CloseTrigger |
| Toaster.vue | `Toaster` | (provider, renders viewport) |

### Styling pattern

Ark components use explicit class names for anatomy parts. Target them in `<style scoped>`. State-based styling uses `data-*` attributes provided by Ark.

```css
/* .root, .control, .thumb, etc. are assigned to Ark components */

.control {
  background-color: var(--gray-3);
  border-radius: var(--radius-full);
  transition: background-color var(--duration-normal);
}

/* State-based styling via data attributes */
.control[data-state='checked'] {
  background-color: var(--accent-9);
}

.thumb {
  background-color: white;
  border-radius: var(--radius-full);
}

/* Keyboard focus */
.control[data-focus-visible] {
  outline: 2px solid var(--accent-9);
  outline-offset: 2px;
}

/* Disabled */
.root[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Toast usage

```ts
// composable
import { useToast } from '@/composables/useToast'
const { toast } = useToast()

toast.create({ title: 'Saved!', type: 'success' })
toast.create({ title: 'Error', description: 'Try again', type: 'error' })
```

Place `<Toaster />` in the app root (AppLayout or main App.vue).

## CONVENTIONS

- All components use `<script setup lang="ts">` with `defineProps<{...}>()`.
- `<style scoped>` for all component styles — no global class pollution.
- CSS vars only — never hardcode hex values or raw pixel/rem values for sizes and durations.
- Ark components: use class selectors for anatomy parts, and `[data-state]`, `[data-disabled]` etc. for state.
- Icon component wraps Material Symbols Outlined (`font-variation-settings` controlled).
- Button sizes: `sm`=h-6 (1.5rem), `md`=h-9 (2.25rem), `icon`=size-8 (2rem).
- Toast is imperative (via `toast.create()`), not declarative.

## ANTI-PATTERNS

- Do NOT use Tailwind classes — scoped CSS + CSS vars only.
- Do NOT use Panda CSS or any CSS-in-JS.
- Do NOT add inline styles — use CSS vars.
- Do NOT use `v-deep` / `:deep()` except for third-party slot content.
- Do NOT add new CSS vars in component files — add to `packages/theme-preset` instead.
- Do NOT hardcode hex/rgba values anywhere in component files.
- Do NOT use `data-part` selectors for styling — use class names.
- Do NOT add new Ark components outside the 5 listed above without explicit approval.

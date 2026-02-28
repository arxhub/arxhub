# packages/uikit

Vue 3 component library. Dark-theme-first, Radix Colors-based design tokens. All styling via scoped CSS using CSS custom properties from `variables.css`.

## STRUCTURE

```
src/
├── AppLayout.vue          # Root shell: header + sidebar + content slot
├── styles/
│   └── variables.css      # ALL CSS custom properties (colors, fonts, radii, scrollbars)
└── components/
    ├── layout/            # Structural components
    │   ├── AppHeader.vue
    │   ├── AppFooter.vue
    │   ├── AppSidebar.vue
    │   ├── Card.vue
    │   └── NavItem.vue
    └── ui/                # Reusable primitives
        ├── Avatar.vue
        ├── Badge.vue
        ├── Button.vue     # variant: primary|secondary|ghost|icon; size: sm|md|icon
        ├── Checkbox.vue
        ├── Icon.vue       # Material Symbols Outlined icon wrapper
        ├── Input.vue
        ├── Notification.vue
        ├── ProgressBar.vue
        └── Switch.vue
```

## DESIGN TOKENS (variables.css)

```
Colors:    --radix-gray-{1,2,3,6,11,12}, --radix-cyan-{3,4,9,10}
Semantic:  --primary (#359EFF), --primary-dim, --bg-app, --bg-panel, --border-cold
Text:      --text-main (#EEEEEE), --text-muted (#B4B4B4)
Fonts:     --font-display (Inter), --font-mono (JetBrains Mono)
Radii:     --radius-sm/md/lg/full
```

Use `packages/theme-preset/src/semantic.css` for full Radix color palette (`--danger-*`, `--warning-*`, full `--radix-{color}-{1-12}` scale).

## CONVENTIONS

- All components use `<script setup lang="ts">` with `defineProps<{...}>()`.
- `<style scoped>` for all component styles — no global class pollution.
- CSS vars only — never hardcode hex values except in `variables.css`.
- Icon component wraps Material Symbols Outlined (`font-variation-settings` controlled).
- Button sizes: `sm`=h-6 (1.5rem), `md`=h-9 (2.25rem), `icon`=size-8 (2rem).
- No component framework (Vuetify, Element Plus etc.) — bespoke components only.

## ANTI-PATTERNS

- Do NOT use Tailwind classes — this project uses scoped CSS + CSS vars only.
- Do NOT add inline styles — use CSS vars.
- Do NOT use `v-deep` / `:deep()` except for third-party slot content.
- Do NOT add new CSS vars in component files — add to `variables.css` first.

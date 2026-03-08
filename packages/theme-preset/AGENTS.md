# packages/theme-preset

Radix Colors CSS design tokens. No runtime code — pure CSS variables for colors, typography, sizing, shadows, radii, durations. Foundation for all ArxHub themes.

## STRUCTURE

```
src/
├── colors/           # Radix color scales (amber.css → yellow.css)
│   └── index.css     # Aggregates all color scales
├── styles/           # Non-color tokens
│   ├── duration.css  # Animation durations (--duration-fastest → --duration-slowest)
│   ├── radii.css     # Border radii (--radius-xs → --radius-full)
│   ├── shadow.css    # Box shadows (--shadow-xs → --shadow-xl)
│   ├── sizing.css    # Size scale (--size-xs → --size-2xl)
│   ├── typography.css # Font families (--font-sans, --font-mono)
│   ├── z-index.css   # Z-index scale (--z-index-1 → --z-index-max)
│   └── index.css     # Aggregates all styles
├── index.css         # Entry: imports colors + styles
├── reset.css         # Modern CSS reset (import first)
└── semantic.css      # Semantic aliases (--danger-*, --success-*, etc.)
```

## IMPORT PATTERNS

```css
/* Full preset (colors + styles) */
@import '@arxhub/theme-preset';

/* Specific color scale only */
@import '@arxhub/theme-preset/colors/slate';
@import '@arxhub/theme-preset/colors/cyan';

/* Reset + sizing system only */
@import '@arxhub/theme-preset/reset';
@import '@arxhub/theme-preset/styles/sizing';
```

## CONVENTIONS

- Color scales follow Radix naming: `--{color}-{1-12}` for solid, `--{color}-a{1-12}` for alpha.
- Themes map `--gray-*` and `--accent-*` to specific color scales via CSS variables.
- No build step — `src/` files published directly via `files: ["src"]` in package.json.
- Use `sideEffects: ["**/*.css", "**/*.scss"]` for tree-shaking safety.

## ANTI-PATTERNS

- Do NOT import color scales directly in component files — themes handle mapping.
- Do NOT add new CSS variables here without updating `semantic.css` if semantic.
- Do NOT reference color names (slate, cyan) directly in UI components — use `--gray-*` / `--accent-*`.

## SEE ALSO

- `themes/default/` — Cyan + Slate theme implementation
- `packages/uikit/` — consumes these tokens via scoped CSS

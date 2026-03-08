# themes/default

Default ArxHub theme. Maps Radix Colors (Cyan + Slate) to semantic tokens `--gray-*` and `--accent-*`. Consumes `@arxhub/theme-preset`.

## STRUCTURE

```
index.css       # Theme entry: imports preset + maps colors
package.json    # "@arxhub/theme" alias for this package
```

## COLOR MAPPING

| Semantic | Maps To |
|----------|---------|
| `--gray-*` | Slate (neutral backgrounds, text) |
| `--accent-*` | Cyan (primary actions, highlights) |

## USAGE

```ts
// In app entry (main.ts)
import '@arxhub/theme-preset'  // Base tokens
import '@arxhub/theme'         // This theme's color mapping
```

## CONVENTIONS

- Theme packages are thin CSS wrappers around theme-preset.
- Only responsibility: map color scales to semantic variables.
- No JavaScript — pure CSS package.
- Peer dependency: `@arxhub/theme-preset`.

## ANTI-PATTERNS

- Do NOT add component styles here — tokens only.
- Do NOT import color scales directly (slate, cyan) in app — theme handles this.
- Do NOT create multiple themes in one package — one theme per package.

## CREATING A NEW THEME

1. Create `themes/my-theme/package.json` with `"name": "@arxhub/my-theme"`
2. Create `index.css` importing preset + mapping colors
3. Add to `instances/app` dependencies
4. Import in `main.ts` alongside theme-preset

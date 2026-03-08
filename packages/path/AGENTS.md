# packages/path

Browser path shim. Pre-compiled JS from `path-browserify`. No TypeScript source — thin wrapper for browser compatibility.

## STRUCTURE

```
index.js      # path-browserify bundle
index.d.ts    # TypeScript declarations
package.json  # "main": "index.js", "types": "index.d.ts"
```

## USAGE

Not typically imported directly. `@arxhub/vfs` and `@arxhub/stdlib/fs/*` utilities handle path operations isomorphically.

## CONVENTIONS

- Runtime dependency: `path-browserify` (catalog:shared).
- No build script — committed JS bundle.
- Browser-only; Node.js uses native `node:path`.

## ANTI-PATTERNS

- Do NOT modify `index.js` — rebuild from path-browserify if updates needed.
- Do NOT use in Node.js VFS implementation — use native `node:path`.

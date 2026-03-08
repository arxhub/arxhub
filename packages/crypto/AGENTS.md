# packages/crypto

Browser crypto shim. Pre-compiled JS from `crypto-browserify`. No TypeScript source — thin wrapper for browser compatibility.

## STRUCTURE

```
index.js      # crypto-browserify bundle
index.d.ts    # TypeScript declarations
package.json  # "main": "index.js", "types": "index.d.ts"
```

## USAGE

Not typically imported directly. Used via `@arxhub/stdlib/crypto/sha256` which abstracts the implementation.

## CONVENTIONS

- Runtime dependency: `crypto-browserify` (catalog:shared).
- No build script — committed JS bundle.
- Browser-only; Node.js uses native `node:crypto`.

## ANTI-PATTERNS

- Do NOT modify `index.js` — rebuild from crypto-browserify if updates needed.
- Do NOT import directly in application code — use `@arxhub/stdlib/crypto/*` abstractions.

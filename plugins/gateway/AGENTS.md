# plugins/gateway

HTTP server plugin. Uses ElysiaJS with Node adapter. Exposes `GatewayServerExtension` (containing a `Gateway` instance) for other plugins to register routes.

## STRUCTURE

```
src/
├── manifest.ts          # Plugin manifest (definePluginManifest)
├── server.ts            # Default export: GatewayServerPlugin
├── api.ts               # Re-exports extension, gateway, plugin
└── server/
    ├── plugin.ts        # GatewayServerPlugin — lifecycle impl
    ├── extension.ts     # GatewayServerExtension — holds Gateway instance
    ├── gateway.ts       # Gateway — wraps Elysia, listen/stop/use
    └── routes/
        └── healthcheck.ts  # GET /healthcheck → '200 OK'
```

## ADDING A ROUTE FROM ANOTHER PLUGIN

In the calling plugin's `configure()`:
```ts
override configure(target: ArxHub): void {
  const { gateway } = target.extensions.get(GatewayServerExtension)
  gateway.use(myElysiaPlugin())
}
```

`gateway.use()` accepts any `AnyElysia` instance. Build routes as standalone Elysia instances.

## PACKAGE EXPORTS

Two exports defined:
- `@arxhub/plugin-gateway/manifest` → `src/manifest.ts`
- `@arxhub/plugin-gateway/server` → `src/server.ts` (default: `GatewayServerPlugin`)

## CONVENTIONS

- Default port: `3000` (configurable via `gateway.listen(port)`).
- Elysia adapter: `@elysiajs/node` (not Bun native).
- Routes live in `src/server/routes/` — one file per route group.
- Server build: `tsc && vite build` using `createNodeConfig` from `@arxhub/toolchain-vite`.

## ANTI-PATTERNS

- Do NOT call `gateway.use()` in `start()` — only in `configure()` (routes must be registered before listen).
- Do NOT import `GatewayServerExtension` from `@arxhub/plugin-gateway/server` in other plugins to avoid circular deps — import from `@arxhub/plugin-gateway` (api.ts).

# instances/server

Headless ArxHub server instance. Runs the Gateway plugin (Elysia HTTP server) without any UI.

This is the **server** instance — for the client app, see `instances/app/`.

## STRUCTURE

```
src/
├── main.ts       # Entry: boots ArxHub, adds server plugins, starts HTTP server

package.json      # Private, depends on core + gateway
vite.config.ts    # Uses createNodeConfig from @arxhub/toolchain-vite
tsconfig.json     # Extends @arxhub/toolchain-tsconfig
```

## DEVELOPMENT

```bash
# Development with hot reload (uses tsx)
pnpm --filter @arxhub/server dev

# Build for production
pnpm --filter @arxhub/server build

# Run production build
pnpm --filter @arxhub/server start
```

## BOOT SEQUENCE

1. `new ArxHub()` — instantiate core
2. `arxhub.plugins.add(new GatewayServerPlugin(...))` — register gateway
3. `await arxhub.start()` — lifecycle: create → configure → start → listen on port 3000
4. Setup SIGINT/SIGTERM handlers for graceful shutdown

## DEFAULT PORT

The gateway listens on port `3000` by default. Healthcheck endpoint available at:
```
GET http://localhost:3000/healthcheck
```

## CONVENTIONS

- Server is a thin shell — business logic lives in plugins.
- Only server-side plugins should be added here (no UI dependencies).
- Graceful shutdown handles SIGINT (Ctrl+C) and SIGTERM.

## ANTI-PATTERNS

- Do NOT add UI-related dependencies or plugins here.
- Do NOT import from `dist/` of workspace packages — always `src/`.
- Do NOT add client-side code here — this is a headless server.

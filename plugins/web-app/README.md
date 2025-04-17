# ArxHub Web App Plugin (@arxhub/plugin-web-app)

This plugin provides the core web user interface for ArxHub.

## Development

```bash
# Install dependencies (run from monorepo root)
pnpm install

# Build the plugin
pnpm --filter @arxhub/plugin-web-app build
```

## Features

*   Serves the main ArxHub UI.
*   Integrates with `@arxhub/plugin-gateway` to handle web requests.
*   Uses `@arxhub/plugin-vfs` for accessing UI assets if needed.

## Integration

*   This plugin contains the client-side code and assets for the ArxHub UI.
*   It coordinates with the `@arxhub/plugin-gateway` to serve its assets and handle API routes.

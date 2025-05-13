# Guide: Creating an ArxHub Plugin

This guide walks you through the process of creating a new plugin for ArxHub. Plugins allow you to extend ArxHub's functionality with new features and capabilities.

## Prerequisites

*   Basic understanding of TypeScript.
*   Node.js and pnpm installed.
*   Familiarity with the ArxHub monorepo structure.

## 1. Setting Up the Plugin Package

Plugins typically reside within the `plugins/` directory of the ArxHub monorepo.

1.  **Create a Directory:** Create a new directory for your plugin, e.g., `plugins/my-cool-plugin`.
2.  **Initialize Package:** Inside the new directory, create a `package.json` file.
    *   Define its `name` (e.g., `@arxhub/plugin-my-cool-plugin`), `version`, `description`, `license`, etc.
    *   Set `"type": "module"`.
    *   Add core libraries like `@arxhub/core` and `@arxhub/stdlib` to `peerDependencies`. Add other plugins your plugin depends on (e.g., `@arxhub/plugin-gateway`) to `peerDependencies` as well.
    *   Add build tools like `@arxhub/toolchain-tsconfig`, `@arxhub/toolchain-vite`, `@types/node`, and `typescript` to `devDependencies`.
3.  **TypeScript Configuration:** Add a `tsconfig.json` file, extending the base configuration (e.g., `"extends": "@arxhub/toolchain-tsconfig"`). Configure `rootDir`, `outDir`, etc.
4.  **Package Exports:** Define entry points for development and production builds.
    *   Use the top-level `exports` field to point directly to your source `.ts` files (e.g., `"./manifest": "./src/manifest.ts"`). This is used during development within the monorepo.
    *   Use the `publishConfig.exports` field to point to the compiled JavaScript files in your output directory (e.g., `./dist/manifest.js`). This is used when the package is published.
    *   Common export keys include:
        *   `./manifest`: Points to the file exporting the plugin's `manifest` object. (Required)
        *   `./server`: Points to the main server-side plugin class/entry point. (Common)
        *   `./client`: Points to the client-side entry point (if applicable). (Optional)

    ```json
    // package.json (example exports structure)
    {
      "name": "@arxhub/plugin-my-cool-plugin",
      "version": "0.1.0",
      "type": "module",
      "exports": {
        "./manifest": "./src/manifest.ts",
        "./server": "./src/server.ts"
      },
      "peerDependencies": {
        "@arxhub/core": "workspace:*",
        "@arxhub/stdlib": "workspace:*"
      },
      "devDependencies": {
        "@arxhub/toolchain-tsconfig": "workspace:*",
        // ... other dev deps
      },
      "publishConfig": {
        "exports": {
          "./manifest": {
            "import": "./dist/manifest.js",
            "types": "./dist/manifest.d.ts"
          },
          "./server": {
            "import": "./dist/server.js",
            "types": "./dist/server.d.ts"
          }
        }
      }
      // ... other package.json fields
    }
    ```
5.  **Source Directory:** Create a `src/` directory for your plugin's source code (e.g., `src/server.ts`, `src/manifest.ts`, `src/api.ts`).
6.  **Build Configuration:** Add a `vite.config.ts` file, typically using helpers from `@arxhub/toolchain-vite` like `createNodeConfig`.

## 2. Defining the Manifest

Every plugin needs a manifest file that provides metadata. Create an object conforming to the `PluginManifest` interface (defined in `@arxhub/core/plugin`).

```typescript
// src/manifest.ts
import { definePluginManifest } from '@arxhub/core/plugin'; // Import the helper

export default definePluginManifest({
  name: '@arxhub/plugin-my-cool-plugin', // Use the full package name
  version: '0.1.0',
  description: 'Does something cool.',
  author: 'Your Name <your.email@example.com>',
  // minApi: '0.1.0' // Optional: Specify minimum ArxHub API version
});
```

## 3. Creating the Plugin Class

The core of your plugin is typically a class in `src/server.ts` (or `src/plugin.ts`) that extends the `Plugin<ArxHub>` abstract class from `@arxhub/core`. The generic type `ArxHub` represents the main application instance provided by the Core.

```typescript
// src/server.ts (Example)
import type { ArxHub, Logger } from '@arxhub/core'; // Import core types
import { Plugin } from '@arxhub/core';
import manifest from './manifest';
// Import extensions from other plugins if needed
import { GatewayExtension } from '@arxhub/plugin-gateway/api';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export class MyCoolServerPlugin extends Plugin<ArxHub> {
  // Declare a logger instance
  private logger!: Logger;

  constructor() {
    super(manifest);
  }

  // --- Lifecycle Methods ---

  /**
   * Called when the plugin is first created.
   * Initialize resources, get logger, register extensions.
   */
  override create(target: ArxHub): void {
    // Get a prefixed logger instance from the core
    this.logger = target.logger.child(`[${this.name}] - `);
    this.logger.info('Plugin created.');
    // Example: Register an extension this plugin provides
    // target.extensions.register(new MyCoolExtension());
  }

  /**
   * Called after all plugins have been created.
   * Configure interactions with other plugins via their extensions.
   */
  override configure(target: ArxHub): void {
    this.logger.info('Plugin configuring...');

    // Example: Access the Gateway plugin's extension
    const gatewayExt = target.extensions.get(GatewayExtension);
    if (gatewayExt) {
      const { gateway } = gatewayExt;
      this.logger.info('Gateway found, adding routes...');

      // Example: Serve an index.html file
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const indexHtmlPath = path.resolve(__dirname, '..', 'public', 'index.html');
      gateway.get('/', async (ctx) => {
        try {
          const content = await fs.readFile(indexHtmlPath, 'utf-8');
          return ctx.html(content); // Assumes ctx.html exists
        } catch (error) {
          this.logger.error('Failed to read index.html:', error);
          ctx.status(500); // Assumes ctx.status exists
          return ctx.text('Internal Server Error'); // Assumes ctx.text exists
        }
      });
      this.logger.info('Added route for /');

    } else {
      this.logger.warn('Gateway extension not found.');
    }
  }

  /**
   * Called to start any long-running processes.
   */
  override async start(target: ArxHub): Promise<void> {
    this.logger.info('Plugin starting...');
    // Start background tasks here
    await Promise.resolve(); // Placeholder
    this.logger.info('Plugin started.');
  }

  /**
   * Called when ArxHub is shutting down.
   */
  override async stop(target: ArxHub): Promise<void> {
    this.logger.info('Plugin stopping...');
    // Stop background tasks and cleanup
    await Promise.resolve(); // Placeholder
    this.logger.info('Plugin stopped.');
  }
}

// Optional: Export a factory function if needed by the core loader
// export function createPlugin(): MyCoolPlugin {
//  return new MyCoolPlugin();
// }
```

## 4. Defining Extensions (Optional)

Extensions are the public API or configuration points of your plugin. Define an interface or class implementing the `Extension` interface from `@arxhub/core/extension`.

```typescript
// src/extension.ts
import type { Extension } from '@arxhub/core/extension';

export class MyCoolExtension implements Extension {
  readonly name = 'my-cool-extension'; // Unique name for the extension

  doSomethingCool(): string {
    return 'Doing something cool!';
  }
}
```

Register your extension within the `create` method of your plugin using `target.extensions.register(...)`.

## 5. Building the Plugin

Configure your build process in `package.json` and `vite.config.ts`.

1.  **Build Script:** In `package.json`, define a build script. If you need to compile TypeScript first (e.g., for type checking or if Vite doesn't handle everything), use `tsc && vite build`.
    ```json
    // package.json (scripts section example)
    "scripts": {
      "build": "tsc && vite build"
      // "dev": "vite build --watch" // Optional dev script
    }
    ```
2.  **Vite Configuration:** In `vite.config.ts`, use the helpers provided by `@arxhub/toolchain-vite`.
    ```typescript
    // vite.config.ts
    import { createNodeConfig } from '@arxhub/toolchain-vite'
    import { defineConfig } from 'vite'

    // biome-ignore format: Manual formatting is more readable
    export default defineConfig((env) => createNodeConfig(__dirname, env, [
      // List your entry points (relative to src/)
      'src/manifest.ts',
      'src/api.ts',
      'src/server.ts',
      // 'src/client.ts', // If you have a client entry point
    ]))
    ```

## 6. Integrating with ArxHub

How ArxHub discovers and loads your plugin depends on its specific implementation.

1.  **Dependencies:**
    *   Add your plugin package as a **dependency** in the main application package (usually `boot/package.json`).
    *   If other plugins *use* your plugin's API or extensions, add your plugin package as a **peerDependency** in *their* `package.json`.
2.  **Loading:** Ensure the main application (`boot/src/index.ts` or similar) imports and registers your plugin, often by importing the `./server` or `./plugin` export.
3.  **Installation:** Run `pnpm install` from the monorepo root to link the packages correctly.

Refer to the `boot` package for the specific plugin loading mechanism.

You have now created a basic ArxHub plugin! Remember to add tests and more detailed documentation within your plugin's `README.md` for developers working on it.

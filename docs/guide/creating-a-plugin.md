# Guide: Creating an ArxHub Plugin

This guide walks you through the process of creating a new plugin for ArxHub. Plugins allow you to extend ArxHub's functionality with new features and capabilities.

## Prerequisites

*   Basic understanding of TypeScript.
*   Node.js and pnpm installed.
*   Familiarity with the ArxHub monorepo structure.

## 1. Setting Up the Plugin Package

Plugins typically reside within the `plugins/` directory of the ArxHub monorepo.

1.  **Create a Directory:** Create a new directory for your plugin, e.g., `plugins/my-cool-plugin`.
2.  **Initialize Package:** Inside the new directory, create a `package.json` file. Define its name, version, author, and dependencies. Make sure to include `@arxhub/core` and `@arxhub/stdlib` as dependencies if needed.
3.  **TypeScript Configuration:** Add a `tsconfig.json` file, likely extending a base configuration from `toolchains/tsconfig`.
4.  **Package Exports:** Define specific entry points in your `package.json` using the `exports` field. This allows ArxHub to load only the necessary parts of your plugin for different contexts (e.g., server-side vs. client-side). ArxHub expects specific export keys for different purposes:
    *   `./manifest`: Points to the compiled JavaScript file exporting the plugin's `manifest` object. (Required)
    *   `./plugin`: Points to the compiled JavaScript file exporting the main `Plugin` class (or a factory function). (Required)
    *   `./api`: Points to the TypeScript definition file (`.d.ts`) for the plugin's public API, including any extensions. (Optional, but recommended)
    *   `./client`: Points to the entry point for client-side code (e.g., for a web application). (Optional)
    *   `./server`: Points to the entry point for server-side specific code (if different from the main `./plugin` export). (Optional)

    ```json
    // package.json (example exports)
    {
      "name": "@arxhub/my-cool-plugin",
      "version": "0.1.0",
      "type": "module",
      "exports": {
        "./manifest": {
          "import": "./dist/manifest.js",
          "types": "./dist/manifest.d.ts"
        },
        "./api": {
					"import": "./dist/api.js",
          "types": "./dist/api.d.ts" // Only types needed for API consumers
        },
        "./client": {
          "import": "./dist/client.js",
          "types": "./dist/client.d.ts"
        },
        "./server": {
          "import": "./dist/server.js",
          "types": "./dist/server.d.ts"
        }
      },
      // ... other package.json fields
    }
    ```
    *Note: Adjust paths (`./dist/...`) based on your build output directory.*
5.  **Source Directory:** Create a `src/` directory for your plugin's source code (e.g., `src/plugin.ts`, `src/manifest.ts`, `src/client.ts`).

## 2. Defining the Manifest

Every plugin needs a manifest file that provides metadata. Create an object conforming to the `PluginManifest` interface (defined in `@arxhub/core/plugin`).

```typescript
// src/manifest.ts
import type { PluginManifest } from '@arxhub/core/plugin';

export default definePluginManifest({
  name: 'my-cool-plugin',
  version: '0.1.0',
  description: 'Does something cool.',
  author: 'Your Name <your.email@example.com>',
  // minApi: '0.1.0' // Optional: Specify minimum ArxHub API version
});
```

## 3. Creating the Plugin Class

The core of your plugin is a class that extends the `Plugin<T>` abstract class from `@arxhub/core/plugin`. The generic type `T` represents the target context provided by ArxHub Core, which your plugin will interact with (e.g., the main ArxHub application instance).

```typescript
// src/plugin.ts
import { Plugin } from '@arxhub/core/plugin';
import type { Extension } from '@arxhub/core/extension'; // If defining extensions
import { manifest } from './manifest';

// Define the type for the ArxHub context your plugin receives.
// This might be defined in @arxhub/core or you might need to import it.
// Let's assume it's called 'ArxHubContext' for this example.
import type { ArxHubContext } from '@arxhub/core'; // Hypothetical import

export class MyCoolPlugin extends Plugin<ArxHubContext> {
  constructor() {
    // Pass the manifest to the base Plugin constructor
    super(manifest);
  }

  // --- Lifecycle Methods ---

  /**
   * Called when the plugin is first created.
   * Use this to initialize resources and register extensions.
   */
  override create(context: ArxHubContext): void {
    console.log(`[${this.name}] Plugin created!`);
    // Example: Register an extension
    // context.extensions.register(new MyCoolExtension());
  }

  /**
   * Called after all plugins have been created.
   * Use this for configuration steps that might depend on other plugins.
   */
  override configure(context: ArxHubContext): void {
    console.log(`[${this.name}] Plugin configuring...`);
    // Example: Access another plugin's extension
    // const someOtherPluginExtension = context.extensions.get('some-other-extension');
    // if (someOtherPluginExtension) {
    //   // ... interact with it
    // }
  }

  /**
   * Called to start any long-running processes (e.g., servers, listeners).
   * Should return a Promise that resolves when startup is complete.
   */
  override async start(context: ArxHubContext): Promise<void> {
    console.log(`[${this.name}] Plugin starting...`);
    // Start background tasks here
    await Promise.resolve(); // Placeholder
    console.log(`[${this.name}] Plugin started!`);
  }

  /**
   * Called when ArxHub is shutting down.
   * Use this to gracefully stop processes and clean up resources.
   * Should return a Promise that resolves when shutdown is complete.
   */
  override async stop(context: ArxHubContext): Promise<void> {
    console.log(`[${this.name}] Plugin stopping...`);
    // Stop background tasks and cleanup
    await Promise.resolve(); // Placeholder
    console.log(`[${this.name}] Plugin stopped!`);
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

Register your extension within the `create` method of your plugin, likely using a method on the `context` object (e.g., `context.extensions.register(...)`).

## 5. Building the Plugin

Add build scripts to your plugin's `package.json`, typically using `tsc` or a bundler like Vite configured via `toolchains/vite`.

```json
// package.json (scripts section example)
"scripts": {
  "build": "vite build",
  "dev": "vite build --watch"
}
```

## 6. Integrating with ArxHub

How ArxHub discovers and loads your plugin depends on its specific implementation. Commonly, you might need to:

*   Add your plugin package as a dependency to the main application package (e.g., `boot` or `core`).
*   Register your plugin in a central configuration file or list.
*   Ensure your built plugin code is correctly placed or linked for ArxHub to find it.

Refer to the main ArxHub application setup (`boot/src/index.ts` or similar) for details on how plugins are loaded.

You have now created a basic ArxHub plugin! Remember to add tests and more detailed documentation within your plugin's `README.md` for developers working on it.

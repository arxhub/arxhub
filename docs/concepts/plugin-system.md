# ArxHub Plugin System

ArxHub is designed with a modular architecture built around a core system, plugins, and extensions. This approach allows for flexibility, customization, and community contributions.

## Core

The **Core** (`@arxhub/core`) is the central orchestrator of ArxHub. Its primary responsibility is managing the lifecycle of plugins. It provides essential shared services, like logging (via an injectable `Logger` instance that supports child loggers for prefixing), and manages the extension registry. The Core doesn't implement major features itself but provides the foundation and context (`ArxHub` instance) for plugins.

## Plugins

**Plugins** are self-contained units that add specific features or capabilities to ArxHub. Each plugin typically focuses on a single area of functionality.

**Key Characteristics:**

*   **Modular:** Adds a distinct feature (e.g., file rendering, virtual file system access, HTTP server).
*   **Independent:** Can often operate on its own, though it might interact with other plugins.
*   **Manageable:** Can be enabled or disabled by the user or administrator.
*   **Extensible:** Can expose "Extensions" to allow fine-grained configuration and customization.

**Examples in ArxHub:**

ArxHub utilizes several core plugins:

*   **`vfs`:** Provides a Virtual File System, abstracting how and where files are stored and accessed.
*   **`gateway`:** Acts as the main entry point, often an HTTP server, handling requests and responses. It exposes a `GatewayExtension` allowing other plugins to add routes or middleware.
*   **`file-renderer`:** Renders various file types (like Markdown) into formats suitable for display (like HTML), often used by the `gateway`.
*   **`web-app`:** Serves the main user interface assets (like `index.html` and associated JavaScript/CSS) by interacting with the `gateway` plugin to register routes.
*   *(Other plugins like `gateway-vfs` and `http-client` provide specific integrations and utilities).*

**Plugin Lifecycle:**

Plugins follow a defined lifecycle managed by the Core:

1.  **Create:** The plugin initializes itself, often obtaining a logger instance (`target.logger.child(...)`), and registers any Extensions it provides (`target.extensions.register(...)`).
2.  **Configure:** After all plugins are created, they can interact with each other by retrieving registered extensions (`target.extensions.get(...)`) and applying configurations (e.g., adding routes to the `gateway`).
3.  **Start:** Plugins initiate any long-running processes (like starting a web server or connecting to external services).
4.  **Running:** The plugin is active and performing its function.
5.  **Stop:** The plugin gracefully shuts down its processes and cleans up resources.

```mermaid
graph LR
    A(Create) --> B(Configure);
    B --> E(Start);
    E --> F(*Running*);
    F --> H(Stop);
```

## Extensions

**Extensions** are the public APIs or configuration points exposed by a Plugin. They allow users or other plugins to customize or interact with a plugin's behavior without modifying the plugin's core code.

**Purpose:**

*   Provide configuration options (e.g., setting a port number for an HTTP server plugin).
*   Enable/disable specific sub-features within a plugin.
*   Allow other plugins to integrate or modify behavior. This is the primary way plugins interact. For instance, the `web-app` plugin uses the `GatewayExtension` from the `gateway` plugin to add routes for serving its UI.

**Examples:**

*   A `ThemeExtension` for a `gateway-html` plugin could allow changing the website's appearance.
*   An `AuthExtension` for a `gateway` plugin could add user authentication requirements.
*   A `FileSystemMountExtension` for a `vfs` (Virtual File System) plugin could allow adding different storage backends.

This system of Core, Plugins, and Extensions provides a powerful and flexible way to build and customize ArxHub.

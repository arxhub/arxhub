# Technical Context

This document details the technologies used in the project, the development setup, technical constraints, dependencies, and tool usage patterns.

## Technologies Used

- **Frontend:** TypeScript, React (or similar), HTML, CSS
- **Backend (for potential sync/collaboration features):** Node.js, Express (or similar)
- **Data Storage:** Markdown files, potentially a lightweight database for indexing (e.g., SQLite)
- **Build Tools:** Vite, esbuild
- **Testing:** Jest, React Testing Library

## Development Setup

1.  Install Node.js and pnpm.
2.  Clone the project repository.
3.  Install dependencies using `pnpm install` from the monorepo root.
4.  Refer to the `docs/guide/creating-a-plugin.md` for detailed steps on setting up a new plugin package.
5.  Start the development server using `pnpm dev` (if applicable for the specific package).

## Technical Constraints

- Performance needs to be optimized for large knowledge bases.
- Ensuring data integrity and handling conflicts in a file-based system.
- Cross-platform compatibility for desktop applications (if applicable).
- Managing plugin dependencies and compatibility.

## Dependencies

- Core ArxHub packages (`@arxhub/core`, `@arxhub/stdlib`).
- Frontend framework (React or chosen).
- Markdown parser library.
- Graph visualization library.
- File system access libraries (Node.js).
- Build tool dependencies (Vite, esbuild, TypeScript).
- Testing libraries (Jest, React Testing Library).
- Linting and formatting tools (Biome).
- Specific plugin dependencies (listed in individual plugin `package.json` files).

## Tool Usage Patterns

- **pnpm:** Used as the package manager for the monorepo.
- **Vite:** Used for fast development builds and hot module replacement, configured via `vite.config.ts` with helpers from `@arxhub/toolchain-vite`.
- **esbuild:** Used for efficient code bundling, often integrated with Vite.
- **Jest:** Used for running unit and integration tests.
- **Biome:** Used for code formatting and linting to maintain code style consistency.
- **TypeScript:** Used for type checking and compiling code.
- **`@arxhub/toolchain-tsconfig`:** Provides base TypeScript configuration.
- **`@arxhub/toolchain-vite`:** Provides helpers for Vite configuration.

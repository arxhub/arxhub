# @arxhub/toolchain-vite

This package provides a Vite toolchain for ArxHub projects.

## Usage

Install this package as a dev dependency:

```bash
pnpm add -D @arxhub/toolchain-vite
```

Then, configure Vite to use this toolchain by adding it to your `vite.config.ts` file:

```typescript
import { defineConfig } from 'vite';
import { createGenericConfig } from '@arxhub/toolchain-vite';

export default defineConfig((env) => createGenericConfig(__dirname, env));
```
# @arxhub/toolchain-biome

This package provides a Biome configuration for Arxhub projects.

## Usage

Install this package as a dev dependency:

```bash
pnpm add -D @arxhub/toolchain-biome
```

Then, configure Biome to use this configuration by extending it in your project's `biome.json` file:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "extends": "@arxhub/toolchain-biome"
}
```

See the [Biome documentation](https://biomejs.dev/guides/configure-biome/) for more information on configuring Biome.

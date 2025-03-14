# @arxhub/toolchain-tsconfig

This package provides a base tsconfig.json for ArxHub projects.

## Usage

Install this package as a dev dependency:

```bash
pnpm add -D @arxhub/toolchain-tsconfig
```

Then, configure your project to use this tsconfig by extending it in your project's `tsconfig.json` file:

```json
{
  "extends": "@arxhub/toolchain-tsconfig",
  "compilerOptions": {
    "baseUrl": "./",
    "rootDir": "./src",
    "outDir": "./dist",
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["./src"],
  "exclude": ["./dist", "./node_modules"]
}
```

# packages/core

Central orchestrator. Manages Plugin/Extension lifecycle. No domain logic — provides context, logging, and registry.

## STRUCTURE

```
src/
├── arxhub.ts      # ArxHub class — main entrypoint, owns plugins + extensions + logger
├── plugin.ts      # Plugin<T> abstract class + PluginContainer (LazyContainer)
├── extension.ts   # Extension abstract class + ExtensionContainer (LazyContainer)
├── logger.ts      # Logger interface + ConsoleLogger (child-prefix support)
└── index.ts       # Re-exports everything
```

## KEY PATTERNS

**Adding a new plugin**: Extend `Plugin<ArxHub>`, pass `PluginManifest` to super. Override only the lifecycle methods you need.

```ts
class MyPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) { super(args, manifest) }
  override create(target: ArxHub): void { target.extensions.register(MyExtension) }
  override configure(target: ArxHub): void { /* get other extensions */ }
  override start(target: ArxHub): Promise<void> { return Promise.resolve() }
}
```

**Adding a new extension**: Extend `Extension`, accept `ExtensionArgs` in constructor.

```ts
class MyExtension extends Extension {
  constructor(args: ExtensionArgs) { super(args) }
}
```

**Registering with extra args**:
```ts
container.register(MyPlugin, () => ({ extraField: value }))
// Args merged with defaults (logger) automatically
```

## CONVENTIONS

- `plugin.name` and `extension.name` return `this.constructor.name` — class names must be unique.
- Logger children: `logger.child('[MyThing] - ')` — produces prefixed output.
- Lifecycle method signatures use `override` keyword (noImplicitOverride enforced).
- Method overloads on `register()` use `// biome-ignore format:` — keep this pattern for new overloads.

## ANTI-PATTERNS

- Do NOT call `plugins.get(MyPlugin)` before `instantiate()` — container throws.
- Do NOT store direct references to other plugins — only to their extensions.
- Do NOT implement `start()` synchronously-blocking — always return a Promise.

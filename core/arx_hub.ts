import { ErrorFactory } from '~/core/error/error-factory.ts'
import { ExtensionContainer } from '~/core/stdlib/extension_container.ts'

export type ArxHub<T extends Record<string, unknown> = Record<string, never>> =
  & { [K in keyof T]: T[K] }
  & { extensions: ExtensionContainer }

export const ArxHub = <T extends Record<string, unknown> = Record<string, never>>() => {
  const extensions = new ExtensionContainer({})
  return new Proxy(
    { extensions },
    {
      get: (target: Record<string, unknown>, prop: string | symbol) => {
        if (typeof prop === 'symbol') return
        if (prop in target) return target[prop]

        const ext = extensions.get(prop)
        if (ext == null) throw ErrorFactory.KeyError(`Extension '${prop}' not found`)
        return ext
      },
      // TODO: Maybe prevent set, delete, etc
      // set: () =>
    },
  ) as ArxHub<T>
}

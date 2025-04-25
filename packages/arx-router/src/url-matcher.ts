import Memoirist from 'memoirist'

// Copy-Paste start
// Copied from https://github.com/elysiajs/elysia/blob/main/src/types.ts#L199
//
// type IsPathParameter<Part extends string> = Part extends `:${infer Parameter}`
//   ? Parameter
//   : Part extends `*`
//     ? '*'
//     : never

// type GetPathParameter<Path extends string> = Path extends `${infer A}/${infer B}`
//   ? IsPathParameter<A> | GetPathParameter<B>
//   : IsPathParameter<Path>

// type ResolvePath<Path extends string> = Simplify<
//   {
//     [Param in GetPathParameter<Path> as Param extends `${string}?` ? never : Param]: string
//   } & {
//     [Param in GetPathParameter<Path> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string
//   }
// >
//
// Copy-Paste end

export class UrlMatcher<T> {
  private readonly memoirist: Memoirist<T>

  constructor() {
    this.memoirist = new Memoirist()
  }

  add(path: string, store: T): void {
    this.memoirist.add('', path, store)
  }

  find(path: string) {
    return this.memoirist.find('', path)
  }
}

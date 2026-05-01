export type Join = (...paths: string[]) => string
export type Dirname = (path: string) => string
export type Basename = (path: string, ext?: string) => string
export type Extname = (path: string) => string
export type NormalizeFn = (path: string) => string
export type Resolve = (...paths: string[]) => string
export type Relative = (from: string, to: string) => string
export type IsAbsolute = (path: string) => boolean

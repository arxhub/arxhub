/*!
 * This file is based on @types/path-browserify
 * Licensed under the MIT license.
 */

export declare interface PathObject {
  /**
   * The root portion of the path.
   */
  root: string
  /**
   * The directory portion of the path.
   */
  dir: string
  /**
   * The base name of the file, including the extension.
   */
  base: string
  /**
   * The file extension including the dot.
   */
  ext: string
  /**
   * The file name without the extension.
   */
  name: string
}

/**
 * Resolves a sequence of paths or path segments into an absolute path.
 *
 * @param pathSegments - The sequence of path segments to resolve.
 * @returns The resolved absolute path.
 */
export declare function resolve(this: void, ...pathSegments: string[]): string

/**
 * Normalizes a path, resolving '..' and '.' segments.
 *
 * @param path - The path to normalize.
 * @returns The normalized path.
 */
export declare function normalize(this: void, path: string): string

/**
 * Determines if a path is absolute.
 *
 * @param path - The path to check.
 * @returns `true` if the path is absolute, `false` otherwise.
 */
export declare function isAbsolute(this: void, path: string): boolean

/**
 * Joins multiple path segments into a single path.
 *
 * @param paths - The path segments to join.
 * @returns The joined path.
 */
export declare function join(this: void, ...paths: string[]): string

/**
 * Returns the relative path from one path to another.
 *
 * @param from - The starting path.
 * @param to - The destination path.
 * @returns The relative path from `from` to `to`.
 */
export declare function relative(this: void, from: string, to: string): string

/**
 * Returns the directory name of a path.
 *
 * @param path - The path to get the directory name from.
 * @returns The directory name of the path.
 */
export declare function dirname(this: void, path: string): string

/**
 * Returns the base name of a file, optionally removing the file extension.
 *
 * @param path - The path to get the base name from.
 * @param ext - An optional extension to remove from the base name.
 * @returns The base name of the file.
 */
export declare function basename(this: void, path: string, ext?: string): string

/**
 * Returns the file extension of a path.
 *
 * @param path - The path to get the extension from.
 * @returns The file extension of the path.
 */
export declare function extname(this: void, path: string): string

/**
 * Formats a path object into a path string.
 *
 * @param pathObject - The path object to format.
 * @returns The formatted path string.
 */
export declare function format(this: void, pathObject: Partial<PathObject>): string

/**
 * Parses a path string into a path object.
 *
 * @param path - The path string to parse.
 * @returns The parsed path object.
 */
export declare function parse(this: void, path: string): PathObject

/**
 * The platform-specific path segment separator.
 */
export declare const sep: string

/**
 * The platform-specific path delimiter.
 */
export declare const delimiter: string

/**
 * Provides methods for handling Windows paths (always `null`).
 */
export declare const win32: null

/**
 * Provides methods for handling POSIX paths.
 */
export declare const posix: Path

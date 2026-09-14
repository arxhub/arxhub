// Reading a slice of a file without reading the file. A backend that can seek declares it; one that
// cannot is served by the `readRange` op, which reads the whole file and cuts — correct, and exactly
// as expensive as it sounds, which is why the capability exists.
//
// `offset >= 0` counts from the start and `length` bounds the slice (omitted = to the end); both are
// clamped at the end of the file, so a slice that starts past it is empty, not an error. `offset < 0`
// is a suffix range — the last |offset| bytes — the shape HTTP `Range: bytes=-N` has and the one a
// container format needs: a ZIP's central directory (every office document) and an MP4's `moov`
// atom sit at the END, so reading the map of a 50 MB file is two small reads rather than the file.
// A suffix range takes no `length`.
export interface RangeCapable {
  readRange(pathname: string, offset: number, length?: number): Promise<Uint8Array>
}

export function isRangeCapable(vfs: unknown): vfs is RangeCapable {
  return typeof (vfs as RangeCapable).readRange === 'function'
}

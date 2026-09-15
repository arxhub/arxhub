// A file the product stores but does not edit — a CAD model, a spreadsheet for another program — is
// edited where it belongs, and the edit comes back through the checkout's stat check (`packages/sync/src/checkout.ts`)
// rather than through us. Only a backend that IS the local disk can hand a file to the OS to open, which
// is why a browser backend (HTTP, signed requests, no filesystem of its own) never declares this.
export interface OpenExternallyCapable {
  openExternally(pathname: string): Promise<void>

  // A synchronous answer for a UI deciding whether to show the action at all — a menu built before any
  // await must not offer an entry nobody can honour. Optional: a backend whose answer never varies by
  // call omits it and `canOpenExternally(vfs)` (in `ops/open-externally.ts`) treats a capable backend as
  // always able.
  canOpenExternally?(): boolean
}

export function isOpenExternallyCapable(vfs: unknown): vfs is OpenExternallyCapable {
  return typeof (vfs as OpenExternallyCapable).openExternally === 'function'
}

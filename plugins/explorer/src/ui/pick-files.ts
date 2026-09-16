import type { ImportSource } from '../import-files'

// OR-07: the platform's own chooser, through a plain `<input type="file">` and nothing else. It is the
// one road that works in every bundle we ship — the browser SPA, the Tauri webview and Android — with
// no Rust-side dialog plugin, no capability entry and no per-platform branch. The input is built here
// rather than rendered in a component because both the tree's strip and a folder's context menu open
// it, and the menu is drawn from a global host with no template of its own to hold one.
//
// Must be called straight from the click (no await before it): the browsers all gate a file chooser on
// transient user activation, and a picker opened after an await is one that silently never appears.
export function pickFiles(): Promise<ImportSource[]> {
  return new Promise<ImportSource[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    // In the document, not detached: WebKit fires `change` only for an input the page actually holds,
    // and the desktop Linux target is a WebKitGTK webview.
    input.style.display = 'none'
    document.body.append(input)

    const settle = (files: ImportSource[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => settle([...(input.files ?? [])]), { once: true })
    // A dismissed chooser resolves as "nothing picked" rather than hanging — the caller then has no
    // toast to show and the tree is left exactly as it was.
    input.addEventListener('cancel', () => settle([]), { once: true })
    input.click()
  })
}

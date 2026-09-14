// A URL a browser element can load the file from — `<img src>`, `<video src>`, `<audio src>` — with the
// byte-range semantics those elements need (a player seeks by `Range`). A backend declares it only when
// it can hand out such a URL: the native file systems under Tauri do, through the asset protocol, where
// `Range` is answered on the Rust side. An HTTP backend cannot: its requests are signed, and an element
// carries no signature. `null` means "no such URL" and the caller falls back to bytes — which is why
// the answer is nullable rather than the capability being absent: a scoped view over an unknown backend
// has to be able to say "ask me", and then "no".
export interface ContentUrlCapable {
  contentUrl(pathname: string): Promise<string | null>
}

export function isContentUrlCapable(vfs: unknown): vfs is ContentUrlCapable {
  return typeof (vfs as ContentUrlCapable).contentUrl === 'function'
}

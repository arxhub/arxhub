// A user-visible field of a registration made once, in configure(): a string would freeze the language the
// app booted in, so it may be a function the renderer calls every time it draws. A plain string stays legal
// — for a name that is not translated, and so a package that has not moved to its catalog yet still compiles.
export type Text = string | (() => string)

export function readText(text: Text): string
export function readText(text: Text | undefined): string | undefined
export function readText(text: Text | undefined): string | undefined {
  return typeof text === 'function' ? text() : text
}

// The measure of a gate's column on the desktop frame. A gate is a screen of its own before the app
// exists (unlock, first run, the crash and boot screens), and the widths are decisions about those
// screens, so they live with the role rather than in the scale (DS-5).
export type GateWidth = 'narrow' | 'wide' | 'page'

export interface GateLayoutProps {
  // A welcome, an unlock, a finished step: one short message centred on the screen. `mobile` centres it on
  // the phone only — the first run's welcome, which on the desktop reads from the column's leading edge
  // like the steps after it.
  center?: boolean | 'mobile'
  // Where a centred column settles on the phone. `end` sits it just above the actions — the unlock
  // screen's mark, dots and keypad, all within the thumb's reach. The desktop always centres.
  anchor?: 'middle' | 'end'
  width?: GateWidth
  // The accent square above the title — the product mark on the screens that stand for the app itself.
  mark?: string
  // The body IS the screen on the phone — a camera picture: no inset, and the head is kept for assistive
  // technology only, since a title over a viewfinder is a band nothing needs. The desktop ignores it.
  bleed?: boolean
}

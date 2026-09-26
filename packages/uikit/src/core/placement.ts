// Floating-overlay placement values (matches @zag-js/popper's Placement).
export type Placement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'right'
  | 'right-start'
  | 'right-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'

export interface FloatingBox {
  left: number
  top: number
  right: number
  bottom: number
}

export interface FloatingPlacement {
  x: number
  y: number
  // What the overlay may grow to on the side it took; it scrolls past that.
  maxHeight: number
  side: 'below' | 'above'
}

export interface FloatingOptions {
  // Between the anchor and the overlay.
  gap?: number
  // Kept free at the edges of `bounds`.
  margin?: number
  maxHeight?: number
  // Horizontally too: open leftwards from the anchor's right edge when there is no room to the right, the
  // way a context menu does, instead of sliding along the edge.
  flipX?: boolean
}

// Where an overlay opened at an anchor lands (a menu at the caret, a context menu at the pointer). Below
// the anchor by default, above it when the overlay does not fit below and there is more room above — the
// anchor itself is never covered. `bounds` is what is really visible (the visual viewport, so an on-screen
// keyboard counts).
export function placeFloating(
  anchor: FloatingBox,
  size: { width: number; height: number },
  bounds: FloatingBox,
  { gap = 4, margin = 8, maxHeight = Number.POSITIVE_INFINITY, flipX = false }: FloatingOptions = {},
): FloatingPlacement {
  const below = Math.max(0, bounds.bottom - margin - anchor.bottom - gap)
  const above = Math.max(0, anchor.top - gap - bounds.top - margin)
  const side = size.height <= below || below >= above ? 'below' : 'above'
  const room = Math.min(maxHeight, side === 'below' ? below : above)
  const height = Math.min(size.height, room)
  const y = side === 'below' ? anchor.bottom + gap : anchor.top - gap - height
  const minX = bounds.left + margin
  const maxX = bounds.right - margin - size.width
  const x =
    flipX && anchor.left + size.width > bounds.right - margin
      ? Math.max(minX, anchor.right - size.width)
      : Math.max(minX, Math.min(anchor.left, maxX))
  return { x, y, maxHeight: room, side }
}

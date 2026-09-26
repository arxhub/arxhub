import { describe, expect, it } from 'vitest'
import { placeFloating } from '../core/placement'

const bounds = { left: 0, top: 0, right: 400, bottom: 800 }
const line = (top: number, left = 100) => ({ left, right: left, top, bottom: top + 20 })

describe('placeFloating', () => {
  it('opens below the anchor when it fits', () => {
    expect(placeFloating(line(100), { width: 200, height: 300 }, bounds)).toEqual({ x: 100, y: 124, maxHeight: 668, side: 'below' })
  })

  it('flips above when it does not fit below and there is more room above', () => {
    const placed = placeFloating(line(600), { width: 200, height: 300 }, bounds)
    expect(placed.side).toBe('above')
    expect(placed.y + 300).toBe(596)
    expect(placed.maxHeight).toBe(588)
  })

  it('stays below when that side still has more room, and caps the height to it', () => {
    const placed = placeFloating(line(300), { width: 200, height: 600 }, bounds)
    expect(placed).toMatchObject({ side: 'below', y: 324, maxHeight: 468 })
  })

  it('never covers the anchor: an overlay taller than the room above ends above the line', () => {
    const placed = placeFloating(line(700), { width: 200, height: 900 }, bounds)
    expect(placed.side).toBe('above')
    expect(placed.maxHeight).toBe(688)
    expect(placed.y + placed.maxHeight).toBe(696)
  })

  it('applies a height cap on either side', () => {
    expect(placeFloating(line(100), { width: 200, height: 500 }, bounds, { maxHeight: 288 }).maxHeight).toBe(288)
    expect(placeFloating(line(700), { width: 200, height: 500 }, bounds, { maxHeight: 288 })).toMatchObject({ side: 'above', maxHeight: 288 })
  })

  it('clamps horizontally inside the margins', () => {
    expect(placeFloating(line(100, 350), { width: 200, height: 100 }, bounds).x).toBe(192)
    expect(placeFloating(line(100, -20), { width: 200, height: 100 }, bounds).x).toBe(8)
  })

  it('flips leftwards from the anchor when asked', () => {
    const point = { left: 350, right: 350, top: 100, bottom: 100 }
    expect(placeFloating(point, { width: 200, height: 100 }, bounds, { flipX: true, gap: 0, margin: 0 }).x).toBe(150)
    expect(placeFloating(point, { width: 20, height: 100 }, bounds, { flipX: true, gap: 0, margin: 0 }).x).toBe(350)
  })

  it('measures against the bounds it is given, not the window', () => {
    const keyboardUp = { left: 0, top: 0, right: 400, bottom: 400 }
    expect(placeFloating(line(300), { width: 200, height: 200 }, keyboardUp).side).toBe('above')
  })
})

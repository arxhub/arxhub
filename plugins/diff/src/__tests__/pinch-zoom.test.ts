import { describe, expect, it } from 'vitest'
import { DIFF_ZOOM_STEPS } from '../ui/types'
import { pinchZoomValue, settlePinchZoom } from '../ui/use-pinch-zoom'

describe('pinchZoomValue', () => {
  it('scales the starting zoom by the spread ratio', () => {
    expect(pinchZoomValue(1, 1.2, DIFF_ZOOM_STEPS)).toBeCloseTo(1.2)
    expect(pinchZoomValue(1.25, 0.8, DIFF_ZOOM_STEPS)).toBeCloseTo(1)
  })

  it('holds the live value inside the first and last step', () => {
    expect(pinchZoomValue(1, 3, DIFF_ZOOM_STEPS)).toBe(1.5)
    expect(pinchZoomValue(1, 0.2, DIFF_ZOOM_STEPS)).toBe(0.75)
    expect(pinchZoomValue(1.5, 1.1, DIFF_ZOOM_STEPS)).toBe(1.5)
  })

  it('keeps the starting zoom for a degenerate ratio', () => {
    expect(pinchZoomValue(0.9, 0, DIFF_ZOOM_STEPS)).toBe(0.9)
    expect(pinchZoomValue(0.9, Number.NaN, DIFF_ZOOM_STEPS)).toBe(0.9)
    expect(pinchZoomValue(0.9, Number.POSITIVE_INFINITY, DIFF_ZOOM_STEPS)).toBe(0.9)
  })
})

describe('settlePinchZoom', () => {
  it('snaps to the nearest listed step', () => {
    expect(settlePinchZoom(1.1, DIFF_ZOOM_STEPS)).toBe(1)
    expect(settlePinchZoom(1.13, DIFF_ZOOM_STEPS)).toBe(1.25)
    expect(settlePinchZoom(0.8, DIFF_ZOOM_STEPS)).toBe(0.75)
    expect(settlePinchZoom(1.4, DIFF_ZOOM_STEPS)).toBe(1.5)
  })

  it('a live value and its settled step always land in the listed range', () => {
    for (let ratio = 0.1; ratio <= 4; ratio += 0.05) {
      for (const start of DIFF_ZOOM_STEPS) {
        const settled = settlePinchZoom(pinchZoomValue(start, ratio, DIFF_ZOOM_STEPS), DIFF_ZOOM_STEPS)
        expect(DIFF_ZOOM_STEPS).toContain(settled)
      }
    }
  })
})

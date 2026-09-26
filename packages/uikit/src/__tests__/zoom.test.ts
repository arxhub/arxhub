import { describe, expect, test } from 'vitest'
import { stepZoomValue } from '../core/zoom'

const DIFF_STEPS = [0.75, 0.9, 1, 1.25, 1.5] as const
const listed = { min: 0.75, max: 1.5, steps: DIFF_STEPS }
const pdf = { min: 0.5, max: 3, step: 0.25 }

// The PDF viewer's own stepZoom before it moved here — the arithmetic scale must answer exactly as it did.
function legacyPdfStep(current: number, direction: 1 | -1): number {
  const stepped = Math.round((current + direction * 0.25) / 0.25) * 0.25
  return Math.min(3, Math.max(0.5, Math.round(stepped * 100) / 100))
}

describe('stepZoomValue with a listed scale', () => {
  test('moves one listed value in either direction', () => {
    expect(stepZoomValue(1, 1, listed)).toBe(1.25)
    expect(stepZoomValue(1, -1, listed)).toBe(0.9)
    expect(stepZoomValue(0.9, -1, listed)).toBe(0.75)
    expect(stepZoomValue(1.25, 1, listed)).toBe(1.5)
  })

  test('stays at the ends of the list', () => {
    expect(stepZoomValue(0.75, -1, listed)).toBe(0.75)
    expect(stepZoomValue(1.5, 1, listed)).toBe(1.5)
  })

  test('an off-list value snaps to the nearest listed one before stepping', () => {
    expect(stepZoomValue(1.1, 1, listed)).toBe(1.25)
    expect(stepZoomValue(1.1, -1, listed)).toBe(0.9)
    expect(stepZoomValue(1.4, 1, listed)).toBe(1.5)
    expect(stepZoomValue(3, 1, listed)).toBe(1.5)
    expect(stepZoomValue(0.1, -1, listed)).toBe(0.75)
  })

  test('the list wins over a step', () => {
    expect(stepZoomValue(1, 1, { ...listed, step: 0.1 })).toBe(1.25)
  })
})

describe('stepZoomValue with an even step', () => {
  test('answers exactly as the PDF viewer did across its whole range', () => {
    for (let zoom = 0.5; zoom <= 3; zoom += 0.25) {
      expect(stepZoomValue(zoom, 1, pdf)).toBe(legacyPdfStep(zoom, 1))
      expect(stepZoomValue(zoom, -1, pdf)).toBe(legacyPdfStep(zoom, -1))
    }
  })

  test('holds the bounds', () => {
    expect(stepZoomValue(0.5, -1, pdf)).toBe(0.5)
    expect(stepZoomValue(3, 1, pdf)).toBe(3)
  })

  test('an off-grid value lands back on the grid', () => {
    expect(stepZoomValue(1.1, 1, pdf)).toBe(1.25)
    expect(stepZoomValue(1.1, -1, pdf)).toBe(0.75)
  })

  test('a run of steps lands on exact quarters, not float drift', () => {
    let zoom = 0.5
    for (let i = 0; i < 10; i++) zoom = stepZoomValue(zoom, 1, pdf)
    expect(zoom).toBe(3)
  })
})

import { describe, expect, test } from 'vitest'
import { canvasPixelSize, clampZoom, DEFAULT_ZOOM, fitWidthSize, formatPageCount, MAX_ZOOM, MIN_ZOOM, stepZoom } from '../pdf'

describe('clampZoom', () => {
  test('holds the bounds', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(10)).toBe(MAX_ZOOM)
    expect(clampZoom(1)).toBe(1)
  })
})

describe('stepZoom', () => {
  test('moves by one step, in and out', () => {
    expect(stepZoom(DEFAULT_ZOOM, 1)).toBe(1.25)
    expect(stepZoom(DEFAULT_ZOOM, -1)).toBe(0.75)
  })

  test('never crosses the bounds', () => {
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
  })

  test('a run of steps lands on exact quarters, not float drift', () => {
    let zoom = MIN_ZOOM
    for (let i = 0; i < 10; i++) zoom = stepZoom(zoom, 1)
    expect(zoom).toBe(MAX_ZOOM)
  })
})

describe('fitWidthSize', () => {
  test('fits the stage width at zoom 1', () => {
    const size = fitWidthSize({ width: 612, height: 792 }, 300, 1)
    expect(size.width).toBeCloseTo(300)
    expect(size.height).toBeCloseTo(300 * (792 / 612))
    expect(size.scale).toBeCloseTo(300 / 612)
  })

  test('zoom moves off the fit-width baseline', () => {
    const size = fitWidthSize({ width: 612, height: 792 }, 300, 2)
    expect(size.width).toBeCloseTo(600)
    expect(size.height).toBeCloseTo(600 * (792 / 612))
  })

  test('a page with no reported width does not divide by zero', () => {
    const size = fitWidthSize({ width: 0, height: 0 }, 300, 1.5)
    expect(size.scale).toBe(1.5)
  })
})

describe('canvasPixelSize', () => {
  test('scales the CSS box by the device pixel ratio', () => {
    expect(canvasPixelSize(300, 400, 2)).toEqual({ width: 600, height: 800 })
  })

  test('rounds and never reaches zero', () => {
    expect(canvasPixelSize(0.2, 0.2, 1)).toEqual({ width: 1, height: 1 })
  })
})

describe('formatPageCount', () => {
  test('pluralises like a person would say it', () => {
    expect(formatPageCount(1)).toBe('1 page')
    expect(formatPageCount(0)).toBe('0 pages')
    expect(formatPageCount(42)).toBe('42 pages')
  })
})

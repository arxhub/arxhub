import { describe, expect, test } from 'vitest'
import { canvasPixelSize, clampZoom, fitWidthSize, formatPageCount, formatPageOf, MAX_ZOOM, MIN_ZOOM, pageAtOffset, pageOfAnchor } from '../pdf'

describe('clampZoom', () => {
  test('holds the bounds', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(10)).toBe(MAX_ZOOM)
    expect(clampZoom(1)).toBe(1)
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

describe('pageOfAnchor', () => {
  test('reads the page number from the part', () => {
    expect(pageOfAnchor({ part: '3' }, 10)).toBe(3)
  })

  test('a page past the end lands on the last one', () => {
    expect(pageOfAnchor({ part: '12' }, 5)).toBe(5)
  })

  test('no part, a non-number or page zero is no address', () => {
    expect(pageOfAnchor({}, 5)).toBeNull()
    expect(pageOfAnchor({ part: 'Sheet1' }, 5)).toBeNull()
    expect(pageOfAnchor({ part: '0' }, 5)).toBeNull()
    expect(pageOfAnchor({ part: '2.5' }, 5)).toBeNull()
  })

  test('a document with no pages has nowhere to go', () => {
    expect(pageOfAnchor({ part: '1' }, 0)).toBeNull()
  })
})

describe('pageAtOffset', () => {
  test('the page crossing the offset, counting the gap between pages', () => {
    expect(pageAtOffset(0, 100, 16, 5)).toBe(1)
    expect(pageAtOffset(115, 100, 16, 5)).toBe(1)
    expect(pageAtOffset(116, 100, 16, 5)).toBe(2)
    expect(pageAtOffset(350, 100, 16, 5)).toBe(4)
  })

  test('stays inside the document', () => {
    expect(pageAtOffset(-40, 100, 16, 5)).toBe(1)
    expect(pageAtOffset(10_000, 100, 16, 5)).toBe(5)
    expect(pageAtOffset(50, 0, 16, 5)).toBe(1)
    expect(pageAtOffset(50, 100, 16, 0)).toBe(0)
  })
})

describe('formatPageOf', () => {
  test('names the page and the count', () => {
    expect(formatPageOf(3, 12)).toBe('Page 3 of 12')
  })
})

import { describe, expect, test } from 'vitest'
import type { BudgetPlace } from '../model'
import { nearestKnownPlace } from '../places'

const places: BudgetPlace[] = [
  { id: 'unknown', name: 'No position', latitude: null, longitude: null },
  { id: 'far', name: 'Far', latitude: 0, longitude: 0.0015 },
  { id: 'near', name: 'Near', latitude: 0, longitude: 0.0005 },
]

describe('nearestKnownPlace', () => {
  test('returns the nearest positioned place and its geodesic distance within the radius', () => {
    const match = nearestKnownPlace({ latitude: 0, longitude: 0, accuracy: 20 }, places)
    expect(match?.place.id).toBe('near')
    expect(match?.distanceMeters).toBeGreaterThan(55)
    expect(match?.distanceMeters).toBeLessThan(56)
  })

  test('does not auto-match when reported accuracy is wider than the matching radius', () => {
    expect(nearestKnownPlace({ latitude: 0, longitude: 0, accuracy: 101 }, places)).toBeNull()
  })

  test('returns null when every known place is beyond the radius or lacks coordinates', () => {
    expect(nearestKnownPlace({ latitude: 0, longitude: 0, accuracy: 5 }, places, 50)).toBeNull()
    expect(nearestKnownPlace({ latitude: 0, longitude: 0, accuracy: 5 }, [places[0]])).toBeNull()
  })

  test('invalid coordinates, accuracy, or threshold do not produce a match', () => {
    expect(nearestKnownPlace({ latitude: 91, longitude: 0, accuracy: 5 }, places)).toBeNull()
    expect(nearestKnownPlace({ latitude: 0, longitude: 0, accuracy: Number.NaN }, places)).toBeNull()
    expect(nearestKnownPlace({ latitude: 0, longitude: 0, accuracy: 0 }, places, 0)).toBeNull()
  })
})

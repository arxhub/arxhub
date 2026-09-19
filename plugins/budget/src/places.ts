import type { BudgetPlace } from './model'

export interface GeoPoint {
  latitude: number
  longitude: number
  accuracy: number
}

const EARTH_RADIUS_METERS = 6_371_008.8
const radians = (degrees: number) => (degrees * Math.PI) / 180

function validCoordinates(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
}

function haversineDistance(a: Pick<GeoPoint, 'latitude' | 'longitude'>, b: Pick<GeoPoint, 'latitude' | 'longitude'>): number {
  const latitudeDelta = radians(b.latitude - a.latitude)
  const longitudeDelta = radians(b.longitude - a.longitude)
  const latitudeA = radians(a.latitude)
  const latitudeB = radians(b.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

export function nearestKnownPlace(
  point: GeoPoint,
  places: readonly BudgetPlace[],
  maxDistanceMeters = 100,
): { place: BudgetPlace; distanceMeters: number } | null {
  // An accuracy radius larger than the matching radius cannot distinguish this place from its
  // neighbours, so it never makes an automatic match even when the reported centre is close.
  if (
    !validCoordinates(point.latitude, point.longitude) ||
    !Number.isFinite(point.accuracy) ||
    point.accuracy < 0 ||
    !Number.isFinite(maxDistanceMeters) ||
    maxDistanceMeters <= 0 ||
    point.accuracy > maxDistanceMeters
  ) {
    return null
  }

  let nearest: BudgetPlace | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const place of places) {
    const { latitude, longitude } = place
    if (latitude === null || longitude === null || !validCoordinates(latitude, longitude)) continue
    const distance = haversineDistance(point, { latitude, longitude })
    if (distance <= maxDistanceMeters && distance < nearestDistance) {
      nearest = place
      nearestDistance = distance
    }
  }
  return nearest === null ? null : { place: nearest, distanceMeters: nearestDistance }
}

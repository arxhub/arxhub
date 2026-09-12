import { apiBaseUrl } from '@arxhub/core'
import { PUBLISH_NAMESPACE } from './namespace'

export const PUBLIC_ROUTE_PREFIX = '/public'
export const PUBLIC_READ_PATH = `${apiBaseUrl('', PUBLISH_NAMESPACE)}${PUBLIC_ROUTE_PREFIX}`

export function publicUrl(path: string, origin = ''): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `${apiBaseUrl(origin, PUBLISH_NAMESPACE)}${PUBLIC_ROUTE_PREFIX}/${encoded}`
}

// The prefix arxhub's gateway mounts every plugin's HTTP routes under (see the gateway's
// NamespacedGateway). Defined once here so the server and the clients — which target
// `<origin>/api/<namespace>` — can never drift apart.
export const API_PREFIX = '/api'

// Build a client baseUrl for a plugin's namespaced routes. `origin` may be '' (same-origin, e.g. behind
// the dev proxy) or a full origin like `https://hub.example.com`; a trailing slash is trimmed.
export function apiBaseUrl(origin: string, namespace: string): string {
  return `${origin.replace(/\/+$/, '')}${API_PREFIX}/${namespace}`
}

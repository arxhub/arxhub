// The unique route namespace for the sync object store. Single source of truth shared by the server
// (@arxhub/plugin-sync/server manifest.namespace → arxhub mounts it at /api/sync) and the client (HttpSyncRemote
// baseUrl via apiBaseUrl). Browser-safe (no elysia), so both sides import it.
export const SYNC_NAMESPACE = 'sync'

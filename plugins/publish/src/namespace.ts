// The unique route namespace for publishing. Single source of truth shared by the server
// (PublishServerPlugin's manifest.namespace → arxhub mounts it at /api/publish, and PUBLIC_READ_PATH)
// and the client (the object-store upload baseUrl). Browser-safe, so both sides import it.
export const PUBLISH_NAMESPACE = 'publish'

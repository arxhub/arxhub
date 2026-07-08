// The unique route namespace for the HTTP VFS. Single source of truth shared by the server
// (VfsHttpServerPlugin's manifest.namespace → arxhub mounts it at /api/vfs) and the client baseUrl
// (HttpFileSystem via apiBaseUrl). Browser-safe (no elysia), so both sides import it.
export const VFS_NAMESPACE = 'vfs'

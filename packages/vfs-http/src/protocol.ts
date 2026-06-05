// Wire contract shared by the HTTP VFS client (@arxhub/vfs-http) and the
// server route handler (@arxhub/plugin-gateway). Keep this file dependency-free
// so it can be imported safely from both browser and node code.

export interface VfsEntryDto {
  pathname: string
  kind: 'file' | 'dir'
}

export interface ListResponse {
  entries: VfsEntryDto[]
}

export interface ExistsResponse {
  exists: boolean
}

export interface FileHeadResponse {
  size: number
  modifiedAt: number
  createdAt: number
}

export const VFS_DEFAULT_BASE_URL = '/vfs'

export const VFS_ROUTES = {
  list: '/list',
  read: '/read',
  write: '/write',
  delete: '/delete',
  exists: '/exists',
  head: '/head',
} as const

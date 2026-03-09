export interface FileMetadata {
  hash: string
  createdAt: number
  updatedAt: number
  size: number
  [key: string]: unknown
}

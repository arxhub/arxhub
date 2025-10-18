export type FileStatus = {
  pathname: string
  type: 'created' | 'modified' | 'deleted' | 'unmodified'
}

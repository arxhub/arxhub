export interface ChangeSetStore {
  add(pathname: string): Promise<void>

  remove(pathname: string): Promise<void>

  clear(): Promise<void>
}

export type Runtime =
  // | 'Browser'
  // | 'Node'
  // | 'Electron'
  // | 'Deno"
  'Client' | 'Server' | 'Universal'

export function currentRuntime(): Runtime {
  if (typeof window !== 'undefined') {
    return 'Client'
  }
  return 'Server'
}

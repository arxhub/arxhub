export function isNodeError(err: unknown, code: string): boolean {
  return err instanceof Error && 'code' in err && err.code === code
}

export const isError = (err?: unknown): err is Error => {
  return err != null && typeof err === 'object' && 'name' in err && 'message' in err
}

export type GenericError = {
  statusCode: number
  code: string
  title: string
  message: string
}

export const isGenericError = (err: unknown): err is GenericError => {
  return err != null &&
    typeof err === 'object' &&
    'statusCode' in err &&
    'code' in err &&
    'title' in err &&
    'message' in err
}

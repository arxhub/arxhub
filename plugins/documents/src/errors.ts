import { AppError, defineAppError } from '@arxhub/errors'
import { type Static, Type } from '@sinclair/typebox'

// A rename refused for what was typed. Each reason is its own code rather than one ValidationError, so the
// reader's language is chosen where the toast is drawn (the `errors` section of this package's catalog)
// while the body stays the English one logs and tests read.
export const documentNameEmptySchema = defineAppError('DocumentNameEmptyError', 400)
export const documentNameInvalidSchema = Type.Composite([defineAppError('DocumentNameInvalidError', 400), Type.Object({ name: Type.String() })])
export const documentNameSlashSchema = defineAppError('DocumentNameSlashError', 400)
export const documentNameTakenSchema = Type.Composite([defineAppError('DocumentNameTakenError', 400), Type.Object({ name: Type.String() })])

export const documentNameEmpty = () =>
  new AppError<Static<typeof documentNameEmptySchema>>({
    code: 'DocumentNameEmptyError',
    statusCode: 400,
    title: 'No name',
    message: 'A file needs a name',
  })

export const documentNameInvalid = (name: string) =>
  new AppError<Static<typeof documentNameInvalidSchema>>({
    code: 'DocumentNameInvalidError',
    statusCode: 400,
    title: 'Not a name',
    message: `"${name}" is not a name`,
    name,
  })

export const documentNameSlash = () =>
  new AppError<Static<typeof documentNameSlashSchema>>({
    code: 'DocumentNameSlashError',
    statusCode: 400,
    title: 'Not a name',
    message: 'A name cannot hold a slash — rename a file here, move it in the tree',
  })

export const documentNameTaken = (name: string) =>
  new AppError<Static<typeof documentNameTakenSchema>>({
    code: 'DocumentNameTakenError',
    statusCode: 400,
    title: 'Name taken',
    message: `"${name}" is already here`,
    name,
  })

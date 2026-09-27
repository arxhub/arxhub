import { AppError, defineAppError } from '@arxhub/errors'
import { type Static, Type } from '@sinclair/typebox'

// One code per refusal, not the shared IllegalStateError: the person reads these in a toast, and the
// catalog's `errors` section translates by code — one code for eight situations could only say one thing.
// The bodies stay English: they feed the log, and the roundtrip tests match on them.

export const publishStorageUnavailableErrorSchema = defineAppError('PublishStorageUnavailableError', 500)

export const publishStorageUnavailable = () =>
  new AppError<Static<typeof publishStorageUnavailableErrorSchema>>({
    code: 'PublishStorageUnavailableError',
    statusCode: 500,
    title: 'Publication storage unavailable',
    message: 'Publication storage is not available',
  })

export const publishExportUnsavedErrorSchema = defineAppError('PublishExportUnsavedError', 409)

export const publishExportUnsaved = () =>
  new AppError<Static<typeof publishExportUnsavedErrorSchema>>({
    code: 'PublishExportUnsavedError',
    statusCode: 409,
    title: 'Document not saved',
    message: 'Save or recover the document before exporting it',
  })

export const publishUnsavedErrorSchema = defineAppError('PublishUnsavedError', 409)

export const publishUnsaved = () =>
  new AppError<Static<typeof publishUnsavedErrorSchema>>({
    code: 'PublishUnsavedError',
    statusCode: 409,
    title: 'Documents not saved',
    message: 'Save or recover open documents before publishing',
  })

export const publishExportUnsupportedErrorSchema = defineAppError('PublishExportUnsupportedError', 422)

export const publishExportUnsupported = () =>
  new AppError<Static<typeof publishExportUnsupportedErrorSchema>>({
    code: 'PublishExportUnsupportedError',
    statusCode: 422,
    title: 'Cannot export',
    message: 'This document cannot be exported with the installed plugins',
  })

export const publishNotConfiguredErrorSchema = defineAppError('PublishNotConfiguredError', 409)

export const publishNotConfigured = () =>
  new AppError<Static<typeof publishNotConfiguredErrorSchema>>({
    code: 'PublishNotConfiguredError',
    statusCode: 409,
    title: 'Publishing is off',
    message: 'Publishing is not configured — set the server URL and identity in Settings',
  })

// `publication` is the short hash, carried as a field so a translation can name it too.
export const publicationNotInHistoryErrorSchema = Type.Composite([
  defineAppError('PublicationNotInHistoryError', 404),
  Type.Object({ publication: Type.String() }),
])

export const publicationNotInHistory = (publication: string) =>
  new AppError<Static<typeof publicationNotInHistoryErrorSchema>>({
    code: 'PublicationNotInHistoryError',
    statusCode: 404,
    title: 'Publication not found',
    message: `Publication ${publication} is not in the history`,
    publication,
  })

export const publicationGoneErrorSchema = Type.Composite([
  defineAppError('PublicationGoneError', 410),
  Type.Object({ publication: Type.String() }),
])

export const publicationGone = (publication: string) =>
  new AppError<Static<typeof publicationGoneErrorSchema>>({
    code: 'PublicationGoneError',
    statusCode: 410,
    title: 'Publication gone',
    message: `The server no longer holds publication ${publication}`,
    publication,
  })

export const publishHistoryMovedErrorSchema = defineAppError('PublishHistoryMovedError', 409)

export const publishHistoryMoved = () =>
  new AppError<Static<typeof publishHistoryMovedErrorSchema>>({
    code: 'PublishHistoryMovedError',
    statusCode: 409,
    title: 'Publication changed',
    message: 'The publication changed on another device since this history was read — look at it again before rolling back',
  })

export const publishHeadMovedErrorSchema = defineAppError('PublishHeadMovedError', 409)

export const publishHeadMoved = () =>
  new AppError<Static<typeof publishHeadMovedErrorSchema>>({
    code: 'PublishHeadMovedError',
    statusCode: 409,
    title: 'Publication changed',
    message: 'Publish head moved during upload — try publishing again',
  })

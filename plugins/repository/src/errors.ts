import { AppError, defineAppError } from '@arxhub/errors'
import { type Static, Type } from '@sinclair/typebox'

// What the repository refuses while sync is off or racing it. Codes of their own, not IllegalStateError, so
// the surface that shows one can say it in the reader's language (this package's catalog) while the body
// stays the English one logs and tests read.
export const repositoryVersionOfflineSchema = defineAppError('RepositoryVersionOfflineError', 503)
export const repositoryFileOfflineSchema = defineAppError('RepositoryFileOfflineError', 503)
export const repositoryRangeOfflineSchema = defineAppError('RepositoryRangeOfflineError', 503)
export const repositoryStorageOfflineSchema = Type.Composite([
  defineAppError('RepositoryStorageOfflineError', 503),
  Type.Object({ plugin: Type.String() }),
])
export const repositoryStorageChangedSchema = Type.Composite([
  defineAppError('RepositoryStorageChangedError', 409),
  Type.Object({ plugin: Type.String() }),
])

export const repositoryVersionOffline = () =>
  new AppError<Static<typeof repositoryVersionOfflineSchema>>({
    code: 'RepositoryVersionOfflineError',
    statusCode: 503,
    title: 'Version on the server',
    message: 'Connect to the sync server to download this version.',
  })

export const repositoryFileOffline = () =>
  new AppError<Static<typeof repositoryFileOfflineSchema>>({
    code: 'RepositoryFileOfflineError',
    statusCode: 503,
    title: 'File on the server',
    message: 'This file is on the server — turn sync on to open it.',
  })

export const repositoryRangeOffline = () =>
  new AppError<Static<typeof repositoryRangeOfflineSchema>>({
    code: 'RepositoryRangeOfflineError',
    statusCode: 503,
    title: 'Not cached',
    message: 'This part of the file is not cached — turn sync on and retry.',
  })

export const repositoryStorageOffline = (plugin: string) =>
  new AppError<Static<typeof repositoryStorageOfflineSchema>>({
    code: 'RepositoryStorageOfflineError',
    statusCode: 503,
    title: 'Storage on the server',
    message: `Storage for plugin "${plugin}" is on the server — turn sync on before using it.`,
    plugin,
  })

export const repositoryStorageChanged = (plugin: string) =>
  new AppError<Static<typeof repositoryStorageChangedSchema>>({
    code: 'RepositoryStorageChangedError',
    statusCode: 409,
    title: 'Storage changed',
    message: `Storage for plugin "${plugin}" changed while it was being prepared — retry the action.`,
    plugin,
  })

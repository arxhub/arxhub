import { AppError, defineAppError } from '@arxhub/errors'
import type { Static } from '@sinclair/typebox'

// Its own code so the download gate can say it in the reader's language (this package's catalog).
export const syncSettingsUnreadableSchema = defineAppError('SyncSettingsUnreadableError', 500)

export const syncSettingsUnreadable = () =>
  new AppError<Static<typeof syncSettingsUnreadableSchema>>({
    code: 'SyncSettingsUnreadableError',
    statusCode: 500,
    title: 'Sync settings unreadable',
    message: "Could not read this device's sync settings",
  })

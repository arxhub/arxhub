import { AppError, defineAppError } from '@arxhub/errors'
import { type Static, Type } from '@sinclair/typebox'

// Codes of their own, not IllegalStateError / AggregateError, so the toast can say them in the reader's
// language (this package's catalog, `errors` section, or describeImportFailure for the import) while the
// body stays the English one logs and tests read.
export const explorerMoveRefusedSchema = defineAppError('ExplorerMoveRefusedError', 409)
export const explorerNameTakenSchema = Type.Composite([defineAppError('ExplorerNameTakenError', 409), Type.Object({ name: Type.String() })])
export const explorerImportIncompleteSchema = Type.Composite([
  defineAppError('ExplorerImportIncompleteError', 500),
  Type.Object({ failedNames: Type.Array(Type.String()), added: Type.Number() }),
])

export const explorerMoveRefused = () =>
  new AppError<Static<typeof explorerMoveRefusedSchema>>({
    code: 'ExplorerMoveRefusedError',
    statusCode: 409,
    title: 'Cannot move',
    message: 'This item cannot be moved to that folder',
  })

export const explorerNameTaken = (name: string) =>
  new AppError<Static<typeof explorerNameTakenSchema>>({
    code: 'ExplorerNameTakenError',
    statusCode: 409,
    title: 'Name taken',
    message: `"${name}" already exists in the destination folder`,
    name,
  })

function listEnglish(names: readonly string[]): string {
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

export const explorerImportIncomplete = (errors: unknown[], failedNames: readonly string[], added: number) => {
  const failed = `${listEnglish(failedNames)} could not be written`
  return new AppError<Static<typeof explorerImportIncompleteSchema>>(
    {
      code: 'ExplorerImportIncompleteError',
      statusCode: 500,
      title: 'Could not add every file',
      message: added === 0 ? `${failed}.` : `${failed} — ${added} of ${added + failedNames.length} were added.`,
      failedNames: [...failedNames],
      added,
    },
    errors,
  )
}

export function isImportIncomplete(error: unknown): error is AppError<Static<typeof explorerImportIncompleteSchema>> {
  return error instanceof AppError && error.body.code === 'ExplorerImportIncompleteError'
}

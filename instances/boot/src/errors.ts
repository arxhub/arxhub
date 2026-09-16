import { AppError, defineAppError } from '@arxhub/errors'
import type { Static } from '@sinclair/typebox'

// Raised when a composition root's plugin list breaks an invariant the boot sequence stands on — an
// essential plugin nobody registered, a pair registered the wrong way round, one name twice. It is a
// programming error in a composition root, never something the owner did: it must surface loudly,
// before start(), rather than as `extension 'ShellExtension' not found` from inside a lifecycle phase
// three plugins later.
export const bootCompositionErrorSchema = defineAppError('BootCompositionError', 500)

export const bootComposition = (kind: string, problems: readonly string[]) =>
  new AppError<Static<typeof bootCompositionErrorSchema>>({
    code: 'BootCompositionError',
    statusCode: 500,
    title: 'Bad composition',
    message: `The ${kind} plugin list is not bootable: ${problems.join('; ')}`,
  })

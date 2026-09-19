import { hasErrorCode, illegalState, validation } from '@arxhub/errors'
import { compareAndSwap, type VirtualEntry, type VirtualFileSystem } from '@arxhub/vfs'
import { type BudgetData, emptyBudget, parseBudget, serializeBudget, validateBudget } from './model'

export const BUDGET_PATH = 'budget.jsonl'
export const MAX_BUDGET_UPDATE_RETRIES = 10

const CONFLICT_COPY = /^conflict-[0-9a-f]{8}-budget(?:-\d+)?\.jsonl$/
const encoder = new TextEncoder()

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw validation('Invalid budget JSONL: the file is not valid UTF-8')
  }
}

export class BudgetStore {
  readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs
  }

  async load(): Promise<BudgetData> {
    await this.refuseConflictCopies()
    const current = await this.readCurrent()
    return current === null ? emptyBudget() : parseBudget(decode(current))
  }

  async update(change: (current: BudgetData) => BudgetData): Promise<BudgetData> {
    for (let attempt = 0; attempt < MAX_BUDGET_UPDATE_RETRIES; attempt++) {
      await this.refuseConflictCopies()
      const currentBytes = await this.readCurrent()
      const current = currentBytes === null ? emptyBudget() : parseBudget(decode(currentBytes))
      const next = validateBudget(change(current))
      const nextBytes = encoder.encode(serializeBudget(next))
      await this.refuseConflictCopies()
      if (await compareAndSwap(this.vfs, BUDGET_PATH, currentBytes, nextBytes)) return parseBudget(decode(nextBytes))
    }
    throw illegalState(`Could not update ${BUDGET_PATH} after ${MAX_BUDGET_UPDATE_RETRIES} concurrent changes; retry the action`)
  }

  private async readCurrent(): Promise<Uint8Array | null> {
    try {
      return await this.vfs.read(BUDGET_PATH)
    } catch (error) {
      if (hasErrorCode(error, 'FileNotFound')) return null
      throw error
    }
  }

  private async refuseConflictCopies(): Promise<void> {
    let entries: VirtualEntry[]
    try {
      entries = await this.vfs.list('')
    } catch (error) {
      if (hasErrorCode(error, 'FileNotFound')) entries = []
      else throw error
    }
    const conflicts = entries
      .filter((entry) => entry.kind === 'file' && CONFLICT_COPY.test(entry.pathname))
      .map((entry) => entry.pathname)
      .sort()
    if (conflicts.length === 0) return
    throw illegalState(
      `Budget data has unresolved conflict ${conflicts.length === 1 ? 'copy' : 'copies'} (${conflicts.join(', ')}). Resolve or remove ${conflicts.length === 1 ? 'it' : 'them'} before using the budget.`,
    )
  }
}

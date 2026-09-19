import {
  type BudgetAccount,
  type BudgetCategory,
  type BudgetData,
  type BudgetPlace,
  type BudgetTransaction,
  parseBudget,
  serializeBudget,
  validateBudget,
} from './model'

const decoder = new TextDecoder('utf-8', { fatal: true })
const encoder = new TextEncoder()

function same<T>(left: T | undefined, right: T | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function byId<T extends { id: string }>(values: readonly T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]))
}

function mergeRecords<T extends { id: string }>(baseValues: readonly T[], localValues: readonly T[], remoteValues: readonly T[]): T[] | null {
  const base = byId(baseValues)
  const local = byId(localValues)
  const remote = byId(remoteValues)
  const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()])
  const merged: T[] = []

  for (const id of [...ids].sort()) {
    const ancestor = base.get(id)
    const ours = local.get(id)
    const theirs = remote.get(id)
    let value: T | undefined
    if (same(ours, theirs)) value = ours
    else if (same(ours, ancestor)) value = theirs
    else if (same(theirs, ancestor)) value = ours
    else return null
    if (value) merged.push(value)
  }
  return merged
}

function currencyChangeWouldReinterpretTransactions(base: BudgetData | null, merged: BudgetData): boolean {
  if (!base) return false
  const ancestorAccounts = byId(base.accounts)
  const usedAccounts = new Set(merged.transactions.map((transaction) => transaction.accountId))
  return merged.accounts.some((account) => {
    const ancestor = ancestorAccounts.get(account.id)
    return ancestor !== undefined && ancestor.currency !== account.currency && usedAccounts.has(account.id)
  })
}

export function mergeBudgets(baseBytes: Uint8Array | null, localBytes: Uint8Array, remoteBytes: Uint8Array): Uint8Array | null {
  try {
    const base = baseBytes === null ? null : parseBudget(decoder.decode(baseBytes))
    const local = parseBudget(decoder.decode(localBytes))
    const remote = parseBudget(decoder.decode(remoteBytes))
    const accounts = mergeRecords<BudgetAccount>(base?.accounts ?? [], local.accounts, remote.accounts)
    const categories = mergeRecords<BudgetCategory>(base?.categories ?? [], local.categories, remote.categories)
    const places = mergeRecords<BudgetPlace>(base?.places ?? [], local.places, remote.places)
    const transactions = mergeRecords<BudgetTransaction>(base?.transactions ?? [], local.transactions, remote.transactions)
    if (!accounts || !categories || !places || !transactions) return null

    const merged = validateBudget({ version: 2, accounts, categories, places, transactions })
    if (currencyChangeWouldReinterpretTransactions(base, merged)) return null
    return encoder.encode(serializeBudget(merged))
  } catch {
    return null
  }
}

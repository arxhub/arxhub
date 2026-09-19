import { validation } from '@arxhub/errors'
import { calculateItemTotal, validateQuantity } from '../items'
import type { BudgetTransaction } from '../model'
import { parseAmount } from '../money'
import { amountInput } from './budget-ui'

export interface PurchaseItemDraft {
  id: string
  name: string
  quantity: string
  unitPrice: string
  original?: Pick<TransactionItem, 'quantity' | 'unitPrice' | 'total'>
}

type TransactionItem = BudgetTransaction['items'][number]

export function purchaseItemDraft(item: TransactionItem, currency: string): PurchaseItemDraft {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: amountInput(item.unitPrice, currency),
    original: { quantity: item.quantity, unitPrice: item.unitPrice, total: item.total },
  }
}

function lineTotal(draft: PurchaseItemDraft, unitPrice: number, quantity: string): number {
  // Fiscal discounts belong to the saved line total. Opening the form or renaming an item must
  // not turn a discounted receipt back into its undiscounted price times quantity.
  if (draft.original?.unitPrice === unitPrice && draft.original.quantity === quantity) return draft.original.total
  return calculateItemTotal(unitPrice, quantity)
}

export function itemTotal(draft: PurchaseItemDraft, currency: string): number | null {
  try {
    const unitPrice = parseAmount(draft.unitPrice, currency)
    if (unitPrice < 0) return null
    return lineTotal(draft, unitPrice, validateQuantity(draft.quantity.replace(',', '.')))
  } catch {
    return null
  }
}

export function purchaseItems(drafts: PurchaseItemDraft[], currency: string): TransactionItem[] {
  return drafts.map((draft, index) => {
    const name = draft.name.trim()
    if (!name) throw validation(`Enter a name for item ${index + 1}.`)
    const quantity = validateQuantity(draft.quantity.replace(',', '.'))
    const unitPrice = parseAmount(draft.unitPrice, currency)
    if (unitPrice < 0) throw validation(`Unit price for item ${index + 1} cannot be negative.`)
    return { id: draft.id, name, quantity, unitPrice, total: lineTotal(draft, unitPrice, quantity) }
  })
}

export function itemsSubtotal(drafts: PurchaseItemDraft[], currency: string): number | null {
  let subtotal = 0n
  for (const draft of drafts) {
    const total = itemTotal(draft, currency)
    if (total === null) return null
    subtotal += BigInt(total)
    if (subtotal > BigInt(Number.MAX_SAFE_INTEGER)) return null
  }
  return Number(subtotal)
}

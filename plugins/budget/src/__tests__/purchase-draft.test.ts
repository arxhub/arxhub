import { describe, expect, it } from 'vitest'
import { itemsSubtotal, itemTotal, purchaseItemDraft, purchaseItems } from '../ui/purchase-draft'

const discounted = { id: 'apples', name: 'Apples', quantity: '1.25', unitPrice: 10000, total: 12050 }

describe('receipt line drafts', () => {
  it('retains a fiscal discount when opening, renaming and saving an imported item', () => {
    const draft = { ...purchaseItemDraft(discounted, 'RUB'), name: 'Weighted apples' }
    expect(itemTotal(draft, 'RUB')).toBe(12050)
    expect(itemsSubtotal([draft], 'RUB')).toBe(12050)
    expect(purchaseItems([draft], 'RUB')).toEqual([{ ...discounted, name: 'Weighted apples' }])
  })

  it('recalculates only after the quantity or unit price changes', () => {
    const draft = purchaseItemDraft(discounted, 'RUB')
    expect(purchaseItems([{ ...draft, quantity: '1,5' }], 'RUB')[0].total).toBe(15000)
    expect(purchaseItems([{ ...draft, unitPrice: '110' }], 'RUB')[0].total).toBe(13750)
    expect(itemTotal({ ...draft, quantity: '' }, 'RUB')).toBeNull()
  })
})

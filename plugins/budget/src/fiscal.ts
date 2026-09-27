import { budgetError } from './errors'
import { type BudgetItem, type FiscalReceipt, validateFiscalReceipt } from './model'
import { parseAmount } from './money'

export interface FiscalFields {
  fn: string
  fd: string
  fp: string
  issuedAt: string
  amount: string
  operation: string | number
}

export interface ImportedReceipt {
  fiscalReceipt: FiscalReceipt
  merchantName: string
  address: string
  items: BudgetItem[]
}

export interface ReceiptPosition {
  latitude: number
  longitude: number
}
export interface ReceiptLookupOptions {
  signal?: AbortSignal
  position?: ReceiptPosition
}

export function parseFiscalFields(fields: FiscalFields): FiscalReceipt {
  if (!/^[1-4]$/.test(String(fields.operation).trim())) throw budgetError('BudgetInvalidOperation')
  return validateFiscalReceipt({
    fn: fields.fn.trim(),
    fd: fields.fd.trim().replace(/^0+(?=\d)/, ''),
    fp: fields.fp.trim().replace(/^0+(?=\d)/, ''),
    issuedAt: fields.issuedAt.trim(),
    total: parseAmount(fields.amount.trim(), 'RUB'),
    operation: Number(fields.operation),
  })
}

// The QR is a lookup key, not a list of goods. Decoding it works offline and never follows a URL.
export function parseFiscalQr(raw: string): FiscalReceipt {
  let text = raw.trim()
  if (text.length > 4096) throw budgetError('BudgetQrTooLong')
  if (/^https?:\/\//i.test(text)) {
    try {
      text = new URL(text).search.slice(1)
    } catch {
      throw budgetError('BudgetQrInvalidUrl')
    }
  }
  const params = new URLSearchParams(text)
  const value = (key: string): string => {
    const entries = params.getAll(key)
    if (entries.length !== 1 || !entries[0]) throw budgetError('BudgetQrField', { field: key })
    return entries[0]
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(value('t'))
  if (!time) throw budgetError('BudgetQrDateTime')
  const issuedAt = `${time[1]}-${time[2]}-${time[3]}T${time[4]}:${time[5]}${time[6] ? `:${time[6]}` : ''}`
  return parseFiscalFields({ fn: value('fn'), fd: value('i'), fp: value('fp'), issuedAt, amount: value('s'), operation: value('n') })
}

export function fiscalQr(value: FiscalReceipt): string {
  const receipt = validateFiscalReceipt(value)
  const total = BigInt(receipt.total)
  const amount = `${total / 100n}.${String(total % 100n).padStart(2, '0')}`
  return `t=${receipt.issuedAt.replace(/[-:]/g, '')}&s=${amount}&fn=${receipt.fn}&i=${receipt.fd}&fp=${receipt.fp}&n=${receipt.operation}`
}

export function fiscalReceiptKey(receipt: FiscalReceipt): string {
  return `${receipt.fn}:${BigInt(receipt.fd)}:${BigInt(receipt.fp)}`
}

// `field` is the key in the FNS JSON, not a description: it is what the person finds when they open the file,
// and a key is not translated. `null` is the document itself.
function object(value: unknown, field: string | null): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw field === null ? budgetError('BudgetReceiptJsonInvalid') : budgetError('BudgetReceiptFieldInvalid', { field })
  return value as Record<string, unknown>
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw budgetError('BudgetReceiptFieldInvalid', { field })
  return value.trim()
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw budgetError('BudgetReceiptFieldInvalid', { field })
  return value
}

function fiscalNumber(value: unknown, field: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  if (typeof value === 'number') throw budgetError('BudgetReceiptNumberAsString', { field })
  throw budgetError('BudgetReceiptFieldInvalid', { field })
}

function receiptDate(value: unknown, expected?: FiscalReceipt): string {
  if (typeof value !== 'number') return text(value, 'dateTime').replace(/Z$/, '')
  if (!Number.isSafeInteger(value) || value < 0 || value > 253402300799) throw budgetError('BudgetReceiptTimestampInvalid')
  // Some FNS responses carry epoch seconds but no cash-register timezone. The QR states the local
  // calendar time, which accounting must retain even if this device is in another timezone.
  if (!expected) throw budgetError('BudgetReceiptNoTimezone')
  const localAsUtc = Date.parse(`${expected.issuedAt}Z`)
  if (!Number.isFinite(localAsUtc) || Math.abs(localAsUtc - value * 1000) > (14 * 60 * 60 + 60) * 1000) {
    throw budgetError('BudgetReceiptTimestampMismatch')
  }
  return expected.issuedAt
}

// FNS JSON uses minor units in price/sum/totalSum and permits weighted goods. Preserve the line sum:
// discounts and receipt rounding can make it differ from unit price multiplied by quantity.
export function parseReceiptJson(value: unknown, expected?: FiscalReceipt): ImportedReceipt {
  let receipt = object(value, null)
  if ('document' in receipt) receipt = object(receipt.document, 'document')
  if ('receipt' in receipt) receipt = object(receipt.receipt, 'receipt')
  if ('bso' in receipt) receipt = object(receipt.bso, 'bso')
  const rawDate = receiptDate(receipt.dateTime, expected)
  const fiscalReceipt = validateFiscalReceipt({
    fn: fiscalNumber(receipt.fiscalDriveNumber, 'fiscalDriveNumber'),
    fd: fiscalNumber(receipt.fiscalDocumentNumber, 'fiscalDocumentNumber'),
    fp: fiscalNumber(receipt.fiscalSign, 'fiscalSign'),
    issuedAt: rawDate,
    total: integer(receipt.totalSum, 'totalSum'),
    operation: receipt.operationType,
  })
  if (
    expected &&
    (fiscalReceiptKey(fiscalReceipt) !== fiscalReceiptKey(expected) ||
      fiscalReceipt.total !== expected.total ||
      fiscalReceipt.operation !== expected.operation ||
      fiscalReceipt.issuedAt.slice(0, 16) !== expected.issuedAt.slice(0, 16))
  )
    throw budgetError('BudgetReceiptMismatch')
  if (!Array.isArray(receipt.items) || receipt.items.length === 0 || receipt.items.length > 10000) {
    throw budgetError('BudgetReceiptItemCount')
  }
  const items = receipt.items.map((value, index): BudgetItem => {
    const item = object(value, `items[${index}]`)
    const quantity = typeof item.quantity === 'number' ? String(item.quantity) : text(item.quantity, `items[${index}].quantity`)
    if (!/^\d+(?:\.\d{1,6})?$/.test(quantity) || !/[1-9]/.test(quantity)) throw budgetError('BudgetReceiptItemQuantity', { item: index + 1 })
    return {
      id: crypto.randomUUID(),
      name: text(item.name, `items[${index}].name`),
      quantity,
      unitPrice: integer(item.price, `items[${index}].price`),
      total: integer(item.sum, `items[${index}].sum`),
    }
  })
  const itemTotal = items.reduce((sum, item) => sum + BigInt(item.total), 0n)
  if (itemTotal !== BigInt(fiscalReceipt.total)) throw budgetError('BudgetReceiptTotals')
  return {
    fiscalReceipt,
    merchantName:
      typeof receipt.retailPlace === 'string' && receipt.retailPlace.trim() ? receipt.retailPlace.trim() : text(receipt.user, 'user'),
    address:
      typeof receipt.retailPlaceAddress === 'string'
        ? receipt.retailPlaceAddress
        : typeof receipt.retailAddress === 'string'
          ? receipt.retailAddress
          : '',
    items,
  }
}

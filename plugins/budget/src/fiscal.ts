import { validation } from '@arxhub/errors'
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
  if (!/^[1-4]$/.test(String(fields.operation).trim())) throw validation('Invalid fiscal receipt operation.')
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
  if (text.length > 4096) throw validation('The receipt QR is too long.')
  if (/^https?:\/\//i.test(text)) {
    try {
      text = new URL(text).search.slice(1)
    } catch {
      throw validation('Invalid receipt QR URL.')
    }
  }
  const params = new URLSearchParams(text)
  const value = (key: string): string => {
    const entries = params.getAll(key)
    if (entries.length !== 1 || !entries[0]) throw validation(`Receipt QR must contain exactly one ${key} field.`)
    return entries[0]
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(value('t'))
  if (!time) throw validation('Invalid date and time in the receipt QR.')
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

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw validation(`Invalid ${name}.`)
  return value as Record<string, unknown>
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw validation(`Invalid receipt ${name}.`)
  return value.trim()
}

function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw validation(`Invalid receipt ${name}.`)
  return value
}

function fiscalNumber(value: unknown, name: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  throw validation(`Invalid receipt ${name}; large identifiers must be stored as strings.`)
}

function receiptDate(value: unknown, expected?: FiscalReceipt): string {
  if (typeof value !== 'number') return text(value, 'date and time').replace(/Z$/, '')
  if (!Number.isSafeInteger(value) || value < 0 || value > 253402300799) throw validation('Invalid receipt timestamp.')
  // Some FNS responses carry epoch seconds but no cash-register timezone. The QR states the local
  // calendar time, which accounting must retain even if this device is in another timezone.
  if (!expected) throw validation('This receipt JSON has no local timezone. Read its QR or enter the fiscal details before importing it.')
  const localAsUtc = Date.parse(`${expected.issuedAt}Z`)
  if (!Number.isFinite(localAsUtc) || Math.abs(localAsUtc - value * 1000) > (14 * 60 * 60 + 60) * 1000) {
    throw validation('The receipt timestamp does not match the scanned fiscal details.')
  }
  return expected.issuedAt
}

// FNS JSON uses minor units in price/sum/totalSum and permits weighted goods. Preserve the line sum:
// discounts and receipt rounding can make it differ from unit price multiplied by quantity.
export function parseReceiptJson(value: unknown, expected?: FiscalReceipt): ImportedReceipt {
  let receipt = object(value, 'receipt JSON')
  if ('document' in receipt) receipt = object(receipt.document, 'receipt document')
  if ('receipt' in receipt) receipt = object(receipt.receipt, 'receipt')
  if ('bso' in receipt) receipt = object(receipt.bso, 'receipt')
  const rawDate = receiptDate(receipt.dateTime, expected)
  const fiscalReceipt = validateFiscalReceipt({
    fn: fiscalNumber(receipt.fiscalDriveNumber, 'FN'),
    fd: fiscalNumber(receipt.fiscalDocumentNumber, 'FD'),
    fp: fiscalNumber(receipt.fiscalSign, 'FP'),
    issuedAt: rawDate,
    total: integer(receipt.totalSum, 'total'),
    operation: receipt.operationType,
  })
  if (
    expected &&
    (fiscalReceiptKey(fiscalReceipt) !== fiscalReceiptKey(expected) ||
      fiscalReceipt.total !== expected.total ||
      fiscalReceipt.operation !== expected.operation ||
      fiscalReceipt.issuedAt.slice(0, 16) !== expected.issuedAt.slice(0, 16))
  )
    throw validation('The returned receipt does not match the scanned fiscal details.')
  if (!Array.isArray(receipt.items) || receipt.items.length === 0 || receipt.items.length > 10000) {
    throw validation('The receipt must contain between 1 and 10000 items.')
  }
  const items = receipt.items.map((value, index): BudgetItem => {
    const item = object(value, `receipt item ${index + 1}`)
    const quantity = typeof item.quantity === 'number' ? String(item.quantity) : text(item.quantity, 'quantity')
    if (!/^\d+(?:\.\d{1,6})?$/.test(quantity) || !/[1-9]/.test(quantity)) throw validation(`Invalid quantity in receipt item ${index + 1}.`)
    return {
      id: crypto.randomUUID(),
      name: text(item.name, `item ${index + 1} name`),
      quantity,
      unitPrice: integer(item.price, `item ${index + 1} price`),
      total: integer(item.sum, `item ${index + 1} sum`),
    }
  })
  const itemTotal = items.reduce((sum, item) => sum + BigInt(item.total), 0n)
  if (itemTotal !== BigInt(fiscalReceipt.total)) throw validation('Receipt item totals do not match its fiscal total.')
  return {
    fiscalReceipt,
    merchantName:
      typeof receipt.retailPlace === 'string' && receipt.retailPlace.trim() ? receipt.retailPlace.trim() : text(receipt.user, 'merchant'),
    address:
      typeof receipt.retailPlaceAddress === 'string'
        ? receipt.retailPlaceAddress
        : typeof receipt.retailAddress === 'string'
          ? receipt.retailAddress
          : '',
    items,
  }
}

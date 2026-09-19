import { describe, expect, it } from 'vitest'
import { fiscalQr, parseFiscalFields, parseFiscalQr, parseReceiptJson } from '../fiscal'

const qr = 't=20260919T121530&s=120.50&fn=9282440300123456&i=125&fp=1186123459&n=1'
const fiscal = {
  fn: '9282440300123456',
  fd: '125',
  fp: '1186123459',
  issuedAt: '2026-09-19T12:15:30',
  total: 12050,
  operation: 1,
}
const receipt = () => ({
  fiscalDriveNumber: fiscal.fn,
  fiscalDocumentNumber: 125,
  fiscalSign: 1186123459,
  dateTime: fiscal.issuedAt,
  totalSum: fiscal.total,
  operationType: 1,
  user: 'Example grocery',
  retailAddress: 'Example street 1',
  items: [{ name: 'Weighted apples', price: 10000, quantity: 1.25, sum: 12050 }],
})

describe('fiscal QR and manual input', () => {
  it('round trips fiscal details without rounding money or converting local time', () => {
    expect(parseFiscalQr(qr)).toEqual(fiscal)
    expect(fiscalQr(parseFiscalQr(qr))).toBe(qr)
    expect(parseFiscalQr(qr.replace('121530', '1215')).issuedAt).toBe('2026-09-19T12:15')
  })

  it('accepts the same details entered by hand and normalizes numeric identifiers', () => {
    expect(
      parseFiscalFields({ fn: fiscal.fn, fd: '00125', fp: fiscal.fp, issuedAt: fiscal.issuedAt, amount: '120,50', operation: '1' }),
    ).toEqual(fiscal)
  })

  it.each([
    `${qr}&fn=9282440300123456`,
    qr.replace('&fp=1186123459', ''),
    qr.replace('20260919', '20260230'),
    qr.replace('121530', '251530'),
    qr.replace('120.50', '1.999'),
    qr.replace('1186123459', '4294967296'),
    qr.replace('9282440300123456', 'not-a-number'),
    qr.replace('n=1', 'n=9'),
  ])('refuses incomplete, contradictory or invalid fiscal details', (raw) => {
    expect(() => parseFiscalQr(raw)).toThrow()
  })

  it('extracts fiscal query fields from a URL without visiting it', () => {
    expect(parseFiscalQr(`https://example.test/receipt?${qr}`)).toEqual(fiscal)
  })
})

describe('receipt details', () => {
  it('keeps the QR local date for an FNS epoch timestamp without guessing the cash-register timezone', () => {
    const expected = parseFiscalQr(qr)
    const timestamp = Date.parse('2026-09-19T09:15:30Z') / 1000
    expect(parseReceiptJson({ ...receipt(), dateTime: timestamp }, expected).fiscalReceipt.issuedAt).toBe(fiscal.issuedAt)
    expect(() => parseReceiptJson({ ...receipt(), dateTime: timestamp })).toThrow('Read its QR')
    expect(() => parseReceiptJson({ ...receipt(), dateTime: timestamp - 2 * 86400 }, expected)).toThrow('timestamp')
  })

  it('accepts the FNS document envelope and preserves weighted goods and discounted line totals', () => {
    const result = parseReceiptJson({ document: { receipt: receipt() } }, parseFiscalQr(qr))
    expect(result.fiscalReceipt).toEqual(fiscal)
    expect(result.merchantName).toBe('Example grocery')
    expect(result.items[0]).toMatchObject({ name: 'Weighted apples', quantity: '1.25', unitPrice: 10000, total: 12050 })
  })

  it('refuses another receipt returned for the scanned key', () => {
    expect(() => parseReceiptJson({ ...receipt(), fiscalDocumentNumber: 126 }, parseFiscalQr(qr))).toThrow('does not match')
  })

  it('matches numeric identifiers with leading zeroes in imported JSONL', () => {
    const expected = { ...parseFiscalQr(qr), fd: '00125', fp: '01186123459' }
    expect(parseReceiptJson(receipt(), expected).fiscalReceipt.fd).toBe('125')
  })

  it('refuses a partial or corrupted item list instead of silently changing the purchase total', () => {
    expect(() => parseReceiptJson({ ...receipt(), items: [{ name: 'Apple', price: 100, quantity: 1, sum: 100 }] })).toThrow('totals')
    expect(() => parseReceiptJson({ ...receipt(), items: [] })).toThrow('items')
    expect(() => parseReceiptJson({ ...receipt(), fiscalDriveNumber: 9282440300123456 })).toThrow('identifiers')
  })
})

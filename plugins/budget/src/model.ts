import { validation } from '@arxhub/errors'
import { validateQuantity } from './items'
import { currencyDigits } from './money'

export type TransactionKind = 'income' | 'expense'

export interface BudgetAccount {
  id: string
  name: string
  currency: string
  openingBalance: number
}

export interface BudgetCategory {
  id: string
  name: string
  kind: TransactionKind
}

export interface BudgetPlace {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
}

export interface BudgetItem {
  id: string
  name: string
  quantity: string
  unitPrice: number
  total: number
}

export interface BudgetAttachment {
  id: string
  path: string
  name: string
  mimeType: string
  size: number
}

export interface FiscalReceipt {
  fn: string
  fd: string
  fp: string
  issuedAt: string
  total: number
  operation: 1 | 2 | 3 | 4
}

export interface BudgetTransaction {
  id: string
  accountId: string
  categoryId: string
  kind: TransactionKind
  amount: number
  date: string
  note: string
  placeId: string | null
  items: BudgetItem[]
  attachments: BudgetAttachment[]
  fiscalReceipt: FiscalReceipt | null
}

export interface BudgetData {
  version: 2
  accounts: BudgetAccount[]
  categories: BudgetCategory[]
  places: BudgetPlace[]
  transactions: BudgetTransaction[]
}

export interface MonthlyTotal {
  currency: string
  income: number
  expense: number
  balance: number
}

export interface CategoryTotal {
  categoryId: string
  currency: string
  amount: number
}

export const SUPPORTED_FISCAL_OPERATION_KINDS = { 1: 'expense', 2: 'income' } as const satisfies Record<1 | 2, TransactionKind>
export const MAX_BUDGET_ATTACHMENT_SIZE = 10 * 1024 * 1024
export const MAX_FISCAL_TOTAL = 281_474_976_710_655

type JsonObject = Record<string, unknown>
type BudgetFileVersion = 1 | 2

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH = /^(\d{4})-(\d{2})$/
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const RECEIPT_PATH = /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/
const MIME_BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function fail(context: string, message: string): never {
  throw validation(`Invalid ${context}: ${message}`)
}

function objectWithKeys(value: unknown, keys: readonly string[], context: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(context, 'expected an object')
  const object = value as JsonObject
  const allowed = new Set(keys)
  for (const key of Object.keys(object)) if (!allowed.has(key)) fail(context, `unknown field "${key}"`)
  for (const key of keys) if (!Object.hasOwn(object, key)) fail(context, `missing field "${key}"`)
  return object
}

function stringField(value: unknown, field: string, context: string): string {
  if (typeof value !== 'string') fail(context, `field "${field}" must be a string`)
  return value
}

function identifier(value: unknown, field: string, context: string): string {
  const id = stringField(value, field, context)
  if (id === '' || /\s/u.test(id)) fail(context, `field "${field}" must be a non-empty identifier without whitespace`)
  return id
}

function displayName(value: unknown, field: string, context: string): string {
  const name = stringField(value, field, context)
  if (name.trim() === '') fail(context, `field "${field}" must not be empty`)
  return name
}

function safeInteger(value: unknown, field: string, context: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(context, `field "${field}" must be a safe integer`)
  return value
}

function positiveMoney(value: unknown, field: string, context: string): number {
  const amount = safeInteger(value, field, context)
  if (amount <= 0) fail(context, `field "${field}" must be positive`)
  return amount
}

function nonNegativeMoney(value: unknown, field: string, context: string): number {
  const amount = safeInteger(value, field, context)
  if (amount < 0) fail(context, `field "${field}" must not be negative`)
  return amount
}

function transactionKind(value: unknown, context: string): TransactionKind {
  if (value !== 'income' && value !== 'expense') fail(context, 'field "kind" must be "income" or "expense"')
  return value
}

function validCurrency(value: unknown, context: string): string {
  const code = stringField(value, 'currency', context)
  try {
    currencyDigits(code)
  } catch {
    fail(context, 'field "currency" must be a three-letter uppercase currency supported by Intl')
  }
  return code
}

function validDateString(date: string, context: string, field = 'date'): string {
  const match = DATE.exec(date)
  if (!match) fail(context, `field "${field}" must be a real local calendar date YYYY-MM-DD`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    fail(context, `field "${field}" must be a real local calendar date YYYY-MM-DD`)
  }
  return date
}

function validDate(value: unknown, context: string): string {
  return validDateString(stringField(value, 'date', context), context)
}

function validMonth(value: string, context: string): string {
  const match = MONTH.exec(value)
  if (!match || Number(match[1]) === 0 || Number(match[2]) < 1 || Number(match[2]) > 12) fail(context, 'expected a real calendar month YYYY-MM')
  return value
}

function validLocalDateTime(value: unknown, context: string): string {
  const dateTime = stringField(value, 'issuedAt', context)
  const match = LOCAL_DATE_TIME.exec(dateTime)
  if (!match) fail(context, 'field "issuedAt" must be a local date and time YYYY-MM-DDTHH:mm[:ss] without a timezone')
  validDateString(match[1], context, 'issuedAt')
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || (match[4] !== undefined && Number(match[4]) > 59)) {
    fail(context, 'field "issuedAt" must be a real local time')
  }
  return dateTime
}

function accountFrom(value: unknown, context: string, tagged: boolean): BudgetAccount {
  const object = objectWithKeys(
    value,
    tagged ? ['type', 'id', 'name', 'currency', 'openingBalance'] : ['id', 'name', 'currency', 'openingBalance'],
    context,
  )
  if (tagged && object.type !== 'account') fail(context, 'expected an account record')
  return {
    id: identifier(object.id, 'id', context),
    name: displayName(object.name, 'name', context),
    currency: validCurrency(object.currency, context),
    openingBalance: safeInteger(object.openingBalance, 'openingBalance', context),
  }
}

function categoryFrom(value: unknown, context: string, tagged: boolean): BudgetCategory {
  const object = objectWithKeys(value, tagged ? ['type', 'id', 'name', 'kind'] : ['id', 'name', 'kind'], context)
  if (tagged && object.type !== 'category') fail(context, 'expected a category record')
  return {
    id: identifier(object.id, 'id', context),
    name: displayName(object.name, 'name', context),
    kind: transactionKind(object.kind, context),
  }
}

function coordinate(value: unknown, field: 'latitude' | 'longitude', context: string): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(context, `field "${field}" must be finite or null`)
  const limit = field === 'latitude' ? 90 : 180
  if (value < -limit || value > limit) fail(context, `field "${field}" must be between ${-limit} and ${limit}`)
  return value
}

function placeFrom(value: unknown, context: string, tagged: boolean): BudgetPlace {
  const object = objectWithKeys(
    value,
    tagged ? ['type', 'id', 'name', 'latitude', 'longitude'] : ['id', 'name', 'latitude', 'longitude'],
    context,
  )
  if (tagged && object.type !== 'place') fail(context, 'expected a place record')
  const latitude = coordinate(object.latitude, 'latitude', context)
  const longitude = coordinate(object.longitude, 'longitude', context)
  if ((latitude === null) !== (longitude === null)) fail(context, 'latitude and longitude must either both be coordinates or both be null')
  return { id: identifier(object.id, 'id', context), name: displayName(object.name, 'name', context), latitude, longitude }
}

function itemFrom(value: unknown, context: string): BudgetItem {
  const object = objectWithKeys(value, ['id', 'name', 'quantity', 'unitPrice', 'total'], context)
  const quantity = stringField(object.quantity, 'quantity', context)
  try {
    validateQuantity(quantity)
  } catch {
    fail(context, 'field "quantity" must be a decimal greater than zero with at most 6 fractional digits')
  }
  return {
    id: identifier(object.id, 'id', context),
    name: displayName(object.name, 'name', context),
    quantity,
    unitPrice: nonNegativeMoney(object.unitPrice, 'unitPrice', context),
    total: nonNegativeMoney(object.total, 'total', context),
  }
}

function attachmentFrom(value: unknown, context: string): BudgetAttachment {
  const object = objectWithKeys(value, ['id', 'path', 'name', 'mimeType', 'size'], context)
  const path = stringField(object.path, 'path', context)
  const match = RECEIPT_PATH.exec(path)
  if (!match) fail(context, 'field "path" must be receipts/<uuid>.<jpg|png|webp>')
  const mimeType = stringField(object.mimeType, 'mimeType', context)
  if (mimeType !== MIME_BY_EXTENSION[match[1]]) fail(context, `field "mimeType" does not match the .${match[1]} receipt path`)
  const size = safeInteger(object.size, 'size', context)
  if (size <= 0 || size > MAX_BUDGET_ATTACHMENT_SIZE) fail(context, `field "size" must be between 1 and ${MAX_BUDGET_ATTACHMENT_SIZE} bytes`)
  return { id: identifier(object.id, 'id', context), path, name: displayName(object.name, 'name', context), mimeType, size }
}

export function validateBudgetAttachment(value: unknown): BudgetAttachment {
  return attachmentFrom(value, 'budget attachment')
}

function fiscalDecimal(value: unknown, field: 'fd' | 'fp', context: string): string {
  const text = stringField(value, field, context)
  if (!/^\d+$/.test(text) || BigInt(text) === 0n || BigInt(text) > 4_294_967_295n) {
    fail(context, `field "${field}" must be a positive decimal up to 4294967295`)
  }
  return text
}

function fiscalReceiptFrom(value: unknown, context: string): FiscalReceipt {
  const object = objectWithKeys(value, ['fn', 'fd', 'fp', 'issuedAt', 'total', 'operation'], context)
  const fn = stringField(object.fn, 'fn', context)
  if (!/^\d{16}$/.test(fn)) fail(context, 'field "fn" must contain exactly 16 decimal digits')
  const operation = object.operation
  if (operation !== 1 && operation !== 2 && operation !== 3 && operation !== 4) fail(context, 'field "operation" must be 1, 2, 3, or 4')
  const total = positiveMoney(object.total, 'total', context)
  if (total > MAX_FISCAL_TOTAL) fail(context, `field "total" must not exceed ${MAX_FISCAL_TOTAL}`)
  return {
    fn,
    fd: fiscalDecimal(object.fd, 'fd', context),
    fp: fiscalDecimal(object.fp, 'fp', context),
    issuedAt: validLocalDateTime(object.issuedAt, context),
    total,
    operation,
  }
}

export function validateFiscalReceipt(value: unknown): FiscalReceipt {
  return fiscalReceiptFrom(value, 'fiscal receipt')
}

function uniqueById<T extends { id: string }>(values: T[], label: string, context: string): Map<string, T> {
  const result = new Map<string, T>()
  for (const value of values) {
    if (result.has(value.id)) fail(context, `duplicate ${label} id "${value.id}"`)
    result.set(value.id, value)
  }
  return result
}

function transactionFrom(value: unknown, context: string, tagged: boolean, version: BudgetFileVersion): BudgetTransaction {
  const common = ['id', 'accountId', 'categoryId', 'kind', 'amount', 'date', 'note']
  const fields = version === 1 ? common : [...common, 'placeId', 'items', 'attachments', 'fiscalReceipt']
  const object = objectWithKeys(value, tagged ? ['type', ...fields] : fields, context)
  if (tagged && object.type !== 'transaction') fail(context, 'expected a transaction record')
  let items: BudgetItem[] = []
  let attachments: BudgetAttachment[] = []
  if (version === 2) {
    if (!Array.isArray(object.items)) fail(context, 'field "items" must be an array')
    if (!Array.isArray(object.attachments)) fail(context, 'field "attachments" must be an array')
    items = object.items.map((item, index) => itemFrom(item, `${context} item ${index + 1}`))
    attachments = object.attachments.map((item, index) => attachmentFrom(item, `${context} attachment ${index + 1}`))
    uniqueById(items, 'item', context)
    uniqueById(attachments, 'attachment', context)
  }
  return {
    id: identifier(object.id, 'id', context),
    accountId: identifier(object.accountId, 'accountId', context),
    categoryId: identifier(object.categoryId, 'categoryId', context),
    kind: transactionKind(object.kind, context),
    amount: positiveMoney(object.amount, 'amount', context),
    date: validDate(object.date, context),
    note: stringField(object.note, 'note', context),
    placeId: version === 1 ? null : object.placeId === null ? null : identifier(object.placeId, 'placeId', context),
    items,
    attachments,
    fiscalReceipt: version === 1 || object.fiscalReceipt === null ? null : fiscalReceiptFrom(object.fiscalReceipt, `${context} fiscal receipt`),
  }
}

function validateReferences(data: BudgetData, context: string | ((transaction: BudgetTransaction) => string)): void {
  const accounts = uniqueById(data.accounts, 'account', 'budget data')
  const categories = uniqueById(data.categories, 'category', 'budget data')
  const places = uniqueById(data.places, 'place', 'budget data')
  uniqueById(data.transactions, 'transaction', 'budget data')
  const fiscalReceipts = new Map<string, string>()
  for (const transaction of data.transactions) {
    const transactionContext = typeof context === 'string' ? context : context(transaction)
    const account = accounts.get(transaction.accountId)
    if (!account) fail(transactionContext, `transaction "${transaction.id}" references missing account "${transaction.accountId}"`)
    const category = categories.get(transaction.categoryId)
    if (!category) fail(transactionContext, `transaction "${transaction.id}" references missing category "${transaction.categoryId}"`)
    if (category.kind !== transaction.kind)
      fail(transactionContext, `transaction "${transaction.id}" kind does not match category "${transaction.categoryId}"`)
    if (transaction.placeId !== null && !places.has(transaction.placeId)) {
      fail(transactionContext, `transaction "${transaction.id}" references missing place "${transaction.placeId}"`)
    }
    const receipt = transaction.fiscalReceipt
    if (receipt === null) continue
    if (account.currency !== 'RUB') fail(transactionContext, `fiscal transaction "${transaction.id}" must use a RUB account`)
    if (receipt.total !== transaction.amount) fail(transactionContext, `fiscal total does not match transaction "${transaction.id}" amount`)
    if (receipt.operation === 1 && transaction.kind !== SUPPORTED_FISCAL_OPERATION_KINDS[1])
      fail(transactionContext, 'fiscal operation 1 must be an expense')
    if (receipt.operation === 2 && transaction.kind !== SUPPORTED_FISCAL_OPERATION_KINDS[2])
      fail(transactionContext, 'fiscal operation 2 must be income')
    // FD and FP are decimal identifiers. Leading zeroes from imported data do not make a second receipt.
    const key = `${receipt.fn}\0${BigInt(receipt.fd)}\0${BigInt(receipt.fp)}`
    const duplicate = fiscalReceipts.get(key)
    if (duplicate !== undefined) fail(transactionContext, `fiscal receipt is already attached to transaction "${duplicate}"`)
    fiscalReceipts.set(key, transaction.id)
  }
}

function checkedAdd(left: number, right: number, context: string): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) throw validation(`${context} exceeds the safe integer range`, 'Money overflow')
  return result
}

function safeBigInt(value: bigint, context: string): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw validation(`${context} exceeds the safe integer range`, 'Money overflow')
  }
  return Number(value)
}

function validateAggregateSafety(data: BudgetData, context: string | ((transaction: BudgetTransaction) => string)): void {
  const accounts = new Map(data.accounts.map((account) => [account.id, account]))
  const balances = new Map(data.accounts.map((account) => [account.id, BigInt(account.openingBalance)]))
  const monthlyIncome = new Map<string, number>()
  const monthlyExpense = new Map<string, number>()
  const categoryAmounts = new Map<string, number>()
  for (const transaction of data.transactions) {
    const transactionContext = typeof context === 'string' ? context : context(transaction)
    const account = accounts.get(transaction.accountId)
    if (!account) continue
    let itemTotal = 0
    for (const item of transaction.items) itemTotal = checkedAdd(itemTotal, item.total, `${transactionContext} item total`)
    const balance = balances.get(account.id) ?? 0n
    balances.set(account.id, balance + (transaction.kind === 'income' ? BigInt(transaction.amount) : -BigInt(transaction.amount)))
    const month = transaction.date.slice(0, 7)
    const monthlyKey = `${month}\0${account.currency}`
    const target = transaction.kind === 'income' ? monthlyIncome : monthlyExpense
    target.set(monthlyKey, checkedAdd(target.get(monthlyKey) ?? 0, transaction.amount, `${transactionContext} monthly total`))
    checkedAdd(monthlyIncome.get(monthlyKey) ?? 0, -(monthlyExpense.get(monthlyKey) ?? 0), `${transactionContext} monthly balance`)
    const categoryKey = `${month}\0${transaction.categoryId}\0${account.currency}`
    categoryAmounts.set(
      categoryKey,
      checkedAdd(categoryAmounts.get(categoryKey) ?? 0, transaction.amount, `${transactionContext} category total`),
    )
  }
  for (const [accountId, balance] of balances)
    safeBigInt(balance, `${typeof context === 'string' ? context : 'budget data'} account "${accountId}" balance`)
}

export function emptyBudget(): BudgetData {
  return { version: 2, accounts: [], categories: [], places: [], transactions: [] }
}

export function validateBudget(value: unknown): BudgetData {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('budget data', 'expected an object')
  const version = (value as JsonObject).version
  if (version !== 1 && version !== 2) fail('budget data', 'unsupported version')
  const object = objectWithKeys(
    value,
    version === 1 ? ['version', 'accounts', 'categories', 'transactions'] : ['version', 'accounts', 'categories', 'places', 'transactions'],
    'budget data',
  )
  if (!Array.isArray(object.accounts)) fail('budget data', 'field "accounts" must be an array')
  if (!Array.isArray(object.categories)) fail('budget data', 'field "categories" must be an array')
  if (version === 2 && !Array.isArray(object.places)) fail('budget data', 'field "places" must be an array')
  if (!Array.isArray(object.transactions)) fail('budget data', 'field "transactions" must be an array')
  const data: BudgetData = {
    version: 2,
    accounts: object.accounts.map((item, index) => accountFrom(item, `budget account ${index + 1}`, false)),
    categories: object.categories.map((item, index) => categoryFrom(item, `budget category ${index + 1}`, false)),
    places: version === 1 ? [] : (object.places as unknown[]).map((item, index) => placeFrom(item, `budget place ${index + 1}`, false)),
    transactions: object.transactions.map((item, index) => transactionFrom(item, `budget transaction ${index + 1}`, false, version)),
  }
  validateReferences(data, 'budget data')
  validateAggregateSafety(data, 'budget data')
  return data
}

function parseLine(line: string, lineNumber: number): JsonObject {
  const context = `budget JSONL at line ${lineNumber}`
  if (line === '') fail(context, 'blank lines are not allowed')
  try {
    const value: unknown = JSON.parse(line)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(context, 'expected an object')
    return value as JsonObject
  } catch (error) {
    if (error instanceof SyntaxError) fail(context, 'invalid JSON')
    throw error
  }
}

export function parseBudget(text: string): BudgetData {
  if (text === '') fail('budget JSONL', 'the file is empty')
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  if (lines.length === 0) fail('budget JSONL', 'the file is empty')
  const normalized = lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
  const header = objectWithKeys(parseLine(normalized[0], 1), ['type', 'version'], 'budget JSONL at line 1')
  if (header.type !== 'budget') fail('budget JSONL at line 1', 'expected a budget header')
  if (header.version !== 1 && header.version !== 2) fail('budget JSONL at line 1', 'unsupported version')
  const version = header.version
  const data = emptyBudget()
  const lineByTransaction = new Map<string, number>()
  const ids: Record<'account' | 'category' | 'place', Set<string>> = { account: new Set(), category: new Set(), place: new Set() }
  for (let index = 1; index < normalized.length; index++) {
    const lineNumber = index + 1
    const object = parseLine(normalized[index], lineNumber)
    const context = `budget JSONL at line ${lineNumber}`
    if (object.type === 'account') {
      const account = accountFrom(object, context, true)
      if (ids.account.has(account.id)) fail(context, `duplicate account id "${account.id}"`)
      ids.account.add(account.id)
      data.accounts.push(account)
    } else if (object.type === 'category') {
      const category = categoryFrom(object, context, true)
      if (ids.category.has(category.id)) fail(context, `duplicate category id "${category.id}"`)
      ids.category.add(category.id)
      data.categories.push(category)
    } else if (object.type === 'place' && version === 2) {
      const place = placeFrom(object, context, true)
      if (ids.place.has(place.id)) fail(context, `duplicate place id "${place.id}"`)
      ids.place.add(place.id)
      data.places.push(place)
    } else if (object.type === 'transaction') {
      const transaction = transactionFrom(object, context, true, version)
      if (lineByTransaction.has(transaction.id)) fail(context, `duplicate transaction id "${transaction.id}"`)
      lineByTransaction.set(transaction.id, lineNumber)
      data.transactions.push(transaction)
    } else {
      fail(context, `unknown record type "${String(object.type)}" for budget version ${version}`)
    }
  }
  const transactionContext = (transaction: BudgetTransaction) => `budget JSONL at line ${lineByTransaction.get(transaction.id)}`
  validateReferences(data, transactionContext)
  validateAggregateSafety(data, transactionContext)
  return data
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function serializeBudget(value: BudgetData): string {
  const data = validateBudget(value)
  const lines = [JSON.stringify({ type: 'budget', version: 2 })]
  for (const account of [...data.accounts].sort(byId)) lines.push(JSON.stringify({ type: 'account', ...account }))
  for (const category of [...data.categories].sort(byId)) lines.push(JSON.stringify({ type: 'category', ...category }))
  for (const place of [...data.places].sort(byId)) lines.push(JSON.stringify({ type: 'place', ...place }))
  for (const transaction of [...data.transactions].sort(byId)) lines.push(JSON.stringify({ type: 'transaction', ...transaction }))
  return `${lines.join('\n')}\n`
}

export function accountBalance(value: BudgetData, accountId: string): number {
  const data = validateBudget(value)
  const account = data.accounts.find((item) => item.id === accountId)
  if (!account) throw validation(`Unknown budget account "${accountId}"`)
  let balance = BigInt(account.openingBalance)
  for (const transaction of data.transactions) {
    if (transaction.accountId !== accountId) continue
    balance += transaction.kind === 'income' ? BigInt(transaction.amount) : -BigInt(transaction.amount)
  }
  return safeBigInt(balance, `Balance for account "${accountId}"`)
}

export function monthlyTotals(value: BudgetData, month: string): MonthlyTotal[] {
  const data = validateBudget(value)
  validMonth(month, 'budget month')
  const accounts = new Map(data.accounts.map((account) => [account.id, account]))
  const totals = new Map<string, MonthlyTotal>()
  for (const transaction of data.transactions) {
    if (!transaction.date.startsWith(`${month}-`)) continue
    const account = accounts.get(transaction.accountId)
    if (!account) continue
    const total = totals.get(account.currency) ?? { currency: account.currency, income: 0, expense: 0, balance: 0 }
    if (transaction.kind === 'income') total.income = checkedAdd(total.income, transaction.amount, `${account.currency} monthly income`)
    else total.expense = checkedAdd(total.expense, transaction.amount, `${account.currency} monthly expense`)
    total.balance = checkedAdd(total.income, -total.expense, `${account.currency} monthly balance`)
    totals.set(account.currency, total)
  }
  return [...totals.values()].sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0))
}

export function categoryTotals(value: BudgetData, month: string): CategoryTotal[] {
  const data = validateBudget(value)
  validMonth(month, 'budget month')
  const accounts = new Map(data.accounts.map((account) => [account.id, account]))
  const totals = new Map<string, CategoryTotal>()
  for (const transaction of data.transactions) {
    if (!transaction.date.startsWith(`${month}-`)) continue
    const currency = accounts.get(transaction.accountId)?.currency
    if (!currency) continue
    const key = `${transaction.categoryId}\0${currency}`
    const total = totals.get(key) ?? { categoryId: transaction.categoryId, currency, amount: 0 }
    total.amount = checkedAdd(total.amount, transaction.amount, `Total for category "${transaction.categoryId}" in ${currency}`)
    totals.set(key, total)
  }
  return [...totals.values()].sort((a, b) =>
    a.categoryId === b.categoryId ? (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0) : a.categoryId < b.categoryId ? -1 : 1,
  )
}

import { address, type Patch, pointOf, rangePoints, type Sheet } from './model'
import { anchoredAddress, mapReferences, quoteSheet } from './references'
import type { Workbook } from './workbook'

export type Scalar = string | number | boolean
export interface CellError {
  error: string
}
export type CellValue = Scalar | CellError
type Value = CellValue | CellValue[]
type Expr =
  | { kind: 'error'; value: string }
  | { kind: 'literal'; value: Scalar }
  | { kind: 'ref'; key: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'unary'; op: string; arg: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] }
interface Token {
  text: string
  start: number
  end: number
}
const error = (name: string): CellError => ({ error: name })
export function isCellError(value: Value): value is CellError {
  return !Array.isArray(value) && typeof value === 'object'
}
export function displayValue(value: CellValue): string {
  if (isCellError(value)) return value.error
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(Number(value.toPrecision(12)))
  return value
}

function tokens(raw: string): Token[] | null {
  if (raw.length > 4096) return null
  const result: Token[] = []
  const pattern =
    /\s+|'(?:[^']|'')+'|"(?:[^"]|"")*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|\$?[A-Za-z_][A-Za-z_0-9]*\$?\d*|#[A-Z0-9/?!]+|<=|>=|<>|[+\-*/^%&=<>():,;!]/gy
  let position = 0
  while (position < raw.length) {
    pattern.lastIndex = position
    const match = pattern.exec(raw)
    if (!match) return null
    position = pattern.lastIndex
    if (match[0].trim()) result.push({ text: match[0], start: match.index, end: position })
    if (result.length > 1024) return null
  }
  return result
}

const precedence: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 }

function parse(raw: string): Expr | null {
  const list = tokens(raw)
  if (!list) return null
  let index = 0,
    depth = 0
  const peek = () => list[index]?.text ?? ''
  const take = () => list[index++]?.text ?? ''
  const expression = (min = 0): Expr | null => {
    if (++depth > 64) return null
    let left: Expr | null = null
    let token = take()
    if (peek() === '!') {
      take()
      const name = token.startsWith("'") ? token.slice(1, -1).replaceAll("''", "'") : token
      token = `${name}!${take()}`
    }
    if (token === '+' || token === '-') {
      const arg = expression(5)
      if (arg) left = { kind: 'unary', op: token, arg }
    } else if (token === '(') {
      left = expression()
      if (take() !== ')') return null
    } else if (token.startsWith('"')) left = { kind: 'literal', value: token.slice(1, -1).replaceAll('""', '"') }
    else if (/^(\d|\.)/.test(token)) left = { kind: 'literal', value: Number(token) }
    else if (/^(TRUE|FALSE)$/i.test(token) && peek() !== '(') left = { kind: 'literal', value: token.toUpperCase() === 'TRUE' }
    else if (peek() === '(') {
      take()
      const args: Expr[] = []
      if (peek() !== ')') {
        do {
          const arg = expression()
          if (!arg) return null
          args.push(arg)
          if (peek() !== ',' && peek() !== ';') break
          take()
        } while (args.length < 256)
      }
      if (take() !== ')') return null
      left = { kind: 'call', name: token.toUpperCase(), args }
    } else if (token.startsWith('#')) left = { kind: 'error', value: token }
    else if (token.includes('!') || pointOf(token) || /^\$?[A-Z]+\$?\d+$/i.test(token) || token === '#REF!') {
      left = { kind: 'ref', key: token }
      if (peek() === ':') {
        take()
        left = { kind: 'range', from: token, to: take() }
      }
    } else if (token) left = { kind: 'call', name: token.toUpperCase(), args: [] }
    if (!left) return null
    while (peek() === '%') {
      take()
      left = { kind: 'unary', op: '%', arg: left }
    }
    while (peek() && (precedence[peek()] ?? -1) >= min) {
      const op = take(),
        level = precedence[op]
      const right = expression(level + (op === '^' ? 0 : 1))
      if (!right) return null
      left = { kind: 'binary', op, left, right }
    }
    depth--
    return left
  }
  const result = expression()
  return index === list.length ? result : null
}

function number(value: Value): number | CellError {
  if (Array.isArray(value)) return error('#VALUE!')
  if (isCellError(value)) return value
  if (value === '') return 0
  const result = Number(value)
  return Number.isFinite(result) ? result : error('#VALUE!')
}

function finite(value: number): CellValue {
  return Number.isFinite(value) ? value : error('#NUM!')
}

export class FormulaEngine {
  private sheets = new Map<string, Sheet>()
  private names = new Map<string, string>()
  private current: string
  evaluations = 0
  private cache = new Map<string, CellValue>()
  private parsed = new Map<string, Expr | null>()
  private dependencies = new Map<string, Set<string>>()
  private dependents = new Map<string, Set<string>>()
  private active = new Set<string>()
  private budget = 0
  private edgeCount = 0

  constructor(sheet: Sheet, book?: Workbook) {
    this.current = book?.active ?? 'sheet1'
    for (const entry of book?.sheets ?? [{ id: 'sheet1', name: 'Sheet1', sheet }]) {
      this.sheets.set(entry.id, { ...entry.sheet, cells: { ...entry.sheet.cells } })
      this.names.set(entry.name.toLowerCase(), entry.id)
    }
  }

  private target(raw: string, context = this.current): { key: string; sheet: Sheet; point: NonNullable<ReturnType<typeof pointOf>> } | null {
    const split = raw.lastIndexOf('!')
    const id =
      split < 0
        ? context.startsWith('\u0001')
          ? context.slice(1)
          : context
        : raw.startsWith('\u0001')
          ? raw.slice(1, split)
          : (this.names.get(raw.slice(0, split).toLowerCase()) ?? '')
    const point = pointOf(split < 0 ? raw : raw.slice(split + 1)),
      sheet = this.sheets.get(id)
    return point && sheet ? { key: `\u0001${id}!${address(point)}`, sheet, point } : null
  }

  update(patch: Patch, rows?: number, columns?: number, id = this.current): void {
    const sheet = this.sheets.get(id)
    if (!sheet) return
    rows ??= sheet.rows
    columns ??= sheet.columns
    patch = Object.fromEntries(
      Object.entries(patch)
        .filter(([key, value]) => (sheet.cells[key] ?? '') !== value)
        .map(([key, value]) => [`\u0001${id}!${key}`, value]),
    )
    const pending = Object.keys(patch),
      dirty = new Set(pending)
    for (let i = 0; i < pending.length; i++) {
      for (const key of this.dependents.get(pending[i]) ?? [])
        if (!dirty.has(key)) {
          dirty.add(key)
          pending.push(key)
        }
    }
    for (const key of dirty) this.cache.delete(key)
    for (const [key, value] of Object.entries(patch)) {
      this.clearDependencies(key)
      const local = key.slice(key.lastIndexOf('!') + 1)
      if (value) sheet.cells[local] = value
      else delete sheet.cells[local]
      this.parsed.delete(key)
    }
    if (rows !== sheet.rows || columns !== sheet.columns) this.resetCache()
    sheet.rows = rows
    sheet.columns = columns
  }

  values(keys: string[], id = this.current): Record<string, CellValue> {
    const result: Record<string, CellValue> = {}
    this.budget = 500_000
    for (const key of keys) result[key] = this.cell(`\u0001${id}!${key}`)
    return result
  }

  private resetCache(): void {
    this.cache.clear()
    this.dependencies.clear()
    this.dependents.clear()
    this.edgeCount = 0
  }

  private clearDependencies(key: string): void {
    for (const dependency of this.dependencies.get(key) ?? []) {
      const back = this.dependents.get(dependency)
      back?.delete(key)
      if (!back?.size) this.dependents.delete(dependency)
      this.edgeCount--
    }
    this.dependencies.delete(key)
  }

  private cell(key: string): CellValue {
    if (--this.budget < 0 || this.active.size > 128) return error('#LIMIT!')
    const target = this.target(key)
    if (!target || target.point.row >= target.sheet.rows || target.point.column >= target.sheet.columns) return error('#REF!')
    key = target.key
    if (this.active.has(key)) return error('#CYCLE!')
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached
    const context = key.slice(0, key.lastIndexOf('!'))
    const raw = target.sheet.cells[address(target.point)] ?? ''
    if (!raw.startsWith('=')) {
      if (raw.startsWith("'")) return raw.slice(1)
      if (/^(TRUE|FALSE)$/i.test(raw)) return raw.toUpperCase() === 'TRUE'
      if (raw.trim() && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())) return finite(Number(raw))
      return raw
    }
    if (!this.parsed.has(key)) this.parsed.set(key, parse(raw.slice(1)))
    const expr = this.parsed.get(key)
    if (!expr) return error('#ERROR!')
    this.evaluations++
    this.clearDependencies(key)
    const deps = new Set<string>()
    this.dependencies.set(key, deps)
    const read = (target: string): CellValue => {
      const reference = this.target(target, context)
      if (!reference) return error('#REF!')
      const canonical = reference.key
      if (!deps.has(canonical)) {
        if (this.edgeCount >= 500_000) return error('#LIMIT!')
        deps.add(canonical)
        this.edgeCount++
        let back = this.dependents.get(canonical)
        if (!back) {
          back = new Set()
          this.dependents.set(canonical, back)
        }
        back.add(key)
      }
      return this.cell(canonical)
    }
    this.active.add(key)
    let value: Value
    try {
      value = this.evaluate(expr, read, context)
    } finally {
      this.active.delete(key)
    }
    const scalar = Array.isArray(value) ? error('#VALUE!') : value
    // A partial dependency walk must never make an error permanent after its missing input changes.
    if (!isCellError(scalar) || !['#LIMIT!', '#CYCLE!'].includes(scalar.error)) this.cache.set(key, scalar)
    return scalar
  }

  private evaluate(expr: Expr, read: (key: string) => CellValue, context: string): Value {
    if (--this.budget < 0) return error('#LIMIT!')
    if (expr.kind === 'error') return error(expr.value)
    if (expr.kind === 'literal') return typeof expr.value === 'number' ? finite(expr.value) : expr.value
    if (expr.kind === 'ref') return read(expr.key)
    if (expr.kind === 'range') {
      const source = this.target(expr.from, context)
      const finish = this.target(expr.to, source?.key.split('!')[0] ?? context)
      if (!source || !finish || source.sheet !== finish.sheet) return error('#REF!')
      const from = source.point,
        to = finish.point,
        sheet = source.sheet
      if (from.row >= sheet.rows || to.row >= sheet.rows || from.column >= sheet.columns || to.column >= sheet.columns) return error('#REF!')
      if ((Math.abs(from.row - to.row) + 1) * (Math.abs(from.column - to.column) + 1) > 50_000) return error('#LIMIT!')
      const id = source.key.slice(0, source.key.lastIndexOf('!'))
      return rangePoints(from, to).map((point) => read(`${id}!${address(point)}`))
    }
    if (expr.kind === 'unary') {
      const value = number(this.evaluate(expr.arg, read, context))
      return isCellError(value) ? value : finite(expr.op === '-' ? -value : expr.op === '%' ? value / 100 : value)
    }
    if (expr.kind === 'binary') {
      const left = this.evaluate(expr.left, read, context),
        right = this.evaluate(expr.right, read, context)
      if (isCellError(left)) return left
      if (isCellError(right)) return right
      if (Array.isArray(left) || Array.isArray(right)) return error('#VALUE!')
      if (expr.op === '&') {
        const text = displayValue(left) + displayValue(right)
        return text.length > 4096 ? error('#LIMIT!') : text
      }
      if (['=', '<>', '<', '>', '<=', '>='].includes(expr.op)) {
        const a = typeof left === 'string' ? left.toLowerCase() : left
        const b = typeof right === 'string' ? right.toLowerCase() : right
        switch (expr.op) {
          case '=':
            return a === b
          case '<>':
            return a !== b
          case '<':
            return a < b
          case '>':
            return a > b
          case '<=':
            return a <= b
          default:
            return a >= b
        }
      }
      const a = number(left),
        b = number(right)
      if (isCellError(a)) return a
      if (isCellError(b)) return b
      switch (expr.op) {
        case '+':
          return finite(a + b)
        case '-':
          return finite(a - b)
        case '*':
          return finite(a * b)
        case '/':
          return b === 0 ? error('#DIV/0!') : finite(a / b)
        case '^':
          return finite(a ** b)
        default:
          return error('#ERROR!')
      }
    }
    if (expr.name === 'IF') {
      if (expr.args.length < 2 || expr.args.length > 3) return error('#VALUE!')
      const condition = this.evaluate(expr.args[0], read, context)
      if (isCellError(condition)) return condition
      if (Array.isArray(condition)) return error('#VALUE!')
      const branch = expr.args[condition ? 1 : 2]
      return branch ? this.evaluate(branch, read, context) : false
    }
    if (!['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ABS', 'ROUND'].includes(expr.name)) return error('#NAME?')
    const values = expr.args.flatMap((arg) => this.evaluate(arg, read, context))
    const failure = values.find(isCellError)
    if (failure) return failure
    if (expr.name === 'ABS' || expr.name === 'ROUND') {
      if (values.length !== (expr.name === 'ABS' ? 1 : 2)) return error('#VALUE!')
      const value = number(values[0]),
        digits = number(values[1] ?? 0)
      if (isCellError(value)) return value
      if (isCellError(digits)) return digits
      if (expr.name === 'ABS') return Math.abs(value)
      if (!Number.isInteger(digits) || Math.abs(digits) > 100) return error('#NUM!')
      const factor = 10 ** digits
      return finite((Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * factor)) / factor)
    }
    const numbers = values.filter((value): value is number => typeof value === 'number')
    switch (expr.name) {
      case 'COUNT':
        return numbers.length
      case 'SUM':
        return finite(numbers.reduce((a, b) => a + b, 0))
      case 'AVERAGE':
        return numbers.length ? finite(numbers.reduce((a, b) => a + b, 0) / numbers.length) : error('#DIV/0!')
      case 'MIN':
        return numbers.length ? numbers.reduce((a, b) => Math.min(a, b)) : 0
      default:
        return numbers.length ? numbers.reduce((a, b) => Math.max(a, b)) : 0
    }
  }
}

export function shiftFormula(raw: string, rows: number, columns: number): string {
  return mapReferences(raw, (ref) => {
    const shift = (text: string) => {
      const old = pointOf(text)
      if (!old) return '#REF!'
      const point = { row: old.row + (/\$\d+$/.test(text) ? 0 : rows), column: old.column + (text.startsWith('$') ? 0 : columns) }
      return point.row >= 0 && point.column >= 0 && pointOf(address(point)) ? anchoredAddress(text, point) : '#REF!'
    }
    return (ref.sheet ? quoteSheet(ref.sheet) : '') + shift(ref.from) + (ref.to ? `:${shift(ref.to)}` : '')
  })
}

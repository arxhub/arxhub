import { canInsertReference } from './reference-input'
export const FUNCTIONS = [
  { name: 'SUM', signature: 'SUM(number1, number2, …)', description: 'Total numbers or ranges' },
  { name: 'AVERAGE', signature: 'AVERAGE(number1, number2, …)', description: 'Arithmetic mean' },
  { name: 'MIN', signature: 'MIN(number1, number2, …)', description: 'Smallest number' },
  { name: 'MAX', signature: 'MAX(number1, number2, …)', description: 'Largest number' },
  { name: 'COUNT', signature: 'COUNT(value1, value2, …)', description: 'Count numeric values' },
  { name: 'IF', signature: 'IF(condition, value_if_true, value_if_false)', description: 'Choose a value' },
  { name: 'ABS', signature: 'ABS(number)', description: 'Absolute value' },
  { name: 'ROUND', signature: 'ROUND(number, digits)', description: 'Round to decimal places' },
]
export function formulaHelp(text: string, caret: number) {
  if (!canInsertReference(text, caret, caret)) return { suggestions: [], prefix: '', argument: 0, fn: undefined }
  const prefix = /(?:^|[=+*/^%&<>,;(\s-])([A-Za-z_]+)$/.exec(text.slice(0, caret))?.[1] ?? ''
  const suggestions = prefix ? FUNCTIONS.filter((fn) => fn.name.startsWith(prefix.toUpperCase())) : []
  const stack: { name: string; argument: number }[] = []
  const tokens = /"(?:[^"]|"")*"|'(?:[^']|'')*'|([A-Za-z_]+)\s*\(|[(),;]/g
  for (const token of text.slice(0, caret).matchAll(tokens)) {
    if (token[0].startsWith('"') || token[0].startsWith("'")) continue
    if (token[0].endsWith('(')) stack.push({ name: token[1]?.toUpperCase() ?? '', argument: 1 })
    else if (token[0] === ')') stack.pop()
    else if (stack.length) stack[stack.length - 1].argument++
  }
  const call = stack.at(-1)
  return { suggestions, prefix, argument: call?.argument ?? 0, fn: FUNCTIONS.find((fn) => fn.name === call?.name) }
}

// Splits a SQL text into its top-level statements. A semicolon separates only when it is not inside a
// string literal, a quoted identifier, a dollar-quoted body or a comment — otherwise a perfectly good
// `WHERE title = 'a;b'` would read as two statements and be refused (FR-237). An unterminated quote
// or comment swallows the rest of the text rather than splitting it: a half-written query is one
// statement the DBMS will complain about, not two.
export function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let start = 0
  let i = 0

  const flush = (end: number): void => {
    const text = sql.slice(start, end).trim()
    if (text.length > 0) statements.push(text)
    start = end + 1
  }

  while (i < sql.length) {
    const ch = sql[i]

    if (ch === '-' && sql[i + 1] === '-') {
      const newline = sql.indexOf('\n', i)
      i = newline === -1 ? sql.length : newline + 1
      continue
    }

    if (ch === '/' && sql[i + 1] === '*') {
      i = skipBlockComment(sql, i)
      continue
    }

    if (ch === "'") {
      // E'...' switches on backslash escapes, so the quote that ends the literal is found differently.
      i = skipQuoted(sql, i, "'", isEscapeStringStart(sql, i))
      continue
    }

    if (ch === '"') {
      i = skipQuoted(sql, i, '"', false)
      continue
    }

    if (ch === '$') {
      const afterTag = skipDollarQuoted(sql, i)
      if (afterTag !== i) {
        i = afterTag
        continue
      }
    }

    if (ch === ';') {
      flush(i)
      i += 1
      continue
    }

    i += 1
  }

  flush(sql.length)
  return statements
}

// Block comments nest in Postgres, so `/* /* */ */` is one comment and not a comment plus garbage.
function skipBlockComment(sql: string, from: number): number {
  let depth = 0
  let i = from
  while (i < sql.length) {
    if (sql[i] === '/' && sql[i + 1] === '*') {
      depth += 1
      i += 2
      continue
    }
    if (sql[i] === '*' && sql[i + 1] === '/') {
      depth -= 1
      i += 2
      if (depth === 0) return i
      continue
    }
    i += 1
  }
  return sql.length
}

function skipQuoted(sql: string, from: number, quote: string, backslashEscapes: boolean): number {
  let i = from + 1
  while (i < sql.length) {
    const ch = sql[i]
    if (backslashEscapes && ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) {
      // A doubled quote is the quote itself, not the end of the literal.
      if (sql[i + 1] === quote) {
        i += 2
        continue
      }
      return i + 1
    }
    i += 1
  }
  return sql.length
}

// `$$…$$` and `$tag$…$tag$` open a dollar-quoted body; `$1` is a bind parameter and opens nothing.
// Returns `from` unchanged when there is no tag here, so the caller can carry on.
function skipDollarQuoted(sql: string, from: number): number {
  const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(from))
  if (tag == null) return from
  const closing = sql.indexOf(tag[0], from + tag[0].length)
  return closing === -1 ? sql.length : closing + tag[0].length
}

// True when the quote at `from` belongs to an E'' escape string. The `E` must be a word of its own —
// in `name = 'x'` the `e` of `name` is not an escape-string prefix.
function isEscapeStringStart(sql: string, from: number): boolean {
  const prefix = sql[from - 1]
  if (prefix !== 'e' && prefix !== 'E') return false
  const before = sql[from - 2]
  return before === undefined || !/[A-Za-z0-9_$]/.test(before)
}

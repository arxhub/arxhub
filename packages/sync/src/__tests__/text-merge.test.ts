import { describe, expect, test } from 'vitest'
import { mergeText } from '../merge/text-merge'

const lines = (...items: string[]) => `${items.join('\n')}\n`

describe('mergeText', () => {
  test('edits to different lines on each side both land, with nothing to report', () => {
    const base = lines('a', 'b', 'c', 'd', 'e')
    const local = lines('a (local)', 'b', 'c', 'd', 'e')
    const remote = lines('a', 'b', 'c', 'd', 'e (remote)')
    expect(mergeText(base, local, remote)).toEqual({ merged: lines('a (local)', 'b', 'c', 'd', 'e (remote)'), conflicts: 0 })
  })

  test('a side that did not change takes the other side as is', () => {
    const base = lines('a', 'b')
    expect(mergeText(base, base, lines('a', 'B'))).toEqual({ merged: lines('a', 'B'), conflicts: 0 })
    expect(mergeText(base, lines('A', 'b'), base)).toEqual({ merged: lines('A', 'b'), conflicts: 0 })
  })

  test('both sides making the same change is not a conflict', () => {
    const base = lines('a', 'b', 'c')
    const both = lines('a', 'X', 'c')
    expect(mergeText(base, both, both)).toEqual({ merged: both, conflicts: 0 })
  })

  test('the same line changed differently is one git-style conflict region', () => {
    const base = lines('a', 'b', 'c')
    const { merged, conflicts } = mergeText(base, lines('a', 'local b', 'c'), lines('a', 'remote b', 'c'))
    expect(conflicts).toBe(1)
    expect(merged).toBe(lines('a', '<<<<<<< local', 'local b', '=======', 'remote b', '>>>>>>> remote', 'c'))
  })

  // diff3 has no context line between two touching hunks to anchor them on, so — exactly as in git — edits
  // to adjacent lines are one conflict, not two clean edits. Pinned so the behaviour is a decision, not a surprise.
  test('edits to adjacent lines are a conflict, as in git', () => {
    const base = lines('a', 'b', 'c', 'd')
    const { merged, conflicts } = mergeText(base, lines('a', 'B', 'c', 'd'), lines('a', 'b', 'C', 'd'))
    expect(conflicts).toBe(1)
    expect(merged).toBe(lines('a', '<<<<<<< local', 'B', 'c', '=======', 'b', 'C', '>>>>>>> remote', 'd'))
  })

  test('two separate disagreements are two regions, and clean hunks between them still merge', () => {
    const base = lines('a', 'b', 'c', 'd', 'e', 'f', 'g')
    const local = lines('a', 'L1', 'c', 'd', 'e', 'L2', 'g')
    const remote = lines('a', 'R1', 'c', 'd (remote)', 'e', 'R2', 'g')
    const { merged, conflicts } = mergeText(base, local, remote)
    expect(conflicts).toBe(2)
    expect(merged).toBe(
      lines(
        'a',
        '<<<<<<< local',
        'L1',
        '=======',
        'R1',
        '>>>>>>> remote',
        'c',
        'd (remote)',
        'e',
        '<<<<<<< local',
        'L2',
        '=======',
        'R2',
        '>>>>>>> remote',
        'g',
      ),
    )
  })

  test('a line deleted on one side and an edit elsewhere on the other both land', () => {
    const base = lines('a', 'b', 'c', 'd')
    expect(mergeText(base, lines('a', 'c', 'd'), lines('a', 'b', 'c', 'D'))).toEqual({ merged: lines('a', 'c', 'D'), conflicts: 0 })
  })

  test('the same line deleted on both sides is deleted once', () => {
    const base = lines('a', 'b', 'c')
    expect(mergeText(base, lines('a', 'c'), lines('a', 'c'))).toEqual({ merged: lines('a', 'c'), conflicts: 0 })
  })

  test('a line deleted on one side and edited on the other is a conflict with an empty local half', () => {
    const base = lines('a', 'b', 'c')
    const { merged, conflicts } = mergeText(base, lines('a', 'c'), lines('a', 'B', 'c'))
    expect(conflicts).toBe(1)
    expect(merged).toBe(lines('a', '<<<<<<< local', '=======', 'B', '>>>>>>> remote', 'c'))
  })

  test('an empty base with content on both sides is one conflict holding everything', () => {
    const { merged, conflicts } = mergeText('', lines('a', 'b'), lines('c', 'd'))
    expect(conflicts).toBe(1)
    expect(merged).toBe(lines('<<<<<<< local', 'a', 'b', '=======', 'c', 'd', '>>>>>>> remote'))
  })

  test('an empty base and one empty side take the other side whole', () => {
    expect(mergeText('', lines('a', 'b'), '')).toEqual({ merged: lines('a', 'b'), conflicts: 0 })
    expect(mergeText('', '', lines('a', 'b'))).toEqual({ merged: lines('a', 'b'), conflicts: 0 })
  })

  test('a null base is read as an empty one', () => {
    expect(mergeText(null, lines('a'), lines('a'))).toEqual({ merged: lines('a'), conflicts: 0 })
  })

  test('everything deleted on both sides is an empty file', () => {
    expect(mergeText(lines('a', 'b'), '', '')).toEqual({ merged: '', conflicts: 0 })
  })

  describe('trailing newline', () => {
    test('is kept when every side has it', () => {
      expect(mergeText(lines('a'), lines('a', 'b'), lines('a')).merged).toBe(lines('a', 'b'))
    })

    test('stays absent when no side has it', () => {
      expect(mergeText('a\nb\nc', 'A\nb\nc', 'a\nb\nC').merged).toBe('A\nb\nC')
    })

    test('follows the side that changed it', () => {
      expect(mergeText(lines('a', 'b'), 'a\nb', lines('A', 'b')).merged).toBe('A\nb')
      expect(mergeText('a\nb', 'a\nb', lines('a', 'B')).merged).toBe(lines('a', 'B'))
    })

    test('an empty last line is content, not a second trailing newline', () => {
      expect(mergeText('a\n\n', 'a\n\n', 'a\n\n').merged).toBe('a\n\n')
    })
  })

  describe('CRLF', () => {
    const crlf = (...items: string[]) => `${items.join('\r\n')}\r\n`

    test('passes through a clean merge untouched', () => {
      const merged = mergeText(crlf('a', 'b', 'c'), crlf('A', 'b', 'c'), crlf('a', 'b', 'C')).merged
      expect(merged).toBe(crlf('A', 'b', 'C'))
    })

    test('conflict markers take the file’s own line ending', () => {
      const { merged, conflicts } = mergeText(crlf('a', 'b', 'c'), crlf('a', 'L', 'c'), crlf('a', 'R', 'c'))
      expect(conflicts).toBe(1)
      expect(merged).toBe(crlf('a', '<<<<<<< local', 'L', '=======', 'R', '>>>>>>> remote', 'c'))
    })
  })
})

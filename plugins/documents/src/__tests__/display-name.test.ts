import { describe, expect, test } from 'vitest'
import { displayNameOf } from '../display-name'

const claimsArx = (path: string) => path.toLowerCase().endsWith('.arx')

describe('what is shown', () => {
  test('hides the extension when the setting is on and a viewer claims it', () => {
    expect(displayNameOf('Contract.arx', true, claimsArx)).toMatchObject({ text: 'Contract', hiddenExtension: '.arx' })
  })

  test('shows the full name when the setting is off, even for a claimed extension', () => {
    expect(displayNameOf('Contract.arx', false, claimsArx)).toMatchObject({ text: 'Contract.arx', hiddenExtension: '' })
  })

  test('shows the full name when nothing claims the extension', () => {
    expect(displayNameOf('report.pdf', true, claimsArx)).toMatchObject({ text: 'report.pdf', hiddenExtension: '' })
  })

  test('a name with no extension hides nothing', () => {
    expect(displayNameOf('README', true, claimsArx)).toMatchObject({ text: 'README', hiddenExtension: '' })
  })

  test('works on a nested path — only the basename is shown', () => {
    expect(displayNameOf('vault/notes/Contract.arx', true, claimsArx).text).toBe('Contract')
  })

  // OR-03: "known" is never a hand-written list — a plugin that stops claiming an extension (switched
  // off, or simply never registered) must un-hide it, and this is what proves the rule does not cache an
  // answer of its own once a caller's own delegate changes its mind.
  test('is dynamic: the same path answers differently once the delegate no longer claims it', () => {
    let claims = true
    const delegate = () => claims
    expect(displayNameOf('Contract.arx', true, delegate).hiddenExtension).toBe('.arx')
    claims = false
    expect(displayNameOf('Contract.arx', true, delegate).hiddenExtension).toBe('')
  })
})

describe('what a rename writes', () => {
  // The subtle part (OR-03): a rename field only ever holds the visible stem, so committing it must not
  // silently drop the extension that was never on screen to begin with.
  test('glues the hidden extension back onto whatever the owner typed', () => {
    expect(displayNameOf('Contract.arx', true, claimsArx).fullName('Invoice')).toBe('Invoice.arx')
  })

  test('renaming to the same visible stem still keeps the hidden extension', () => {
    expect(displayNameOf('Contract.arx', true, claimsArx).fullName('Contract')).toBe('Contract.arx')
  })

  test('leaves the edited name untouched when nothing was hidden', () => {
    expect(displayNameOf('report.pdf', true, claimsArx).fullName('report.pdf')).toBe('report.pdf')
  })

  // Changing an extension is extremely rare, so it has no control of its own anywhere: switching the
  // setting off is the road, and then the field edits the whole name, extension and all.
  test('with the setting off the field owns the extension too', () => {
    expect(displayNameOf('Contract.arx', false, claimsArx).fullName('Contract.md')).toBe('Contract.md')
  })

  test('does not special-case an extension the owner typed themselves — it is glued on regardless', () => {
    // Extensions are hidden or shown as a whole; a stem that happens to contain a dot is just a stem.
    expect(displayNameOf('Contract.arx', true, claimsArx).fullName('Contract.v2')).toBe('Contract.v2.arx')
  })
})

import { Type } from '@sinclair/typebox'
import { describe, expect, it } from 'vitest'
import { buildFields, controlFor, groupFields, hasBlockingErrors, signatureFor, validate } from '../ui/field-model'

describe('controlFor', () => {
  it('reads a boolean as a switch', () => {
    expect(controlFor(Type.Boolean())).toBe('switch')
  })

  it('reads a bounded, aimable number as a slider and an open one as a stepper', () => {
    expect(controlFor(Type.Integer({ minimum: 1, maximum: 16 }))).toBe('slider')
    expect(controlFor(Type.Integer({ minimum: 0 }))).toBe('stepper')
    // A port is bounded but far too wide to drag to an exact value.
    expect(controlFor(Type.Integer({ minimum: 1, maximum: 65535 }))).toBe('stepper')
  })

  it('splits enums on how many options there are', () => {
    expect(controlFor(Type.Union([Type.Literal('a'), Type.Literal('b'), Type.Literal('c')]))).toBe('segmented')
    expect(controlFor(Type.Union([Type.Literal('a'), Type.Literal('b'), Type.Literal('c'), Type.Literal('d')]))).toBe('radio-list')
  })

  it('reads a bare enum keyword the same as a union of literals', () => {
    expect(controlFor({ type: 'string', enum: ['a', 'b'] })).toBe('segmented')
  })

  it('reads arrays as chips, or as checkboxes when the items are an enum', () => {
    expect(controlFor(Type.Array(Type.String()))).toBe('chips')
    expect(controlFor(Type.Array(Type.Union([Type.Literal('md'), Type.Literal('png')])))).toBe('checkbox-list')
  })

  it('reads a long or explicitly multiline string as a textarea', () => {
    expect(controlFor(Type.String({ maxLength: 80 }))).toBe('text')
    expect(controlFor(Type.String({ maxLength: 400 }))).toBe('textarea')
    expect(controlFor({ type: 'string', multiline: true })).toBe('textarea')
  })

  it('reads writeOnly as a secret and readOnly as a value, not a dead input', () => {
    expect(controlFor(Type.String({ writeOnly: true }))).toBe('secret')
    expect(controlFor(Type.String({ readOnly: true }))).toBe('readonly')
  })

  it('lets readOnly win over every other signal', () => {
    expect(controlFor(Type.Integer({ minimum: 1, maximum: 4, readOnly: true }))).toBe('readonly')
  })
})

describe('signatureFor', () => {
  it('names the path, the type, and the constraint that narrows the value', () => {
    expect(signatureFor('server.url', Type.String({ format: 'uri' }), [])).toBe('server.url · string · format: uri')
    expect(signatureFor('build.concurrency', Type.Integer({ minimum: 1, maximum: 16 }), [])).toBe('build.concurrency · integer · 1–16')
    expect(signatureFor('server.token', Type.String({ writeOnly: true }), [])).toBe('server.token · string · writeOnly')
  })

  it('says a device-local field is device-local, so a save is not read as a save everywhere', () => {
    expect(signatureFor('sync.intervalMinutes', Type.Integer({ deviceLocal: true }), [])).toBe(
      'sync.intervalMinutes · integer · device-local · this device only',
    )
    expect(signatureFor('server.url', Type.String(), [])).not.toContain('device-local')
  })

  it('counts the options for an enum', () => {
    const choices = [
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ]
    expect(signatureFor('site.visibility', { type: 'string' }, choices)).toBe('site.visibility · enum · 2 values')
  })
})

describe('buildFields', () => {
  const schema = Type.Object({
    enabled: Type.Boolean({ title: 'Enable publishing', group: 'Connection' }),
    serverUrl: Type.String({ title: 'Server URL', group: 'Connection' }),
    password: Type.Optional(Type.String({ title: 'Password', group: 'Access', enabledBy: 'enabled' })),
  })

  it('marks a field required unless the schema made it optional', () => {
    const fields = buildFields(schema, { enabled: true })
    expect(fields.map((f) => [f.key, f.required])).toEqual([
      ['enabled', true],
      ['serverUrl', true],
      ['password', false],
    ])
  })

  it('disables a gated field while its controlling boolean is off', () => {
    expect(buildFields(schema, { enabled: false }).find((f) => f.key === 'password')?.disabled).toBe(true)
    expect(buildFields(schema, { enabled: true }).find((f) => f.key === 'password')?.disabled).toBe(false)
  })

  it('treats a missing gate value as off, so a gated field never starts live by accident', () => {
    expect(buildFields(schema, {}).find((f) => f.key === 'password')?.disabled).toBe(true)
  })

  it('takes an array field’s choices from its items, not from the array itself', () => {
    const withItems = Type.Object({
      types: Type.Array(Type.Union([Type.Literal('md'), Type.Literal('png')]), {
        enumLabels: { md: 'Markdown', png: 'Images' },
      }),
    })
    const field = buildFields(withItems, {})[0]
    // Reading the array level instead would leave the checkbox list with nothing to render.
    expect(field?.kind).toBe('checkbox-list')
    expect(field?.choices).toEqual([
      { value: 'md', label: 'Markdown', hint: undefined },
      { value: 'png', label: 'Images', hint: undefined },
    ])
    expect(field?.signature).toBe('types · array<enum> · 2 values')
  })

  it('never marks a read-only field required — nobody can fill one in', () => {
    const readOnly = Type.Object({ lastBuild: Type.String({ readOnly: true }) })
    expect(buildFields(readOnly, {})[0]?.required).toBe(false)
  })

  it('reads enum labels and hints off the schema', () => {
    const withLabels = Type.Object({
      scope: Type.Union([Type.Literal('all'), Type.Literal('selected')], {
        enumLabels: { all: 'Everything', selected: 'Selected notes' },
        enumHints: { all: 'Every note in the vault.' },
      }),
    })
    expect(buildFields(withLabels, {})[0]?.choices).toEqual([
      { value: 'all', label: 'Everything', hint: 'Every note in the vault.' },
      { value: 'selected', label: 'Selected notes', hint: undefined },
    ])
  })
})

describe('groupFields', () => {
  it('keeps declaration order and leads with the ungrouped fields', () => {
    const fields = buildFields(
      Type.Object({
        theme: Type.String(),
        url: Type.String({ group: 'Connection' }),
        port: Type.Integer({ group: 'Connection' }),
        secret: Type.String({ group: 'Access' }),
      }),
      {},
    )
    expect(groupFields(fields).map((g) => [g.title, g.fields.map((f) => f.key)])).toEqual([
      [undefined, ['theme']],
      ['Connection', ['url', 'port']],
      ['Access', ['secret']],
    ])
  })
})

describe('validate', () => {
  const [required, bounded, capped, patterned] = buildFields(
    Type.Object({
      url: Type.String({ title: 'Server URL' }),
      port: Type.Integer({ minimum: 1, maximum: 65535 }),
      blurb: Type.String({ maxLength: 10 }),
      host: Type.String({ pattern: '^[a-z0-9.-]+$' }),
    }),
    {},
  )

  it('reports a required field only when it is actually empty', () => {
    expect(validate(required, '')).toBe('Server URL is required.')
    expect(validate(required, 'notes.example.com')).toBeNull()
  })

  it('checks numeric bounds', () => {
    expect(validate(bounded, 0)).toBe('Must be 1 or more.')
    expect(validate(bounded, 70000)).toBe('Must be 65535 or less.')
    expect(validate(bounded, 443)).toBeNull()
  })

  it('checks length and pattern', () => {
    expect(validate(capped, 'far too long to fit')).toBe('At most 10 characters.')
    expect(validate(patterned, 'https://x/y')).toBe('Does not match the format this field expects.')
    expect(validate(patterned, 'notes.example.com')).toBeNull()
  })

  it('stays quiet on a disabled field — an inert control cannot be fixed', () => {
    expect(validate({ ...required, disabled: true }, '')).toBeNull()
  })
})

describe('hasBlockingErrors', () => {
  // The exact shape of the reported bug: a required field that is simply what shipped on disk, in a
  // section the user opened to edit something else entirely and never touched this one.
  const fields = buildFields(Type.Object({ url: Type.String({ title: 'Server URL' }) }), {})

  it('does not block a save over a required field nobody has touched', () => {
    expect(hasBlockingErrors(fields, { url: '' }, new Set())).toBe(false)
  })

  it('blocks a save once the untouched field is touched and left empty', () => {
    expect(hasBlockingErrors(fields, { url: '' }, new Set(['url']))).toBe(true)
  })

  it('unblocks the save once the touched field is given a valid value', () => {
    expect(hasBlockingErrors(fields, { url: 'notes.example.com' }, new Set(['url']))).toBe(false)
  })

  it('does not let one untouched-and-invalid field hide a different field that actually is blocking', () => {
    const two = buildFields(
      Type.Object({
        url: Type.String({ title: 'Server URL' }),
        port: Type.Integer({ minimum: 1, maximum: 65535 }),
      }),
      {},
    )
    // 'url' is untouched and empty (fine); 'port' was touched and left out of range (blocks).
    expect(hasBlockingErrors(two, { url: '', port: 0 }, new Set(['port']))).toBe(true)
  })
})

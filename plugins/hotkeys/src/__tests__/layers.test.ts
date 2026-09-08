import { describe, expect, it } from 'vitest'
import { APP_LAYER, layerStack, type StackedLayer } from '../layers'

function layer(id: string, depth: number, over: Partial<StackedLayer> = {}): StackedLayer {
  return { id, depth, reason: 'focus', modal: false, ...over }
}

describe('the layer stack', () => {
  it('always ends at app, so a chord nobody else claims still has a floor', () => {
    expect(layerStack([])).toEqual([APP_LAYER])
  })

  it('puts the deeper layer on top, so the more specific one overrides', () => {
    const stack = layerStack([layer('type:notes', 4, { reason: 'visible' }), layer('editor:codemirror', 9)])
    expect(stack).toEqual(['editor:codemirror', 'type:notes', APP_LAYER])
  })

  it('breaks a depth tie in favour of the layer pushed last', () => {
    expect(layerStack([layer('first', 6), layer('second', 6)])).toEqual(['second', 'first', APP_LAYER])
  })

  it('cuts everything a modal does not contain, app included', () => {
    // A dialog teleported to <body> is shallower in the document than the type stage behind it, so
    // depth alone would leave ⌘B collapsing the column from under an open dialog.
    const stack = layerStack([layer('type:notes', 7, { reason: 'visible' }), layer('layer:sheet', 3, { modal: true })])
    expect(stack).toEqual(['layer:sheet'])
  })

  it('keeps what is inside the modal — focus is in one place, so anything deeper is within it', () => {
    const stack = layerStack([
      layer('type:notes', 7, { reason: 'visible' }),
      layer('layer:sheet', 3, { modal: true }),
      layer('editor:in-dialog', 6),
    ])
    expect(stack).toEqual(['editor:in-dialog', 'layer:sheet'])
  })

  it('a modal that is not up cuts nothing', () => {
    const stack = layerStack([layer('type:settings', 5, { reason: 'visible' })])
    expect(stack).toEqual(['type:settings', APP_LAYER])
  })
})

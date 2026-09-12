import { illegalState } from '@arxhub/errors'
import { history, undo } from 'prosemirror-history'
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { createAssetSession } from '../asset-session'
import { type ArxAssetStore, createAssetStore, validateAssetPath } from '../assets'
import { modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'

const paragraph = (text: string) => schema.node('paragraph', null, schema.text(text))

describe('document attachments', () => {
  it('writes original bytes under a unique managed path without trusting the filename', async () => {
    const files = new Map<string, Uint8Array>()
    const store = createAssetStore({
      read: async (path) => files.get(path) ?? new Uint8Array(),
      write: async (path, bytes) => {
        files.set(path, bytes)
      },
    })
    const file = new File(['original bytes'], '../../receipt.txt', { type: 'text/plain' })
    const first = await store.put(file)
    const second = await store.put(file)
    expect(first.path).not.toBe(second.path)
    expect(first.name).toBe('../../receipt.txt')
    expect(() => validateAssetPath(first.path)).not.toThrow()
    expect(new TextDecoder().decode(await store.read(first))).toBe('original bytes')
    expect(() => validateAssetPath('attachments/../../secret')).toThrow()
    expect(() => validateAssetPath('/attachments/a')).toThrow()
  })

  it('maps a delayed paste through new edits, waits for insertion and undoes it alone', async () => {
    let release = () => {}
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    const store: ArxAssetStore = {
      put: async (file) => {
        await ready
        return { path: 'attachments/image.png', name: file.name, mime: file.type, size: file.size }
      },
      read: async () => new Uint8Array(),
    }
    const session = createAssetSession(store)
    const doc = schema.node('doc', null, [paragraph('First'), paragraph('Second')])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
      plugins: [modePlugin('editable'), session.plugin, history()],
    })
    const view = {
      get state() {
        return state
      },
      isDestroyed: false,
      dispatch: (tr: Transaction) => {
        state = state.apply(tr)
      },
    }
    session.insert(view, [new File(['image'], 'image.png', { type: 'image/png' })])
    expect(session.pending.value).toBe(1)
    state = state.apply(state.tr.insertText('typed ', 1))
    const before = state.doc
    release()
    await session.wait()
    expect(session.pending.value).toBe(0)
    expect(state.doc.firstChild?.textContent).toBe('typed First')
    expect(state.doc.child(1).type.name).toBe('image_block')
    expect(state.doc.lastChild?.textContent).toBe('Second')
    undo(state, view.dispatch)
    expect(state.doc.eq(before)).toBe(true)
  })

  it('retries a partial batch without uploading successful files twice', async () => {
    let fails = true
    const writes: string[] = []
    const session = createAssetSession({
      put: async (file) => {
        if (file.name === 'second.txt' && fails) throw illegalState('offline')
        writes.push(file.name)
        return { path: `attachments/${file.name}`, name: file.name, mime: file.type, size: file.size }
      },
      read: async () => new Uint8Array(),
    })
    let state = EditorState.create({ schema, plugins: [session.plugin] })
    const view = {
      get state() {
        return state
      },
      isDestroyed: false,
      dispatch: (tr: Transaction) => {
        state = state.apply(tr)
      },
    }
    session.insert(view, [new File(['1'], 'first.txt'), new File(['2'], 'second.txt')])
    await expect(session.wait()).rejects.toThrow('offline')
    expect(session.error.value).toContain('offline')
    expect(state.doc.childCount).toBe(1)
    fails = false
    session.retry()
    await session.wait()
    expect(writes).toEqual(['first.txt', 'second.txt'])
    expect(state.doc.children.map((node) => node.type.name)).toEqual(['attachment', 'attachment', 'paragraph'])
    state.doc.check()
  })
})

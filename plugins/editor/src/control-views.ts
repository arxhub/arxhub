import type { Attrs, Node } from 'prosemirror-model'
import { NodeSelection } from 'prosemirror-state'
import type { EditorProps } from 'prosemirror-view'
import { shallowReactive } from 'vue'
import type { ArxEditorComponent } from './editor-extension'
import { type EditorMode, editorMode } from './editor-mode'
import AssetBlock from './ui/AssetBlock.vue'
import CodeBlockTools from './ui/CodeBlockTools.vue'
import DataView from './ui/DataView.vue'
import SectionTitle from './ui/SectionTitle.vue'
import UnknownBlock from './ui/UnknownBlock.vue'

export interface ArxEditorControlProps {
  node: Node
  mode: EditorMode
  change: (attrs: Attrs) => void
}

export interface ControlView extends ArxEditorControlProps {
  id: number
  host: HTMLElement
  component?: ArxEditorComponent['component']
}

export function createControlViews(components: Readonly<Record<string, ArxEditorComponent>> = {}) {
  const definitions: Readonly<Record<string, ArxEditorComponent>> = {
    data_view: { component: DataView },
    image_block: { component: AssetBlock },
    attachment: { component: AssetBlock },
    code_block: { component: CodeBlockTools, content: true },
    section: { component: SectionTitle, content: true },
    unknown_block: { component: UnknownBlock },
    ...components,
  }
  const controls = shallowReactive(new Map<number, ControlView>())
  let nextId = 0
  const nodeView: NonNullable<EditorProps['nodeViews']>[string] = (node, view, getPos) => {
    const task = node.type.name === 'task_item'
    const code = node.type.name === 'code_block'
    const section = node.type.name === 'section'
    const definition = definitions[node.type.name]
    const dom = document.createElement(section ? 'details' : (definition?.tag ?? (task ? 'li' : 'div')))
    if (section) dom.setAttribute('open', '')
    dom.dataset.type = node.type.name
    const host = document.createElement('div')
    host.contentEditable = 'false'
    host.className = 'arx-control'
    const selectControl = () => {
      const pos = getPos()
      if (!node.isAtom || pos == null || view.isDestroyed) return
      if (view.state.selection instanceof NodeSelection && view.state.selection.from === pos) return
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
    }
    // A component consumes its own input events, so ProseMirror cannot infer the active block.
    host.addEventListener('pointerdown', selectControl)
    host.addEventListener('focusin', selectControl)
    if (section) {
      const summary = document.createElement('summary')
      summary.setAttribute('aria-label', `Toggle section: ${node.attrs.title}`)
      summary.append(host)
      dom.append(summary)
    } else dom.append(host)
    const contentDOM = (definition?.content ?? task) ? document.createElement(code ? 'code' : 'div') : undefined
    if (contentDOM) {
      contentDOM.className = code ? 'code-content' : section ? 'section-content' : 'task-content'
      if (code) {
        const pre = document.createElement('pre')
        pre.append(contentDOM)
        dom.append(pre)
      } else dom.append(contentDOM)
    }
    const control = shallowReactive<ControlView>({
      id: nextId++,
      host,
      node,
      mode: editorMode(view.state),
      component: definition?.component,
      change: (attrs) => {
        const pos = getPos()
        if (pos == null || editorMode(view.state) === 'readonly') return
        const current = view.state.doc.nodeAt(pos)
        if (current?.type !== node.type) return
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }))
      },
    })
    if (task) dom.dataset.checked = String(node.attrs.checked)
    controls.set(control.id, control)
    return {
      dom,
      contentDOM,
      update: (next) => {
        if (next.type !== node.type) return false
        control.node = next
        control.mode = editorMode(view.state)
        if (section) dom.firstElementChild?.setAttribute('aria-label', `Toggle section: ${next.attrs.title}`)
        if (task) dom.dataset.checked = String(next.attrs.checked)
        return true
      },
      stopEvent: (event) => event.target instanceof globalThis.Node && host.contains(event.target),
      ignoreMutation: (mutation) => mutation.type !== 'selection' && !contentDOM?.contains(mutation.target),
      destroy: () => controls.delete(control.id),
    }
  }
  const nodeViews: NonNullable<EditorProps['nodeViews']> = { task_item: nodeView, select: nodeView }
  for (const name of Object.keys(definitions)) nodeViews[name] = nodeView
  return { controls, nodeViews }
}

import type { Attrs, Node } from 'prosemirror-model'
import { NodeSelection } from 'prosemirror-state'
import type { EditorProps } from 'prosemirror-view'
import { shallowReactive } from 'vue'
import type { ArxEditorComponent } from './editor-extension'
import { type EditorMode, editorMode } from './editor-mode'
import AssetBlock from './ui/AssetBlock.vue'
import CodeBlockTools from './ui/CodeBlockTools.vue'
import ConflictBlock from './ui/ConflictBlock.vue'
import DataView from './ui/DataView.vue'
import SectionTitle from './ui/SectionTitle.vue'
import UnknownBlock from './ui/UnknownBlock.vue'

export interface ArxEditorControlProps {
  node: Node
  mode: EditorMode
  change: (attrs: Attrs) => void
  // Replaces the WHOLE node with a different sequence of blocks, in one transaction — what a conflict
  // box's "keep this / keep the other / keep both" needs, since a decision between two versions of a
  // block is not an attribute edit `change` can express. Only ever takes effect in 'editable' mode:
  // 'interactive' cannot pass a structural change through its own transaction filter (see editor-mode.ts,
  // `onlyControlValuesChanged`), so letting the dispatch through there would just be a silent no-op.
  replace: (nodes: readonly Node[]) => void
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
    // No `content: true`: a conflict's two sides are real document content (kept whole through Undo,
    // serialized like any other block), but neither is meant to be edited in place — only replaced
    // wholesale by choosing a side — so the component renders both as a read-only preview instead of
    // ProseMirror handing them a contentDOM to manage.
    conflict: { component: ConflictBlock },
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
      replace: (nodes) => {
        const pos = getPos()
        if (pos == null || editorMode(view.state) !== 'editable') return
        const current = view.state.doc.nodeAt(pos)
        if (current?.type !== node.type) return
        // A parent whose content requires at least one block (`doc`'s is `block+`) never accepts being
        // emptied out entirely — a plain paragraph stands in for "nothing survived this decision" only
        // when this node is the parent's sole child; otherwise the other siblings already keep it valid.
        const parent = view.state.doc.resolve(pos).parent
        const content = nodes.length || parent.childCount > 1 ? nodes : [view.state.schema.nodes.paragraph.create()]
        view.dispatch(view.state.tr.replaceWith(pos, pos + current.nodeSize, content))
        // The control that triggered this (a Button in the node's own Vue component) is about to be
        // destroyed along with the node it belonged to — DOM focus would otherwise fall out of the
        // editor entirely, taking every keyboard chord routed through it (Undo included) with it.
        view.focus()
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

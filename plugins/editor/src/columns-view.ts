import type { ShellFrame } from '@arxhub/uikit/hooks'
import type { Node } from 'prosemirror-model'
import type { NodeView } from 'prosemirror-view'

function desktopColumns(node: Node): NodeView {
  const dom = document.createElement('div')
  dom.className = 'arx-columns-desktop'
  dom.dataset.arxColumns = ''
  dom.style.gridTemplateColumns = `repeat(${node.childCount}, minmax(0, 1fr))`
  return {
    dom,
    contentDOM: dom,
    update(next) {
      if (next.type !== node.type) return false
      dom.style.gridTemplateColumns = `repeat(${next.childCount}, minmax(0, 1fr))`
      return true
    },
  }
}
function mobileColumns(node: Node): NodeView {
  const dom = document.createElement('div')
  dom.className = 'arx-columns-mobile'
  dom.dataset.arxColumns = ''
  return { dom, contentDOM: dom, update: (next) => next.type === node.type }
}
export const columnsView = (frame: ShellFrame) => (frame === 'mobile' ? mobileColumns : desktopColumns)

import type { Node } from 'prosemirror-model'
import { Plugin, type Selection, TextSelection } from 'prosemirror-state'
import { BlockSelection } from './block-selection'
import { editorMode } from './editor-mode'

type Gesture = {
  pointerId: number
  x: number
  y: number
  clientX: number
  clientY: number
  doc: Node
  selection: Selection
  extend: boolean
  active: boolean
}

export function blockMarqueePlugin(getScroller?: () => HTMLElement | undefined): Plugin {
  let cancel = () => false
  return new Plugin({
    props: {
      handleKeyDown: (_view, event) => event.key === 'Escape' && cancel(),
    },
    view(view) {
      const scroller = getScroller?.() ?? view.dom.parentElement
      if (!scroller) return {}
      const overlay = document.createElement('div')
      overlay.className = 'arx-block-marquee'
      overlay.setAttribute('aria-hidden', 'true')
      let gesture: Gesture | null = null
      let animation = 0

      function finish(restore = false) {
        const previous = gesture
        gesture = null
        cancelAnimationFrame(animation)
        overlay.remove()
        if (previous && scroller?.hasPointerCapture(previous.pointerId)) scroller.releasePointerCapture(previous.pointerId)
        if (restore && previous && !view.isDestroyed && view.state.doc === previous.doc)
          view.dispatch(view.state.tr.setSelection(previous.selection))
        return !!previous
      }
      cancel = () => finish(true)

      function render() {
        if (!gesture?.active || !scroller) return
        const viewport = scroller.getBoundingClientRect()
        const anchorX = viewport.left + gesture.x - scroller.scrollLeft
        const anchorY = viewport.top + gesture.y - scroller.scrollTop
        const x = Math.max(viewport.left, Math.min(viewport.right, gesture.clientX))
        const y = Math.max(viewport.top, Math.min(viewport.bottom, gesture.clientY))
        const left = Math.min(anchorX, x)
        const right = Math.max(anchorX, x)
        const top = Math.min(anchorY, y)
        const bottom = Math.max(anchorY, y)
        const visibleTop = Math.max(viewport.top, top)
        const visibleLeft = Math.max(viewport.left, left)
        Object.assign(overlay.style, {
          left: `${visibleLeft}px`,
          top: `${visibleTop}px`,
          width: `${Math.max(0, Math.min(viewport.right, right) - visibleLeft)}px`,
          height: `${Math.max(0, Math.min(viewport.bottom, bottom) - visibleTop)}px`,
        })
        let from = Infinity
        let to = -Infinity
        view.state.doc.forEach((node, pos) => {
          const dom = view.nodeDOM(pos)
          if (!(dom instanceof HTMLElement)) return
          const rect = dom.getBoundingClientRect()
          if (rect.width && rect.height && rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top) {
            from = Math.min(from, pos)
            to = Math.max(to, pos + node.nodeSize)
          }
        })
        if (gesture.extend && gesture.selection instanceof BlockSelection) {
          from = Math.min(from, gesture.selection.from)
          to = Math.max(to, gesture.selection.to)
        }
        const selection = from < to ? BlockSelection.create(view.state.doc, from, to) : TextSelection.near(gesture.selection.$from)
        if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection))
      }

      function scroll() {
        if (!gesture?.active || !scroller) return
        if (!view.dom.getClientRects().length) {
          finish()
          return
        }
        const rect = scroller.getBoundingClientRect()
        const y = gesture.clientY
        const delta = y < rect.top + 40 ? -12 : y > rect.bottom - 40 ? 12 : 0
        if (delta) scroller.scrollTop += delta
        animation = requestAnimationFrame(scroll)
      }

      function start(event: PointerEvent) {
        if (
          !scroller ||
          gesture ||
          event.button !== 0 ||
          event.pointerType !== 'mouse' ||
          !event.isPrimary ||
          editorMode(view.state) !== 'editable' ||
          (event.target !== scroller && event.target !== view.dom)
        )
          return
        const rect = scroller.getBoundingClientRect()
        // The native scrollbar is part of the scroller too; leave its drag to the browser.
        if (event.clientX >= rect.left + scroller.clientWidth || event.clientY >= rect.top + scroller.clientHeight) return
        event.preventDefault()
        gesture = {
          pointerId: event.pointerId,
          x: event.clientX - rect.left + scroller.scrollLeft,
          y: event.clientY - rect.top + scroller.scrollTop,
          clientX: event.clientX,
          clientY: event.clientY,
          doc: view.state.doc,
          selection: view.state.selection,
          extend: event.shiftKey,
          active: false,
        }
        view.focus()
        scroller.setPointerCapture(event.pointerId)
      }

      function move(event: PointerEvent) {
        if (!gesture || !scroller || event.pointerId !== gesture.pointerId) return
        const distance = Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY)
        if (!gesture.active && distance < 8) return
        gesture.clientX = event.clientX
        gesture.clientY = event.clientY
        if (!gesture.active) {
          gesture.active = true
          scroller.append(overlay)
          animation = requestAnimationFrame(scroll)
        }
        event.preventDefault()
        render()
      }

      function end(event: PointerEvent) {
        if (!gesture || event.pointerId !== gesture.pointerId) return
        if (!gesture.active) {
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (position) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos))))
        }
        finish()
      }

      scroller.addEventListener('pointerdown', start)
      scroller.addEventListener('scroll', render)
      scroller.addEventListener('pointermove', move)
      scroller.addEventListener('pointerup', end)
      scroller.addEventListener('pointercancel', cancel)
      scroller.addEventListener('lostpointercapture', cancel)
      window.addEventListener('blur', cancel)
      return {
        update() {
          if (gesture && (view.state.doc !== gesture.doc || editorMode(view.state) !== 'editable' || !view.dom.getClientRects().length))
            finish()
        },
        destroy() {
          finish()
          scroller.removeEventListener('pointerdown', start)
          scroller.removeEventListener('scroll', render)
          scroller.removeEventListener('pointermove', move)
          scroller.removeEventListener('pointerup', end)
          scroller.removeEventListener('pointercancel', cancel)
          scroller.removeEventListener('lostpointercapture', cancel)
          window.removeEventListener('blur', cancel)
        },
      }
    },
  })
}

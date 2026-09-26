import { onBeforeUnmount, type Ref, readonly, ref, watch } from 'vue'
import { nearestStep } from './sheet-view'

// The zoom a pinch shows while the fingers are still down: the zoom it started at scaled by how far the fingers
// spread, held inside the listed range so the table never passes a size the control could not reach.
export function pinchZoomValue(start: number, ratio: number, steps: readonly number[]): number {
  const min = steps[0]
  const max = steps[steps.length - 1]
  const scaled = Number.isFinite(ratio) && ratio > 0 ? start * ratio : start
  return Math.min(max, Math.max(min, scaled))
}

// Where a pinch settles once released: a listed step, so the zoom control and the pinch never disagree about which
// zoom the table is at.
export function settlePinchZoom(value: number, steps: readonly number[]): number {
  return nearestStep(value, steps)
}

interface Point {
  x: number
  y: number
}

function spread(points: Iterable<Point>): number {
  const [a, b] = [...points]
  return a == null || b == null ? 0 : Math.hypot(a.x - b.x, a.y - b.y)
}

// Two-finger pinch on a scrolling element, through pointer events. `live` is the zoom to draw while the gesture is
// under way (null otherwise); `zoom` is written once, on release. The element takes `touch-action: pan-x pan-y`,
// so one finger still scrolls both axes while the browser neither zooms the page nor claims the pinch.
export function usePinchZoom(target: Ref<HTMLElement | null>, zoom: Ref<number>, steps: readonly number[]) {
  const live = ref<number | null>(null)
  const points = new Map<number, Point>()
  let start: { distance: number; zoom: number } | null = null

  function onDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return
    points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (points.size === 2) {
      const distance = spread(points.values())
      start = distance > 0 ? { distance, zoom: zoom.value } : null
    }
  }

  function onMove(event: PointerEvent): void {
    const point = points.get(event.pointerId)
    if (point == null) return
    point.x = event.clientX
    point.y = event.clientY
    if (start == null || points.size !== 2) return
    live.value = pinchZoomValue(start.zoom, spread(points.values()) / start.distance, steps)
  }

  // A cancel lands here as well: the browser may take the gesture over as a pan midway, and a pinch it interrupted
  // should keep the size it reached rather than jump back.
  function onUp(event: PointerEvent): void {
    if (!points.delete(event.pointerId)) return
    if (start == null) return
    if (live.value != null) zoom.value = settlePinchZoom(live.value, steps)
    live.value = null
    start = null
  }

  let detach: (() => void) | null = null
  watch(
    target,
    (element) => {
      detach?.()
      detach = null
      points.clear()
      start = null
      live.value = null
      if (element == null) return
      const previous = element.style.touchAction
      element.style.touchAction = 'pan-x pan-y'
      element.addEventListener('pointerdown', onDown)
      element.addEventListener('pointermove', onMove)
      element.addEventListener('pointerup', onUp)
      element.addEventListener('pointercancel', onUp)
      detach = () => {
        element.style.touchAction = previous
        element.removeEventListener('pointerdown', onDown)
        element.removeEventListener('pointermove', onMove)
        element.removeEventListener('pointerup', onUp)
        element.removeEventListener('pointercancel', onUp)
      }
    },
    { immediate: true },
  )
  onBeforeUnmount(() => detach?.())

  return { live: readonly(live) }
}

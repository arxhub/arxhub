import { computed, type MaybeRefOrGetter, shallowRef, toValue, watchEffect } from 'vue'

type ElementSource = MaybeRefOrGetter<HTMLElement | null | undefined>

export interface UseOverflowActionsOptions {
  container: ElementSource
  /** An always-mounted sizing element for one action. Actions have equal widths and no gaps. */
  item: ElementSource
  /** Optional sizing element when the overflow trigger has a different width. */
  overflow?: ElementSource
  /** Pinned content is measured separately and never enters the overflow list. */
  leading?: ElementSource
  trailing?: ElementSource
}

/** Items are ordered by priority: the trailing items move into overflow first. */
export function useOverflowActions<T>(items: MaybeRefOrGetter<readonly T[]>, options: UseOverflowActionsOptions) {
  const widths = shallowRef({ available: 0, item: 0, overflow: 0 })

  watchEffect(
    (onCleanup) => {
      const container = toValue(options.container)
      const item = toValue(options.item)
      const overflow = toValue(options.overflow) ?? item
      const leading = toValue(options.leading)
      const trailing = toValue(options.trailing)
      if (!container || !item) return

      const measure = () => {
        const style = getComputedStyle(container)
        const insets = [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce(
          (sum, value) => sum + (Number.parseFloat(value) || 0),
          0,
        )
        widths.value = {
          available: Math.max(
            0,
            container.getBoundingClientRect().width -
              insets -
              (leading?.getBoundingClientRect().width ?? 0) -
              (trailing?.getBoundingClientRect().width ?? 0),
          ),
          item: item.getBoundingClientRect().width,
          overflow: overflow?.getBoundingClientRect().width ?? 0,
        }
      }
      const observer = new ResizeObserver(measure)
      for (const element of new Set([container, item, overflow, leading, trailing])) {
        if (element) observer.observe(element)
      }
      measure()
      onCleanup(() => observer.disconnect())
    },
    { flush: 'post' },
  )

  const visibleCount = computed(() => {
    const count = toValue(items).length
    const { available, item, overflow } = widths.value
    if (item <= 0) return 0
    if (count * item <= available) return count
    return Math.max(0, Math.min(count, Math.floor((available - overflow) / item)))
  })
  const visible = computed(() => toValue(items).slice(0, visibleCount.value))
  const overflow = computed(() => toValue(items).slice(visibleCount.value))
  return { visible, overflow, visibleCount }
}

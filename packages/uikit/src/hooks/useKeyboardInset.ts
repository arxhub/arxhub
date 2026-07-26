import { onMounted, onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'

// How many pixels the on-screen keyboard covers at the bottom of the window.
//
// `100dvh` is not enough on its own: an Android WebView commonly keeps the layout viewport at full
// height and only shrinks the *visual* viewport, so a footer pinned to the bottom ends up underneath
// the keyboard. visualViewport reports the difference, and it is the only signal that does.
export function useKeyboardInset(): Ref<number> {
  const inset = ref(0)

  const update = () => {
    const vv = window.visualViewport
    if (vv == null) return
    // offsetTop covers the case where the page is scrolled up to keep the caret in view.
    const covered = window.innerHeight - vv.height - vv.offsetTop
    // Small negatives and rounding noise are not a keyboard.
    inset.value = covered > 1 ? Math.round(covered) : 0
  }

  onMounted(() => {
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
  })

  onUnmounted(() => {
    window.visualViewport?.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('scroll', update)
  })

  return inset
}

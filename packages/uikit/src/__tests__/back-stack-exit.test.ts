import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The entry the owner was on before the app: back reaching it IS the app being left, and it is what
// gives the last traversal somewhere to land.
const OUTSIDE = Symbol('before the app')

// A session history that traverses one entry per task, the way a browser does — the guard depends on
// exactly that, since it issues the next back() from the popstate of the previous one. Nothing here
// needs a DOM: what is under test is the bookkeeping over window.history, so window is the only thing
// that has to exist.
function fakeBrowser() {
  const listeners: Array<() => void> = []
  const entries: unknown[] = [OUTSIDE, null]
  let index = 1
  let pending = 0
  let left = false

  const window = {
    history: {
      get state(): unknown {
        return entries[index]
      },
      pushState(state: unknown): void {
        entries.length = index + 1
        entries.push(state)
        index = entries.length - 1
      },
      back(): void {
        pending += 1
      },
    },
    addEventListener(type: string, listener: () => void): void {
      if (type === 'popstate') listeners.push(listener)
    },
    removeEventListener(): void {},
  }

  function flush(): void {
    while (pending > 0) {
      pending -= 1
      index -= 1
      // Landing outside the app unloads the document, so there is no popstate and nothing after it.
      if (entries[index] === OUTSIDE) {
        left = true
        return
      }
      for (const listener of [...listeners]) listener()
    }
  }

  return {
    window,
    // The system back gesture.
    press(): void {
      pending += 1
      flush()
    },
    flush,
    // How many backs still stand between here and leaving — the measure accumulation would show up in.
    stepsToLeave: (): number => index,
    state: (): unknown => entries[index],
    hasLeft: (): boolean => left,
  }
}

describe('back that would leave the app', () => {
  let browser: ReturnType<typeof fakeBrowser>
  let backStack: typeof import('../hooks/useBackStack')
  let vue: typeof import('vue')

  // The stack, the guard and the popstate listener are module state, so every test gets its own copy
  // of the module — and its own vue with it, or the module's watch() would be tracking refs from a
  // different reactivity system.
  beforeEach(async () => {
    vi.resetModules()
    browser = fakeBrowser()
    vi.stubGlobal('window', browser.window)
    backStack = await import('../hooks/useBackStack')
    vue = await import('vue')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // What a dialog is to the back stack: an entry of its own, closed by back or by a button. Closing it
  // by a button unwinds that entry, which is the traversal a confirmed exit waits behind.
  function openDialog(): { close: () => Promise<void> } {
    const open = vue.ref(true)
    backStack.useBackStack(open, () => {
      open.value = false
    })
    return {
      async close(): Promise<void> {
        open.value = false
        await vue.nextTick()
        browser.flush()
      },
    }
  }

  test('the guard asks instead of leaving, and answering it leaves the history as deep as it was', async () => {
    const ask = vi.fn()
    backStack.armExitGuard(ask)
    const armed = browser.stepsToLeave()
    const entry = browser.state()

    for (let round = 0; round < 3; round++) {
      browser.press()
      expect(ask).toHaveBeenCalledTimes(round + 1)
      expect(browser.hasLeft()).toBe(false)

      const dialog = openDialog()
      await dialog.close()

      // Back on the guard's own entry, and no further from leaving for having asked.
      expect(browser.state()).toEqual(entry)
      expect(browser.stepsToLeave()).toBe(armed)
    }
  })

  test('back inside the question is a cancel, and the guard is still armed after it', async () => {
    const ask = vi.fn()
    backStack.armExitGuard(ask)
    const armed = browser.stepsToLeave()

    browser.press()
    openDialog()
    browser.press()
    await vue.nextTick()

    expect(browser.hasLeft()).toBe(false)
    expect(browser.stepsToLeave()).toBe(armed)

    browser.press()
    expect(ask).toHaveBeenCalledTimes(2)
  })

  test('the app is left only once the exit is confirmed, and only behind the dialog that asked', async () => {
    backStack.armExitGuard(() => {})
    browser.press()
    const dialog = openDialog()

    backStack.leaveApp()
    browser.flush()
    // The dialog is still on screen: leaving before it closes would traverse the entry it is holding.
    expect(browser.hasLeft()).toBe(false)

    await dialog.close()
    expect(browser.hasLeft()).toBe(true)
  })

  test('a layer still wins over the guard: back closes it and asks nothing', async () => {
    const ask = vi.fn()
    backStack.armExitGuard(ask)
    openDialog()

    browser.press()
    await vue.nextTick()

    expect(ask).not.toHaveBeenCalled()
    expect(browser.hasLeft()).toBe(false)
  })

  test('a disarmed guard lets back leave the app', () => {
    const disarm = backStack.armExitGuard(() => {})
    disarm()

    // Two: the entry the guard left behind, then the app's own.
    browser.press()
    browser.press()

    expect(browser.hasLeft()).toBe(true)
  })
})

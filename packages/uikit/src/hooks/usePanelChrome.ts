import {
  computed,
  type InjectionKey,
  inject,
  type MaybeRefOrGetter,
  onScopeDispose,
  provide,
  type Ref,
  type ShallowRef,
  toValue,
  watchEffect,
} from 'vue'

export interface PanelChromeState {
  icon?: string
  status?: { icon: string; label: string; tone?: 'neutral' | 'danger' | 'warning' }
  mode?: string
}
export interface PanelChromeHost {
  actions: Readonly<Ref<HTMLElement | null>>
  state: ShallowRef<PanelChromeState>
}
const key: InjectionKey<PanelChromeHost> = Symbol('panel-chrome')
export function providePanelChrome(host: PanelChromeHost) {
  provide(key, host)
}

/** A hosted view contributes chrome; the panel container decides where it is drawn. */
export function usePanelChrome(state: MaybeRefOrGetter<PanelChromeState>) {
  const host = inject(key, null)
  if (host) {
    watchEffect(() => {
      host.state.value = toValue(state)
    })
    onScopeDispose(() => {
      host.state.value = {}
    })
  }
  return computed(() => host?.actions.value ?? null)
}

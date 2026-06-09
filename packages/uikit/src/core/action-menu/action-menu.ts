import { type Ref, ref } from 'vue'

// A single action presented in the action menu. Presentation-agnostic: rendered as a context-menu
// item on desktop and (later) as a bottom-sheet button on mobile.
export interface ActionItem {
  id: string
  label: string
  // Icon spec resolved by the icon registry, e.g. 'lu:trash-2'.
  icon?: string
  variant?: 'default' | 'danger'
  disabled?: boolean
  onSelect: () => void
}

export interface ActionMenuState {
  open: boolean
  items: ActionItem[]
  x: number
  y: number
  title?: string
}

const state: Ref<ActionMenuState> = ref({ open: false, items: [], x: 0, y: 0 })

export const actionMenu = {
  open(items: ActionItem[], opts?: { x?: number; y?: number; title?: string }): void {
    state.value = { open: true, items, x: opts?.x ?? 0, y: opts?.y ?? 0, title: opts?.title }
  },
  close(): void {
    if (state.value.open) state.value = { ...state.value, open: false }
  },
}

export function useActionMenuState(): Ref<ActionMenuState> {
  return state
}

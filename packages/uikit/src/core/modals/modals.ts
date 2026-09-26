import { type Component, markRaw, type Ref, ref, type VNodeChild } from 'vue'

// Body content for a modal — a component, a render function, or plain text (Vue's stand-in for
// Mantine's JSX `children`).
export type ModalContent = Component | (() => VNodeChild) | string

export interface ModalSettings {
  modalId?: string
  title?: string
  centered?: boolean
  size?: 'sm' | 'md' | 'lg'
  closeOnClickOutside?: boolean
  closeOnEscape?: boolean
  /** Body content. */
  content?: ModalContent
  /** Props passed to `content` when it is a component. */
  contentProps?: Record<string, unknown>
  onClose?: () => void
}

export interface ConfirmLabels {
  confirm: string
  cancel: string
}

export interface ConfirmButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  danger?: boolean
  label?: string
  disabled?: boolean
}

export interface OpenConfirmModal extends ModalSettings {
  /** Confirm body — alias of `content`, kept for Mantine parity. */
  children?: ModalContent
  labels?: ConfirmLabels
  confirmProps?: ConfirmButtonProps
  cancelProps?: ConfirmButtonProps
  closeOnConfirm?: boolean
  closeOnCancel?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}

export interface OpenContextModal<P extends Record<string, unknown> = Record<string, unknown>> extends ModalSettings {
  innerProps?: P
}

// Extension point for typed context-modal keys — augment via:
//   declare module '@arxhub/uikit/core' { interface ArxhubModalsOverride { modals: { confirmDelete: Component } } }
// biome-ignore lint/suspicious/noEmptyInterface: an interface is required so plugins can augment it
export interface ArxhubModalsOverride {}

// A layer that draws its own surface — a multi-step BottomSheet, whose title, back key and height change
// from step to step. The registry only holds it open: a component mounted from a plain function (a key
// in a band, a menu item) has no template of its own to put a sheet in, and ModalsProvider sits at the
// root of both frames.
export interface OpenSurface {
  modalId?: string
  component: Component
  /** Props for `component`, which also receives `modalId` and closes itself with `modals.close(modalId)`. */
  props?: Record<string, unknown>
  onClose?: () => void
}

export type ModalState =
  | { id: string; type: 'surface'; props: OpenSurface }
  | { id: string; type: 'content'; props: ModalSettings }
  | { id: string; type: 'confirm'; props: OpenConfirmModal }
  | { id: string; type: 'context'; ctx: string; props: OpenContextModal }

export const openModals: Ref<ModalState[]> = ref<ModalState[]>([])

let counter = 0
function nextId(): string {
  counter += 1
  return `modal-${counter}`
}

function freezeContent<T extends ModalSettings>(props: T): T {
  const next = { ...props }
  if (next.content && typeof next.content === 'object') next.content = markRaw(next.content as object) as ModalContent
  return next
}

function freezeConfirm(props: OpenConfirmModal): OpenConfirmModal {
  const next = freezeContent(props)
  if (next.children && typeof next.children === 'object') next.children = markRaw(next.children as object) as ModalContent
  return next
}

export const modals = {
  open(props: ModalSettings): string {
    const id = props.modalId ?? nextId()
    openModals.value = [...openModals.value, { id, type: 'content', props: freezeContent(props) }]
    return id
  },

  openSurface(props: OpenSurface): string {
    const id = props.modalId ?? nextId()
    openModals.value = [...openModals.value, { id, type: 'surface', props: { ...props, component: markRaw(props.component) } }]
    return id
  },

  openConfirmModal(props: OpenConfirmModal): string {
    const id = props.modalId ?? nextId()
    openModals.value = [...openModals.value, { id, type: 'confirm', props: freezeConfirm(props) }]
    return id
  },

  openContextModal(props: OpenContextModal & { modal: string }): string {
    const { modal, ...rest } = props
    const id = props.modalId ?? nextId()
    openModals.value = [...openModals.value, { id, type: 'context', ctx: modal, props: rest }]
    return id
  },

  close(id: string): void {
    const modal = openModals.value.find((m) => m.id === id)
    if (!modal) return
    openModals.value = openModals.value.filter((m) => m.id !== id)
    modal.props.onClose?.()
  },

  closeAll(): void {
    const all = openModals.value
    openModals.value = []
    for (const m of all) m.props.onClose?.()
  },

  updateModal(payload: { modalId: string } & Partial<ModalSettings>): void {
    const { modalId, ...rest } = payload
    openModals.value = openModals.value.map((m) =>
      m.id === modalId && m.type !== 'surface' ? ({ ...m, props: { ...m.props, ...rest } } as ModalState) : m,
    )
  },
}

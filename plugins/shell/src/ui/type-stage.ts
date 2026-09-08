import { type Component, type ComputedRef, computed, type InjectionKey, inject, provide } from 'vue'
import { isObjectType } from './tab-type'
import type { TabTypeRegistry } from './tab-type-registry'
import type { Workspace } from './workspace'

// One type's content, as the frame renders it: a type with objects shows its panel host, a type without
// shows itself.
export interface TypeStage {
  readonly typeId: string
  readonly view: Component
}

// What both frames put in front of the person: every type they have entered this session, ALL of them
// mounted, with the active one shown. This is the panels rule one level up — `PanelView` is `v-show`
// and never `v-if`, because unmounting silently threw away an editor's buffer and a staged settings
// draft — and it is what F-05 asks for: coming back to a type shows what was there.
//
// Two bounds, and they are the whole memory story. A type is staged only once it has been ENTERED
// (`mounted` is the order of first visit), so a boot that restores four types still mounts one; and it
// leaves the stage when it leaves the workspace, because `closeType` is the person saying they are done
// with it. There is no cap beyond that on purpose: the ceiling is the row they can see, and a numeric
// limit would evict a type that is still standing in it — losing the state of a visible key at random is
// worse than the megabyte it saves.
export function stagesOf(workspace: Workspace, types: TabTypeRegistry, mounted: readonly string[]): TypeStage[] {
  const open = new Set(workspace.openTypeIds.value)
  const stages: TypeStage[] = []
  for (const typeId of mounted) {
    if (!open.has(typeId)) continue
    const view = viewOf(workspace, types, typeId)
    if (view != null) stages.push({ typeId, view })
  }
  return stages
}

function viewOf(workspace: Workspace, types: TabTypeRegistry, typeId: string): Component | null {
  const panels = workspace.panelsOf(typeId)
  if (panels != null) return panels.view
  const type = types.get(typeId)
  return type != null && !isObjectType(type) ? type.content : null
}

const StageVisibleKey: InjectionKey<ComputedRef<boolean>> = Symbol('arxhub.shell.stage-visible')

// Whether the stage this component sits on is the one on screen. It exists because the stages stay
// mounted: a component that used to learn it had been put away from `onDeactivated` learns nothing at
// all under `v-show`, and the mobile rail host is exactly that component — a claim never released left
// every mini-app visited this session teleporting into the shared panel at once.
export function provideStageVisible(visible: ComputedRef<boolean>): void {
  provide(StageVisibleKey, visible)
}

// Visible by default: a component mounted outside any stage (a test, a dialog, an instance that renders
// a layout directly) is on screen exactly when it is mounted.
export function useStageVisible(): ComputedRef<boolean> {
  return inject(
    StageVisibleKey,
    computed(() => true),
  )
}

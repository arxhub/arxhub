import { computed } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { addField, type PropertiesAttrs, withField, withoutField } from '../properties'

export function usePropertiesBlock(props: ArxEditorControlProps) {
  // The node's own attrs are already validated by the schema (properties-block.ts), so this just gives
  // them a stable shape to read — never a second source of truth for what they mean.
  const attrs = computed<PropertiesAttrs>(() => ({
    tags: Array.isArray(props.node.attrs.tags) ? props.node.attrs.tags : [],
    favorite: props.node.attrs.favorite === true,
    fields: Array.isArray(props.node.attrs.fields) ? props.node.attrs.fields : [],
    subject: props.node.attrs.subject ?? undefined,
  }))

  const editable = computed(() => props.mode === 'editable')
  // `favorite` is the block's one "use" action (like a task's checked or a dropdown's value) and stays
  // reachable in interactive mode; tags and fields reshape the block and need `editable` (see the control
  // policy in properties-block.ts).
  const canFavorite = computed(() => props.mode !== 'readonly')

  function setTags(tags: string[]) {
    const next = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
    props.change({ tags: next })
  }

  // Each handler passes `change()` only the ONE key it actually means to touch, never the whole object
  // `withField`/`addField`/… happen to return — `change()` merges onto the node's LIVE attrs (read fresh
  // from the view at call time), and a merge from a possibly-lagging local snapshot of `attrs.value` (this
  // component's own computed, refreshed only on Vue's next render) would silently reassert stale tags or
  // fields alongside the one field this call means to change.
  function onFavoriteToggle() {
    if (!canFavorite.value) return
    props.change({ favorite: !attrs.value.favorite })
  }

  function updateField(index: number, patch: Partial<{ key: string; value: string }>) {
    props.change({ fields: withField(attrs.value, index, patch).fields })
  }

  function addFieldRow() {
    props.change({ fields: addField(attrs.value).fields })
  }

  function removeFieldRow(index: number) {
    props.change({ fields: withoutField(attrs.value, index).fields })
  }

  return { attrs, editable, canFavorite, setTags, onFavoriteToggle, updateField, addFieldRow, removeFieldRow }
}

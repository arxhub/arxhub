import { validation } from '@arxhub/errors'
import type { Command } from 'prosemirror-state'
import { NodeSelection } from 'prosemirror-state'
import { isRecord } from './document-migrations'
import type { ArxEditorContribution } from './editor-extension'
import { emptyPropertiesAttrs, PROPERTIES_NODE_TYPE, type PropertyField } from './properties'
import type { BlockCommand } from './slash-commands'
import PropertiesBlock from './ui/PropertiesBlock.vue'

function isValidFields(value: unknown): value is PropertyField[] {
  return Array.isArray(value) && value.every((field) => isRecord(field) && typeof field.key === 'string' && typeof field.value === 'string')
}

function isValidSubject(value: unknown): boolean {
  if (value === null) return true
  return (
    isRecord(value) &&
    (value.fileId === undefined || typeof value.fileId === 'string') &&
    (value.path === undefined || typeof value.path === 'string')
  )
}

// Reveals the existing block instead of inserting a second one (at most one per document); otherwise
// always lands at the TOP regardless of where the cursor was — replacing an empty trigger paragraph the
// same way a slash insertion does (`placeBlocks` in block-placement.ts), except the new block is placed
// at position 0 rather than at the cursor.
const insertOrRevealProperties: Command = (state, dispatch) => {
  const { schema, doc } = state
  const type = schema.nodes[PROPERTIES_NODE_TYPE]
  if (!type) return false
  if (doc.firstChild?.type === type) {
    if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.tr.doc, 0)).scrollIntoView())
    return true
  }
  const { $from } = state.selection
  if ($from.parent.type !== schema.nodes.paragraph || $from.parent.content.size !== 0) return false
  if (dispatch) {
    const tr = state.tr.delete($from.before(), $from.after()).insert(0, type.create(emptyPropertiesAttrs()))
    dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)).scrollIntoView())
  }
  return true
}

// The editor's own first-party block type — registered as a contribution like any plugin's, rather than
// baked into editor-schema.ts's base builder, so it carries a `version` and can take a `migrations` entry
// the day its attrs shape changes (arx-editor-api.md's "Сохранённые версии"). An older client that has
// never heard of `properties` already falls back to `unknown_block` on its own (editor-format.ts checks
// `schema.nodes[name]`); registering it here is what protects a FUTURE shape change of this same block.
export function propertiesContribution(): ArxEditorContribution {
  return {
    id: 'arxhub.editor.properties',
    version: 1,
    nodes: {
      properties: {
        group: 'block',
        atom: true,
        attrs: {
          tags: {
            default: [],
            validate: (value: unknown) => {
              if (!Array.isArray(value) || !value.every((tag) => typeof tag === 'string')) throw validation('Invalid property tags')
            },
          },
          favorite: { default: false, validate: 'boolean' },
          fields: {
            default: [],
            validate: (value: unknown) => {
              if (!isValidFields(value)) throw validation('Invalid property fields')
            },
          },
          subject: {
            default: null,
            validate: (value: unknown) => {
              if (!isValidSubject(value)) throw validation('Invalid properties subject')
            },
          },
        },
        parseDOM: [
          {
            tag: 'div[data-arx-properties]',
            getAttrs: (dom: HTMLElement) => {
              try {
                const value: unknown = JSON.parse(dom.dataset.arxProperties ?? '')
                if (!isRecord(value)) return false
                return {
                  tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === 'string') : [],
                  favorite: value.favorite === true,
                  fields: isValidFields(value.fields) ? value.fields : [],
                  subject: isValidSubject(value.subject) ? (value.subject ?? null) : null,
                }
              } catch {
                return false
              }
            },
          },
        ],
        toDOM: (node) => {
          const summary = `Properties${node.attrs.favorite ? ' ★' : ''}${
            Array.isArray(node.attrs.tags) && node.attrs.tags.length ? `: ${node.attrs.tags.join(', ')}` : ''
          }`
          return [
            'div',
            {
              'data-arx-properties': JSON.stringify({
                tags: node.attrs.tags,
                favorite: node.attrs.favorite,
                fields: node.attrs.fields,
                subject: node.attrs.subject,
              }),
            },
            summary,
          ] as const
        },
      },
    },
    components: { properties: { component: PropertiesBlock } },
    // Only `favorite` is a "use" of the block the way a task's `checked` or a dropdown's `value` is —
    // interactive mode may flip it, but adding a tag or a field changes the block's own shape and, like
    // configuring a dropdown's options, needs `editable`.
    controls: { properties: { favorite: (value: unknown) => typeof value === 'boolean' } },
    commands: () => [
      {
        id: 'properties',
        label: 'Properties',
        icon: 'lu:tags',
        keywords: 'tags favorite fields properties метаданные свойства избранное',
        run: insertOrRevealProperties,
      } satisfies BlockCommand,
    ],
  }
}

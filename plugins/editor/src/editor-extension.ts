import { Extension } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { Container } from '@arxhub/stdlib/collections/container'
import type { ActionItem } from '@arxhub/uikit/core'
import { type MarkSpec, type NodeSpec, Schema } from 'prosemirror-model'
import type { Plugin } from 'prosemirror-state'
import type { Component } from 'vue'
import type { ArxAssetStore } from './assets'
import { identityNodes } from './block-identity'
import type { ArxDataSource } from './data-sources'
import type { ArxDraftStore } from './document-drafts'
import type { ArxHistoryStore } from './document-history'
import type { ArxDocumentLinks } from './document-links'
import type { ArxFormatConfig, ArxJsonNode } from './document-migrations'
import { type ControlPolicy, DEFAULT_CONTROL_POLICIES } from './editor-mode'
import { schema as baseSchema } from './editor-schema'
import { type BlockCommand, buildBlockCommands } from './slash-commands'

export interface ArxEditorComponent {
  component: Component
  tag?: 'div' | 'li'
  content?: boolean
}

export interface ArxEditorContribution {
  id: string
  version?: number
  legacyNodes?: readonly string[]
  legacyMarks?: readonly string[]
  migrations?: Readonly<Record<number, (node: ArxJsonNode) => ArxJsonNode>>
  nodes?: Record<string, NodeSpec>
  marks?: Record<string, MarkSpec>
  components?: Record<string, ArxEditorComponent>
  controls?: Record<string, ControlPolicy>
  commands?: (schema: Schema) => BlockCommand[]
  plugins?: (schema: Schema) => Plugin[]
  dataSources?: Record<string, ArxDataSource>
  publishText?: Record<string, (node: ArxJsonNode) => string>
}

export interface ArxEditorKit {
  publishText: Readonly<Record<string, (node: ArxJsonNode) => string>>
  dataSources: Readonly<Record<string, ArxDataSource>>
  format: ArxFormatConfig
  schema: Schema
  commands: readonly BlockCommand[]
  components: Readonly<Record<string, ArxEditorComponent>>
  controls: Readonly<Record<string, ControlPolicy>>
  plugins: () => Plugin[]
}

// Register in configure; seal in start, after every plugin has contributed. A live document's
// NodeTypes cannot be replaced without rebuilding its history and component views.
export class ArxEditorExtension extends Extension {
  assets: ArxAssetStore | null = null
  links: ArxDocumentLinks | null = null
  history: ArxHistoryStore | null = null
  drafts: ArxDraftStore | null = null
  publicationActions: ((path: string) => ActionItem[]) | null = null
  private readonly contributions = new Container<ArxEditorContribution>('Editor contribution')
  private built: ArxEditorKit | null = null

  register(contribution: ArxEditorContribution): void {
    if (this.built) throw illegalState('Register editor contributions during configure(), before the editor starts')
    if (!contribution.id || this.contributions.has(contribution.id)) throw illegalState(`Duplicate editor contribution: ${contribution.id}`)
    this.contributions.set(contribution.id, contribution)
  }

  get kit(): ArxEditorKit {
    if (!this.built) throw illegalState('The editor has not started')
    return this.built
  }

  seal(): void {
    if (this.built) return
    let nodes = baseSchema.spec.nodes
    let marks = baseSchema.spec.marks
    const publishText: Record<string, (node: ArxJsonNode) => string> = {}
    const dataSources: Record<string, ArxDataSource> = {}
    const components: Record<string, ArxEditorComponent> = {}
    const controls: Record<string, ControlPolicy> = { ...DEFAULT_CONTROL_POLICIES }
    const contributions = this.contributions.values()
    const retiredNodes = new Set<string>()
    const retiredMarks = new Set<string>()
    for (const contribution of contributions) {
      for (const [id, source] of Object.entries(contribution.dataSources ?? {})) {
        if (Object.hasOwn(dataSources, id) || !id || !source.layouts.length) throw illegalState(`Invalid or duplicate data source: ${id}`)
        dataSources[id] = source
      }
      for (const [name, render] of Object.entries(contribution.publishText ?? {})) {
        if (!contribution.nodes?.[name] || publishText[name])
          throw illegalState(`Publication renderer must belong to a contributed node: ${name}`)
        publishText[name] = render
      }
      const version = contribution.version ?? 1
      if (!Number.isSafeInteger(version) || version < 1) throw illegalState(`Invalid data version: ${contribution.id}`)
      for (let from = 1; from < version; from++) {
        if (!contribution.migrations?.[from]) throw illegalState(`Missing migration ${contribution.id}: ${from} → ${from + 1}`)
      }
      for (const name of contribution.legacyNodes ?? []) {
        if (nodes.get(name) || retiredNodes.has(name)) throw illegalState(`Legacy editor node already registered: ${name}`)
        retiredNodes.add(name)
      }
      for (const name of contribution.legacyMarks ?? []) {
        if (marks.get(name) || retiredMarks.has(name)) throw illegalState(`Legacy editor mark already registered: ${name}`)
        retiredMarks.add(name)
      }
      for (const [name, spec] of Object.entries(contribution.nodes ?? {})) {
        if (spec.attrs && Object.hasOwn(spec.attrs, 'arxId')) throw illegalState(`Reserved editor attribute: ${name}.arxId`)
        if (!spec.toDOM) throw illegalState(`Editor node needs toDOM for clipboard and rendering: ${name}`)
        if (nodes.get(name) || retiredNodes.has(name)) throw illegalState(`Editor node already registered: ${name}`)
      }
      for (const [name, spec] of Object.entries(contribution.marks ?? {})) {
        if (!spec.toDOM) throw illegalState(`Editor mark needs toDOM for clipboard and rendering: ${name}`)
        if (marks.get(name) || retiredMarks.has(name)) throw illegalState(`Editor mark already registered: ${name}`)
      }
      nodes = nodes.append(contribution.nodes ?? {})
      marks = marks.append(contribution.marks ?? {})
      for (const [name, component] of Object.entries(contribution.components ?? {})) {
        if (!contribution.nodes?.[name] || components[name]) throw illegalState(`Component must belong to a contributed node: ${name}`)
        components[name] = component
      }
      for (const [name, policy] of Object.entries(contribution.controls ?? {})) {
        if (!contribution.nodes?.[name] || controls[name]) throw illegalState(`Control policy must belong to a contributed node: ${name}`)
        controls[name] = policy
      }
    }
    const schema = new Schema({ nodes: identityNodes(nodes), marks })
    for (const [name, component] of Object.entries(components)) {
      const node = schema.nodes[name]
      if (!node.isLeaf && !node.spec.atom && !component.content) throw illegalState(`Editable component needs contentDOM: ${name}`)
    }
    for (const [name, policy] of Object.entries(controls)) {
      for (const attr of Object.keys(policy)) {
        if (!Object.hasOwn(schema.nodes[name].spec.attrs ?? {}, attr)) throw illegalState(`Unknown interactive attribute: ${name}.${attr}`)
      }
    }
    const commands = buildBlockCommands(schema)
    const ids = new Set(commands.map((command) => command.id))
    for (const contribution of contributions) {
      for (const command of contribution.commands?.(schema) ?? []) {
        if (!command.id || ids.has(command.id)) throw illegalState(`Editor command already registered: ${command.id}`)
        ids.add(command.id)
        commands.push(command)
      }
    }
    this.built = Object.freeze({
      dataSources: Object.freeze(dataSources),
      publishText: Object.freeze(publishText),
      format: {
        versions: contributions.map((owner) => ({
          id: owner.id,
          version: owner.version ?? 1,
          nodes: [...Object.keys(owner.nodes ?? {}), ...(owner.legacyNodes ?? [])],
          marks: [...Object.keys(owner.marks ?? {}), ...(owner.legacyMarks ?? [])],
          migrations: owner.migrations ?? {},
        })),
      },
      schema,
      commands: Object.freeze(commands),
      components: Object.freeze(components),
      controls: Object.freeze(controls),
      plugins: () => contributions.flatMap((contribution) => contribution.plugins?.(schema) ?? []),
    })
  }
}

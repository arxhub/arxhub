import { Extension } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { Container } from '@arxhub/stdlib/collections/container'
import { type MarkSpec, type NodeSpec, Schema } from 'prosemirror-model'
import type { Plugin } from 'prosemirror-state'
import type { Component } from 'vue'
import type { ArxAssetStore } from './assets'
import type { ArxDocumentLinks } from './document-links'
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
  nodes?: Record<string, NodeSpec>
  marks?: Record<string, MarkSpec>
  components?: Record<string, ArxEditorComponent>
  controls?: Record<string, ControlPolicy>
  commands?: (schema: Schema) => BlockCommand[]
  plugins?: (schema: Schema) => Plugin[]
}

export interface ArxEditorKit {
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
    const components: Record<string, ArxEditorComponent> = {}
    const controls: Record<string, ControlPolicy> = { ...DEFAULT_CONTROL_POLICIES }
    const contributions = this.contributions.values()
    for (const contribution of contributions) {
      for (const [name, spec] of Object.entries(contribution.nodes ?? {})) {
        if (!spec.toDOM) throw illegalState(`Editor node needs toDOM for clipboard and rendering: ${name}`)
        if (nodes.get(name)) throw illegalState(`Editor node already registered: ${name}`)
      }
      for (const [name, spec] of Object.entries(contribution.marks ?? {})) {
        if (!spec.toDOM) throw illegalState(`Editor mark needs toDOM for clipboard and rendering: ${name}`)
        if (marks.get(name)) throw illegalState(`Editor mark already registered: ${name}`)
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
    const schema = new Schema({ nodes, marks })
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
      schema,
      commands: Object.freeze(commands),
      components: Object.freeze(components),
      controls: Object.freeze(controls),
      plugins: () => contributions.flatMap((contribution) => contribution.plugins?.(schema) ?? []),
    })
  }
}

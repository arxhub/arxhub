import { definePluginManifest, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { internalServer } from '@arxhub/errors'
import { type ArxEditorControlProps, ArxEditorExtension } from '@arxhub/plugin-editor/ui'
import { Button } from '@arxhub/uikit/core'
import { defineComponent, h } from 'vue'

let failedOnce = false
const Rating = defineComponent(
  (props: ArxEditorControlProps) => () =>
    h('div', { 'data-testid': 'plugin-rating' }, [
      h('output', { 'aria-label': 'Rating value' }, String(props.node.attrs.value)),
      h(
        Button,
        {
          disabled: props.mode === 'readonly' || props.node.attrs.value >= props.node.attrs.maximum,
          onClick: () => props.change({ value: props.node.attrs.value + 1 }),
        },
        () => 'Increase rating',
      ),
      h(
        Button,
        {
          disabled: props.mode === 'readonly',
          onClick: () => props.change({ value: 999 }),
        },
        () => 'Invalid rating',
      ),
    ]),
  { props: ['node', 'mode', 'change'] },
)

const Recoverable = defineComponent(() => {
  if (!failedOnce) {
    failedOnce = true
    throw internalServer(undefined, 'Fixture renderer failed once')
  }
  return () => h('div', 'Recovered plugin component')
})

export class ArxComponentsFixturePlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, definePluginManifest({ name: 'ArxComponentsFixture', version: '1.0.0', author: 'e2e' }))
  }

  override configure(ctx: PluginContext): void {
    ctx.extensions.get(ArxEditorExtension).register({
      id: 'fixture.rating',
      nodes: {
        fixture_recoverable: {
          group: 'block',
          atom: true,
          attrs: { payload: { default: 'keep', validate: 'string' } },
          toDOM: (node) => ['div', node.attrs.payload],
        },
        fixture_rating: {
          group: 'block',
          atom: true,
          attrs: { value: { default: 0, validate: 'number' }, maximum: { default: 5, validate: 'number' } },
          toDOM: (node) => ['div', { 'data-rating': node.attrs.value, 'data-maximum': node.attrs.maximum }, String(node.attrs.value)],
          parseDOM: [
            {
              tag: 'div[data-rating]',
              getAttrs: (element) => ({
                value: Number(element.dataset.rating),
                maximum: Number(element.dataset.maximum),
              }),
            },
          ],
        },
      },
      components: { fixture_rating: { component: Rating }, fixture_recoverable: { component: Recoverable } },
      controls: { fixture_rating: { value: (value, before) => typeof value === 'number' && value >= 0 && value <= before.attrs.maximum } },
      commands: (schema) => [
        {
          id: 'fixture.rating',
          label: 'Rating',
          icon: 'lu:star',
          keywords: 'rating',
          run: (state, dispatch) => {
            const { $from } = state.selection
            if ($from.parent.type !== schema.nodes.paragraph) return false
            dispatch?.(
              state.tr.replaceWith($from.before(), $from.after(), [schema.nodes.fixture_rating.create(), schema.nodes.paragraph.create()]),
            )
            return true
          },
        },
      ],
    })
  }
}

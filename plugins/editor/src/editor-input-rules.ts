import type { Schema } from 'prosemirror-model'
import { InputRule, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules'

export function buildInputRules(schema: Schema): InputRule[] {
  const rules: InputRule[] = []

  if (schema.nodes.heading) {
    rules.push(
      textblockTypeInputRule(/^(#{1,3})\s$/, schema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
    )
  }

  if (schema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote))
  }

  if (schema.nodes.code_block) {
    rules.push(textblockTypeInputRule(/^```(\w*)$/, schema.nodes.code_block, (match) => ({
      language: match[1] || null,
    })))
  }

  if (schema.nodes.bullet_list) {
    rules.push(wrappingInputRule(/^\s*([-*])\s$/, schema.nodes.bullet_list))
  }

  if (schema.nodes.ordered_list) {
    rules.push(
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes.ordered_list,
        (match) => ({ order: +match[1] }),
        (match, node) => node.childCount + (node.attrs.order as number) === +match[1],
      ),
    )
  }

  return rules
}

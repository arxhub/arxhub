import { validation } from '@arxhub/errors'
import type { NodeSpec } from 'prosemirror-model'
import { validateAssetPath } from './assets'

function assetNode(image: boolean): NodeSpec {
  return {
    group: 'block',
    atom: true,
    attrs: {
      path: { default: null, validate: validateAssetPath },
      name: { default: '', validate: 'string' },
      mime: { default: '', validate: 'string' },
      size: {
        default: 0,
        validate: (value: unknown) => {
          if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw validation('Invalid attachment size')
        },
      },
      caption: { default: '', validate: 'string' },
      ...(image
        ? {
            alt: { default: '', validate: 'string' },
            width: {
              default: 100,
              validate: (value: unknown) => {
                if (typeof value !== 'number' || !Number.isFinite(value) || value < 10 || value > 100)
                  throw validation('Image width must be between 10% and 100%')
              },
            },
          }
        : {}),
    },
    parseDOM: [
      {
        tag: `div[data-arx-asset="${image ? 'image' : 'file'}"]`,
        priority: 100,
        getAttrs: (dom: HTMLElement) => {
          try {
            const attrs: unknown = JSON.parse(dom.dataset.asset ?? '{}')
            if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return false
            const values = attrs as Record<string, unknown>
            const strings = ['name', 'mime', 'caption', ...(image ? ['alt'] : [])]
            const allowed = new Set(['arxId', 'path', 'size', ...strings, ...(image ? ['width'] : [])])
            if (Object.keys(values).some((key) => !allowed.has(key))) return false
            if (values.arxId != null && typeof values.arxId !== 'string') return false
            if (strings.some((key) => values[key] !== undefined && typeof values[key] !== 'string')) return false
            if (values.size !== undefined && (typeof values.size !== 'number' || !Number.isSafeInteger(values.size) || values.size < 0))
              return false
            if (
              image &&
              values.width !== undefined &&
              (typeof values.width !== 'number' || !Number.isFinite(values.width) || values.width < 10 || values.width > 100)
            )
              return false
            validateAssetPath(values.path ?? null)
            return values
          } catch {
            return false
          }
        },
      },
    ],
    toDOM: (node) => [
      'div',
      { 'data-arx-asset': image ? 'image' : 'file', 'data-asset': JSON.stringify(node.attrs) },
      node.attrs.caption || node.attrs.name || (image ? 'Image' : 'File attachment'),
    ],
  }
}

export const assetNodes: Record<string, NodeSpec> = { image_block: assetNode(true), attachment: assetNode(false) }

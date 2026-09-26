import { type Static, Type } from '@sinclair/typebox'

// Synced (no `deviceLocal`): how much context a diff keeps is a reading preference of the vault's owner, and a
// history that folds differently on each device would read as two different histories.
export const DiffConfigSchema = Type.Object(
  {
    'context.blocks': Type.Integer({
      title: 'Контекст вокруг правки — блоки',
      description: 'Сколько неизменённых блоков документа или таблицы оставлять рядом с правкой; остальное сворачивается.',
      group: 'Контекст',
      minimum: 0,
      maximum: 20,
      default: 2,
    }),
    'context.lines': Type.Integer({
      title: 'Контекст вокруг правки — строки',
      description: 'Сколько неизменённых строк текстового файла оставлять рядом с правкой.',
      group: 'Контекст',
      minimum: 0,
      maximum: 50,
      default: 3,
    }),
  },
  { description: 'Как ArxHub показывает сравнение версий.' },
)

export type DiffConfig = Static<typeof DiffConfigSchema>

export interface DiffSettings {
  contextBlocks: number
  contextLines: number
}

export const DEFAULT_DIFF_SETTINGS: DiffSettings = { contextBlocks: 2, contextLines: 3 }

// readConfig applies defaults without validating, and the file can be edited by hand — so every field is read
// on its own and a nonsense value costs that field only.
export function toDiffSettings(config: Partial<DiffConfig>): DiffSettings {
  return {
    contextBlocks: integerIn(config['context.blocks'], 0, 20, DEFAULT_DIFF_SETTINGS.contextBlocks),
    contextLines: integerIn(config['context.lines'], 0, 50, DEFAULT_DIFF_SETTINGS.contextLines),
  }
}

function integerIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

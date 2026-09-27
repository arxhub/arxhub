import { setLanguagePreference } from '@arxhub/i18n'
import { catalogProblems, manifestProblems } from '@arxhub/i18n/testing'
import { afterEach, expect, test } from 'vitest'
import { aiWorkspaceError } from '../errors'
import { messages } from '../i18n/messages'
import { manifest, serverManifest } from '../manifest'
import { errorText } from '../ui/error-text'
import { sessionDetail, sideLabel } from '../ui/use-ai-workspace'

afterEach(() => setLanguagePreference('en'))

test('the Russian catalog covers every English key', () => {
  expect(catalogProblems(messages)).toEqual([])
})

test('wire values read in the interface language, and unknown ones pass through', () => {
  const session = { sessionId: 's', status: 'open', result: null, baseSnapshotHash: '', changes: [], actions: [], sources: [] }
  expect(sessionDetail(session)).toBe('open · 0 changes')
  setLanguagePreference('ru')
  expect(sessionDetail({ ...session, changes: [{ pathname: 'a', kind: 'modified' }] })).toBe('открыта · 1 изменение')
  expect(sideLabel('Worktree')).toBe('Рабочая копия')
  expect(sideLabel('Somewhere')).toBe('Somewhere')
  const error = aiWorkspaceError('AiSourceMissing', 404, { path: 'a.md' })
  expect(error.message).toBe('Source file is not available: a.md')
  expect(errorText(error)).toBe('Файл источника недоступен: a.md')
})

test('the manifest describes the plugin in Russian too', () => {
  expect(manifestProblems(manifest, serverManifest)).toEqual([])
})

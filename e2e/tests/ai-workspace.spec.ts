import type { Page } from '@playwright/test'
import { expect, openType, SEEDED_MNEMONIC, test } from './fixtures'
import { mcpCallTool } from './ai-workspace-mcp'

// Spec: forge-wiki APP-02-*-QA / UJ-27..UJ-29 (26-ai-workspace).
const AI_WORKSPACE_TYPE_ID = 'arxhub.ai-workspace'

async function openAiWorkspace(page: Page): Promise<void> {
  await openType(page, 'AI workspace', AI_WORKSPACE_TYPE_ID)
}

function parseToolJson<T>(text: string): T {
  return JSON.parse(text) as T
}

test.describe('ai workspace agent channel', () => {
  // Shared state/AiWorkspace on one stand — parallel workers would steal each other's sessions.
  test.describe.configure({ mode: 'serial' })

  test('UJ-27 external agent writes only in a worktree session', async ({ app, vault }) => {
    test.setTimeout(60_000)
    const note = await vault.write('ai-workspace-uj27.md', 'main body A\n')

    const created = await mcpCallTool(app, SEEDED_MNEMONIC, 'create_session')
    const session = parseToolJson<{ sessionId: string }>(created.text)
    expect(session.sessionId).toBeTruthy()

    await mcpCallTool(app, SEEDED_MNEMONIC, 'write', {
      sessionId: session.sessionId,
      pathname: note,
      content: 'overlay body B\n',
    })

    expect(await vault.read(note)).toBe('main body A\n')
    await openAiWorkspace(app)
    await expect(app.getByTestId('ai-workspace-proposal')).toBeVisible()
  })

  test('UJ-28 proposal screen lists changes and accepts as a whole', async ({ app, vault }) => {
    test.setTimeout(60_000)
    const note = await vault.write('ai-workspace-uj28.md', 'before\n')

    const created = await mcpCallTool(app, SEEDED_MNEMONIC, 'create_session')
    const { sessionId } = parseToolJson<{ sessionId: string }>(created.text)

    await mcpCallTool(app, SEEDED_MNEMONIC, 'write', {
      sessionId,
      pathname: note,
      content: 'after from agent\n',
    })
    await mcpCallTool(app, SEEDED_MNEMONIC, 'propose', { sessionId })

    await app.reload()
    await openAiWorkspace(app)
    const proposal = app.getByTestId('ai-workspace-proposal')
    await expect(proposal).toBeVisible()
    await expect(proposal.getByText(`modified · ${note}`, { exact: false })).toBeVisible()
    await proposal.getByText(`modified · ${note}`, { exact: false }).click()
    await expect(app.getByTestId('ai-workspace-diff')).toBeVisible()
    await expect(app.getByTestId('diff-view')).toBeVisible()
    await proposal.getByRole('button', { name: 'Accept all', exact: true }).click()
    await expect.poll(async () => vault.read(note)).toBe('after from agent\n')
  })

  test('UJ-29 answers cite vault sources without writing', async ({ app, vault }) => {
    test.setTimeout(60_000)
    const marker = `unique-ai-source-${Date.now()}`
    const note = await vault.write('ai-workspace-uj29.md', `Context about ${marker}.\n`)

    const created = await mcpCallTool(app, SEEDED_MNEMONIC, 'create_session')
    const { sessionId } = parseToolJson<{ sessionId: string }>(created.text)

    const search = await mcpCallTool(app, SEEDED_MNEMONIC, 'search', { sessionId, query: marker })
    const body = parseToolJson<{ sources?: Array<{ pathname: string }> }>(search.text)
    expect(body.sources?.some((s) => s.pathname.includes(note) || s.pathname.endsWith(note))).toBe(true)
    expect(await vault.read(note)).toContain(marker)

    await app.reload()
    await openAiWorkspace(app)
    const sources = app.getByTestId('ai-workspace-sources')
    await expect(sources).toBeVisible()
    await expect(sources.getByText(note, { exact: false })).toBeVisible()
    await sources.getByRole('button', { name: new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
    // Jump opens Notes on the main vault file (not the AI workspace staging path).
    await expect(app.getByRole('button', { name: /^Notes(,|$)/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(app.getByText(marker, { exact: false }).first()).toBeVisible()
  })
})

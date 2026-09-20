import { apiBaseUrl, Plugin, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner, signingMiddleware } from '@arxhub/crypto'
import { createHttpClient } from '@arxhub/http'
import { NOTES_TYPE_ID, NotesExtension } from '@arxhub/plugin-notes'
import { KeyringExtension } from '@arxhub/plugin-protection'
import { RepositoryExtension } from '@arxhub/plugin-repository'
import { ShellExtension } from '@arxhub/plugin-shell'
import { VaultWatcher, type VfsChange } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { applyAcceptWithMerge } from './accept-with-merge'
import { AiWorkspaceExtension } from './ai-workspace-extension'
import { AI_WORKSPACE_TYPE_ID } from './contributions'
import { AI_WORKSPACE_NAMESPACE, manifest } from './manifest'
import type { CompareMode } from './session-store'
import AiWorkspaceHost from './ui/AiWorkspaceHost.vue'
import type { SessionView } from './ui/AiWorkspacePage.vue'

function stagingPath(sessionId: string, pathname: string): string {
  return `_ai-workspace/${sessionId}/${pathname.replace(/^\/+/, '')}`
}

function vaultPathFromStaging(sessionId: string, staging: string): string | null {
  const prefix = `_ai-workspace/${sessionId}/`
  if (!staging.startsWith(prefix)) return null
  return staging.slice(prefix.length)
}

export class AiWorkspacePlugin extends Plugin {
  private unwatch: (() => void) | null = null
  private syncing = new Set<string>()

  constructor(args: ConstructorParameters<typeof Plugin>[0]) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)

    const signer = new MutableRequestSigner()
    let clientInstalled = false
    const http = () => {
      if (!clientInstalled) {
        const keyring = ctx.extensions.get(KeyringExtension).keyring
        if (keyring) {
          signer.install(keyring)
          clientInstalled = true
        }
      }
      return createHttpClient(apiBaseUrl('', AI_WORKSPACE_NAMESPACE), { middlewares: [signingMiddleware(signer)] })
    }

    const clearStaging = async (sessionId: string) => {
      if (!ctx.extensions.has(NotesExtension)) return
      const notes = ctx.extensions.get(NotesExtension)
      try {
        await notes.vfs.delete(`_ai-workspace/${sessionId}`, { recursive: true, force: true })
      } catch {
        // best-effort
      }
    }

    ctx.extensions.register(AiWorkspaceExtension, () => ({
      loadSessions: async () => {
        const list = await http().get('/sessions').json<{ sessions: Array<{ sessionId: string }> }>()
        const views: SessionView[] = []
        for (const row of list.sessions ?? []) {
          views.push(await http().get(`/sessions/${row.sessionId}`).json<SessionView>())
        }
        return views
      },
      accept: async (sessionId: string) => {
        const notes = ctx.extensions.get(NotesExtension)
        const repository = ctx.extensions.get(RepositoryExtension)
        const view = await http().get(`/sessions/${sessionId}`).json<SessionView>()
        await applyAcceptWithMerge({
          changes: view.changes,
          beforeClose: (pathname) => notes.beforeClose(pathname),
          readSide: async (pathname, side) => {
            if (side === 'main') {
              const file = notes.vfs.file(pathname)
              if (!(await file.exists())) return ''
              return file.readText()
            }
            const compared = await http()
              .url(`/sessions/${sessionId}/files/compare`)
              .post({ pathname, mode: 'agent' })
              .json<{ left: string; right: string }>()
            return side === 'base' ? compared.left : compared.right
          },
          writeVault: async (pathname, content) => {
            await notes.vfs.file(pathname).writeText(content)
          },
          deleteVault: async (pathname) => {
            if (await notes.vfs.exists(pathname)) {
              await notes.vfs.delete(pathname, { recursive: true, force: true })
            }
          },
          mergeContent: (pathname, base, local, remote) => repository.mergeContent(pathname, base, local, remote),
          archive: async () => {
            await http().url(`/sessions/${sessionId}/accept`).post({ clientApplied: true }).res()
          },
        })
        await clearStaging(sessionId)
      },
      reject: async (sessionId: string) => {
        await http().url(`/sessions/${sessionId}/reject`).post({}).res()
        await clearStaging(sessionId)
      },
      compare: async (sessionId: string, pathname: string, mode: CompareMode) => {
        return http()
          .url(`/sessions/${sessionId}/files/compare`)
          .post({ pathname, mode })
          .json<{ leftLabel: string; rightLabel: string; left: string; right: string }>()
      },
      openOverlay: async (sessionId: string, pathname: string) => {
        const notes = ctx.extensions.get(NotesExtension)
        const shell = ctx.extensions.get(ShellExtension)
        const content = await http().url(`/sessions/${sessionId}/files/read`).post({ pathname }).json<{ content: string }>()
        const staged = stagingPath(sessionId, pathname)
        await notes.vfs.file(staged).writeText(content.content)
        await shell.workspace.openObject(NOTES_TYPE_ID, { id: staged })
      },
      openSource: async (pathname: string, excerpt: string) => {
        const notes = ctx.extensions.get(NotesExtension)
        const shell = ctx.extensions.get(ShellExtension)
        const path = pathname.replace(/^\/+/, '')
        const file = notes.vfs.file(path)
        if (!(await file.exists())) {
          throw new Error(`Source file is not available: ${path}`)
        }
        const text = excerpt.trim()
        const opened = await shell.workspace.openObject(
          NOTES_TYPE_ID,
          text ? { id: path, at: { text } } : { id: path },
        )
        if (opened == null) throw new Error(`Could not open source: ${path}`)
      },
    }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    ctx.extensions.get(ShellExtension).types.register({
      id: AI_WORKSPACE_TYPE_ID,
      title: 'AI workspace',
      icon: 'lu:bot',
      pinned: false,
      order: 80,
      content: markRaw(AiWorkspaceHost),
    })

    if (ctx.services.has(VaultWatcher) && ctx.extensions.has(NotesExtension)) {
      const notes = ctx.extensions.get(NotesExtension)
      this.unwatch = ctx.services.get(VaultWatcher).subscribe((change: VfsChange) => {
        void this.onVaultChange(ctx, notes, change)
      })
    }
  }

  private async onVaultChange(ctx: PluginContext, notes: NotesExtension, change: VfsChange): Promise<void> {
    if (change.kind === 'deleted') return
    const path = change.pathname.replace(/^\/+/, '')
    if (!path.startsWith('_ai-workspace/')) return
    const parts = path.split('/')
    // _ai-workspace / <sessionId> / <rest...>
    if (parts.length < 3) return
    const sessionId = parts[1]
    const relative = vaultPathFromStaging(sessionId, path)
    if (!relative) return
    const key = `${sessionId}:${relative}`
    if (this.syncing.has(key)) return
    this.syncing.add(key)
    try {
      const signer = new MutableRequestSigner()
      const keyring = ctx.extensions.get(KeyringExtension).keyring
      if (keyring) signer.install(keyring)
      const http = createHttpClient(apiBaseUrl('', AI_WORKSPACE_NAMESPACE), { middlewares: [signingMiddleware(signer)] })
      const text = await notes.vfs.file(path).readText()
      await http.url(`/sessions/${sessionId}/files/write`).post({ pathname: relative, content: text }).res()
    } catch {
      // archived or unreachable — ignore
    } finally {
      this.syncing.delete(key)
    }
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.unwatch?.()
    this.unwatch = null
    await super.stop(ctx)
  }
}

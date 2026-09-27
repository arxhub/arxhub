import { apiBaseUrl, Plugin, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner, signingMiddleware } from '@arxhub/crypto'
import { createHttpClient } from '@arxhub/http'
import { DOCUMENTS_TYPE_ID, DocumentsExtension } from '@arxhub/plugin-documents'
import { KeyringExtension } from '@arxhub/plugin-protection'
import { RepositoryExtension } from '@arxhub/plugin-repository'
import { ShellExtension } from '@arxhub/plugin-shell'
import { VaultWatcher, type VfsChange } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { applyAcceptWithMerge } from './accept-with-merge'
import { AiWorkspaceExtension } from './ai-workspace-extension'
import { base64ToBytes } from './bytes-wire'
import { AI_WORKSPACE_TYPE_ID } from './contributions'
import { aiWorkspaceError } from './errors'
import { t } from './i18n/messages'
import { AI_WORKSPACE_NAMESPACE, manifest } from './manifest'
import type { CompareMode } from './session-store'
import type { CompareWire, SessionView } from './session-view'
import AiSessionsSheet from './ui/AiSessionsSheet.vue'
import AiWorkspaceHost from './ui/AiWorkspaceHost.vue'
import { aiWorkspaceBar } from './ui/ai-workspace-bar'
import { aiWorkspaceState, disposeAiWorkspaceState } from './ui/use-ai-workspace'

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
      if (!ctx.extensions.has(DocumentsExtension)) return
      const documents = ctx.extensions.get(DocumentsExtension)
      try {
        await documents.vfs.delete(`_ai-workspace/${sessionId}`, { recursive: true, force: true })
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
        const documents = ctx.extensions.get(DocumentsExtension)
        const repository = ctx.extensions.get(RepositoryExtension)
        const view = await http().get(`/sessions/${sessionId}`).json<SessionView>()
        await applyAcceptWithMerge({
          changes: view.changes,
          beforeClose: (pathname) => documents.beforeClose(pathname),
          readSide: async (pathname, side) => {
            if (side === 'main') {
              const file = documents.vfs.file(pathname)
              if (!(await file.exists())) return ''
              return file.readText()
            }
            const compared = await http().url(`/sessions/${sessionId}/files/compare`).post({ pathname, mode: 'agent' }).json<CompareWire>()
            return new TextDecoder().decode(base64ToBytes(side === 'base' ? compared.left : compared.right))
          },
          writeVault: async (pathname, content) => {
            await documents.vfs.file(pathname).writeText(content)
          },
          deleteVault: async (pathname) => {
            if (await documents.vfs.exists(pathname)) {
              await documents.vfs.delete(pathname, { recursive: true, force: true })
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
        const wire = await http().url(`/sessions/${sessionId}/files/compare`).post({ pathname, mode }).json<CompareWire>()
        return { ...wire, left: base64ToBytes(wire.left), right: base64ToBytes(wire.right) }
      },
      openOverlay: async (sessionId: string, pathname: string) => {
        const documents = ctx.extensions.get(DocumentsExtension)
        const shell = ctx.extensions.get(ShellExtension)
        const content = await http().url(`/sessions/${sessionId}/files/read`).post({ pathname }).json<{ content: string }>()
        const staged = stagingPath(sessionId, pathname)
        await documents.vfs.file(staged).writeText(content.content)
        await shell.workspace.openObject(DOCUMENTS_TYPE_ID, { id: staged })
      },
      openSource: async (pathname: string, excerpt: string) => {
        const documents = ctx.extensions.get(DocumentsExtension)
        const shell = ctx.extensions.get(ShellExtension)
        const path = pathname.replace(/^\/+/, '')
        const file = documents.vfs.file(path)
        if (!(await file.exists())) {
          throw aiWorkspaceError('AiSourceMissing', 404, { path })
        }
        const text = excerpt.trim()
        const opened = await shell.workspace.openObject(DOCUMENTS_TYPE_ID, text ? { id: path, at: { text } } : { id: path })
        if (opened == null) throw aiWorkspaceError('AiSourceNotOpened', 500, { path })
      },
    }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    ctx.extensions.get(ShellExtension).types.register({
      id: AI_WORKSPACE_TYPE_ID,
      title: () => t('title'),
      icon: 'lu:bot',
      pinned: false,
      order: 80,
      content: markRaw(AiWorkspaceHost),
      bar: () => aiWorkspaceBar(aiWorkspaceState(ctx.extensions.get(AiWorkspaceExtension))),
      summary: () => {
        const count = aiWorkspaceState(ctx.extensions.get(AiWorkspaceExtension)).sessions.value.length
        return t('sessionCount', { count })
      },
      sheet: { title: () => t('sessions'), content: markRaw(AiSessionsSheet) },
    })

    if (ctx.services.has(VaultWatcher) && ctx.extensions.has(DocumentsExtension)) {
      const documents = ctx.extensions.get(DocumentsExtension)
      this.unwatch = ctx.services.get(VaultWatcher).subscribe((change: VfsChange) => {
        void this.onVaultChange(ctx, documents, change)
      })
    }
  }

  private async onVaultChange(ctx: PluginContext, documents: DocumentsExtension, change: VfsChange): Promise<void> {
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
      const text = await documents.vfs.file(path).readText()
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
    disposeAiWorkspaceState(ctx.extensions.get(AiWorkspaceExtension))
    await super.stop(ctx)
  }
}

import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { CompareMode } from './session-store'
import type { SessionView } from './ui/AiWorkspacePage.vue'

export type CompareResult = {
  leftLabel: string
  rightLabel: string
  left: string
  right: string
}

export class AiWorkspaceExtension extends Extension {
  constructor(
    args: ExtensionArgs & {
      loadSessions: () => Promise<SessionView[]>
      accept: (sessionId: string) => Promise<void>
      reject: (sessionId: string) => Promise<void>
      compare: (sessionId: string, pathname: string, mode: CompareMode) => Promise<CompareResult>
      openOverlay: (sessionId: string, pathname: string) => Promise<void>
      openSource: (pathname: string, excerpt: string) => Promise<void>
    },
  ) {
    super(args)
    this.loadSessions = args.loadSessions
    this.accept = args.accept
    this.reject = args.reject
    this.compare = args.compare
    this.openOverlay = args.openOverlay
    this.openSource = args.openSource
  }

  readonly loadSessions: () => Promise<SessionView[]>
  readonly accept: (sessionId: string) => Promise<void>
  readonly reject: (sessionId: string) => Promise<void>
  readonly compare: (sessionId: string, pathname: string, mode: CompareMode) => Promise<CompareResult>
  readonly openOverlay: (sessionId: string, pathname: string) => Promise<void>
  readonly openSource: (pathname: string, excerpt: string) => Promise<void>
}

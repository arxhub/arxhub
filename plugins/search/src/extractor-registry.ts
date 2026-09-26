import { illegalState } from '@arxhub/errors'
import { type DocumentExtractor, extractorSignature } from '@arxhub/sql'

// The formats search can read beyond markdown and text, each contributed by the plugin that owns it. The
// set is sealed when search starts: the index is built under one signature of it (`reconcileExtractors`),
// and an extractor arriving after the walk began would leave the rows it would have read under the old
// rule with nothing to tell them apart.
export class ExtractorRegistry {
  private readonly registrations: DocumentExtractor[] = []
  private sealed = false

  register(extractor: DocumentExtractor): () => void {
    if (this.sealed) throw illegalState(`Document extractor "${extractor.id}" registered after search started; register it in configure()`)
    if (this.registrations.some((it) => it.id === extractor.id))
      throw illegalState(`A document extractor with id "${extractor.id}" is already registered`)
    this.registrations.push(extractor)
    // Removes THIS registration, not whichever currently holds the id — a plugin restarted under the same
    // id must not have its fresh registration pulled out by the old one's late unregister. Allowed after
    // the seal: an owner that stops must stop being read.
    return () => {
      const index = this.registrations.indexOf(extractor)
      if (index >= 0) this.registrations.splice(index, 1)
    }
  }

  seal(): void {
    this.sealed = true
  }

  list(): readonly DocumentExtractor[] {
    return this.registrations
  }

  signature(): string {
    return extractorSignature(this.registrations)
  }
}

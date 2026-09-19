import { hash } from '@arxhub/crypto'
import { illegalState, internalServer, validation } from '@arxhub/errors'
import { SaxesParser } from 'saxes'
import { parseReceiptJson, type ReceiptLookupOptions, type ReceiptPosition } from '../fiscal'
import { type FiscalReceipt, validateFiscalReceipt } from '../model'

const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/'
const SYNC_NS = 'urn://x-artefacts-gnivc-ru/inplat/servin/OpenApiMessageConsumerService/types/1.0'
const ASYNC_NS = 'urn://x-artefacts-gnivc-ru/inplat/servin/OpenApiAsyncMessageConsumerService/types/1.0'
const AUTH_NS = 'urn://x-artefacts-gnivc-ru/ais3/kkt/AuthService/types/1.0'
const TICKET_NS = 'urn://x-artefacts-gnivc-ru/ais3/kkt/KktTicketService/types/1.0'
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

interface XmlNode {
  name: string
  namespace: string
  text: string
  children: XmlNode[]
}

function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: '', namespace: '', text: '', children: [] }
  const stack = [root]
  const parser = new SaxesParser({ xmlns: true })
  parser.on('doctype', () => {
    throw validation('FNS returned an unsupported XML document.')
  })
  parser.on('opentag', (tag) => {
    if (stack.length > 64) throw validation('FNS returned excessively nested XML.')
    const node: XmlNode = { name: tag.local, namespace: tag.uri, text: '', children: [] }
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  })
  parser.on('text', (value) => {
    stack[stack.length - 1].text += value
  })
  parser.on('cdata', (value) => {
    stack[stack.length - 1].text += value
  })
  parser.on('closetag', () => {
    stack.pop()
  })
  parser.on('error', () => {
    throw validation('FNS returned malformed XML.')
  })
  parser.write(source).close()
  return root
}

function find(node: XmlNode, name: string, namespace: string): XmlNode[] {
  return [
    ...(node.name === name && node.namespace === namespace ? [node] : []),
    ...node.children.flatMap((child) => find(child, name, namespace)),
  ]
}

function field(node: XmlNode, name: string, namespace: string): string {
  const matches = find(node, name, namespace)
  if (matches.length !== 1 || !matches[0].text.trim()) throw validation(`FNS response has no unambiguous ${name}.`)
  return matches[0].text.trim()
}

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const element = (name: string, value: string | number): string => `<t:${name}>${escapeXml(String(value))}</t:${name}>`

export interface FnsClientOptions {
  // The base address issued together with the master token. Secrets stay in the headless process.
  baseUrl: string
  masterToken: string
  fetch?: typeof globalThis.fetch
  pollDelayMs?: number
}

export function validateReceiptPosition(value: ReceiptPosition | undefined): ReceiptPosition {
  if (
    !value ||
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  ) {
    throw validation('FNS requires your current location to request receipt details. Enable location or import the receipt JSON instead.')
  }
  return value
}

async function responseText(response: Response): Promise<string> {
  if (!response.body) throw illegalState('FNS returned an empty response.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > MAX_RESPONSE_BYTES) throw validation('FNS receipt exceeds the supported response size.')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw validation('FNS returned a response that is not valid UTF-8.')
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      reject(illegalState('Receipt download was cancelled.'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

// Official OpenAPI's Auth → CheckTicket → GetTicket protocol. WSDL/XSD references and operational
// requirements are recorded in the budget brief; no undocumented mobile-app credentials are used.
export class FnsReceiptClient {
  private readonly baseUrl: string
  private readonly masterToken: string
  private readonly fetch: typeof globalThis.fetch
  private readonly pollDelayMs: number
  private token: { value: string; expiresAt: number } | null = null
  private authenticating: Promise<string> | null = null

  constructor(options: FnsClientOptions) {
    let url: URL
    try {
      url = new URL(options.baseUrl)
    } catch {
      throw validation('ARXHUB_FNS_API_URL must be the HTTPS origin issued by FNS, without credentials or a path.')
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
      throw validation('ARXHUB_FNS_API_URL must be the HTTPS origin issued by FNS, without credentials or a path.')
    }
    if (!options.masterToken.trim()) throw validation('ARXHUB_FNS_MASTER_TOKEN is empty.')
    this.baseUrl = url.origin
    this.masterToken = options.masterToken.trim()
    this.fetch = options.fetch ?? globalThis.fetch
    this.pollDelayMs = options.pollDelayMs ?? 1000
  }

  async lookup(receipt: FiscalReceipt, userId: string, options: ReceiptLookupOptions = {}): Promise<unknown> {
    const fiscal = validateFiscalReceipt(receipt)
    const position = validateReceiptPosition(options.position)
    const signal = AbortSignal.any([AbortSignal.timeout(45000), ...(options.signal ? [options.signal] : [])])
    const token = await this.authenticate()
    signal.throwIfAborted()
    // FNS needs a stable per-user value, but it does not need the ArxHub public identity itself.
    const userPseudonym = await hash(new TextEncoder().encode(userId), 'sha256')
    const headers = { 'FNS-OpenApi-Token': token, 'FNS-OpenApi-UserToken': btoa(userPseudonym) }
    const info =
      element('Sum', fiscal.total) +
      element('Date', fiscal.issuedAt.length === 16 ? `${fiscal.issuedAt}:00` : fiscal.issuedAt) +
      element('Fn', fiscal.fn) +
      element('TypeOperation', fiscal.operation) +
      element('FiscalDocumentId', fiscal.fd) +
      element('FiscalSign', fiscal.fp)
    const geo = `<t:GeoInfo>${element('Latitude', position.latitude)}${element('Longitude', position.longitude)}</t:GeoInfo>`
    const check = await this.ticket('CheckTicket', info, geo, headers, signal)
    if (field(check, 'Code', TICKET_NS) !== '200')
      throw illegalState(
        `FNS could not verify this receipt (code ${field(check, 'Code', TICKET_NS)}). Check the fiscal details or retry later.`,
      )
    const response = await this.ticket('GetTicket', info, geo, headers, signal)
    if (field(response, 'Code', TICKET_NS) !== '200')
      throw illegalState(
        `FNS could not provide receipt details (code ${field(response, 'Code', TICKET_NS)}). Retry later or import the receipt JSON.`,
      )
    let json: unknown
    try {
      json = JSON.parse(field(response, 'Ticket', TICKET_NS))
    } catch {
      throw validation('FNS returned invalid receipt JSON.')
    }
    parseReceiptJson(json, fiscal)
    return json
  }

  private authenticate(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30000) return Promise.resolve(this.token.value)
    if (this.authenticating) return this.authenticating
    // Shared token acquisition has its own timeout: cancelling one purchase cannot abort another.
    this.authenticating = this.soap(
      '/open-api/AuthService/0.1',
      'GetMessageRequest',
      SYNC_NS,
      `<m:Message><t:AuthRequest xmlns:t="${AUTH_NS}"><t:AuthAppInfo>${element('MasterToken', this.masterToken)}</t:AuthAppInfo></t:AuthRequest></m:Message>`,
      {},
      AbortSignal.timeout(15000),
    )
      .then((response) => {
        const value = field(response, 'Token', AUTH_NS)
        const expiresAt = Date.parse(field(response, 'ExpireTime', AUTH_NS))
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw illegalState('FNS returned an expired access token.')
        this.token = { value, expiresAt }
        return value
      })
      .finally(() => {
        this.authenticating = null
      })
    return this.authenticating
  }

  private async ticket(
    kind: 'CheckTicket' | 'GetTicket',
    info: string,
    geo: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<XmlNode> {
    const request = `<m:Message><t:${kind}Request xmlns:t="${TICKET_NS}"><t:${kind}Info>${info}</t:${kind}Info>${geo}</t:${kind}Request></m:Message>`
    const sent = await this.soap('/open-api/ais3/KktService/0.1', 'SendMessageRequest', ASYNC_NS, request, headers, signal)
    const messageId = field(sent, 'MessageId', ASYNC_NS)
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await this.soap(
        '/open-api/ais3/KktService/0.1',
        'GetMessageRequest',
        ASYNC_NS,
        `<m:MessageId>${escapeXml(messageId)}</m:MessageId>`,
        headers,
        signal,
      )
      const status = field(response, 'ProcessingStatus', ASYNC_NS)
      if (status === 'COMPLETED') return response
      if (status !== 'PROCESSING') throw illegalState('FNS returned an unknown processing state.')
      await delay(this.pollDelayMs, signal)
    }
    throw illegalState('FNS is still processing this receipt. Save the purchase now and retry its details later.')
  }

  private async soap(
    path: string,
    operation: string,
    namespace: string,
    content: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<XmlNode> {
    const body = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><m:${operation} xmlns:m="${namespace}">${content}</m:${operation}></soap:Body></soap:Envelope>`
    let response: Response
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: `"urn:${operation}"`, ...headers },
        body,
      })
    } catch (error) {
      if (signal.aborted) throw illegalState('Receipt download was cancelled.')
      throw internalServer(error, 'Could not reach FNS to download the receipt. Retry later.')
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) this.token = null
      await response.body?.cancel()
      throw illegalState(`FNS request failed (${response.status}). Check server access or retry later.`)
    }
    const parsed = parseXml(await responseText(response))
    if (
      find(parsed, 'Fault', SOAP_NS).length ||
      find(parsed, 'AuthenticationFault', ASYNC_NS).length ||
      find(parsed, 'AuthServiceFault', AUTH_NS).length ||
      find(parsed, 'KktTicketServiceFault', TICKET_NS).length
    ) {
      this.token = null
      throw illegalState('FNS refused the request. Check the server credentials and fiscal details.')
    }
    return parsed
  }
}

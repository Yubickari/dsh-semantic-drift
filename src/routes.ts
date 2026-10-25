/**
 * HTTP surface between the browser half and the host service.
 *
 * The routes are a thin transport: every one of them parses, delegates to
 * {@link SemanticService}, and serializes. No validation rule lives here, so a
 * request cannot reach a different outcome than the equivalent agent tool.
 *
 * Request safety: the panel is same-origin browser code, so a write is accepted
 * only with a JSON content type (which forces a CORS preflight for a foreign
 * page) and never with `sec-fetch-site: cross-site`. Combined with workspace
 * authorization in the service, a request can only ever write inside a
 * registered workspace.
 *
 * @module dsh-semantic-drift/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { API_PREFIX } from './protocol.ts'
import type {
  ApiErrorCode,
  ApiFailure,
  DetectorId,
  ValidationIssue,
  VocabularyDocument,
} from './protocol.ts'
import { SemanticError, statusForError } from './service.ts'
import type { SemanticService } from './service.ts'
import { WorkspaceError } from './workspace.ts'

/** Largest accepted JSON body for a document save. */
const DOCUMENT_LIMIT = 8 * 1_024 * 1_024
/** Largest accepted raw YAML body. */
const RAW_LIMIT = 8 * 1_024 * 1_024

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function writeJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { ...JSON_HEADERS, ...headers })
  res.end(payload)
}

function failure(code: ApiErrorCode, message: string, issues?: ValidationIssue[]): ApiFailure {
  return { ok: false, code, message, ...(issues === undefined || issues.length === 0 ? {} : { issues }) }
}

function sendFailure(res: ServerResponse, error: unknown): void {
  if (error instanceof WorkspaceError) {
    const code: ApiErrorCode = error.code === 'forbidden' ? 'forbidden' : 'not-found'
    writeJson(res, statusForError(error), failure(code, error.message))
    return
  }
  if (error instanceof SemanticError) {
    const known = new Set<ApiErrorCode>(['bad-request', 'invalid-vocabulary', 'not-found', 'conflict', 'unsupported'])
    const code: ApiErrorCode = known.has(error.code as ApiErrorCode) ? (error.code as ApiErrorCode) : 'bad-request'
    writeJson(res, statusForError(error), failure(code, error.message, error.issues))
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeJson(res, 500, { ok: false, code: 'unsupported', message, detail: message } as ApiFailure)
}

/** Reject requests a foreign page could have produced. */
function sameOrigin(req: IncomingMessage): boolean {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  return true
}

/** Read the request body, refusing anything above `limit` bytes. */
async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new SemanticError('bad-request', `Request body exceeds ${limit} bytes.`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', error => reject(error))
  })
}

/** Parse a JSON body with a clear failure instead of a stack trace. */
async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase()
  if (!contentType.startsWith('application/json')) {
    throw new SemanticError('content-type', 'A JSON content type is required for this request.')
  }
  const text = await readBody(req, limit)
  if (text.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new SemanticError('bad-json', `Malformed JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SemanticError('bad-json', 'The request body must be a JSON object.')
  }
  return parsed as Record<string, unknown>
}

function stringParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)
  return value === null || value === '' ? undefined : value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Build the route table for one activation.
 * @param service - the shared host service.
 * @param diagnostics - what this activation mounted, for the health route.
 */
export function makeSemanticRoutes(
  service: SemanticService,
  diagnostics: () => Record<string, unknown> = () => ({}),
): WebRoute[] {
  const healthRoute: WebRoute = {
    kind: 'exact',
    path: `${API_PREFIX}/health`,
    handler: (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, failure('method-not-allowed', 'Use GET.'))
      if (!sameOrigin(req)) return writeJson(res, 403, failure('forbidden', 'Cross-site request refused.'))
      writeJson(res, 200, { ok: true, ...diagnostics() })
    },
  }

  const state: WebRoute = {
    kind: 'exact',
    path: `${API_PREFIX}/state`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') return writeJson(res, 405, failure('method-not-allowed', 'Use GET.'))
        if (!sameOrigin(req)) return writeJson(res, 403, failure('forbidden', 'Cross-site request refused.'))
        const url = new URL(req.url ?? '/', 'http://localhost')
        writeJson(res, 200, await service.state(stringParam(url, 'workspace')))
      } catch (error) {
        sendFailure(res, error)
      }
    },
  }

  const scan: WebRoute = {
    kind: 'exact',
    path: `${API_PREFIX}/scan`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return writeJson(res, 405, failure('method-not-allowed', 'Use POST.'))
        if (!sameOrigin(req)) return writeJson(res, 403, failure('forbidden', 'Cross-site request refused.'))
        const body = await readJson(req, 64 * 1_024)
        const detectors = Array.isArray(body.detectors)
          ? (body.detectors.filter(value => typeof value === 'string') as DetectorId[])
          : undefined
        const paths = Array.isArray(body.paths)
          ? body.paths.filter((value): value is string => typeof value === 'string')
          : undefined
        const minConfidence = body.minConfidence === 'all'
          ? 'all'
          : body.minConfidence === 'high' || body.minConfidence === 'medium' || body.minConfidence === 'low'
            ? body.minConfidence
            : undefined
        writeJson(res, 200, await service.scan(optionalString(body.workspace), {
          ...(detectors === undefined ? {} : { detectors }),
          ...(paths === undefined ? {} : { paths }),
          ...(minConfidence === undefined ? {} : { minConfidence }),
        }))
      } catch (error) {
        sendFailure(res, error)
      }
    },
  }

  const save: WebRoute = {
    kind: 'exact',
    path: `${API_PREFIX}/save`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return writeJson(res, 405, failure('method-not-allowed', 'Use POST.'))
        if (!sameOrigin(req)) return writeJson(res, 403, failure('forbidden', 'Cross-site request refused.'))
        const body = await readJson(req, DOCUMENT_LIMIT)
        const document = body.document as VocabularyDocument | undefined
        if (document === undefined || typeof document !== 'object') {
          return writeJson(res, 400, failure('bad-request', '`document` is required.'))
        }
        const vocabulary = await service.save(optionalString(body.workspace), document)
        writeJson(res, 200, { ok: true, vocabulary })
      } catch (error) {
        sendFailure(res, error)
      }
    },
  }

  const raw: WebRoute = {
    kind: 'exact',
    path: `${API_PREFIX}/raw`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return writeJson(res, 405, failure('method-not-allowed', 'Use POST.'))
        if (!sameOrigin(req)) return writeJson(res, 403, failure('forbidden', 'Cross-site request refused.'))
        const body = await readJson(req, RAW_LIMIT)
        if (typeof body.text !== 'string') return writeJson(res, 400, failure('bad-request', '`text` is required.'))
        const vocabulary = await service.saveRaw(optionalString(body.workspace), body.text)
        writeJson(res, 200, { ok: true, vocabulary })
      } catch (error) {
        sendFailure(res, error)
      }
    },
  }

  const init: WebRoute = {
    kind: 'exact',
    path: `${API_PREFIX}/init`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return writeJson(res, 405, failure('method-not-allowed', 'Use POST.'))
        if (!sameOrigin(req)) return writeJson(res, 403, failure('forbidden', 'Cross-site request refused.'))
        const body = await readJson(req, 16 * 1_024)
        const vocabulary = await service.init(optionalString(body.workspace))
        writeJson(res, 200, { ok: true, vocabulary })
      } catch (error) {
        sendFailure(res, error)
      }
    },
  }

  const accept: WebRoute = {
    kind: 'exact',
    path: `${API_PREFIX}/accept`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return writeJson(res, 405, failure('method-not-allowed', 'Use POST.'))
        if (!sameOrigin(req)) return writeJson(res, 403, failure('forbidden', 'Cross-site request refused.'))
        const body = await readJson(req, 64 * 1_024)
        const conceptId = optionalString(body.conceptId)
        const symbol = optionalString(body.symbol)
        const reason = optionalString(body.reason)
        if (conceptId === undefined) return writeJson(res, 400, failure('bad-request', '`conceptId` is required.'))
        if (symbol === undefined) return writeJson(res, 400, failure('bad-request', '`symbol` is required.'))
        if (reason === undefined) {
          return writeJson(res, 400, failure('bad-request', '`reason` is required: an exception without a reason is an undocumented decision.'))
        }
        const result = await service.accept(optionalString(body.workspace), {
          conceptId,
          symbol,
          reason,
          ...(optionalString(body.path) === undefined ? {} : { path: optionalString(body.path) as string }),
        })
        writeJson(res, 200, { ok: true, vocabulary: result.state, concept: result.concept })
      } catch (error) {
        sendFailure(res, error)
      }
    },
  }

  return [healthRoute, state, scan, save, raw, init, accept]
}

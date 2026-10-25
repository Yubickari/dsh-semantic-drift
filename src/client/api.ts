/**
 * Browser-side transport.
 *
 * The base is DOCUMENT-RELATIVE on purpose: DSH serves the page with
 * `<base href="./">`, so a leading slash would escape a sub-path deployment.
 * The host registers the root-absolute prefix; this module drops the slash.
 *
 * @module dsh-semantic-drift/client/api
 */

import { API_PREFIX } from '../protocol.ts'
import type {
  AcceptRequest,
  ApiFailure,
  SaveRequest,
  SaveRawRequest,
  ScanResponse,
  StateResponse,
  ValidationIssue,
  VocabularyDocument,
  WriteResponse,
} from '../protocol.ts'

const BASE = API_PREFIX.replace(/^\//, '')

/** A refusal the host explained; `issues` carries positioned validation errors. */
export class ApiError extends Error {
  readonly code: string
  readonly issues: ValidationIssue[]

  constructor(code: string, message: string, issues: ValidationIssue[] = []) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.issues = issues
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}/${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(init.headers ?? {}),
      },
    })
  } catch (error) {
    throw new ApiError('unreachable', error instanceof Error ? error.message : String(error))
  }
  const text = await response.text()
  let body: unknown
  try {
    body = text === '' ? {} : JSON.parse(text)
  } catch {
    throw new ApiError('unexpected', `The host answered with ${response.status} and a non-JSON body.`)
  }
  if (body !== null && typeof body === 'object' && (body as ApiFailure).ok === false) {
    const failure = body as ApiFailure
    throw new ApiError(failure.code, failure.message, failure.issues ?? [])
  }
  if (!response.ok) throw new ApiError('unexpected', `The host answered with ${response.status}.`)
  return body as T
}

/** Read the vocabulary, workspaces and citation settings for one directory. */
export async function fetchState(workspace?: string): Promise<StateResponse> {
  const query = workspace === undefined ? '' : `?workspace=${encodeURIComponent(workspace)}`
  return await call<StateResponse>(`state${query}`)
}

/** Run one read-only scan. */
export async function runScan(workspace: string): Promise<ScanResponse> {
  return await call<ScanResponse>('scan', { method: 'POST', body: JSON.stringify({ workspace }) })
}

/** Replace the whole document. */
export async function saveDocument(workspace: string, document: VocabularyDocument): Promise<WriteResponse> {
  const request: SaveRequest = { workspace, document }
  return await call<WriteResponse>('save', { method: 'POST', body: JSON.stringify(request) })
}

/** Save hand-edited YAML. */
export async function saveRaw(workspace: string, text: string): Promise<WriteResponse> {
  const request: SaveRawRequest = { workspace, text }
  return await call<WriteResponse>('raw', { method: 'POST', body: JSON.stringify(request) })
}

/** Create an empty vocabulary with the default exclusions. */
export async function initVocabulary(workspace: string): Promise<WriteResponse> {
  return await call<WriteResponse>('init', { method: 'POST', body: JSON.stringify({ workspace }) })
}

/** Record an accepted exception. */
export async function acceptException(request: AcceptRequest): Promise<WriteResponse> {
  return await call<WriteResponse>('accept', { method: 'POST', body: JSON.stringify(request) })
}

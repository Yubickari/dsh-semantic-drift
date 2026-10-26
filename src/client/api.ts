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
  ConfigResponse,
  SaveRequest,
  SaveRawRequest,
  ScanResponse,
  SettingsEcho,
  SettingsRequest,
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

/** Read the plugin row's project settings and how to render each one. */
export async function fetchConfig(): Promise<ConfigResponse> {
  return await call<ConfigResponse>('config')
}

/**
 * Write one settings patch.
 *
 * Sent without a workspace on purpose: the route then answers the flat echo of
 * what it stored (`applied`) instead of a whole panel state, which is all this
 * page needs — and a settings write must not pull a state read that needs a
 * workspace just to prove it succeeded.
 */
export async function saveConfigPatch(patch: Record<string, unknown>): Promise<SettingsEcho> {
  const request: SettingsRequest = { patch }
  return await call<SettingsEcho>('settings', { method: 'POST', body: JSON.stringify(request) })
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

/**
 * Persist one plugin-row setting through the Host's config editor.
 *
 * The row reloads as part of the write, so the returned state is a best-effort
 * refresh: the panel reconciles with `/state` if the response is lost.
 */
export async function updateSettings(workspace: string, settings: { announceToAgent: boolean }): Promise<StateResponse> {
  return await call<StateResponse>('settings', {
    method: 'POST',
    body: JSON.stringify({ workspace, ...settings }),
  })
}

/**
 * The switch value a `/settings` response says actually took effect.
 *
 * The Host may echo `applied` — what it really wrote to the row — beside the
 * derived `effective` view; the echo wins, because a row reload can leave the
 * view a step behind the write.
 */
export function appliedAnnounce(response: StateResponse): boolean | undefined {
  const applied = (response as StateResponse & { applied?: { announceToAgent?: unknown } }).applied
  if (applied !== null && typeof applied === 'object' && typeof applied.announceToAgent === 'boolean') {
    return applied.announceToAgent
  }
  const effective = response.effective?.announceToAgent
  return typeof effective === 'boolean' ? effective : undefined
}

/** Record an accepted exception. */
export async function acceptException(request: AcceptRequest): Promise<WriteResponse> {
  return await call<WriteResponse>('accept', { method: 'POST', body: JSON.stringify(request) })
}

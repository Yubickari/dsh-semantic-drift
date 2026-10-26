import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config } from '../src/config.ts'
import { makeSemanticRoutes } from '../src/routes.ts'
import type { SemanticService } from '../src/service.ts'

/**
 * Integration test over the BUILT host artifact (`lib/index.js`), plus the HTTP
 * contract driven straight from `src/routes.ts`.
 *
 * The real registry validates a tool's `output.schema`, so a definition that
 * only looks right is not enough: this mounts the plugin on a minimal fake
 * context, then drives its tools and its prompt section the way the host does.
 * The route contract is driven from the source instead: a transport change is
 * then testable without a rebuild standing between the edit and the assertion.
 */

interface FakeCtx {
  get(name: string): unknown
  effect(callback: () => () => void, label?: string): () => void
  tools: { register(definition: unknown): () => void }
  systemPrompt: { section(section: Record<string, unknown>): () => void }
}

interface Harness {
  ctx: FakeCtx
  root: string
  tools: Array<Record<string, unknown>>
  routes: Array<Record<string, unknown>>
  sections: Array<Record<string, unknown>>
  dispose(): void
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-fiber-'))
  await mkdir(join(root, 'Alpha'))
  await mkdir(join(root, 'Beta'))
  await writeFile(join(root, 'Alpha', 'Alpha.csproj'), '<Project />\n')
  await writeFile(join(root, 'Beta', 'Beta.csproj'), '<Project />\n')
  await writeFile(join(root, 'Alpha', 'State.cs'), 'namespace A;\npublic enum DeviceState { Idle, Running }\n')
  await writeFile(join(root, 'Beta', 'State.cs'), 'namespace B;\npublic enum DeviceState { Idle, Running, Fault }\n')
  return root
}

function mount(root: string, extra: Record<string, unknown> = {}): Harness {
  const tools: Array<Record<string, unknown>> = []
  const routes: Array<Record<string, unknown>> = []
  const sections: Array<Record<string, unknown>> = []
  const cleanups: Array<() => void> = []
  const services: Record<string, unknown> = {
    ...extra,
    webServer: { register: (route: Record<string, unknown>) => { routes.push(route); return () => undefined } },
    workspaceRegistry: {
      list: () => [{ id: 'w1', title: 'fixture', path: root, sessionIds: [] }],
    },
    workingDirectory: { defaultDirectory: root },
  }
  const ctx: FakeCtx = {
    get: name => services[name],
    effect: callback => {
      const cleanup = callback()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return () => undefined
    },
    tools: { register: definition => { tools.push(definition as Record<string, unknown>); return () => undefined } },
    systemPrompt: { section: section => { sections.push(section); return () => undefined } },
  }
  return { ctx, root, tools, routes, sections, dispose: () => { for (const cleanup of cleanups.reverse()) cleanup() } }
}

test('the built host mounts five tools, nine routes and one prompt section', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  assert.deepEqual(
    harness.tools.map(tool => tool.name).sort(),
    ['drift_scan', 'semantic_accept', 'semantic_get', 'semantic_list', 'semantic_upsert'],
  )
  for (const tool of harness.tools) {
    assert.equal(typeof tool.description, 'string')
    const output = tool.output as { schema: unknown; render: unknown }
    assert.equal(typeof output.render, 'function')
    const parameters = tool.parameters as { type?: string }
    assert.equal(parameters.type, 'object', `${String(tool.name)} must declare an object-rooted parameter schema`)
  }
  assert.deepEqual(
    harness.routes.map(route => route.path).sort(),
    [
      '/semantic-drift/accept',
      '/semantic-drift/config',
      '/semantic-drift/health',
      '/semantic-drift/init',
      '/semantic-drift/raw',
      '/semantic-drift/save',
      '/semantic-drift/scan',
      '/semantic-drift/settings',
      '/semantic-drift/state',
    ],
  )
  assert.equal(harness.sections.length, 1)
  assert.equal(harness.sections[0].name, 'plugin:semantic-drift')
  harness.dispose()
})

test('tools round-trip through the mounted host: upsert, scan, accept, list', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  const byName = (name: string) => harness.tools.find(tool => tool.name === name) as {
    execute(args: Record<string, unknown>, exec: Record<string, unknown>): Promise<Record<string, unknown>>
  }

  const upserted = await byName('semantic_upsert').execute({
    conceptId: 'device.state',
    terms: '设备状态, 运行状态',
    kind: 'status',
    symbol: 'DeviceState',
    note: 'The device working state.',
  }, {})
  assert.equal(upserted.ok, true)
  assert.equal(upserted.created, true)

  const listed = await byName('semantic_list').execute({}, {})
  assert.equal(listed.ok, true)
  assert.equal((listed.concepts as unknown[]).length, 1)

  const got = await byName('semantic_get').execute({ symbol: 'DeviceState' }, {})
  assert.equal(got.ok, true)
  assert.equal((got.concept as { id: string }).id, 'device.state')

  const scanned = await byName('drift_scan').execute({ minConfidence: 'high' }, {})
  assert.equal(scanned.ok, true)
  const findings = scanned.findings as Array<{ detector: string; confidence: string }>
  assert.equal(findings.some(finding => finding.detector === 'contract-drift'), true)

  const accepted = await byName('semantic_accept').execute({
    conceptId: 'device.state',
    symbol: 'DeviceState',
    path: '**',
    reason: 'the enum is owned outside this repository',
  }, {})
  assert.equal(accepted.ok, true)
  const after = await byName('drift_scan').execute({ minConfidence: 'high' }, {})
  assert.equal((after.findings as unknown[]).length, 0, 'the accepted exception must mute the finding')

  const written = await readFile(join(root, '.dsh', 'semantics.yaml'), 'utf8')
  assert.match(written, /reason: the enum is owned outside this repository/)
  harness.dispose()
})

/** Drive one HTTP route with a JSON body, the way the web shell would. */
async function callRoute(
  route: Record<string, unknown>,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const handler = route.handler as (req: unknown, res: unknown) => Promise<void> | void
  const listeners: Record<string, Array<(value?: unknown) => void>> = { data: [], end: [], error: [] }
  const req = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    on(event: string, callback: (value?: unknown) => void) {
      ;(listeners[event] ??= []).push(callback)
      return req
    },
    destroy() {
      // nothing to tear down in the fake
    },
  }
  const payload = body === undefined ? '' : JSON.stringify(body)
  setTimeout(() => {
    for (const callback of listeners.data ?? []) callback(Buffer.from(payload))
    for (const callback of listeners.end ?? []) callback()
  }, 0)
  let status = 0
  let text = ''
  await handler(req, {
    writeHead(code: number) { status = code },
    end(chunk: string) { text = chunk },
  })
  await new Promise(resolve => setTimeout(resolve, 5))
  return { status, json: text === '' ? {} : JSON.parse(text) as Record<string, unknown> }
}

test('the accept route dispatches the exception ops and rejects an unknown one', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/accept') as Record<string, unknown>

  // A write must name its workspace: falling back to the Host default directory
  // would create a vocabulary in a project the caller never mentioned.
  const noWorkspace = await callRoute(route, 'POST', { op: 'add', conceptId: 'device.state', symbol: 'S', reason: 'r' })
  assert.equal(noWorkspace.status, 400)
  assert.match(String(noWorkspace.json.message), /must name its workspace/)

  const unknown = await callRoute(route, 'POST', { workspace: root, op: 'explode', conceptId: 'device.state' })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.json.code, 'bad-request')

  const missingSymbol = await callRoute(route, 'POST', { workspace: root, conceptId: 'device.state' })
  assert.equal(missingSymbol.status, 400, 'no op defaults to add, which needs a symbol')

  const missingReason = await callRoute(route, 'POST', {
    workspace: root,
    op: 'update',
    conceptId: 'device.state',
    symbol: 'DeviceState',
    previousPath: '**',
  })
  assert.equal(missingReason.status, 400)

  const noConcept = await callRoute(route, 'POST', {
    workspace: root,
    conceptId: 'device.absent',
    symbol: 'DeviceState',
    reason: 'r',
  })
  assert.equal(noConcept.status, 404, 'dispatch must reach the service, which reports the missing concept')
  harness.dispose()
})

test('a tool refusal is a value, not an exception', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  const get = harness.tools.find(tool => tool.name === 'semantic_get') as {
    execute(args: Record<string, unknown>, exec: Record<string, unknown>): Promise<Record<string, unknown>>
  }
  const result = await get.execute({ symbol: 'NothingHere' }, {})
  assert.equal(result.ok, false)
  assert.equal(result.code, 'concept-not-found')
  harness.dispose()
})

/** Read the health route synchronously, the way the web shell polls it. */
function callHealth(harness: Harness): Record<string, unknown> {
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/health') as unknown as {
    kind: string
    handler(req: unknown, res: unknown): void
  }
  assert.equal(route.kind, 'exact')
  let status = 0
  let body = ''
  route.handler({ method: 'GET', headers: {} }, {
    writeHead(code: number) { status = code },
    end(payload: string) { body = payload },
  })
  assert.equal(status, 200)
  return JSON.parse(body) as Record<string, unknown>
}

/** Call a prompt section the way an assembly does. */
function promptText(section: Record<string, unknown>): string {
  return (section.text as () => string)()
}

test('the health route reports what the activation mounted', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  const health = callHealth(harness)
  assert.equal(health.ok, true)
  assert.equal(health.tools, 5)
  assert.equal(health.routes, 9)
  assert.equal(health.promptSection, true)
  assert.equal(health.announceToAgent, true)
  harness.dispose()
})

test('announceToAgent=false keeps the section registered and lets it say nothing', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config({ announceToAgent: false }))
  // Registering and then unmounting the section per edit would reload the row
  // for a setting that only has to change what one string says.
  assert.equal(harness.sections.length, 1, 'the section is mounted either way')
  assert.equal(harness.sections[0].name, 'plugin:semantic-drift')
  assert.equal(promptText(harness.sections[0]), '', 'off means an empty section, not an absent one')
  assert.equal(harness.tools.length, 5, 'turning the prompt off must not disable the tools')
  const health = harness.routes.find(entry => entry.path === '/semantic-drift/health')
  assert.ok(health !== undefined, 'the health route mounts regardless of the prompt setting')
  harness.dispose()
})

test('a volatile switch is read live, without remounting the row', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  // The shape the Loader hands over for a volatile field: a live reference.
  let on = false
  // `meta.volatile` is the flag the Loader reads to commit the field in place
  // instead of disposing the row: the behaviour starts here, in the schema.
  assert.equal(module.Config.dict.announceToAgent.meta.volatile, true)
  module.apply(harness.ctx, { ...module.Config(), announceToAgent: { get: () => on } })
  assert.equal(harness.sections.length, 1)
  assert.equal(promptText(harness.sections[0]), '', 'off: mounted but silent')
  assert.equal(callHealth(harness).announceToAgent, false)

  on = true
  assert.match(promptText(harness.sections[0]), /Project vocabulary/, 'on: the same instance now announces')
  assert.equal(callHealth(harness).announceToAgent, true, 'health reports the live value')
  harness.dispose()
})

test('a vocabulary that cannot be parsed is reported as invalid, not as empty', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  await mkdir(join(root, '.dsh'), { recursive: true })
  await writeFile(join(root, '.dsh', 'semantics.yaml'), 'version: 1\nconcepts: [\n')
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  const list = harness.tools.find(tool => tool.name === 'semantic_list') as {
    execute(args: Record<string, unknown>, exec: Record<string, unknown>): Promise<Record<string, unknown>>
  }
  const listed = await list.execute({}, {})
  assert.equal(listed.ok, true)
  assert.equal(listed.valid, false, 'the caller must be able to tell "broken" from "empty"')
  const issues = listed.issues as Array<{ code: string }>
  assert.ok(issues.length > 0)
  assert.equal(issues[0].code, 'yaml-parse')

  const text = (harness.sections[0].text as () => string)()
  assert.match(text, /cannot be parsed/)
  assert.doesNotMatch(text, /No concept is recorded yet/, 'an unparsable file is not an empty vocabulary')
  harness.dispose()
})

test('the injection switch is written back through the Host config editor', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const edits: Array<{ entry: unknown; next: Record<string, unknown> }> = []
  const configEditor = {
    entries: () => [{ id: 'include:semantic-drift', name: 'dsh-semantic-drift' }],
    edit: async (entry: unknown, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>) => {
      edits.push({ entry, next: change({ vocabularyPath: '.dsh/semantics.yaml', announceToAgent: true }, {}) })
    },
  }
  const harness = mount(root, { configEditor })
  module.apply(harness.ctx, module.Config())
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/settings') as Record<string, unknown>

  const refused = await callRoute(route, 'POST', { announceToAgent: 'yes' })
  assert.equal(refused.status, 400)

  const applied = await callRoute(route, 'POST', { workspace: root, announceToAgent: false })
  assert.equal(applied.status, 200)
  assert.equal(edits.length, 1)
  const next = edits[0].next
  assert.equal(next.announceToAgent, false)
  assert.equal(next.vocabularyPath, '.dsh/semantics.yaml', 'the rest of the row config must survive the patch')
  const state = applied.json as Record<string, unknown>
  assert.equal(state.ok, true)
  assert.ok(state.effective !== undefined, 'the answer carries the state, not a bare acknowledgement')
  assert.deepEqual(state.applied, { announceToAgent: false }, 'and the authoritative echo of what was written')
  harness.dispose()
})

/** The route table of `src/routes.ts`, driven directly: the contract is the source. */
const WORKSPACE = '/workspace/fixture'

/** What `GET /semantic-drift/state` answers, for the settings route to echo back. */
function stateAnswer(workspace: string = WORKSPACE): Record<string, unknown> {
  return {
    ok: true,
    workspace: { path: workspace, resolvedFrom: 'request' },
    workspaces: [],
    vocabulary: {
      file: `${workspace}/.dsh/semantics.yaml`,
      relativeFile: '.dsh/semantics.yaml',
      exists: false,
      document: { version: 1, exclude: [], concepts: [] },
      issues: [],
      valid: true,
    },
    citationStyle: 'file+symbol',
    minConfidence: 'medium',
    version: '0.1.5',
    effective: {
      vocabularyPath: '.dsh/semantics.yaml',
      announceToAgent: true,
      citationStyle: 'file+symbol',
      minConfidence: 'medium',
      timeoutMs: 30_000,
      maxFindings: 5_000,
      maxFileBytes: 1_048_576,
      maxFiles: 50_000,
      detectors: ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'],
    },
  }
}

/**
 * A service stand-in.
 *
 * These tests are about the transport: what a request may say, what a refusal
 * says, and what the answer is shaped like. The vocabulary operations are the
 * service's business and are covered where they live.
 */
function fakeService(state?: () => Promise<Record<string, unknown>>): SemanticService {
  const unsupported = async () => {
    throw new Error('this fake only answers `state`')
  }
  return {
    listWorkspaces: () => [],
    resolve: unsupported,
    state: state ?? (async () => stateAnswer()),
    scan: unsupported,
    save: unsupported,
    saveRaw: unsupported,
    init: unsupported,
    changeException: unsupported,
    upsert: unsupported,
  } as unknown as SemanticService
}

interface RouteOptions {
  state?: () => Promise<Record<string, unknown>>
  editConfig?: (patch: { announceToAgent: boolean }) => Promise<void>
}

function routesOf(options: RouteOptions = {}): Array<Record<string, unknown>> {
  const hooks = options.editConfig === undefined ? {} : { editConfig: options.editConfig }
  return makeSemanticRoutes(
    fakeService(options.state),
    () => ({ version: '0.1.5' }),
    hooks,
  ) as unknown as Array<Record<string, unknown>>
}

function routeOf(routes: Array<Record<string, unknown>>, path: string): Record<string, unknown> {
  const route = routes.find(entry => entry.path === path)
  assert.ok(route !== undefined, `${path} must be registered`)
  return route as Record<string, unknown>
}

test('the config route is the field table and nothing else', async () => {
  const route = routeOf(routesOf(), '/semantic-drift/config')
  const answer = await callRoute(route, 'GET')
  assert.equal(answer.status, 200)
  // No values: every field is volatile, so DSH renders the form and holds what
  // is in force. A second copy of the values here could only disagree with it.
  assert.deepEqual(Object.keys(answer.json).sort(), ['fields', 'ok', 'version'])
  assert.equal(answer.json.ok, true)
  assert.equal(answer.json.version, '0.1.5')

  const fields = answer.json.fields as Array<{
    name: string
    kind: string
    options?: string[]
    description?: string
    default?: unknown
    min?: number
    max?: number
  }>
  // The whole point of deriving the form from Config.dict: a field added to the
  // schema is described here without a second list to keep in step.
  assert.deepEqual(
    fields.map(field => field.name).sort(),
    Object.keys(Config.dict).sort(),
    'the field set must be the schema itself',
  )
  const byName = new Map(fields.map(field => [field.name, field]))
  assert.equal(byName.get('vocabularyPath')?.kind, 'string')
  assert.equal(byName.get('announceToAgent')?.kind, 'boolean')
  assert.equal(byName.get('announceToAgent')?.default, true)
  assert.equal(byName.get('timeoutMs')?.kind, 'number')
  assert.equal(byName.get('timeoutMs')?.min, 1_000)
  assert.equal(byName.get('timeoutMs')?.max, 120_000)
  assert.equal(byName.get('citationStyle')?.kind, 'enum')
  assert.deepEqual(byName.get('citationStyle')?.options, ['file+symbol', 'file:line'])
  assert.equal(byName.get('detectors')?.kind, 'flags')
  assert.deepEqual(
    byName.get('detectors')?.options,
    ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'],
  )
  for (const field of fields) {
    assert.equal(typeof field.description, 'string', `${field.name} must carry its schema description`)
  }

  const wrongMethod = await callRoute(route, 'POST', {})
  assert.equal(wrongMethod.status, 405, 'the config route is read-only')
  const crossSite = await callRoute(route, 'GET', undefined, { 'sec-fetch-site': 'cross-site' })
  assert.equal(crossSite.status, 403, 'a foreign page may not read the settings form')
})

test('the settings route accepts the switch alone and refuses a patch', async () => {
  const edits: Array<{ announceToAgent: boolean }> = []
  const route = routeOf(routesOf({ editConfig: async patch => { edits.push(patch) } }), '/semantic-drift/settings')

  // Retired, not ignored: a request that still sends a patch is told where the
  // setting lives now, instead of being applied behind DSH's own form.
  const patched = await callRoute(route, 'POST', { workspace: WORKSPACE, patch: { timeoutMs: 10_000 } })
  assert.equal(patched.status, 400)
  assert.equal(patched.json.code, 'bad-request')
  assert.match(String(patched.json.message), /patch/)
  assert.match(String(patched.json.message), /Plugins → Installed Plugins → this plugin → Configuration/, 'the refusal must say where to go instead')

  const mixed = await callRoute(route, 'POST', {
    workspace: WORKSPACE,
    announceToAgent: false,
    patch: { minConfidence: 'high' },
  })
  assert.equal(mixed.status, 400, 'a request carrying the retired member is refused whole, never half applied')
  assert.match(String(mixed.json.message), /patch/)

  const notBoolean = await callRoute(route, 'POST', { workspace: WORKSPACE, announceToAgent: 'yes' })
  assert.equal(notBoolean.status, 400)
  assert.match(String(notBoolean.json.message), /announceToAgent/)

  const missing = await callRoute(route, 'POST', { workspace: WORKSPACE })
  assert.equal(missing.status, 400, 'the member is required, so "no switch" is not a write')

  const crossSite = await callRoute(route, 'POST', { workspace: WORKSPACE, announceToAgent: false }, {
    'sec-fetch-site': 'cross-site',
  })
  assert.equal(crossSite.status, 403, 'a foreign page may not write the plugin row')

  const wrongMethod = await callRoute(route, 'GET')
  assert.equal(wrongMethod.status, 405)

  assert.equal(edits.length, 0, 'a refused request must reach no config editor')
})

test('the switch is written as a plain boolean and answered in both shapes', async () => {
  const edits: Array<Record<string, unknown>> = []
  const route = routeOf(routesOf({
    editConfig: async patch => { edits.push(patch as unknown as Record<string, unknown>) },
  }), '/semantic-drift/settings')

  // No workspace: the echo alone, and no state read to fail on.
  const echo = await callRoute(route, 'POST', { announceToAgent: false })
  assert.equal(echo.status, 200)
  assert.deepEqual(echo.json, { ok: true, applied: { announceToAgent: false } })
  assert.equal(edits.length, 1)
  assert.deepEqual(edits[0], { announceToAgent: false })
  // A volatile field is a live reference in memory; what reaches the profile
  // serializer is the value, and a reference there is unrepresentable.
  assert.equal(typeof edits[0].announceToAgent, 'boolean')

  // With a workspace: the state the panel consumes, plus the authoritative echo.
  const withState = await callRoute(route, 'POST', { workspace: WORKSPACE, announceToAgent: true })
  assert.equal(withState.status, 200)
  assert.equal(withState.json.ok, true)
  assert.deepEqual(withState.json.applied, { announceToAgent: true })
  assert.equal(
    (withState.json.workspace as Record<string, unknown>).path,
    WORKSPACE,
    'the answer is the state of the workspace the request named',
  )
  assert.ok(withState.json.effective !== undefined, 'and it carries what is in force')
  assert.equal(edits.length, 2, 'one request is one write')
})

test('a state read that fails does not fail the write it followed', async () => {
  const edits: Array<{ announceToAgent: boolean }> = []
  const route = routeOf(routesOf({
    state: async () => {
      throw new Error('the workspace registry is down')
    },
    editConfig: async patch => { edits.push(patch) },
  }), '/semantic-drift/settings')

  const answer = await callRoute(route, 'POST', { workspace: WORKSPACE, announceToAgent: false })
  assert.equal(answer.status, 200, 'the write already happened; a failed read is not a failed write')
  assert.deepEqual(answer.json, { ok: true, applied: { announceToAgent: false } })
  assert.equal(edits.length, 1)
})

test('without a config editor the switch is refused with a pointer to the settings form', async () => {
  const route = routeOf(routesOf(), '/semantic-drift/settings')
  const refused = await callRoute(route, 'POST', { workspace: WORKSPACE, announceToAgent: false })
  assert.equal(refused.status, 501)
  assert.match(String(refused.json.message), /Plugins → Installed Plugins → this plugin → Configuration/)
})

import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Integration test over the BUILT host artifact (`lib/index.js`).
 *
 * The real registry validates a tool's `output.schema`, so a definition that
 * only looks right is not enough: this mounts the plugin on a minimal fake
 * context, then drives its tools and its prompt section the way the host does.
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

function mount(root: string): Harness {
  const tools: Array<Record<string, unknown>> = []
  const routes: Array<Record<string, unknown>> = []
  const sections: Array<Record<string, unknown>> = []
  const cleanups: Array<() => void> = []
  const services: Record<string, unknown> = {
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

test('the built host mounts five tools, seven routes and one prompt section', async () => {
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
      '/semantic-drift/health',
      '/semantic-drift/init',
      '/semantic-drift/raw',
      '/semantic-drift/save',
      '/semantic-drift/scan',
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
): Promise<{ status: number; json: Record<string, unknown> }> {
  const handler = route.handler as (req: unknown, res: unknown) => Promise<void> | void
  const listeners: Record<string, Array<(value?: unknown) => void>> = { data: [], end: [], error: [] }
  const req = {
    method,
    headers: { 'content-type': 'application/json' },
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

test('the health route reports what the activation mounted', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/health') as unknown as {
    kind: string
    handler(req: unknown, res: unknown): void
  }
  assert.equal(route.kind, 'exact')
  let status = 0
  let body = ''
  const res = {
    writeHead(code: number) { status = code },
    end(payload: string) { body = payload },
  }
  route.handler({ method: 'GET', headers: {} }, res)
  assert.equal(status, 200)
  const health = JSON.parse(body) as Record<string, unknown>
  assert.equal(health.ok, true)
  assert.equal(health.tools, 5)
  assert.equal(health.routes, 7)
  assert.equal(health.promptSection, true)
  assert.equal(health.announceToAgent, true)
  harness.dispose()
})

test('announceToAgent=false leaves the prompt untouched', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config({ announceToAgent: false }))
  assert.equal(harness.sections.length, 0)
  assert.equal(harness.tools.length, 5, 'turning the prompt off must not disable the tools')
  const health = harness.routes.find(entry => entry.path === '/semantic-drift/health')
  assert.ok(health !== undefined, 'the health route mounts regardless of the prompt setting')
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

import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateConfigPatch } from '../src/config.ts'

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

/** A config editor that records the patches it is asked to commit. */
function recordingEditor(edits: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    entries: () => [{ id: 'include:semantic-drift', name: 'dsh-semantic-drift' }],
    edit: async (
      _entry: unknown,
      change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>,
    ) => {
      edits.push(change({ vocabularyPath: '.dsh/semantics.yaml', announceToAgent: true }, {}))
    },
  }
}

test('the config route reports every field the schema declares', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/config') as Record<string, unknown>
  const answer = await callRoute(route, 'GET')
  assert.equal(answer.status, 200)
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
    Object.keys(module.Config.dict).sort(),
    'the field set must be the schema itself',
  )
  const values = answer.json.values as Record<string, unknown>
  assert.deepEqual(Object.keys(values).sort(), Object.keys(module.Config.dict).sort())
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
  assert.equal(values.vocabularyPath, '.dsh/semantics.yaml')
  assert.equal(values.announceToAgent, true)
  assert.equal(answer.json.version, module.VERSION)
  const wrongMethod = await callRoute(route, 'POST', {})
  assert.equal(wrongMethod.status, 405, 'the config route is read-only')
  const crossSite = await callRoute(route, 'GET', undefined, { 'sec-fetch-site': 'cross-site' })
  assert.equal(crossSite.status, 403, 'a foreign page may not read the settings form')
  harness.dispose()
})

test('the settings route refuses a patch the schema does not allow', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const edits: Array<Record<string, unknown>> = []
  const harness = mount(root, { configEditor: recordingEditor(edits) })
  module.apply(harness.ctx, module.Config())
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/settings') as Record<string, unknown>

  const unknownKey = await callRoute(route, 'POST', { workspace: root, patch: { nonsense: 1 } })
  assert.equal(unknownKey.status, 400)
  assert.equal(unknownKey.json.code, 'bad-request')
  assert.match(String(unknownKey.json.message), /nonsense/, 'the refusal must name the key')

  const outOfRange = await callRoute(route, 'POST', { workspace: root, patch: { timeoutMs: 10 } })
  assert.equal(outOfRange.status, 400)
  assert.match(String(outOfRange.json.message), /timeoutMs/)
  assert.match(String(outOfRange.json.message), /1000/, 'the schema bound is what refuses it')

  // The schema answers null with the field default, so a null patch would look
  // like a successful write that silently discarded the configured value.
  const nullNumber = await callRoute(route, 'POST', { workspace: root, patch: { timeoutMs: null } })
  assert.equal(nullNumber.status, 400)
  assert.match(String(nullNumber.json.message), /timeoutMs/, 'the refusal must name the nulled field')
  assert.match(String(nullNumber.json.message), /null/)

  const nullFlags = await callRoute(route, 'POST', { workspace: root, patch: { detectors: null } })
  assert.equal(nullFlags.status, 400)
  assert.match(String(nullFlags.json.message), /detectors/)

  const badEnum = await callRoute(route, 'POST', { workspace: root, patch: { citationStyle: 'file:lines' } })
  assert.equal(badEnum.status, 400)
  assert.match(String(badEnum.json.message), /citationStyle/)

  const badFlags = await callRoute(route, 'POST', { workspace: root, patch: { detectors: ['nonsense'] } })
  assert.equal(badFlags.status, 400)

  const notAnObject = await callRoute(route, 'POST', { workspace: root, patch: ['timeoutMs'] })
  assert.equal(notAnObject.status, 400)

  const badAnnounce = await callRoute(route, 'POST', { workspace: root, announceToAgent: 'yes' })
  assert.equal(badAnnounce.status, 400)
  assert.match(String(badAnnounce.json.message), /announceToAgent/)

  const reference = await callRoute(route, 'POST', {
    workspace: root,
    patch: { announceToAgent: { get: () => false } },
  })
  assert.equal(reference.status, 400, 'a patch carries values, not live references')

  const nothing = await callRoute(route, 'POST', { workspace: root })
  assert.equal(nothing.status, 400, 'one of the two members is required')

  const crossSite = await callRoute(route, 'POST', { workspace: root, announceToAgent: false }, {
    'sec-fetch-site': 'cross-site',
  })
  assert.equal(crossSite.status, 403, 'a foreign page may not write the plugin row')

  assert.equal(edits.length, 0, 'a refused request must reach no config editor')
  harness.dispose()
})

test('the settings route writes a patch and the switch in one edit and echoes it', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const edits: Array<Record<string, unknown>> = []
  const harness = mount(root, { configEditor: recordingEditor(edits) })
  module.apply(harness.ctx, module.Config())
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/settings') as Record<string, unknown>

  const both = await callRoute(route, 'POST', {
    workspace: root,
    announceToAgent: false,
    patch: { minConfidence: 'high', detectors: ['contract-drift'] },
  })
  assert.equal(both.status, 200)
  assert.equal(edits.length, 1, 'one request is one write, so the row cannot be left half applied')
  assert.deepEqual(both.json.applied, {
    minConfidence: 'high',
    detectors: ['contract-drift'],
    announceToAgent: false,
  })
  // The fake editor commits nothing, which is exactly the case the echo exists
  // for: the answering instance still reports the value it was mounted with.
  const state = both.json.effective as Record<string, unknown>
  assert.equal(state.announceToAgent, true, 'the state is read from the instance that answered')
  assert.equal(both.json.ok, true)

  const echo = await callRoute(route, 'POST', { announceToAgent: true })
  assert.equal(echo.status, 200)
  assert.deepEqual(echo.json, { ok: true, applied: { announceToAgent: true } }, 'no workspace, no state read')
  harness.dispose()
})

test('a validated patch holds plain values, never a live reference', () => {
  // A volatile field validates into `{ get() }`, and that reference has no YAML
  // representation: it must not survive the validator.
  const validated = validateConfigPatch({ announceToAgent: false })
  assert.equal(validated.ok, true)
  if (!validated.ok) return
  assert.equal(validated.value.announceToAgent, false)
  assert.equal(typeof validated.value.announceToAgent, 'boolean')

  for (const candidate of [null, undefined]) {
    const refused = validateConfigPatch({ timeoutMs: candidate })
    assert.equal(refused.ok, false, 'null must be refused, not answered with the default')
    if (refused.ok) continue
    assert.match(refused.message, /timeoutMs/)
    assert.match(refused.message, /null/)
  }
})

test('the volatile switch is written as a plain boolean, whichever member carries it', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const edits: Array<Record<string, unknown>> = []
  const harness = mount(root, { configEditor: recordingEditor(edits) })
  module.apply(harness.ctx, module.Config())
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/settings') as Record<string, unknown>

  const viaPatch = await callRoute(route, 'POST', { workspace: root, patch: { announceToAgent: false } })
  assert.equal(viaPatch.status, 200)
  assert.equal(edits.length, 1)
  assert.equal(edits[0].announceToAgent, false, 'the profile write is handed a value, not a reference')
  assert.equal(typeof edits[0].announceToAgent, 'boolean')
  assert.deepEqual(viaPatch.json.applied, { announceToAgent: false })
  assert.equal(typeof (viaPatch.json.applied as Record<string, unknown>).announceToAgent, 'boolean')

  // Naming the switch in both members is still one write, and the top-level
  // member wins: that is the member the first callers of this route send.
  const both = await callRoute(route, 'POST', {
    workspace: root,
    announceToAgent: true,
    patch: { announceToAgent: false },
  })
  assert.equal(both.status, 200)
  assert.equal(edits.length, 2, 'one write per request')
  assert.equal(edits[1].announceToAgent, true, 'the top-level member takes precedence over the patch')
  assert.deepEqual(both.json.applied, { announceToAgent: true })
  harness.dispose()
})

test('without a config editor the switch is refused with a pointer to the settings form', async () => {
  const module = await import('../lib/index.js')
  const root = await fixture()
  const harness = mount(root)
  module.apply(harness.ctx, module.Config())
  const route = harness.routes.find(entry => entry.path === '/semantic-drift/settings') as Record<string, unknown>
  const refused = await callRoute(route, 'POST', { workspace: root, announceToAgent: false })
  assert.equal(refused.status, 501)
  assert.match(String(refused.json.message), /Settings → Plugins/)
  harness.dispose()
})

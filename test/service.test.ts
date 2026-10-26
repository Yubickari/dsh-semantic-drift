import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config, announceEnabled, liveConfig, liveValue } from '../src/config.ts'
import { DEFAULT_EXCLUDES } from '../src/store.ts'
import { createSemanticService, SemanticError } from '../src/service.ts'
import type { SemanticConfig } from '../src/service.ts'
import type { WorkspaceResolver, WorkspaceTarget } from '../src/workspace.ts'
import type { VocabularyDocument } from '../src/protocol.ts'

function config(): SemanticConfig {
  return {
    vocabularyPath: '.dsh/semantics.yaml',
    announceToAgent: true,
    citationStyle: 'file+symbol',
    minConfidence: 'medium',
    timeoutMs: 10_000,
    maxFindings: 1_000,
    maxFileBytes: 1_048_576,
    maxFiles: 10_000,
    detectors: ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'],
  }
}

function resolverFor(root: string): WorkspaceResolver {
  const target: WorkspaceTarget = { path: root, title: 'fixture', resolvedFrom: 'request' }
  return {
    list: () => [{ id: 'w1', title: 'fixture', path: root }],
    defaultDirectory: () => root,
    resolve: async () => target,
    resolveForSession: async () => target,
  }
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-service-'))
  await mkdir(join(root, 'Alpha'), { recursive: true })
  await mkdir(join(root, 'Beta'), { recursive: true })
  await writeFile(join(root, 'Alpha', 'A.csproj'), '<Project />\n')
  await writeFile(join(root, 'Beta', 'B.csproj'), '<Project />\n')
  await writeFile(join(root, 'Alpha', 'Status.cs'), 'public enum Status { On, Off }\n')
  await writeFile(join(root, 'Beta', 'Status.cs'), 'public enum Status { On, Off, Unknown }\n')
  return root
}

test('the service starts from an absent vocabulary and can create it', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  const initial = await service.state()
  assert.equal(initial.vocabulary.exists, false)
  assert.equal(initial.ok, true)
  const created = await service.init()
  assert.equal(created.exists, true)
  assert.deepEqual(created.document.exclude, DEFAULT_EXCLUDES)
  assert.equal(created.valid, true)
})

test('upsert stores a concept, refuses a duplicate symbol, and merges partial updates', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  await service.init()
  const created = await service.upsert(undefined, {
    concept: { id: 'device.state', terms: ['设备状态'], kind: 'status', canonical: { symbol: 'DeviceStatus' } },
  })
  assert.equal(created.created, true)

  const merged = await service.upsert(undefined, { concept: { id: 'device.state', note: 'current state' } })
  assert.equal(merged.concept.canonical.symbol, 'DeviceStatus')
  assert.equal(merged.concept.note, 'current state')
  assert.deepEqual(merged.concept.terms, ['设备状态'])

  await assert.rejects(
    () => service.upsert(undefined, {
      concept: { id: 'device.mode', terms: ['设备模式'], kind: 'status', canonical: { symbol: 'DeviceStatus' } },
    }),
    (error: unknown) => error instanceof SemanticError && error.issues.some(issue => issue.code === 'symbol-duplicate'),
  )
})

test('accept requires a reason and then mutes the finding', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  await service.init()
  await service.upsert(undefined, {
    concept: { id: 'device.status', terms: ['设备状态'], kind: 'status', canonical: { symbol: 'DeviceStatus' } },
  })
  const before = await service.scan(undefined, { minConfidence: 'high' })
  assert.equal(before.summary.findings.some(finding => finding.detector === 'contract-drift'), true)

  await assert.rejects(
    () => service.changeException(undefined, { conceptId: 'device.status', symbol: 'Status', reason: '   ' }),
    (error: unknown) => error instanceof SemanticError && error.code === 'bad-request',
  )

  await service.changeException(undefined, { conceptId: 'device.status', symbol: 'Status', path: '**', reason: 'externally owned enum' })
  const after = await service.scan(undefined, { minConfidence: 'high' })
  assert.equal(after.summary.findings.some(finding => finding.detector === 'contract-drift'), false)
})

test('an exception can be narrowed, re-worded, renamed in scope and removed', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  await service.init()
  await service.upsert(undefined, {
    concept: { id: 'device.status', terms: ['设备状态'], kind: 'status', canonical: { symbol: 'DeviceStatus' } },
  })
  const added = await service.changeException(undefined, {
    conceptId: 'device.status',
    symbol: 'Status',
    path: '**',
    reason: 'externally owned enum',
  })
  assert.equal(added.changed, 'added')
  assert.deepEqual(added.concept.accepted, [{ symbol: 'Status', path: '**', reason: 'externally owned enum' }])

  // Narrow the scope and reword the reason.
  const updated = await service.changeException(undefined, {
    op: 'update',
    conceptId: 'device.status',
    symbol: 'Status',
    previousPath: '**',
    path: 'Beta/**',
    reason: 'only the Beta copy is externally owned',
  })
  assert.equal(updated.changed, 'updated')
  assert.deepEqual(updated.concept.accepted, [{ symbol: 'Status', path: 'Beta/**', reason: 'only the Beta copy is externally owned' }])

  // The exception still exists under the new scope, so removing by the old one is a no-op.
  const stale = await service.changeException(undefined, {
    op: 'remove',
    conceptId: 'device.status',
    symbol: 'Status',
    previousPath: '**',
  })
  assert.equal(stale.changed, 'unchanged')

  const removed = await service.changeException(undefined, {
    op: 'remove',
    conceptId: 'device.status',
    symbol: 'Status',
    previousPath: 'Beta/**',
  })
  assert.equal(removed.changed, 'removed')
  assert.equal(removed.concept.accepted, undefined)

  const again = await service.changeException(undefined, {
    op: 'remove',
    conceptId: 'device.status',
    symbol: 'Status',
    previousPath: 'Beta/**',
  })
  assert.equal(again.changed, 'unchanged', 'removal is idempotent')
})

test('updating to a scope that already exists is refused, and a missing target is not found', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  await service.init()
  await service.upsert(undefined, {
    concept: { id: 'device.status', terms: ['设备状态'], kind: 'status', canonical: { symbol: 'DeviceStatus' } },
  })
  await service.changeException(undefined, { conceptId: 'device.status', symbol: 'Status', path: 'Alpha/**', reason: 'a' })
  await service.changeException(undefined, { conceptId: 'device.status', symbol: 'Status', path: 'Beta/**', reason: 'b' })

  await assert.rejects(
    () => service.changeException(undefined, {
      op: 'update',
      conceptId: 'device.status',
      symbol: 'Status',
      previousPath: 'Alpha/**',
      path: 'Beta/**',
      reason: 'collides',
    }),
    (error: unknown) => error instanceof SemanticError && error.code === 'conflict',
  )
  await assert.rejects(
    () => service.changeException(undefined, {
      op: 'update',
      conceptId: 'device.status',
      symbol: 'Status',
      previousPath: 'Gamma/**',
      reason: 'nowhere',
    }),
    (error: unknown) => error instanceof SemanticError && error.code === 'not-found',
  )
})

test('clearing a concept removes every exception at once', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  await service.init()
  await service.upsert(undefined, {
    concept: { id: 'device.status', terms: ['设备状态'], kind: 'status', canonical: { symbol: 'DeviceStatus' } },
  })
  await service.changeException(undefined, { conceptId: 'device.status', symbol: 'Status', path: 'Alpha/**', reason: 'a' })
  await service.changeException(undefined, { conceptId: 'device.status', symbol: 'Status', path: 'Beta/**', reason: 'b' })
  const cleared = await service.changeException(undefined, { op: 'clear', conceptId: 'device.status' })
  assert.equal(cleared.changed, 'removed')
  assert.equal(cleared.concept.accepted, undefined)
  const empty = await service.changeException(undefined, { op: 'clear', conceptId: 'device.status' })
  assert.equal(empty.changed, 'unchanged')
})

test('a removed exception lets its findings reappear on the next scan', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  await service.init()
  await service.upsert(undefined, {
    concept: { id: 'device.status', terms: ['设备状态'], kind: 'status', canonical: { symbol: 'DeviceStatus' } },
  })
  await service.changeException(undefined, { conceptId: 'device.status', symbol: 'Status', path: '**', reason: 'temporary' })
  const muted = await service.scan(undefined, { minConfidence: 'high' })
  assert.equal(muted.summary.findings.some(finding => finding.detector === 'contract-drift'), false)
  await service.changeException(undefined, {
    op: 'remove',
    conceptId: 'device.status',
    symbol: 'Status',
    previousPath: '**',
  })
  const back = await service.scan(undefined, { minConfidence: 'high' })
  assert.equal(back.summary.findings.some(finding => finding.detector === 'contract-drift'), true)
})

test('removing by the new-scope field says so instead of silently doing nothing', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  await service.init()
  await service.upsert(undefined, {
    concept: { id: 'device.status', terms: ['设备状态'], kind: 'status', canonical: { symbol: 'DeviceStatus' } },
  })
  await service.changeException(undefined, { conceptId: 'device.status', symbol: 'Status', path: 'Alpha/**', reason: 'a' })

  await assert.rejects(
    () => service.changeException(undefined, {
      op: 'remove',
      conceptId: 'device.status',
      symbol: 'Status',
      path: 'Alpha/**',
    }),
    (error: unknown) => error instanceof SemanticError
      && error.code === 'not-found'
      && /previousPath/.test(error.message),
    'path is not a lookup key; the refusal has to say which field is',
  )

  const removed = await service.changeException(undefined, {
    op: 'remove',
    conceptId: 'device.status',
    symbol: 'Status',
    previousPath: 'Alpha/**',
  })
  assert.equal(removed.changed, 'removed')
  const again = await service.changeException(undefined, {
    op: 'remove',
    conceptId: 'device.status',
    symbol: 'Status',
    previousPath: 'Alpha/**',
  })
  assert.equal(again.changed, 'unchanged', 'a genuine repeat is still idempotent')
})

test('a save of an invalid document is refused and leaves the file alone', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  const created = await service.init()
  const broken: VocabularyDocument = {
    version: 1,
    exclude: [...DEFAULT_EXCLUDES],
    concepts: [
      { id: 'bad-id', terms: ['x'], kind: 'entity', canonical: { symbol: 'X' } },
      { id: 'bad-id', terms: ['x'], kind: 'entity', canonical: { symbol: 'X' } },
    ],
  }
  await assert.rejects(
    () => service.save(undefined, broken),
    (error: unknown) => error instanceof SemanticError
      && error.code === 'invalid-vocabulary'
      && error.issues.some(issue => issue.code === 'id-format'),
  )
  const state = await service.state()
  assert.deepEqual(state.vocabulary.document.concepts, created.document.concepts)
})

test('raw save refuses broken YAML and keeps the previous file', async () => {
  const root = await fixture()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  await service.init()
  await assert.rejects(
    () => service.saveRaw(undefined, 'version: 1\nconcepts: [\n'),
    (error: unknown) => error instanceof SemanticError && error.issues[0]?.code === 'yaml-parse',
  )
  const state = await service.state()
  assert.equal(state.vocabulary.valid, true)
})

test('a volatile announceToAgent is read live by every state answer', async () => {
  const root = await fixture()
  // Both shapes reach the service: a plain value for a non-volatile field (and
  // for a volatile one the Host mounted directly), a live reference otherwise.
  const plain = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.1.0' })
  assert.equal((await plain.state()).effective?.announceToAgent, true)

  let on = true
  const service = createSemanticService({
    config: { ...config(), announceToAgent: { get: () => on } },
    workspace: resolverFor(root),
    version: '0.1.0',
  })
  assert.equal((await service.state()).effective?.announceToAgent, true)
  on = false
  assert.equal(
    (await service.state()).effective?.announceToAgent,
    false,
    'a volatile field is committed in place, so this very instance must see the change',
  )
  on = true
  assert.equal((await service.state()).effective?.announceToAgent, true)
})

test('the volatile reference is unwrapped, never compared', () => {
  let on = false
  assert.equal(announceEnabled({ get: () => on }), false)
  assert.equal(announceEnabled(false), false)
  on = true
  assert.equal(announceEnabled({ get: () => on }), true, 'the reference is read at use time')
  assert.equal(announceEnabled(true), true)
  assert.equal(announceEnabled(undefined), true, 'an absent field means on')
  assert.equal(liveValue({ get: () => 'value' }), 'value')
  assert.equal(liveValue('value'), 'value', 'a plain value passes through untouched')
})

test('every config field is volatile, which is what DSH renders a form from', () => {
  const dict = Config.dict as unknown as Record<string, { meta?: { volatile?: boolean } }>
  // A non-volatile field is the failure that has no symptom until the settings
  // page is opened: DSH filters the form field by field, and its write path
  // refuses a non-volatile key, so such a setting would be uneditable.
  const fixed = Object.entries(dict)
    .filter(([, field]) => field.meta?.volatile !== true)
    .map(([name]) => name)
  assert.deepEqual(fixed, [], 'no config field may stay non-volatile')
  assert.equal(Object.keys(dict).length, 9, 'the form is this schema: a new field is a new control')
})

test('liveConfig reads every field type live and falls back to the schema default', () => {
  let string = '.dsh/semantics.yaml'
  let number = 30_000
  let enumValue = 'medium'
  let boolean = true
  const flags = ['duplicate-type']
  const config = liveConfig<SemanticConfig>({
    vocabularyPath: { get: () => string },
    timeoutMs: { get: () => number },
    minConfidence: { get: () => enumValue },
    announceToAgent: { get: () => boolean },
    detectors: { get: () => flags },
  })

  // One shape for every field: the wrapper is what makes a reader unaware of it.
  assert.equal(config.vocabularyPath, '.dsh/semantics.yaml')
  assert.equal(config.timeoutMs, 30_000)
  assert.equal(config.minConfidence, 'medium')
  assert.equal(config.announceToAgent, true)
  assert.deepEqual(config.detectors, ['duplicate-type'])

  // A volatile field is committed in place, so the next read already sees it.
  string = 'docs/semantics.yaml'
  number = 5_000
  enumValue = 'high'
  boolean = false
  flags.push('contract-drift')
  assert.equal(config.vocabularyPath, 'docs/semantics.yaml', 'string')
  assert.equal(config.timeoutMs, 5_000, 'number')
  assert.equal(config.minConfidence, 'high', 'union')
  assert.equal(config.announceToAgent, false, 'boolean')
  assert.deepEqual(config.detectors, ['duplicate-type', 'contract-drift'], 'array')

  // A caller that sorts or pushes must not edit what the Loader committed.
  const copy = config.detectors
  assert.ok(copy !== config.detectors, 'every read of an array field is a fresh copy')
  copy.length = 0
  assert.deepEqual(config.detectors, ['duplicate-type', 'contract-drift'])

  // Bare values are accepted too: a hand-mounted context passes what it has.
  const bare = liveConfig<SemanticConfig>({
    vocabularyPath: 'semantics.yaml',
    announceToAgent: false,
    detectors: ['term-unmapped'],
  })
  assert.equal(bare.vocabularyPath, 'semantics.yaml')
  assert.equal(bare.announceToAgent, false)
  assert.deepEqual(bare.detectors, ['term-unmapped'])

  // A field the Loader did not pass answers with the schema default, so an
  // absent object cannot turn a number into undefined halfway through a scan.
  assert.equal(bare.timeoutMs, 30_000)
  assert.equal(bare.minConfidence, 'medium')
  assert.equal(bare.maxFiles, 50_000)
  assert.deepEqual(bare.detectors, ['term-unmapped'])
  const absent = liveConfig<SemanticConfig>(undefined)
  assert.equal(absent.announceToAgent, true)
  assert.equal(absent.citationStyle, 'file+symbol')
  assert.deepEqual(absent.detectors, ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'])
  assert.equal(Object.keys(absent).length, 9, 'every field is reachable, so no reader sees undefined')
})

test('VERSION stays in sync with package.json', async () => {
  const { VERSION } = await import('../src/index.ts').catch(async () => {
    // index.ts imports the DSH tooling at module scope; fall back to reading the source.
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    return { VERSION: /export const VERSION = '([^']+)'/.exec(source)?.[1] ?? '' }
  })
  const { readFile } = await import('node:fs/promises')
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(VERSION, manifest.version)
})

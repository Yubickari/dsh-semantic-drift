import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadVocabulary,
  parseVocabularyText,
  serializeVocabulary,
} from '../src/store.ts'
import { createSemanticService, SemanticError } from '../src/service.ts'
import type { SemanticConfig } from '../src/service.ts'
import type { WorkspaceResolver, WorkspaceTarget } from '../src/workspace.ts'

function config(): SemanticConfig {
  return {
    vocabularyPath: '.dsh/semantics.yaml',
    announceToAgent: true,
    announceByWorkspace: {},
    announceDetail: 'compact',
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

async function workspace(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'semantic-drift-lifecycle-'))
}

test('lifecycle defaults to active, parses planned and is omitted from canonical YAML when active', () => {
  const text = [
    'version: 1',
    'exclude: []',
    'concepts:',
    '  - id: device.state',
    '    terms: [设备状态]',
    '    kind: status',
    '    lifecycle: planned',
    '    canonical: {symbol: DeviceState}',
    '  - id: device.mode',
    '    terms: [设备模式]',
    '    kind: enum',
    '    canonical: {symbol: DeviceMode}',
    '',
  ].join('\n')
  const parsed = parseVocabularyText(text)
  assert.deepEqual(parsed.issues.filter(issue => issue.severity === 'error'), [])
  assert.equal(parsed.document.concepts[0].lifecycle, 'planned')
  assert.equal(parsed.document.concepts[1].lifecycle, undefined)

  const output = serializeVocabulary(parsed.document)
  assert.match(output, /lifecycle: planned/)
  assert.doesNotMatch(output, /lifecycle: active/)
  assert.equal(serializeVocabulary(parseVocabularyText(output).document), output, 'canonical save is idempotent')
})

test('an invalid lifecycle is a positioned error', () => {
  const text = [
    'version: 1',
    'exclude: []',
    'concepts:',
    '  - id: device.state',
    '    terms: [设备状态]',
    '    kind: status',
    '    lifecycle: blocked',
    '    canonical: {symbol: DeviceState}',
    '',
  ].join('\n')
  const parsed = parseVocabularyText(text)
  const issue = parsed.issues.find(entry => entry.code === 'lifecycle-invalid')
  assert.ok(issue !== undefined)
  assert.equal(issue?.severity, 'error')
  assert.equal(issue?.path, 'concepts[0].lifecycle')
})

test('a flat id gets a suggestion without being auto-corrected', () => {
  const text = [
    'version: 1',
    'exclude: []',
    'concepts:',
    '  - id: device.state',
    '    terms: [设备状态]',
    '    kind: status',
    '    canonical: {symbol: DeviceState}',
    '  - id: NetworkStatus',
    '    terms: [网络状态]',
    '    kind: status',
    '    canonical: {symbol: NetworkStatus}',
    '',
  ].join('\n')
  const parsed = parseVocabularyText(text)
  const issue = parsed.issues.find(entry => entry.code === 'id-format')
  assert.ok(issue !== undefined)
  assert.equal(issue?.suggestion, 'device.network_status', 'the most common group is used as a hint')
  assert.match(issue?.message ?? '', /device\.network_status/)
})

test('upsert keeps lifecycle on merge and resets it on replace', async () => {
  const root = await workspace()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.3.0' })
  await service.init()
  const created = await service.upsert(undefined, {
    concept: {
      id: 'device.state',
      terms: ['设备状态'],
      kind: 'status',
      lifecycle: 'planned',
      canonical: { symbol: 'DeviceState' },
    },
  })
  assert.equal(created.concept.lifecycle, 'planned')

  const merged = await service.upsert(undefined, { concept: { id: 'device.state', note: 'planned state' } })
  assert.equal(merged.concept.lifecycle, 'planned')

  const replaced = await service.upsert(undefined, {
    concept: { id: 'device.state', terms: ['设备状态'], kind: 'status', canonical: { symbol: 'DeviceState' } },
    mode: 'replace',
  })
  assert.equal(replaced.concept.lifecycle, undefined)

  await assert.rejects(
    () => service.upsert(undefined, {
      concept: { id: 'device.other', terms: ['其他'], lifecycle: 'blocked' as never, canonical: { symbol: 'Other' } },
    }),
    (error: unknown) => error instanceof SemanticError && error.issues.some(issue => issue.code === 'lifecycle-invalid'),
  )
})

test('batch upsert writes the valid items once and reports the bad one with its position', async () => {
  const root = await workspace()
  const service = createSemanticService({ config: config(), workspace: resolverFor(root), version: '0.3.0' })
  await service.init()
  const inputs = Array.from({ length: 12 }, (_, index) => ({
    concept: {
      id: index === 7 ? 'FlatName' : `device.concept_${index}`,
      terms: [`术语${index}`],
      kind: 'entity' as const,
      ...(index === 3 ? { lifecycle: 'planned' as const } : {}),
      canonical: { symbol: `Concept${index}` },
    },
  }))
  const result = await service.upsertMany(undefined, inputs)
  assert.equal(result.created, 11)
  assert.equal(result.updated, 0)
  assert.equal(result.failed, 1)
  assert.equal(result.results.length, 12)
  assert.equal(result.results[7].ok, false)
  assert.equal(result.results[7].code, 'invalid-vocabulary')
  assert.ok(result.results[7].issues?.some(issue => issue.code === 'id-format'))
  assert.ok(result.results[7].issues?.some(issue => issue.suggestion === 'device.flat_name'))

  const state = await loadVocabulary(root, '.dsh/semantics.yaml')
  assert.equal(state.document.concepts.length, 11)
  assert.equal(state.document.concepts[3].lifecycle, 'planned')
  assert.equal(state.document.concepts.some(concept => concept.id === 'FlatName'), false)

  const text = await readFile(state.file, 'utf8')
  assert.match(text, /lifecycle: planned/)
  assert.doesNotMatch(text, /FlatName/)
})

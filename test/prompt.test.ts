import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPromptText } from '../src/prompt.ts'
import type { SemanticConfig } from '../src/service.ts'
import type { WorkspaceResolver, WorkspaceTarget } from '../src/workspace.ts'

function config(announceDetail: 'full' | 'compact'): SemanticConfig {
  return {
    vocabularyPath: '.dsh/semantics.yaml',
    announceToAgent: true,
    announceByWorkspace: {},
    announceDetail,
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
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-prompt-'))
  await mkdir(join(root, '.dsh'), { recursive: true })
  await writeFile(
    join(root, '.dsh', 'semantics.yaml'),
    [
      'version: 1',
      'meta: {project: fixture, updated: 2026-01-01}',
      'exclude: []',
      'concepts:',
      '  - id: device.temperature',
      '    terms: [目标温度]',
      '    kind: quantity',
      '    canonical: {symbol: TargetTemperature, type: double}',
      '    note: The temperature the device is asked to reach.',
      '',
    ].join('\n'),
    'utf8',
  )
  return root
}

async function manyFixture(count: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-prompt-many-'))
  await mkdir(join(root, '.dsh'), { recursive: true })
  const concepts = Array.from({ length: count }, (_, index) => [
    `  - id: device.concept_${index}`,
    `    terms: [术语${index}]`,
    '    kind: entity',
    `    canonical: {symbol: Concept${index}, type: class}`,
    '    note: A note long enough to make the full section noticeably larger than the compact one.',
  ].join('\n')).join('\n')
  await writeFile(
    join(root, '.dsh', 'semantics.yaml'),
    [
      'version: 1',
      'meta: {project: fixture, updated: 2026-01-01}',
      'exclude: []',
      'concepts:',
      concepts,
      '',
    ].join('\n'),
    'utf8',
  )
  return root
}

test('full keeps notes and compact drops them, including across a cache hit', async () => {
  const root = await fixture()
  const workspace = resolverFor(root)

  const full = buildPromptText({}, config('full'), workspace)
  assert.match(full, /device\.temperature \(quantity\) -> TargetTemperature: The temperature/)

  const compact = buildPromptText({}, config('compact'), workspace)
  assert.match(compact, /- device\.temperature -> TargetTemperature/)
  assert.doesNotMatch(compact, /The temperature/, 'compact must not carry the note')
  assert.ok(compact.length < full.length, 'compact must be shorter than full on the same vocabulary')

  // The parse cache is keyed by vocabulary file and detail. If it were keyed by
  // the file alone, this second full call would return the compact body.
  const fullAgain = buildPromptText({}, config('full'), workspace)
  assert.equal(fullAgain, full, 'switching back to full must not reuse the compact cache entry')
})

test('compact stays below half of full on a mid-size vocabulary', async () => {
  const root = await manyFixture(40)
  const workspace = resolverFor(root)
  const full = buildPromptText({}, config('full'), workspace)
  const compact = buildPromptText({}, config('compact'), workspace)
  assert.ok(
    compact.length < full.length * 0.5,
    `compact ${compact.length} chars is not below half of full ${full.length} chars`,
  )
})

import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_EXCLUDES,
  forgetVocabulary,
  loadVocabulary,
  parseVocabularyText,
  saveRawVocabulary,
  saveVocabulary,
  serializeVocabulary,
} from '../src/store.ts'
import type { VocabularyDocument } from '../src/protocol.ts'

const RELATIVE = '.dsh/semantics.yaml'

async function workspace(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'semantic-drift-store-'))
}

function sample(): VocabularyDocument {
  return {
    version: 1,
    meta: { project: 'demo', updated: '2026-01-01' },
    exclude: [...DEFAULT_EXCLUDES],
    concepts: [
      {
        id: 'device.target_temperature',
        terms: ['目标温度', '设定温度'],
        kind: 'quantity',
        canonical: { symbol: 'TargetTemperature', type: 'double', unit: '°C' },
        note: 'The temperature the device is asked to reach.',
        accepted: [{ symbol: 'TargetTemp', path: 'src/Legacy/**', reason: 'legacy module kept for one release' }],
      },
      {
        id: 'device.state',
        terms: ['设备状态'],
        kind: 'status',
        canonical: { symbol: 'DeviceState' },
      },
    ],
  }
}

test('a workspace without a vocabulary file reports an empty valid document', async () => {
  const root = await workspace()
  const state = await loadVocabulary(root, RELATIVE)
  assert.equal(state.exists, false)
  assert.equal(state.valid, true)
  assert.deepEqual(state.document.concepts, [])
  assert.deepEqual(state.document.exclude, DEFAULT_EXCLUDES)
})

test('save then load round-trips and stays idempotent', async () => {
  const root = await workspace()
  const first = await saveVocabulary(root, RELATIVE, sample(), { now: new Date('2026-02-03T10:00:00') })
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.equal(first.state.valid, true)
  const text = await readFile(first.state.file, 'utf8')
  const second = await saveVocabulary(root, RELATIVE, first.state.document, { now: new Date('2026-02-03T10:00:00') })
  assert.equal(second.ok, true)
  const textAgain = await readFile(first.state.file, 'utf8')
  assert.equal(textAgain, text, 'saving the same document twice must not churn the file')
  assert.match(text, /^version: 1$/m)
  assert.match(text, /updated: '?2026-02-03'?/)
})

test('serialization is canonical and self-consistent', () => {
  const document = sample()
  const text = serializeVocabulary(document)
  const parsed = parseVocabularyText(text)
  assert.deepEqual(parsed.issues.filter(issue => issue.severity === 'error'), [])
  assert.deepEqual(parsed.document.concepts, document.concepts)
  assert.deepEqual(serializeVocabulary(parsed.document), text)
})

test('duplicate ids and duplicate symbols are refused with positioned issues', async () => {
  const root = await workspace()
  const document = sample()
  document.concepts[1].id = document.concepts[0].id
  document.concepts[1].canonical.symbol = document.concepts[0].canonical.symbol
  const result = await saveVocabulary(root, RELATIVE, document)
  assert.equal(result.ok, false)
  if (result.ok) return
  const codes = new Set(result.issues.map(issue => issue.code))
  assert.ok(codes.has('id-duplicate'), `expected id-duplicate, got ${[...codes].join(',')}`)
  assert.ok(codes.has('symbol-duplicate'), `expected symbol-duplicate, got ${[...codes].join(',')}`)
  const state = await loadVocabulary(root, RELATIVE)
  assert.equal(state.exists, false, 'a refused save must not create the file')
})

test('an accepted exception without a reason is an error', () => {
  const text = [
    'version: 1',
    'exclude: ["**/node_modules/**"]',
    'concepts:',
    '  - id: device.state',
    '    terms: ["设备状态"]',
    '    kind: status',
    '    canonical:',
    '      symbol: DeviceState',
    '    accepted:',
    '      - symbol: DevState',
    '        reason: ""',
    '',
  ].join('\n')
  const parsed = parseVocabularyText(text)
  assert.ok(parsed.issues.some(issue => issue.code === 'accepted-reason'))
})

test('a YAML syntax error reports its line and refuses to write', async () => {
  const root = await workspace()
  const broken = 'version: 1\nconcepts:\n  - id: device.state\n    terms: [\n'
  const parsed = parseVocabularyText(broken)
  assert.equal(parsed.issues[0]?.code, 'yaml-parse')
  assert.ok((parsed.issues[0]?.line ?? 0) >= 4)
  const result = await saveRawVocabulary(root, RELATIVE, broken)
  assert.equal(result.ok, false)
  const state = await loadVocabulary(root, RELATIVE)
  assert.equal(state.exists, false)
})

test('raw save keeps the author formatting and is idempotent', async () => {
  const root = await workspace()
  const text = [
    '# keep this comment: it explains the vocabulary',
    'version: 1',
    'concepts:',
    '- id: device.state',
    '  terms: [设备状态]',
    '  kind: status',
    '  canonical: {symbol: DeviceState}',
    '',
  ].join('\n')
  const first = await saveRawVocabulary(root, RELATIVE, text)
  assert.equal(first.ok, true)
  const twice = await saveRawVocabulary(root, RELATIVE, text)
  assert.equal(twice.ok, true)
  const onDisk = await readFile(join(root, RELATIVE), 'utf8')
  assert.equal(onDisk, text)
})

test('an external edit is picked up on the next read', async () => {
  const root = await workspace()
  await saveVocabulary(root, RELATIVE, sample())
  const file = join(root, RELATIVE)
  const edited = (await readFile(file, 'utf8')).replace('DeviceState', 'DeviceWorkingState')
  await writeFile(file, edited, 'utf8')
  forgetVocabulary(root, RELATIVE)
  const state = await loadVocabulary(root, RELATIVE)
  assert.equal(state.document.concepts[1].canonical.symbol, 'DeviceWorkingState')
})

test('unknown keys warn without blocking the save', async () => {
  const text = [
    'version: 1',
    'colours: {}',
    'concepts:',
    '  - id: device.state',
    '    terms: [设备状态]',
    '    kind: status',
    '    canonical: {symbol: DeviceState}',
    '    owner: platform-team',
    '',
  ].join('\n')
  const parsed = parseVocabularyText(text)
  assert.ok(parsed.issues.some(issue => issue.code === 'unknown-key' && issue.severity === 'warning'))
  assert.equal(parsed.issues.some(issue => issue.severity === 'error'), false)
})

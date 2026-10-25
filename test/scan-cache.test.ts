import { strict as assert } from 'node:assert'
import test from 'node:test'

/** Minimal sessionStorage so the module under test sees a browser-shaped store. */
class MemoryStorage {
  private readonly map = new Map<string, string>()
  get length(): number { return this.map.size }
  clear(): void { this.map.clear() }
  getItem(key: string): string | null { return this.map.get(key) ?? null }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null }
  removeItem(key: string): void { this.map.delete(key) }
  setItem(key: string, value: string): void { this.map.set(key, value) }
}

const store = new MemoryStorage()
Object.defineProperty(globalThis, 'sessionStorage', { value: store, configurable: true })

const { clearScanCache, forgetScan, recallScan, rememberScan } = await import('../src/client/scan-cache.ts')
import type { ScanResponse } from '../src/protocol.ts'

function response(files: number): ScanResponse {
  return {
    ok: true,
    workspace: { path: '/tmp/ws' },
    summary: {
      root: '/tmp/ws',
      startedAt: 0,
      durationMs: 1,
      filesScanned: files,
      filesSkipped: 0,
      bytesScanned: 10,
      truncated: false,
      findings: [],
      counts: {},
      skippedTypes: 0,
    },
    vocabularyIssues: [],
  }
}

test('a remembered report is recalled with its age', () => {
  clearScanCache()
  const now = 1_000_000
  rememberScan({ workspace: '/tmp/ws', response: response(7), retentionMinutes: 10, now })
  const recalled = recallScan({ workspace: '/tmp/ws', retentionMinutes: 10, now: now + 30_000 })
  assert.ok(recalled !== undefined)
  assert.equal(recalled.response.summary.filesScanned, 7)
  assert.equal(recalled.ageMs, 30_000)
  assert.equal(recalled.expired, false)
})

test('a report past the retention comes back marked expired, not dropped', () => {
  clearScanCache()
  const now = 1_000_000
  rememberScan({ workspace: '/tmp/ws', response: response(1), retentionMinutes: 10, now })
  const recalled = recallScan({ workspace: '/tmp/ws', retentionMinutes: 10, now: now + 11 * 60_000 })
  assert.ok(recalled !== undefined, 'the panel still shows it, greyed out')
  assert.equal(recalled.expired, true)
})

test('retention 0 neither stores nor recalls', () => {
  clearScanCache()
  rememberScan({ workspace: '/tmp/ws', response: response(1), retentionMinutes: 0, now: 1 })
  assert.equal(recallScan({ workspace: '/tmp/ws', retentionMinutes: 0 }), undefined)
  assert.equal(recallScan({ workspace: '/tmp/ws', retentionMinutes: 10 }), undefined)
})

test('only the three most recent workspaces are kept', () => {
  clearScanCache()
  for (const [index, workspace] of ['/a', '/b', '/c', '/d'].entries()) {
    rememberScan({ workspace, response: response(index), retentionMinutes: 10, now: 1_000 + index })
  }
  assert.equal(recallScan({ workspace: '/a', retentionMinutes: 10 })?.response.summary.filesScanned, undefined, 'the oldest is dropped')
  for (const workspace of ['/b', '/c', '/d']) {
    assert.ok(recallScan({ workspace, retentionMinutes: 10 }) !== undefined, `${workspace} is kept`)
  }
})

test('an oversized report is not persisted', () => {
  clearScanCache()
  const huge = response(1)
  huge.summary.findings = Array.from({ length: 2_000 }, (_, index) => ({
    id: `f${index}`,
    detector: 'term-unmapped' as const,
    confidence: 'low' as const,
    path: `Some/Very/Long/Path/To/A/File/Number/${index}/With/More/Segments.cs`,
    line: index,
    symbol: `Symbol${index}`,
    message: 'x'.repeat(600),
    citation: `Some/Very/Long/Path/To/A/File/Number/${index}.cs::Symbol${index}`,
    detail: {},
  }))
  rememberScan({ workspace: '/tmp/huge', response: huge, retentionMinutes: 10 })
  assert.equal(recallScan({ workspace: '/tmp/huge', retentionMinutes: 10 }), undefined)
})

test('corrupt storage reads as empty, and forget drops one workspace', () => {
  clearScanCache()
  rememberScan({ workspace: '/tmp/ws', response: response(1), retentionMinutes: 10 })
  store.setItem('dsh-semantic-drift:scan-cache', '{not json')
  assert.equal(recallScan({ workspace: '/tmp/ws', retentionMinutes: 10 }), undefined)
  clearScanCache()
  rememberScan({ workspace: '/tmp/ws', response: response(1), retentionMinutes: 10 })
  forgetScan('/tmp/ws')
  assert.equal(recallScan({ workspace: '/tmp/ws', retentionMinutes: 10 }), undefined)
})

test('the vocabulary mtime is carried so the panel can flag a changed file', () => {
  clearScanCache()
  rememberScan({ workspace: '/tmp/ws', response: response(1), retentionMinutes: 10, mtimeMs: 42, now: 1 })
  assert.equal(recallScan({ workspace: '/tmp/ws', retentionMinutes: 10, now: 2 })?.mtimeMs, 42)
})

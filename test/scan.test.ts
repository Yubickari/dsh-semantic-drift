import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir, mkdtemp, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { DEFAULT_EXCLUDES } from '../src/store.ts'
import { scanWorkspace } from '../src/scan/index.ts'
import type { Concept, VocabularyDocument } from '../src/protocol.ts'

/**
 * Fixture tree. Every name here is invented for this test: the rules are
 * general, so the samples must not be copied from any real project.
 *
 * - Alpha and Beta both declare `NetworkStatus` with the same members
 *   (duplicate definition).
 * - Alpha and Beta both declare `DeviceMode`, but Beta is missing `Fault`
 *   (contract drift).
 * - `target_temp` is a case/separator variant of the canonical `TargetTemp`,
 *   and the same file mentions the concept's Chinese term, so the variant rule
 *   is allowed to fire.
 * - `采样地址` appears in a comment while `SampleAddress` appears nowhere
 *   (term unmapped).
 */
const FILES: Record<string, string> = {
  'Alpha/Alpha.csproj': '<Project Sdk="Microsoft.NET.Sdk" />\n',
  'Alpha/Enums/NetworkStatus.cs': [
    'namespace Alpha.Enums;',
    'public enum NetworkStatus',
    '{',
    '    Connecting,',
    '    Connected,',
    '    Disconnected,',
    '}',
    '',
  ].join('\n'),
  'Alpha/Devices/DeviceMode.cs': [
    'namespace Alpha.Devices;',
    'public enum DeviceMode',
    '{',
    '    Idle,',
    '    Running,',
    '    Fault,',
    '}',
    '',
  ].join('\n'),
  'Alpha/Devices/TemperatureSample.cs': [
    'namespace Alpha.Devices;',
    '/// <summary>目标温度 in degrees Celsius.</summary>',
    'public sealed class TemperatureSample',
    '{',
    '    public double target_temp;',
    '    public int SampleId;',
    '}',
    '',
  ].join('\n'),
  'Beta/Beta.csproj': '<Project Sdk="Microsoft.NET.Sdk" />\n',
  'Beta/Enumus/NetworkStatus.cs': [
    'namespace Beta.Enumus;',
    'public enum NetworkStatus',
    '{',
    '    Connecting,',
    '    Connected,',
    '    Disconnected,',
    '}',
    '',
  ].join('\n'),
  'Beta/Enumus/DeviceMode.cs': [
    'namespace Beta.Enumus;',
    'public enum DeviceMode',
    '{',
    '    Idle,',
    '    Running,',
    '}',
    '',
  ].join('\n'),
  'Gamma/Gamma.csproj': '<Project Sdk="Microsoft.NET.Sdk" />\n',
  'Gamma/Notes.cs': [
    'namespace Gamma;',
    '// 采样地址 is configured by the deployment, not by this library.',
    'public static class Notes',
    '{',
    '    public const string Kind = "sample";',
    '}',
    '',
  ].join('\n'),
  'node_modules/left-pad/index.js': 'export const TargetTemp = 1\n',
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-scan-'))
  for (const [relPath, content] of Object.entries(FILES)) {
    const target = join(root, relPath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
  return root
}

function concepts(): Concept[] {
  return [
    {
      id: 'device.target_temperature',
      terms: ['目标温度'],
      kind: 'quantity',
      canonical: { symbol: 'TargetTemp', type: 'double', unit: '°C' },
    },
    {
      id: 'sample.address',
      terms: ['采样地址'],
      kind: 'entity',
      canonical: { symbol: 'SampleAddress' },
    },
  ]
}

function vocabulary(extra: Concept[] = []): VocabularyDocument {
  return {
    version: 1,
    exclude: [...DEFAULT_EXCLUDES],
    concepts: [...concepts(), ...extra],
  }
}

const BASE = {
  citationStyle: 'file+symbol' as const,
  timeoutMs: 15_000,
  maxFindings: 5_000,
  maxFileBytes: 1_048_576,
}

test('finds the identical duplicate, the diverged contract, the variant and the unmapped term', async () => {
  const root = await fixture()
  const summary = await scanWorkspace({ ...BASE, root, document: vocabulary() })
  const byDetector = (id: string) => summary.findings.filter(finding => finding.detector === id)

  const duplicates = byDetector('duplicate-type')
  assert.equal(duplicates.length, 1, JSON.stringify(duplicates, null, 2))
  assert.equal(duplicates[0].symbol, 'NetworkStatus')
  assert.equal(duplicates[0].path, 'Beta/Enumus/NetworkStatus.cs')
  assert.equal(duplicates[0].confidence, 'high')
  assert.deepEqual(duplicates[0].detail.members, ['Connected', 'Connecting', 'Disconnected'])

  const drift = byDetector('contract-drift')
  assert.equal(drift.length, 1, JSON.stringify(drift, null, 2))
  assert.equal(drift[0].symbol, 'DeviceMode')
  assert.equal(drift[0].path, 'Beta/Enumus/DeviceMode.cs')
  assert.deepEqual(drift[0].detail.missing, ['Fault'])
  assert.deepEqual(drift[0].detail.extra, [])

  const variants = byDetector('symbol-variant')
  assert.equal(variants.length, 1, JSON.stringify(variants, null, 2))
  assert.equal(variants[0].symbol, 'target_temp')
  assert.equal(variants[0].expected, 'TargetTemp')
  assert.equal(variants[0].conceptId, 'device.target_temperature')
  assert.equal(variants[0].confidence, 'medium')

  const terms = byDetector('term-unmapped')
  assert.equal(terms.length, 1, JSON.stringify(terms, null, 2))
  assert.equal(terms[0].symbol, 'SampleAddress')
  assert.equal(terms[0].conceptId, 'sample.address')
  assert.equal(terms[0].confidence, 'low')

  assert.equal(summary.filesScanned, 6, 'node_modules is excluded and .csproj is not a scanned extension')
  assert.deepEqual(summary.counts, {
    'duplicate-type': 1,
    'contract-drift': 1,
    'symbol-variant': 1,
    'term-unmapped': 1,
  })
})

test('citations follow the configured style', async () => {
  const root = await fixture()
  const summary = await scanWorkspace({ ...BASE, root, document: vocabulary(), citationStyle: 'file:line' })
  const duplicate = summary.findings.find(finding => finding.detector === 'duplicate-type')
  assert.ok(duplicate !== undefined)
  assert.match(duplicate.citation, /^Beta\/Enumus\/NetworkStatus\.cs:\d+$/)
})

test('a scan is read-only and deterministic', async () => {
  const root = await fixture()
  const before = await signature(root)
  const first = await scanWorkspace({ ...BASE, root, document: vocabulary() })
  const second = await scanWorkspace({ ...BASE, root, document: vocabulary() })
  const after = await signature(root)
  assert.deepEqual(after, before, 'the scanner must not create, modify or delete anything')
  assert.deepEqual(
    first.findings.map(finding => finding.id),
    second.findings.map(finding => finding.id),
  )
})

test('accepted exceptions mute their findings without hiding the rest', async () => {
  const root = await fixture()
  const accepted: Concept = {
    ...concepts()[0],
    accepted: [{ symbol: 'target_temp', path: 'Alpha/**', reason: 'public field kept for one release' }],
  }
  const summary = await scanWorkspace({ ...BASE, root, document: vocabulary([accepted]) })
  assert.equal(summary.findings.some(finding => finding.detector === 'symbol-variant'), false)
  assert.equal(summary.findings.some(finding => finding.detector === 'duplicate-type'), true)
})

test('minConfidence and the detector filter narrow the report', async () => {
  const root = await fixture()
  const highOnly = await scanWorkspace({ ...BASE, root, document: vocabulary(), minConfidence: 'high' })
  assert.deepEqual([...new Set(highOnly.findings.map(finding => finding.confidence))], ['high'])
  const one = await scanWorkspace({ ...BASE, root, document: vocabulary(), detectors: ['term-unmapped'] })
  assert.deepEqual([...new Set(one.findings.map(finding => finding.detector))], ['term-unmapped'])
})

test('paths restrict the scan to one subtree', async () => {
  const root = await fixture()
  const summary = await scanWorkspace({ ...BASE, root, document: vocabulary(), paths: ['Alpha'] })
  assert.equal(summary.filesScanned, 3)
  assert.equal(summary.findings.length, 1, 'no duplicate survives when only one unit is scanned')
  assert.equal(summary.findings[0].detector, 'symbol-variant')
})

test('the deadline truncates the scan and says so', async () => {
  const root = await fixture()
  let clock = 0
  const summary = await scanWorkspace({
    ...BASE,
    root,
    document: vocabulary(),
    timeoutMs: 10,
    now: () => (clock += 1_000),
  })
  assert.equal(summary.truncated, true)
  assert.equal(summary.truncatedReason, 'timeout')
  assert.equal(summary.filesScanned, 0)
})

test('an oversized file is skipped, not read', async () => {
  const root = await fixture()
  const summary = await scanWorkspace({ ...BASE, root, document: vocabulary(), maxFileBytes: 20 })
  assert.ok(summary.filesSkipped > 0)
  assert.equal(summary.findings.length, 0)
})

test('a missing root is reported, never scanned', async () => {
  await assert.rejects(
    () => scanWorkspace({ ...BASE, root: join(tmpdir(), 'semantic-drift-does-not-exist'), document: vocabulary() }),
    /does not exist/,
  )
})

/** Relative path + size + mtime for every file under the root. */
async function signature(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute, rel)
        out.push(`dir:${rel}`)
      } else {
        const info = await stat(absolute)
        out.push(`file:${rel}:${info.size}:${info.mtimeMs}`)
      }
    }
  }
  await walk(root, '')
  return out.sort()
}

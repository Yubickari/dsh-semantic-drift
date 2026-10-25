import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_EXCLUDES } from '../src/store.ts'
import { scanWorkspace } from '../src/scan/index.ts'
import type { Concept } from '../src/protocol.ts'

/** Build a workspace from a path -> source map. */
async function workspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-detectors-'))
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), text, 'utf8')
  }
  return root
}

function document(concepts: Concept[] = []) {
  return { version: 1, exclude: [...DEFAULT_EXCLUDES], concepts }
}

async function scan(root: string, concepts: Concept[] = []) {
  return await scanWorkspace({
    root,
    document: document(concepts),
    citationStyle: 'file+symbol',
    timeoutMs: 20_000,
    maxFindings: 1_000,
    maxFileBytes: 1_048_576,
  })
}

const BASE = `namespace Common
{
    public abstract class ProviderBase
    {
        public abstract string ModuleName { get; }
        public abstract string BaseFileName { get; }
    }
}
`

function provider(module: string, kind: string, name = 'Provider'): string {
  return `namespace ${module}
{
    public class ${name} : ProviderBase
    {
        public override string ModuleName => "${module}";
        public override string BaseFileName => "${kind}";
    }
}
`
}

/** A plain class with one member per line, so the parser sees every member. */
function plain(name: string, body: string): string {
  return `public class ${name}\n{\n${body}\n}\n`
}

test('a shared base with per-unit values is a derived copy, not a duplicate', async () => {
  const root = await workspace({
    'Common/ProviderBase.cs': BASE,
    'Alpha/Alpha.csproj': '<Project />\n',
    'Beta/Beta.csproj': '<Project />\n',
    'Alpha/Provider.cs': provider('Alpha', 'Language'),
    'Beta/Provider.cs': provider('Beta', 'Language'),
  })
  const summary = await scan(root)
  const finding = summary.findings.find(entry => entry.symbol === 'Provider')
  assert.ok(finding !== undefined, JSON.stringify(summary.findings, null, 2))
  assert.equal(finding.detector, 'duplicate-type')
  assert.equal(finding.detail.rule, 'derived-copy')
  assert.equal(finding.detail.base, 'ProviderBase')
  assert.equal(finding.detail.sites, 2)
  assert.doesNotMatch(finding.message, /merge/i)
})

test('the same names and values with no base is still a merge candidate', async () => {
  const root = await workspace({
    'Alpha/Alpha.csproj': '<Project />\n',
    'Beta/Beta.csproj': '<Project />\n',
    'Alpha/Settings.cs': plain('Settings', '    public string Name => "a";\n    public int Port => 1;'),
    'Beta/Settings.cs': plain('Settings', '    public string Name => "a";\n    public int Port => 1;'),
  })
  const summary = await scan(root)
  const finding = summary.findings.find(entry => entry.symbol === 'Settings')
  assert.ok(finding !== undefined)
  assert.equal(finding.detail.rule, 'identical-members')
  assert.match(finding.message, /same values/)
})

test('same names, different values and no base is a literal variant', async () => {
  const root = await workspace({
    'Alpha/Alpha.csproj': '<Project />\n',
    'Beta/Beta.csproj': '<Project />\n',
    'Alpha/Limits.cs': plain('Limits', '    public int Max => 10;\n    public int Min => 0;'),
    'Beta/Limits.cs': plain('Limits', '    public int Max => 20;\n    public int Min => 0;'),
  })
  const summary = await scan(root)
  const finding = summary.findings.find(entry => entry.symbol === 'Limits')
  assert.ok(finding !== undefined)
  assert.equal(finding.detail.rule, 'literal-variant')
  assert.doesNotMatch(finding.message, /merge/i)
})

test('an enum that swapped values reports the value differences', async () => {
  const root = await workspace({
    'Alpha/Alpha.csproj': '<Project />\n',
    'Beta/Beta.csproj': '<Project />\n',
    'Alpha/Status.cs': 'public enum Status { Off = 1, On = 2 }\n',
    'Beta/Status.cs': 'public enum Status { Off = 2, On = 1 }\n',
  })
  const summary = await scan(root)
  const finding = summary.findings.find(entry => entry.symbol === 'Status')
  assert.ok(finding !== undefined, JSON.stringify(summary.findings.map(f => [f.detector, f.symbol, f.detail.rule]), null, 2))
  assert.equal(finding.detail.rule, 'literal-variant')
  assert.deepEqual(
    (finding.detail.valueDiffs ?? []).map(diff => diff.member).sort(),
    ['Off', 'On'],
  )
  assert.match(finding.message, /different values/)
})

test('a renamed identical contract is reported against the concept canonical name', async () => {
  const root = await workspace({
    'Common/ProviderBase.cs': BASE,
    'A/Provider.cs': provider('A', 'Language'),
    'B/Provider.cs': provider('B', 'Language'),
    'C/Alias.cs': provider('C', 'Language', 'Alias'),
    'D/Other.cs': provider('D', 'ErrorCode', 'Other'),
  })
  const concept: Concept = {
    id: 'resource.language_provider',
    terms: ['语言资源'],
    kind: 'entity',
    canonical: { symbol: 'Provider' },
  }
  const summary = await scan(root, [concept])
  const aliases = summary.findings.filter(entry => entry.detail.rule === 'contract-alias')
  assert.equal(aliases.length, 1, JSON.stringify(summary.findings.map(f => [f.symbol, f.detail.rule]), null, 2))
  assert.equal(aliases[0].symbol, 'Alias')
  assert.equal(aliases[0].expected, 'Provider')
  assert.equal(aliases[0].detector, 'symbol-variant')
  assert.equal(summary.findings.some(entry => entry.symbol === 'Other'), false, 'a different stable constant is not an alias')
})

test('without a vocabulary no alias is reported', async () => {
  const root = await workspace({
    'Common/ProviderBase.cs': BASE,
    'A/Provider.cs': provider('A', 'Language'),
    'B/Provider.cs': provider('B', 'Language'),
    'C/Alias.cs': provider('C', 'Language', 'Alias'),
  })
  const summary = await scan(root)
  assert.equal(summary.findings.some(entry => entry.detail.rule === 'contract-alias'), false)
})

test('a canonical spelling that exists nowhere but in another case is reported', async () => {
  const root = await workspace({
    'A/Channel.cs': 'namespace A\n{\n    public class SensorRate\n    {\n        public int Count { get; set; }\n        public int Index { get; set; }\n    }\n}\n',
    'B/Channel.cs': 'namespace B\n{\n    public class SensorRate\n    {\n        public int Count { get; set; }\n        public int Index { get; set; }\n    }\n}\n',
  })
  const summary = await scan(root, [
    { id: 'sensor.sensor_rate', terms: ['采样率'], kind: 'quantity', canonical: { symbol: 'SensorRATE' } },
  ])
  const finding = summary.findings.find(entry => entry.detail.rule === 'canonical-case')
  assert.ok(finding !== undefined, 'a canonical that appears nowhere must be reported')
  assert.equal(finding.symbol, 'SensorRate')
  assert.equal(finding.expected, 'SensorRATE')
  assert.equal(finding.conceptId, 'sensor.sensor_rate')
  assert.equal(finding.detail.sites, 2)
  assert.equal(summary.findings.filter(entry => entry.detail.rule === 'canonical-case').length, 1, 'one finding per concept')
})

test('a type that shadows its own base is not contract drift', async () => {
  const root = await workspace({
    'Base/NetworkConfig.cs': `namespace Base.File
{
    public class NetworkConfig
    {
        public string FileName { get; set; }
        public string FolderName { get; set; }
        public int Retries { get; set; }
    }
}
`,
    'App/NetworkConfig.cs': `namespace App
{
    public class NetworkConfig : Base.File.NetworkConfig
    {
        public bool Enabled { get; set; }
        public string Endpoint { get; set; }
    }
}
`,
  })
  const summary = await scan(root)
  assert.equal(
    summary.findings.some(finding => finding.symbol === 'NetworkConfig' && finding.detector === 'contract-drift'),
    false,
    'inherited members are not a drifting contract',
  )
})

test('two private nested helpers with the same short name are not contract drift', async () => {
  const root = await workspace({
    'A/Policy.cs': `namespace A
{
    public class FileTransferPolicy
    {
        private sealed class Lease
        {
            public int Bytes { get; set; }
            public int Seconds { get; set; }
        }
    }
}
`,
    'B/Session.cs': `namespace B
{
    public class SlotDataConfigEditSession
    {
        private sealed class Lease
        {
            public string Owner { get; set; }
            public long Version { get; set; }
        }
    }
}
`,
  })
  const summary = await scan(root)
  assert.equal(
    summary.findings.some(finding => finding.symbol === 'Lease' && finding.detector === 'contract-drift'),
    false,
    'a nested private helper is a local name',
  )
})

test('identical members declared as different kinds say so', async () => {
  const root = await workspace({
    'Debug/Params.cs': 'namespace Debug\n{\n    public struct TempOptions\n    {\n        public int Mode { get; set; }\n        public int Value { get; set; }\n    }\n}\n',
    'Sys/Params.cs': 'namespace Sys\n{\n    public class TempOptions\n    {\n        public int Mode { get; set; }\n        public int Value { get; set; }\n    }\n}\n',
  })
  const summary = await scan(root)
  const finding = summary.findings.find(entry => entry.symbol === 'TempOptions' && entry.detail.rule === 'identical-members')
  assert.ok(finding !== undefined)
  assert.deepEqual(finding.detail.kinds, ['struct', 'class'])
  assert.match(finding.message, /as a struct there and a class here/)
})

test('the parse cache never hides an edited file', async () => {
  const root = await workspace({
    'A/Thing.cs': 'namespace A\n{\n    public class Thing\n    {\n        public int Alpha { get; set; }\n        public int Beta { get; set; }\n    }\n}\n',
    'B/Thing.cs': 'namespace B\n{\n    public class Thing\n    {\n        public int Alpha { get; set; }\n        public int Beta { get; set; }\n    }\n}\n',
  })
  const old = new Date(Date.now() - 60_000)
  await utimes(join(root, 'A/Thing.cs'), old, old)
  await utimes(join(root, 'B/Thing.cs'), old, old)
  const first = await scan(root)
  assert.equal(first.findings.some(entry => entry.symbol === 'Thing'), true)

  // Same size, different members, an mtime far enough back to be cache-eligible.
  await writeFile(join(root, 'B/Thing.cs'), 'namespace B\n{\n    public class Thing\n    {\n        public int Gamma { get; set; }\n        public int Delta { get; set; }\n    }\n}\n')
  await utimes(join(root, 'B/Thing.cs'), old, old)
  const second = await scan(root)
  assert.equal(
    second.findings.some(entry => entry.symbol === 'Thing' && entry.detail.rule === 'identical-members'),
    false,
    'a changed file must be re-parsed',
  )
})

test('a canonical used only as the head of other names is still reported', async () => {
  const root = await workspace({
    'A/ChannelService.cs': 'namespace A\n{\n    public sealed class SensorRateService\n    {\n        public int Count { get; set; }\n        public int Index { get; set; }\n    }\n\n    public sealed class SensorRateChangedEventArgs\n    {\n        public int Count { get; set; }\n        public int Index { get; set; }\n    }\n}\n',
  })
  const summary = await scan(root, [
    { id: 'sensor.sensor_rate', terms: ['采样率'], kind: 'quantity', canonical: { symbol: 'SensorRATE' } },
  ])
  const finding = summary.findings.find(entry => entry.detail.rule === 'canonical-case')
  assert.ok(finding !== undefined, 'the spelling never appears, but its prefix does')
  assert.equal(finding.symbol, 'SensorRateService')
  assert.match(finding.message, /SensorRateChangedEventArgs/)
  assert.equal(finding.detail.sites, 2)
})

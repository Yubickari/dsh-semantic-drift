import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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

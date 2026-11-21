import { strict as assert } from 'node:assert'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function run(args: string[], cwd: string): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return { code: failure.status ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

function git(root: string, args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-cli-'))
  await mkdir(join(root, '.dsh'), { recursive: true })
  await writeFile(join(root, '.dsh', 'semantics.yaml'), [
    'version: 1',
    'meta: {project: cli-fixture, updated: 2026-01-01}',
    'exclude: ["**/node_modules/**"]',
    'concepts: []',
    '',
  ].join('\n'), 'utf8')
  await mkdir(join(root, 'Alpha'), { recursive: true })
  await writeFile(join(root, 'Alpha', 'Alpha.csproj'), '<Project Sdk="Microsoft.NET.Sdk" />\n', 'utf8')
  await writeFile(join(root, 'Alpha', 'Status.cs'), 'namespace Alpha;\npublic enum Status { On, Off }\n', 'utf8')
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'cli@example.invalid'])
  git(root, ['config', 'user.name', 'CLI Fixture'])
  git(root, ['add', '-A'])
  git(root, ['commit', '-qm', 'initial'])
  return root
}

async function addBeta(root: string): Promise<void> {
  await mkdir(join(root, 'Beta'), { recursive: true })
  await writeFile(join(root, 'Beta', 'Beta.csproj'), '<Project Sdk="Microsoft.NET.Sdk" />\n', 'utf8')
  await writeFile(join(root, 'Beta', 'Status.cs'), 'namespace Beta;\npublic enum Status { On, Off }\n', 'utf8')
  git(root, ['add', '-A'])
  git(root, ['commit', '-qm', 'add beta'])
}

test('--all --json is clean and exits 0', async () => {
  const root = await repository()
  const result = run(['scan', '--root', root, '--all', '--json'], root)
  assert.equal(result.code, 0, result.stderr)
  const answer = JSON.parse(result.stdout) as { ok: boolean; mode: string; total: number; findings: unknown[] }
  assert.equal(answer.ok, true)
  assert.equal(answer.mode, 'all')
  assert.equal(answer.total, 0)
  assert.deepEqual(answer.findings, [])
})

test('a duplicate declaration exits 1 and is machine-readable', async () => {
  const root = await repository()
  await addBeta(root)
  const result = run(['--root', root, '--all', '--json'], root)
  assert.equal(result.code, 1, result.stderr)
  const answer = JSON.parse(result.stdout) as {
    ok: boolean
    total: number
    counts: Record<string, number>
    findings: Array<{ detector: string; path: string; detail: { primaryPath?: string } }>
  }
  assert.equal(answer.ok, true)
  assert.equal(answer.total, 1)
  assert.equal(answer.counts['duplicate-type'], 1)
  assert.equal(answer.findings[0].detector, 'duplicate-type')
  assert.equal(answer.findings[0].path, 'Beta/Status.cs')
  assert.equal(answer.findings[0].detail.primaryPath, 'Alpha/Status.cs')
})

test('--changed filters findings to changed paths and reports the base', async () => {
  const root = await repository()
  await addBeta(root)
  const result = run(['--root', root, '--changed', '--base', 'HEAD^', '--json'], root)
  assert.equal(result.code, 1, result.stderr)
  const answer = JSON.parse(result.stdout) as { mode: string; base: string; changedFiles: string[]; total: number }
  assert.equal(answer.mode, 'changed')
  assert.equal(answer.base, 'HEAD^')
  assert.deepEqual(answer.changedFiles, ['Beta/Beta.csproj', 'Beta/Status.cs'])
  assert.equal(answer.total, 1)
})

test('--changed with no changed files exits 0', async () => {
  const root = await repository()
  const result = run(['--root', root, '--changed', '--base', 'HEAD', '--json'], root)
  assert.equal(result.code, 0, result.stderr)
  const answer = JSON.parse(result.stdout) as { changedFiles: string[]; total: number }
  assert.deepEqual(answer.changedFiles, [])
  assert.equal(answer.total, 0)
})

test('--changed outside a git repository exits 2 with a JSON error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-cli-nogit-'))
  await mkdir(join(root, '.dsh'), { recursive: true })
  await writeFile(join(root, '.dsh', 'semantics.yaml'), 'version: 1\nexclude: []\nconcepts: []\n', 'utf8')
  const result = run(['--root', root, '--changed', '--json'], root)
  assert.equal(result.code, 2)
  const answer = JSON.parse(result.stdout) as { ok: boolean; code: string }
  assert.equal(answer.ok, false)
  assert.equal(answer.code, 'bad-request')
})

test('an invalid vocabulary exits 2 and carries positioned issues', async () => {
  const root = await repository()
  await writeFile(join(root, '.dsh', 'semantics.yaml'), [
    'version: 1',
    'exclude: []',
    'concepts:',
    '  - id: bad',
    '    terms: [x]',
    '    kind: entity',
    '    canonical: {symbol: Bad}',
    '',
  ].join('\n'), 'utf8')
  const result = run(['--root', root, '--all', '--json'], root)
  assert.equal(result.code, 2)
  const answer = JSON.parse(result.stdout) as { ok: boolean; code: string; issues: Array<{ code: string; suggestion?: string }> }
  assert.equal(answer.ok, false)
  assert.equal(answer.code, 'invalid-vocabulary')
  assert.equal(answer.issues[0].code, 'id-format')
  assert.equal(answer.issues[0].suggestion, 'domain.bad')
})

test('--help and --version are side-effect-free', async () => {
  const root = await repository()
  const help = run(['--help'], root)
  assert.equal(help.code, 0)
  assert.match(help.stdout, /--changed/)
  const version = run(['--version'], root)
  assert.equal(version.code, 0)
  const pkg = JSON.parse(execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
  })) as { version: string }
  assert.equal(version.stdout.trim(), pkg.version)
})


test('the built CLI artifact runs the same read-only scan', async () => {
  const libCli = fileURLToPath(new URL('../lib/cli.js', import.meta.url))
  const root = await repository()
  const stdout = execFileSync(process.execPath, [libCli, '--root', root, '--all', '--json'], { encoding: 'utf8' })
  const answer = JSON.parse(stdout) as { ok: boolean; mode: string }
  assert.equal(answer.ok, true)
  assert.equal(answer.mode, 'all')
})

test('the CLI runs through a bin symlink', async (t) => {
  if (process.platform === 'win32') {
    t.skip('symlink bin shims are platform-specific')
    return
  }
  const root = await mkdtemp(join(tmpdir(), 'semantic-drift-cli-bin-'))
  const link = join(root, 'dsh-semantic-drift')
  await symlink(fileURLToPath(new URL('../lib/cli.js', import.meta.url)), link)
  const version = execFileSync(link, ['--version'], { encoding: 'utf8' })
  assert.equal(version.trim(), '0.3.0')
})

/**
 * Release preflight: the checks CI makes, runnable before the tag is pushed.
 *
 * A release fails on GitHub only after the tag exists, which makes the feedback
 * loop slow and leaves a tag behind. This runs the same checks locally, in the
 * same order, and says what to fix.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const steps = []
const fail = message => {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}
const run = (command, args, env = {}) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    fail(`${command} ${args.join(' ')} failed${output === '' ? '' : `:\n${output}`}`)
  }
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const source = readFileSync('src/index.ts', 'utf8')
const version = /export const VERSION = '([^']+)'/.exec(source)?.[1]
if (version !== manifest.version) fail(`VERSION (${version}) does not match package.json (${manifest.version})`)
steps.push(`version ${manifest.version}`)

const tagName = `v${manifest.version}`
if (run('git', ['tag', '-l', tagName]).trim() !== '') {
  const tagCommit = run('git', ['rev-list', '-n', '1', tagName]).trim()
  const head = run('git', ['rev-parse', 'HEAD']).trim()
  if (tagCommit !== head) console.log(`! tag ${tagName} points at ${tagCommit.slice(0, 7)}, HEAD is ${head.slice(0, 7)}`)
  steps.push('version and tag agree')
} else {
  steps.push(`no ${tagName} tag yet`)
}

run('node', ['scripts/build.mjs'])
// A version bump rebuilds lib/, so it is normally dirty until the release commit
// exists. Warn here; CI still verifies that the committed bundle matches a fresh
// build after the commit.
const dirty = run('git', ['status', '--porcelain', '--', 'lib']).trim()
if (dirty !== '') {
  console.log('! lib/ was rebuilt and is not committed yet — commit it before tagging')
}
steps.push('lib/ rebuilt')

run('node', ['--test', ...['test/**/*.test.ts', 'test/**/*.test.mjs']])
steps.push('tests pass')

// Keep npm off the global cache: it may be unwritable, and a release check must
// not depend on that.
const packed = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  npm_config_cache: '.tmp/npm-cache',
  npm_config_logs_dir: '.tmp/npm-logs',
})
const parsed = JSON.parse(packed)
// npm 12 keys the report by package name; older versions return an array.
const entry = Array.isArray(parsed) ? parsed[0] : parsed[Object.keys(parsed)[0]]
const files = entry.files.map(file => file.path)
for (const required of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'locale/en.json', 'icon.svg']) {
  if (!files.includes(required)) fail(`the package would miss ${required}`)
}
steps.push(`package contents (${files.length} files)`)

console.log(`\n✔ preflight passed: ${steps.join(' · ')}`)

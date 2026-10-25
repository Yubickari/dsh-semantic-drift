import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * The repository is published; the projects it was developed against are not.
 *
 * These checks are mechanical and deliberately generic: they cannot know a
 * private project's name by themselves, so the name list comes from
 * `SEMANTIC_DRIFT_DENYLIST` (comma separated, set in the environment, never
 * committed). What they always catch is the most common leak: an absolute path
 * from somebody's laptop — in a file or in a commit message.
 */

const SKIP = new Set(['node_modules', '.git', 'lib'])

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch {
    return undefined
  }
}

/** Tracked files, or undefined outside a git checkout (an npm tarball). */
function trackedFiles(): string[] | undefined {
  const listed = git(['ls-files', '-z'])
  if (listed === undefined) return undefined
  return listed.split('\u0000').filter(file => file !== '')
}

/** Paths that point at somebody's home directory. */
const HOME_PATH = [
  /\/Users\/[A-Za-z0-9._-]+\//,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/,
]

/** The optional private-name list from the environment. */
function denylist(): string[] {
  const raw = process.env.SEMANTIC_DRIFT_DENYLIST ?? ''
  return raw.split(',').map(token => token.trim()).filter(token => token !== '')
}

const SELF = 'test/hygiene.test.ts'

test('no tracked file carries an absolute home path or a private name', () => {
  const files = trackedFiles()
  if (files === undefined) return
  const blocked = denylist()
  const offenders: string[] = []
  for (const file of files) {
    if (file === SELF) continue
    if (file.split('/').some(segment => SKIP.has(segment))) continue
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (HOME_PATH.some(pattern => pattern.test(text))) offenders.push(`${file}: home path`)
    for (const token of blocked) {
      if (text.includes(token)) offenders.push(`${file}: private name "${token}"`)
    }
  }
  assert.deepEqual(offenders, [], 'anonymize the observation before committing (see CONTRIBUTING.md)')
})

test('no commit message carries an absolute home path or a private name', () => {
  const log = git(['log', '--format=%B'])
  if (log === undefined) return
  const blocked = denylist()
  assert.equal(HOME_PATH.some(pattern => pattern.test(log)), false, 'a commit message contains a home path')
  for (const token of blocked) {
    assert.equal(log.includes(token), false, `a commit message contains the private name "${token}"`)
  }
})

test('an empty denylist is allowed: the checks still cover home paths', () => {
  assert.deepEqual(denylist(), [], 'no tokens configured in this environment')
})

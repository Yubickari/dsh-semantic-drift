import { strict as assert } from 'node:assert'
import test from 'node:test'
import { compileGlobs, globToRegExp, isValidGlob, matchesGlob, matchesGlobs } from '../src/glob.ts'

test('**/segment/** prunes the directory itself and its children', () => {
  const set = compileGlobs(['**/bin/**', '**/node_modules/**'])
  assert.equal(matchesGlobs(set, 'src/App/bin', true), true)
  assert.equal(matchesGlobs(set, 'src/App/bin/Debug/app.dll', false), true)
  assert.equal(matchesGlobs(set, 'bin', true), true)
  assert.equal(matchesGlobs(set, 'src/binding/File.cs', false), false)
  assert.equal(matchesGlobs(set, 'src/node_modules_extra/File.cs', false), false)
})

test('single star stays inside one segment', () => {
  const regexp = globToRegExp('src/*.ts')
  assert.equal(regexp.test('src/app.ts'), true)
  assert.equal(regexp.test('src/lib/app.ts'), false)
})

test('doubled star crosses segments, including zero of them', () => {
  const regexp = globToRegExp('src/**/*.ts')
  assert.equal(regexp.test('src/app.ts'), true)
  assert.equal(regexp.test('src/lib/deep/app.ts'), true)
})

test('character classes and alternation are supported', () => {
  assert.equal(globToRegExp('file.[jt]s').test('file.ts'), true)
  assert.equal(globToRegExp('file.[jt]s').test('file.rs'), false)
  assert.equal(globToRegExp('src/{a,b}/*.cs').test('src/b/One.cs'), true)
  assert.equal(globToRegExp('src/{a,b}/*.cs').test('src/c/One.cs'), false)
})

test('unbalanced patterns are rejected instead of silently matching nothing', () => {
  assert.equal(isValidGlob('src/[abc/*.ts'), false)
  assert.equal(isValidGlob('src/{a,b/*.ts'), false)
  assert.equal(isValidGlob(''), false)
  assert.equal(isValidGlob('**/dist/**'), true)
})

test('an absent accepted path accepts every file', () => {
  assert.equal(matchesGlob(undefined, 'src/One.cs'), true)
  assert.equal(matchesGlob('**', 'src/One.cs'), true)
  assert.equal(matchesGlob('**/Legacy/**', 'src/Legacy/One.cs'), true)
  assert.equal(matchesGlob('**/Legacy/**', 'src/One.cs'), false)
})

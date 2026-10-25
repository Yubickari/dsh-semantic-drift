import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { DETECTOR_IDS, DETECTOR_RULES } from '../src/protocol.ts'

/**
 * The detector table is behaviour, not prose: it is what a reader uses to decide
 * whether a finding is real. These checks keep the code, the rule ids and both
 * READMEs from drifting apart.
 */

function detectorSources(): string[] {
  const dir = join(import.meta.dirname, '..', 'src', 'scan', 'detectors')
  return readdirSync(dir)
    .filter(file => file.endsWith('.ts'))
    .map(file => readFileSync(join(dir, file), 'utf8'))
}

test('every rule id the detectors emit is declared in DETECTOR_RULES', () => {
  const declared = new Set<string>(DETECTOR_RULES)
  const detectors = new Set<string>(DETECTOR_IDS)
  const sources = detectorSources()
  const quoted = new Set<string>()
  for (const source of sources) {
    // Any rule id is a string literal; the ones written as `rule: 'x'` or as the
    // value of a local (`const rule = ... ? 'identical-members' : ...`) are what
    // the regex below collects for the reverse direction.
    for (const match of source.matchAll(/rule[\s\S]{0,240}?['"]([a-z]+(?:-[a-z]+)+)['"]/g)) {
      if (detectors.has(match[1])) continue
      quoted.add(match[1])
    }
  }
  for (const rule of quoted) {
    assert.ok(declared.has(rule), `rule "${rule}" is emitted but missing from DETECTOR_RULES`)
  }
  for (const rule of DETECTOR_RULES) {
    assert.equal(
      sources.some(source => source.includes(`'${rule}'`)),
      true,
      `DETECTOR_RULES lists "${rule}" but no detector emits it`,
    )
  }
})

for (const file of ['README.md', 'README.zh.md']) {
  test(`${file} documents every detector and every rule`, () => {
    const text = readFileSync(join(import.meta.dirname, '..', file), 'utf8')
    for (const detector of DETECTOR_IDS) {
      assert.ok(text.includes(`\`${detector}\``), `${file} does not mention the ${detector} detector`)
    }
    for (const rule of DETECTOR_RULES) {
      assert.ok(text.includes(`\`${rule}\``), `${file} does not document the ${rule} rule`)
    }
  })
}

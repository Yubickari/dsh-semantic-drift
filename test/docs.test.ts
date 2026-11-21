import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { parse as parseYaml } from 'yaml'
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

  test(`${file} documents the feedback channels`, () => {
    const text = readFileSync(join(import.meta.dirname, '..', file), 'utf8')
    assert.match(text, /Feedback channels|提示通道/, `${file} needs the channel overview`)
    assert.match(text, /Banner|横幅/, `${file} does not mention persistent banners`)
    assert.match(text, /Validation issue|校验问题/, `${file} does not mention inline validation`)
    assert.match(text, /Footer badge|底栏徽标/, `${file} does not mention footer badges`)
    assert.doesNotMatch(text, /\| Toast \|/, `${file} still documents a removed toast channel`)
  })
}


test('the schema evolution doc states the v1 freeze and keeps v2 a draft', () => {
  const text = readFileSync(join(import.meta.dirname, '..', 'docs', 'schema-evolution.md'), 'utf8')
  assert.match(text, /v1 已冻结/)
  assert.match(text, /v2 仍是草案/)
  assert.match(text, /lifecycle/)
  assert.match(text, /version: 1/)
  assert.match(text, /semantic_upgrade/)
  assert.match(text, /第一次持久化 behavior/)
})

test('both READMEs document lifecycle, the compact default and the CLI', () => {
  for (const file of ['README.md', 'README.zh.md']) {
    const text = readFileSync(join(import.meta.dirname, '..', file), 'utf8')
    assert.match(text, /lifecycle/, `${file} does not document lifecycle`)
    assert.match(text, /compact/, `${file} does not document the compact default`)
    assert.match(text, /--changed/, `${file} does not document the CLI`)
    assert.match(text, /schema-evolution\.md/, `${file} does not link the schema doc`)
  }
})

test('the GitHub Actions example is valid and runs the read-only CLI', () => {
  const text = readFileSync(join(import.meta.dirname, '..', 'docs', 'github-action.yml'), 'utf8')
  const workflow = parseYaml(text) as { jobs?: Record<string, { steps?: Array<{ run?: string }> }> }
  assert.ok(workflow.jobs !== undefined)
  const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? [])
  const command = steps.map(step => step.run ?? '').join('\n')
  assert.match(command, /dsh-semantic-drift@0\.3\.0 scan/)
  assert.match(command, /--changed/)
  assert.match(command, /--json/)
  assert.doesNotMatch(command, /secrets\./)
})

test('the 0.3.0 release plan names the frozen scope and cancels 0.3.1', () => {
  const text = readFileSync(join(import.meta.dirname, '..', 'docs', 'release-plan-0.3.0.md'), 'utf8')
  for (const issue of ['#24', '#22', '#31', '#26', '#25']) assert.ok(text.includes(issue), `missing ${issue}`)
  assert.match(text, /0\.3\.1 不在计划内/)
  assert.match(text, /lifecycle/)
  assert.match(text, /--changed/)
})


test('the CLI and upgrade references cover the shipped 0.3.0 behavior', () => {
  const cli = readFileSync(join(import.meta.dirname, '..', 'docs', 'cli.md'), 'utf8')
  for (const flag of ['--changed', '--all', '--base', '--json', '--min-confidence']) {
    assert.ok(cli.includes(flag), `CLI doc is missing ${flag}`)
  }
  assert.match(cli, /Exit codes/)
  assert.match(cli, /never writes/)

  const upgrading = readFileSync(join(import.meta.dirname, '..', 'docs', 'upgrading-to-0.3.0.md'), 'utf8')
  assert.match(upgrading, /Downgrade warning/)
  assert.match(upgrading, /lifecycle/)
  assert.match(upgrading, /No schema v2/)

  for (const file of ['README.md', 'README.zh.md']) {
    const text = readFileSync(join(import.meta.dirname, '..', file), 'utf8')
    assert.match(text, /docs\/cli\.md/, `${file} does not link the CLI reference`)
    assert.match(text, /docs\/upgrading-to-0\.3\.0\.md/, `${file} does not link the upgrade notes`)
  }
})

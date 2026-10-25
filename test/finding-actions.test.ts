import { strict as assert } from 'node:assert'
import test from 'node:test'
import { defaultAcceptConcept, snakeCase, suggestConceptId } from '../src/client/finding-actions.ts'
import type { Concept, DriftFinding } from '../src/protocol.ts'

/** The store's id pattern, repeated here so a suggested id is checked, not assumed. */
const CONCEPT_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

function finding(overrides: Partial<DriftFinding> = {}): DriftFinding {
  return {
    id: 'duplicate-type:YNE20Debug/Foo/Enums.cs:NetworkStatus:12',
    detector: 'duplicate-type',
    confidence: 'high',
    path: 'YNE20Debug/Foo/Enums.cs',
    line: 12,
    symbol: 'NetworkStatus',
    message: 'example',
    citation: 'YNE20Debug/Foo/Enums.cs::NetworkStatus',
    detail: {},
    ...overrides,
  }
}

function concept(id: string, symbol: string): Concept {
  return { id, terms: ['term'], kind: 'entity', canonical: { symbol } }
}

test('snakeCase turns type names into id segments', () => {
  assert.equal(snakeCase('NetworkStatus'), 'network_status')
  assert.equal(snakeCase('TEC_TargetTemp'), 'tec_target_temp')
  assert.equal(snakeCase('YNE20Debug'), 'yne20_debug')
  assert.equal(snakeCase('__Foo__'), 'foo')
  assert.equal(snakeCase('A'), 'a')
  assert.equal(snakeCase('---'), '')
})

test('a promoted finding suggests a valid concept id', () => {
  const id = suggestConceptId(finding(), [])
  assert.equal(id, 'yne20_debug.network_status')
  assert.match(id, CONCEPT_ID)
})

test('a numeric-leading folder or symbol still yields a valid id', () => {
  const id = suggestConceptId(finding({ path: '2Config/Enums.cs', symbol: '9State' }), [])
  assert.match(id, CONCEPT_ID, `got ${id}`)
  assert.equal(id.startsWith('g_'), true)
})

test('a taken id is suffixed until it is free', () => {
  const existing = [concept('yne20_debug.network_status', 'A'), concept('yne20_debug.network_status_2', 'B')]
  assert.equal(suggestConceptId(finding(), existing), 'yne20_debug.network_status_3')
})

test('accept defaults to the finding concept, then the matching symbol, then the first', () => {
  const concepts = [concept('a.first', 'First'), concept('b.network_status', 'NetworkStatus')]
  assert.equal(defaultAcceptConcept(finding({ conceptId: 'a.first' }), concepts), 'a.first')
  assert.equal(defaultAcceptConcept(finding(), concepts), 'b.network_status')
  assert.equal(defaultAcceptConcept(finding({ symbol: 'Nothing' }), concepts), 'a.first')
  assert.equal(defaultAcceptConcept(finding(), []), undefined)
})

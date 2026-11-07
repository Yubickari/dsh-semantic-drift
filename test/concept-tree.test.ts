import { strict as assert } from 'node:assert'
import test from 'node:test'
import { buildConceptTree } from '../src/client/concept-tree.ts'
import type { Concept } from '../src/protocol.ts'

function concept(id: string, symbol = id.replace(/\./g, '_')): Concept {
  return {
    id,
    terms: [`${id} term`],
    kind: 'entity',
    canonical: { symbol },
  }
}

test('builds nested branches from multi-level ids', () => {
  const tree = buildConceptTree([
    concept('device.temperature.target'),
    concept('device.temperature.current'),
    concept('device.state'),
    concept('sensor.rate'),
  ])

  assert.deepEqual(tree.map(node => node.path), ['device', 'sensor'])
  const device = tree[0]
  assert.equal(device.count, 3)
  assert.equal(device.concept, undefined)
  assert.deepEqual(device.children.map(node => node.path), ['device.state', 'device.temperature'])

  const temperature = device.children[1]
  assert.equal(temperature.count, 2)
  assert.equal(temperature.concept, undefined)
  assert.deepEqual(temperature.children.map(node => node.path), [
    'device.temperature.current',
    'device.temperature.target',
  ])
  assert.equal(temperature.children[0].concept?.canonical.symbol, 'device_temperature_current')
})

test('a node can be both a concept and a branch', () => {
  const tree = buildConceptTree([
    concept('device.temperature'),
    concept('device.temperature.target'),
  ])

  const node = tree[0].children[0]
  assert.equal(node.path, 'device.temperature')
  assert.equal(node.concept?.id, 'device.temperature')
  assert.equal(node.children.length, 1)
  assert.equal(node.count, 2)
})

test('counts and drift aggregate over the subtree', () => {
  const tree = buildConceptTree(
    [
      concept('device.temperature.target'),
      concept('device.temperature.current'),
      concept('device.state'),
      concept('sensor.rate'),
    ],
    new Map([
      ['device.temperature.target', 2],
      ['device.state', 1],
      ['sensor.rate', 5],
    ]),
  )

  assert.equal(tree[0].drift, 3)
  assert.equal(tree[1].drift, 5)
  const temperature = tree[0].children[1]
  assert.equal(temperature.drift, 2)
  assert.equal(
    temperature.children.find(node => node.path === 'device.temperature.target')?.drift,
    2,
  )
})

test('counts are zero without drift input and sibling order is deterministic', () => {
  const tree = buildConceptTree([
    concept('zone.zeta.item'),
    concept('alpha.beta.item'),
    concept('alpha.alpha.item'),
  ])

  assert.deepEqual(tree.map(node => node.path), ['alpha', 'zone'])
  assert.deepEqual(tree[0].children.map(node => node.path), ['alpha.alpha', 'alpha.beta'])
  assert.equal(tree[0].count, 2)
  assert.equal(tree[0].drift, 0)
  assert.equal(tree[0].children[0].children[0].drift, 0)
})

test('an empty list builds an empty tree', () => {
  assert.deepEqual(buildConceptTree([]), [])
})

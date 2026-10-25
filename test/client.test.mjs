import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

/**
 * Browser-half contract test.
 *
 * `lib/client.js` is the artifact the Web shell actually evaluates, so this test
 * loads THAT file: it stubs the module loader the shell provides, checks the
 * exported `{ inject, apply }` shape, drives the slot registrations, and renders
 * the registered panel through react-dom/server. It cannot prove what the user
 * sees, but it does prove the shipped bundle loads, registers both seats, and
 * renders without throwing.
 */

const requireFromHere = createRequire(import.meta.url)

// Node exposes `navigator` as a getter, so both stubs go through defineProperty.
Object.defineProperty(globalThis, 'document', {
  value: { documentElement: { lang: 'zh-CN' } },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => undefined } },
  configurable: true,
})

let loaded
globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      loaded = { id, exports: factory(requireFromHere) }
    },
  },
}
await import('../lib/client.js')

function mountClient() {
  assert.ok(loaded !== undefined, 'the bundle must register itself with window.__ModuleLoader__')
  const registrations = []
  const ctx = {
    slots: {
      inject(key, callback) {
        assert.equal(typeof key, 'string')
        const dispose = callback()
        return typeof dispose === 'function' ? dispose : () => undefined
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => undefined
      },
    },
    effect(callback) {
      const cleanup = callback()
      return typeof cleanup === 'function' ? cleanup : () => undefined
    },
  }
  loaded.exports.apply(ctx)
  return registrations
}

test('the browser bundle registers a sidebar row and a main panel', () => {
  assert.equal(loaded.id, 'dsh-semantic-drift')
  assert.deepEqual(loaded.exports.inject, ['slots'])
  const registrations = mountClient()
  assert.equal(registrations.length, 2)
  const row = registrations.find(entry => entry.options.name === 'sidebar.panellist')
  const panel = registrations.find(entry => entry.options.name === 'main')
  assert.ok(row !== undefined, 'a sidebar row must be registered')
  assert.ok(panel !== undefined, 'a main panel must be registered')
  assert.equal(row.options.id, 'semantic-drift')
  assert.equal(panel.options.key, 'semantic-drift')
  assert.equal(row.options.label(), '语义词表')
  assert.equal(typeof row.component, 'function')
  assert.equal(typeof panel.component, 'function')
})

test('the panel renders its shell, index and empty state', () => {
  const registrations = mountClient()
  const panel = registrations.find(entry => entry.options.name === 'main')
  const html = renderToStaticMarkup(createElement(panel.component, {}))
  assert.match(html, /sd-root/)
  assert.match(html, /sd-header/)
  assert.match(html, /语义词表/)
  assert.match(html, /搜索 id \/ 术语 \/ 符号/)
  assert.match(html, /aria-label="新建概念"/)
  assert.match(html, /sd-tree-title/)
  assert.match(html, /sd-detail/)
})

test('the panel renders with the shell selector hooks supplied', () => {
  const registrations = mountClient()
  const panel = registrations.find(entry => entry.options.name === 'main')
  const useSessions = selector => selector({
    current: 's1',
    byId: { s1: { cwd: '/tmp/example-workspace' } },
  })
  const useWorkspaces = selector => selector({ items: [{ id: 'w1', path: '/tmp/other' }] })
  const html = renderToStaticMarkup(createElement(panel.component, { useSessions, useWorkspaces }))
  assert.match(html, /sd-root/)
})

test('a throwing selector hook does not take the panel down', () => {
  const registrations = mountClient()
  const panel = registrations.find(entry => entry.options.name === 'main')
  const html = renderToStaticMarkup(createElement(panel.component, {
    useSessions: () => { throw new Error('wrong call shape') },
    useWorkspaces: () => { throw new Error('wrong call shape') },
  }))
  assert.match(html, /sd-root/)
})

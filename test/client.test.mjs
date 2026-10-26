import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

/**
 * Browser-half contract test.
 *
 * The bundle under review is built from src/ with the same wrapper the Web shell
 * uses — not read from the committed lib/ artifact, which is only rewritten at
 * release time. It stubs the module loader the shell provides, checks the exported
 * { inject, apply } shape, drives the slot registrations, and renders the registered
 * panel through react-dom/server. It cannot prove what the user sees, but it does
 * prove the shipped bundle loads, registers every seat, and renders without throwing.
 *
 * The configuration page is registered through the settings domain, so these tests
 * drive ctx.inject with a stub configForms service: a shell that serves none must
 * still get the row and the panel, and nothing else.
 */

const requireFromHere = createRequire(import.meta.url)

// Node exposes navigator as a getter, so both stubs go through defineProperty.
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

const repo = fileURLToPath(new URL('..', import.meta.url))
const outdir = join(repo, '.tmp')
await mkdir(outdir, { recursive: true })
const bundled = await build({
  entryPoints: [join(repo, 'src/client/index.ts')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
  logLevel: 'warning',
})
const bundleFile = join(outdir, 'client-contract.js')
const wrapper = [
  'window.__ModuleLoader__.load({',
  "  id: 'dsh-semantic-drift',",
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  bundled.outputFiles[0].text.trim(),
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n')
await writeFile(bundleFile, wrapper, 'utf8')
await import(bundleFile)

/** A settings service that serves one namespace set and records the watch. */
function servedFace(served, form = {}) {
  const face = {
    watches: [],
    get(entryId) {
      face.asked = entryId
      return form
    },
    whileServed(namespaces, register) {
      face.watches.push(namespaces)
      const dispose = register(served)
      return typeof dispose === 'function' ? dispose : () => undefined
    },
  }
  return face
}

/** The shell's fiber inject, handing its face to the callback once. */
function ctxInject(face) {
  return (services, callback) => {
    assert.deepEqual(services, ['configForms'], 'the page needs the settings domain')
    callback(face)
    return () => undefined
  }
}

/**
 * Apply the bundle to a stub shell.
 * @param options.slotsInject - replaces the slot service's inject.
 * @param options.ctxInject - supplies ctx.inject; absent means a shell without it.
 */
function mountClient(options = {}) {
  assert.ok(loaded !== undefined, 'the bundle must register itself with window.__ModuleLoader__')
  const registrations = []
  const ctx = {
    slots: {
      inject(key, callback) {
        assert.equal(typeof key, 'string')
        if (options.slotsInject !== undefined) return options.slotsInject(key, callback)
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
  if (options.ctxInject !== undefined) ctx.inject = options.ctxInject
  loaded.exports.apply(ctx)
  return registrations
}

test('the browser bundle registers a sidebar row and a main panel', () => {
  assert.equal(loaded.id, 'dsh-semantic-drift')
  assert.deepEqual(loaded.exports.inject, ['slots'])
  const registrations = mountClient()
  assert.deepEqual(registrations.map(entry => entry.options.name), ['sidebar.panellist', 'main'])
  const row = registrations.find(entry => entry.options.name === 'sidebar.panellist')
  const panel = registrations.find(entry => entry.options.name === 'main')
  assert.equal(row.options.id, 'semantic-drift')
  assert.equal(panel.options.key, 'semantic-drift')
  assert.equal(row.options.label(), '语义漂移词表')
  assert.equal(typeof row.component, 'function')
  assert.equal(typeof panel.component, 'function')
})

test('a shell without ctx.inject still gets the row and the panel', () => {
  const registrations = mountClient()
  assert.deepEqual(registrations.map(entry => entry.options.name), ['sidebar.panellist', 'main'])
})

test('the served entry id keys the bundle config page', () => {
  const form = { getSnapshot: () => ({ status: 'ready', writable: true }), subscribe: () => () => undefined, set: async () => true }
  const face = servedFace(new Set(['semantic-drift']), form)
  const registrations = mountClient({ ctxInject: ctxInject(face) })

  assert.deepEqual(registrations.map(entry => entry.options.name), ['sidebar.panellist', 'main', 'plugins.bundle.config'])
  const config = registrations.find(entry => entry.options.name === 'plugins.bundle.config')
  assert.equal(config.options.key, 'dsh-semantic-drift', 'the seat is keyed by the package name')
  assert.equal(config.options.locale, 'semantic-drift')
  assert.deepEqual(config.options.inject(), { namespace: 'semantic-drift' }, 'the entry id wins over the package name')
  assert.deepEqual(face.watches, [['semantic-drift', 'dsh-semantic-drift']], 'the page follows both namespace candidates')
  assert.equal(typeof config.component, 'function')
})

test('a package-name namespace is used when the entry id is not served', () => {
  const face = servedFace(new Set(['dsh-semantic-drift']))
  const registrations = mountClient({ ctxInject: ctxInject(face) })
  const config = registrations.find(entry => entry.options.name === 'plugins.bundle.config')
  assert.ok(config !== undefined, 'a served package name is enough to register the page')
  assert.deepEqual(config.options.inject(), { namespace: 'dsh-semantic-drift' })
})

test('a served collection handed over as a list is read the same way', () => {
  const registrations = mountClient({ ctxInject: ctxInject(servedFace(['dsh-semantic-drift'])) })
  const config = registrations.find(entry => entry.options.name === 'plugins.bundle.config')
  assert.deepEqual(config.options.inject(), { namespace: 'dsh-semantic-drift' })
})

test('a face that is not the settings domain registers no page', () => {
  const registrations = mountClient({ ctxInject: ctxInject({ get: () => ({}) }) })
  assert.deepEqual(registrations.map(entry => entry.options.name), ['sidebar.panellist', 'main'])
})

test('a shell without the bundle-config seat still gets the panel', () => {
  const registrations = mountClient({
    slotsInject(key, callback) {
      // A shell that never declares the seat is what a downgraded DSH looks like.
      if (key === 'plugins.bundle.config') throw new Error('unknown slot')
      return callback()
    },
    ctxInject: ctxInject(servedFace(new Set(['semantic-drift']))),
  })
  assert.deepEqual(registrations.map(entry => entry.options.name), ['sidebar.panellist', 'main'])
})

test('the panel renders its shell, index and empty state', () => {
  const registrations = mountClient()
  const panel = registrations.find(entry => entry.options.name === 'main')
  const html = renderToStaticMarkup(createElement(panel.component, {}))
  assert.match(html, /sd-root/)
  assert.match(html, /sd-header/)
  assert.match(html, /语义漂移词表/)
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

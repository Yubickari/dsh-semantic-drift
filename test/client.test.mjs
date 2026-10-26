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
 * The bundle under review is built from `src/` with the same wrapper the Web shell
 * uses — not read from the committed `lib/` artifact, which is only rewritten at
 * release time. It stubs the module loader the shell provides, checks the exported
 * `{ inject, apply }` shape, drives the slot registrations, and renders the
 * registered panel through react-dom/server. It cannot prove what the user sees,
 * but it does prove the shipped bundle loads, registers every seat, and renders
 * without throwing.
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
await writeFile(bundleFile, `window.__ModuleLoader__.load({
  id: 'dsh-semantic-drift',
  factory: (require) => {
    var module = { exports: {} };
    ${bundled.outputFiles[0].text.trim()}
    return module.exports;
  },
});
`, 'utf8')
await import(bundleFile)

function mountClient(options = {}) {
  assert.ok(loaded !== undefined, 'the bundle must register itself with window.__ModuleLoader__')
  const registrations = []
  const ctx = {
    slots: {
      inject(key, callback) {
        assert.equal(typeof key, 'string')
        if (options.inject !== undefined) return options.inject(key, callback)
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

test('the browser bundle registers a sidebar row, a main panel and a settings page', () => {
  assert.equal(loaded.id, 'dsh-semantic-drift')
  assert.deepEqual(loaded.exports.inject, ['slots'])
  const registrations = mountClient()
  assert.equal(registrations.length, 3)
  const row = registrations.find(entry => entry.options.name === 'sidebar.panellist')
  const panel = registrations.find(entry => entry.options.name === 'main')
  const config = registrations.find(entry => entry.options.name === 'plugins.row.config')
  assert.ok(row !== undefined, 'a sidebar row must be registered')
  assert.ok(panel !== undefined, 'a main panel must be registered')
  assert.ok(config !== undefined, 'the installed-plugin settings page must be registered')
  assert.equal(row.options.id, 'semantic-drift')
  assert.equal(panel.options.key, 'semantic-drift')
  assert.equal(config.options.key, 'dsh-semantic-drift#semantic-drift', 'the seat is keyed by package and row id')
  assert.equal(row.options.label(), '语义漂移词表')
  assert.equal(typeof row.component, 'function')
  assert.equal(typeof panel.component, 'function')
  assert.equal(typeof config.component, 'function')
})

test('a shell without the row-settings seat still gets the panel', () => {
  const registrations = mountClient({
    inject(key, callback) {
      // A shell that never declares the seat is what a downgraded DSH looks like.
      if (key === 'plugins.row.config') throw new Error('unknown slot')
      return callback()
    },
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

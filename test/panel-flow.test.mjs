import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

/**
 * The panel's real interaction: open the new-concept form, type a duplicate
 * canonical symbol, press save, and require the refusal to become visible.
 *
 * This is the flow a user reported as "clicking save does nothing". A server
 * test cannot see it and a static render cannot see it either, so this runs the
 * shipped browser bundle inside jsdom with `fetch` replaced by the exact 400 the
 * host returns.
 */

const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:65000/',
  pretendToBeVisual: true,
})
const { window } = dom
for (const key of [
  'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'Node', 'getComputedStyle',
  // The bundle reads `globalThis.localStorage` / `globalThis.sessionStorage`
  // (the browser realm has no separate global object), so the harness exposes
  // jsdom's stores instead of whatever Node happens to provide.
  'localStorage',
  'sessionStorage',
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true })
}
Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
window.__ModuleLoader__ = { load({ factory }) { this.exports = factory(createRequire(import.meta.url)) } }

// Bundled from `src/` rather than loaded from the committed `lib/` artifact:
// this file asserts the panel source under review, and `lib/` is only rewritten
// at release time. The wrapper mirrors `scripts/build.mjs`, so the panel runs
// through the same loader the Web shell uses.
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
const clientBundle = join(outdir, 'panel-client.js')
await writeFile(clientBundle, `window.__ModuleLoader__.load({
  id: 'dsh-semantic-drift',
  factory: (require) => {
    var module = { exports: {} };
    ${bundled.outputFiles[0].text.trim()}
    return module.exports;
  },
});
`, 'utf8')
await import(clientBundle)
const clientModule = window.__ModuleLoader__.exports

const CONCEPT = {
  id: 'device.module_name',
  terms: ['设备模块名称'],
  kind: 'entity',
  canonical: { symbol: 'ModuleName', type: 'string' },
  note: '用于指示设备的模块名称',
}

const STATE = {
  ok: true,
  workspace: { path: '/tmp/sample-app', title: 'SampleApp', resolvedFrom: 'request' },
  workspaces: [{ id: 'w1', title: 'SampleApp', path: '/tmp/sample-app' }],
  vocabulary: {
    file: '/tmp/sample-app/.dsh/semantics.yaml',
    relativeFile: '.dsh/semantics.yaml',
    exists: true,
    text: 'version: 1\n',
    document: { version: 1, meta: { project: 'SampleApp' }, exclude: ['**/node_modules/**'], concepts: [CONCEPT] },
    issues: [],
    valid: true,
    mtimeMs: 1,
  },
  citationStyle: 'file+symbol',
  minConfidence: 'medium',
  version: '0.1.0',
  effective: {
    vocabularyPath: '.dsh/semantics.yaml',
    announceToAgent: true,
    citationStyle: 'file+symbol',
    minConfidence: 'medium',
    timeoutMs: 30000,
    maxFindings: 5000,
    maxFileBytes: 1048576,
    maxFiles: 50000,
    detectors: ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'],
  },
}

const DUPLICATE = {
  ok: false,
  code: 'invalid-vocabulary',
  message: 'The vocabulary was not written because it failed validation.',
  issues: [{
    code: 'symbol-duplicate',
    message: 'Canonical symbol `ModuleName` is already used by `concepts[0]`; one symbol can name only one concept.',
    severity: 'error',
    path: 'concepts[1].canonical.symbol',
    line: 11,
  }],
}

const calls = []
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body })
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
  if (String(url).includes('/state')) return json(STATE)
  if (String(url).includes('/scan')) return json({ ok: true, workspace: { path: '/tmp/sample-app' }, summary: { findings: [], counts: {}, filesScanned: 0, filesSkipped: 0, bytesScanned: 0, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp/sample-app', startedAt: 0 }, vocabularyIssues: [] })
  if (String(url).includes('/save')) return json(DUPLICATE, 400)
  return json({ ok: false, code: 'unexpected', message: 'not stubbed' }, 500)
}

const { createRoot } = await import('react-dom/client')
const { createElement, act } = await import('react')
const { act: reactAct } = await import('react-dom/test-utils')

async function flush(times = 6) {
  for (let i = 0; i < times; i++) {
    await reactAct(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  }
}

/** Preload the panel's scan cache; every mount starts from an empty one. */
function mountPanel(props = {}, options = {}) {
  window.sessionStorage.removeItem('dsh-semantic-drift:scan-cache')
  if (options.cache !== undefined) {
    window.sessionStorage.setItem('dsh-semantic-drift:scan-cache', JSON.stringify(options.cache))
  }
  const registrations = []
  clientModule.apply({
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, component) => { registrations.push({ options, component }); return () => undefined },
    },
    effect: callback => { callback(); return () => undefined },
  })
  const panel = registrations.find(entry => entry.options.name === 'main')
  const container = window.document.getElementById('root')
  container.innerHTML = ''
  const root = createRoot(container)
  reactAct(() => { root.render(createElement(panel.component, props)) })
  return {
    container,
    root,
    rerender(next) {
      reactAct(() => { root.render(createElement(panel.component, next)) })
    },
  }
}

function resetPrefs(value = null) {
  if (value === null) window.localStorage.removeItem('dsh-semantic-drift:prefs')
  else window.localStorage.setItem('dsh-semantic-drift:prefs', JSON.stringify(value))
  window.localStorage.removeItem('dsh-semantic-drift:view')
}

/** Find a control by its accessible label; the toolbar is icon-only. */
function byLabel(container, label) {
  const element = container.querySelector(`[aria-label="${label}"]`)
  assert.ok(element !== null, `missing control: ${label}`)
  return element
}

async function scanNow(container) {
  const button = [...container.querySelectorAll('button')].find(entry => entry.textContent?.includes('重新扫描'))
  assert.ok(button !== undefined, 'the scan button must exist')
  click(button)
  await flush(8)
}

function openSettings(container) {
  const gear = [...container.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === '设置')
  assert.ok(gear !== undefined, 'the settings entry must exist in the header')
  click(gear)
}

function click(element) {
  reactAct(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
}

function type(selector, value) {
  const input = window.document.querySelector(selector)
  assert.ok(input !== null, `missing input ${selector}`)
  const prototype = input.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : input.tagName === 'SELECT'
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  reactAct(() => {
    setter?.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    input.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}

test('a duplicate canonical symbol shows up as a visible refusal', async () => {
  const { container, root } = mountPanel()
  await flush()
  assert.match(container.textContent ?? '', /ModuleName/, 'the loaded concept must be on screen')

  const newButton = byLabel(container, '新建概念')
  click(newButton)
  await flush()

  type('#sd-id', 'device.module_name')
  type('#sd-terms', '模块名称')
  type('#sd-symbol', 'ModuleName')

  const saveButton = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '保存')
  assert.ok(saveButton !== undefined, 'the save button must exist')
  click(saveButton)
  await flush(10)

  const saveCall = calls.find(call => call.method === 'POST' && call.url.includes('/save'))
  assert.ok(saveCall !== undefined, 'pressing save must send the document')
  const text = container.textContent ?? ''
  assert.match(text, /规范符号重复/, `the localized headline must be visible; got: ${text.slice(0, 400)}`)
  assert.match(text, /already used by/, 'the host sentence must be visible')
  assert.match(text, /2 处问题|1 处问题/, 'the notice must count the issues')

  reactAct(() => root.unmount())
})

test('a failed load says so at the bottom and offers a retry', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, code: 'unreachable', message: 'boom' }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  })
  try {
    const { container, root } = mountPanel()
    await flush(8)
    const text = container.textContent ?? ''
    assert.match(text, /加载失败/, `the load failure must be visible; got: ${text.slice(0, 300)}`)
    assert.match(text, /重试/, 'a retry control must be offered')
    const dock = container.querySelector('.sd-notice-dock')
    assert.ok(dock !== null, 'the notice must render in the bottom dock')
    const detail = container.querySelector('.sd-detail')
    assert.ok(detail !== null)
    // The detail pane repeats the failure as its empty state text, so the
    // structural check is about the notice element, not the words.
    assert.equal(detail.querySelector('.sd-notice'), null, 'the notice must not sit inside the scrolling detail pane')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
  }
})

test('a successful save dismisses the form and reports at the bottom', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/state')) {
      return new Response(JSON.stringify(STATE), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (String(url).includes('/save')) {
      return new Response(JSON.stringify({ ok: true, vocabulary: STATE.vocabulary }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ ok: true, workspace: { path: '/tmp/sample-app' }, summary: { findings: [], counts: {}, filesScanned: 0, filesSkipped: 0, bytesScanned: 0, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp', startedAt: 0 }, vocabularyIssues: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const { container, root } = mountPanel()
    await flush()
    const newButton = byLabel(container, '新建概念')
    click(newButton)
    await flush()
    type('#sd-id', 'device.new_thing')
    type('#sd-terms', '新东西')
    type('#sd-symbol', 'NewThing')
    const saveButton = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '保存')
    click(saveButton)
    await flush(8)
    const text = container.textContent ?? ''
    assert.match(text, /已保存/)
    assert.equal(container.querySelector('.sd-notice-dock') !== null, true)
    assert.equal(container.querySelector('#sd-id'), null, 'the form closes after a successful save')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
  }
})

test('accepting an unclassified finding asks which concept and then calls the host', async () => {
  const realFetch = globalThis.fetch
  const finding = {
    id: 'duplicate-type:a/b.cs:ModuleName:3',
    detector: 'duplicate-type',
    confidence: 'high',
    path: 'a/b.cs',
    line: 3,
    symbol: 'ModuleName',
    message: 'example',
    citation: 'a/b.cs::ModuleName',
    detail: { primaryPath: 'a/c.cs', primaryLine: 7, members: ['A', 'B'] },
  }
  const accepted = []
  globalThis.fetch = async (url, init = {}) => {
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (String(url).includes('/state')) return json(STATE)
    if (String(url).includes('/scan')) {
      return json({ ok: true, workspace: { path: '/tmp/sample-app' }, summary: { findings: [finding], counts: { 'duplicate-type': 1 }, filesScanned: 1, filesSkipped: 0, bytesScanned: 10, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp/sample-app', startedAt: 0 }, vocabularyIssues: [] })
    }
    if (String(url).includes('/accept')) {
      accepted.push(JSON.parse(String(init.body ?? '{}')))
      return json({ ok: true, vocabulary: STATE.vocabulary })
    }
    return json({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    await scanNow(container)
    const unclassified = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('未归类'))
    assert.ok(unclassified !== undefined, 'the unclassified row must exist')
    click(unclassified)
    await flush()

    const acceptButton = container.querySelector('[aria-label="接受"]')
    assert.ok(acceptButton !== null, 'the finding must offer accept')
    click(acceptButton)
    await flush()

    const select = container.querySelector('select')
    assert.ok(select !== null, 'an unclassified finding must ask for its concept')
    assert.match(container.textContent ?? '', /接受后归到哪个概念/)

    type('select', 'device.module_name')
    type('#sd-accept-reason', '该写法由外部协议决定')
    const confirm = [...container.querySelectorAll('button')].find(button => button.textContent?.startsWith('接受（'))
    assert.ok(confirm !== undefined, 'the dialog must offer a confirm button')
    click(confirm)
    await flush(8)

    assert.equal(accepted.length, 1, 'the accept request must be sent')
    assert.equal(accepted[0].conceptId, 'device.module_name')
    assert.equal(accepted[0].symbol, 'ModuleName')
    assert.equal(accepted[0].path, 'a/b.cs')
    assert.match(accepted[0].reason, /外部协议/)
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
  }
})

test('the auto switch follows the session workspace and pins when switched off', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const requested = []
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => {
    const href = String(url)
    if (href.includes('/state')) {
      const workspace = new URL(href, 'http://placeholder/').searchParams.get('workspace') ?? '/tmp/default'
      requested.push(workspace)
      return json({
        ...STATE,
        workspace: { path: workspace, title: workspace.split('/').at(-1), resolvedFrom: 'request' },
      })
    }
    if (href.includes('/scan')) {
      return json({
        ok: true,
        workspace: { path: '/tmp' },
        summary: { findings: [], counts: {}, filesScanned: 0, filesSkipped: 0, bytesScanned: 0, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp', startedAt: 0 },
        vocabularyIssues: [],
      })
    }
    return json({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    let cwd = '/tmp/ws-a'
    const props = () => ({ useSessions: selector => selector({ current: 's1', byId: { s1: { cwd } } }) })
    const { container, root, rerender } = mountPanel(props())
    await flush(8)
    assert.ok(requested.includes('/tmp/ws-a'), `auto must open the session workspace; got ${requested.join(',')}`)

    cwd = '/tmp/ws-b'
    rerender(props())
    await flush(8)
    assert.ok(requested.includes('/tmp/ws-b'), 'auto must follow the session when it moves')

    openSettings(container)
    await flush(2)
    const toggle = container.querySelector('[role="switch"]')
    assert.ok(toggle !== null, 'the auto switch must exist in settings')
    assert.equal(toggle.getAttribute('aria-checked'), 'true')
    click(toggle)
    await flush(4)
    assert.equal(container.querySelector('[role="switch"]')?.getAttribute('aria-checked'), 'false')
    // Every settings edit already applied; closing is the title bar's ×.
    const close = container.querySelector('.sd-settings [aria-label="关闭"]')
    assert.ok(close !== null, 'the dialog needs a close control')
    click(close)
    await flush(2)

    cwd = '/tmp/ws-c'
    rerender(props())
    await flush(8)
    assert.equal(requested.includes('/tmp/ws-c'), false, 'a pinned panel must not follow the session')
    assert.ok(requested.at(-1)?.startsWith('/tmp/ws-b'), `the pinned workspace stays on screen; last was ${requested.at(-1)}`)
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
  }
})

test('deleting a concept asks first, then saves the document without it', async () => {
  const realFetch = globalThis.fetch
  const saves = []
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    if (href.includes('/scan')) {
      return json({
        ok: true,
        workspace: { path: '/tmp/sample-app' },
        summary: { findings: [], counts: {}, filesScanned: 0, filesSkipped: 0, bytesScanned: 0, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp', startedAt: 0 },
        vocabularyIssues: [],
      })
    }
    if (href.includes('/save')) {
      saves.push(JSON.parse(String(init.body ?? '{}')))
      return json({ ok: true, vocabulary: { ...STATE.vocabulary, document: { ...STATE.vocabulary.document, concepts: [] } } })
    }
    return json({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    const item = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('device.module_name') === false && button.textContent?.includes('module_name'))
    assert.ok(item !== undefined, 'the concept must be listed in the tree')
    click(item)
    await flush()

    const remove = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '删除')
    assert.ok(remove !== undefined, 'the concept must offer delete')
    click(remove)
    await flush()
    assert.match(container.textContent ?? '', /删除这个概念/, 'delete must confirm first')
    assert.equal(saves.length, 0, 'nothing is written before confirmation')

    const confirm = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('删除概念'))
    assert.ok(confirm !== undefined, 'the dialog must offer a confirm button')
    click(confirm)
    await flush(8)
    assert.equal(saves.length, 1, 'confirming must save the document')
    assert.equal(saves[0].document.concepts.length, 0, 'the deleted concept must be gone')
    assert.match(container.textContent ?? '', /已保存/)
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
  }
})

test('accepting one site can mute the whole file-name family', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const findings = ['Alpha', 'Beta', 'Gamma'].map((unit, index) => ({
    id: `duplicate-type:${unit}/Enums.cs:Thing:${index + 1}`,
    detector: 'duplicate-type',
    confidence: 'high',
    path: `${unit}/Enums.cs`,
    line: index + 1,
    symbol: 'Thing',
    message: 'example',
    citation: `${unit}/Enums.cs::Thing`,
    detail: { rule: 'derived-copy', base: 'Base', members: ['A', 'B'] },
  }))
  const accepted = []
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    if (href.includes('/scan')) {
      return json({ ok: true, workspace: { path: '/tmp/sample-app' }, summary: { findings, counts: { 'duplicate-type': 3 }, filesScanned: 3, filesSkipped: 0, bytesScanned: 10, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp', startedAt: 0 }, vocabularyIssues: [] })
    }
    if (href.includes('/accept')) {
      accepted.push(JSON.parse(String(init.body ?? '{}')))
      return json({ ok: true, vocabulary: STATE.vocabulary })
    }
    return json({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    await scanNow(container)
    const unclassified = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('未归类'))
    click(unclassified)
    await flush()
    click(container.querySelector('[aria-label="接受"]'))
    await flush(2)

    const radios = [...container.querySelectorAll('input[type="radio"]')]
    assert.equal(radios.length, 4, 'four scopes: file, file-name family, symbol, custom')
    assert.equal(radios[1].checked, true, 'the family scope is the default when it covers more')
    const counts = [...container.querySelectorAll('.sd-scope-count')].map(node => node.textContent)
    // The custom scope starts pre-filled with the family glob, so it covers the
    // same three sites until the user edits it.
    assert.deepEqual(counts, ['1', '3', '3', '3'], `scope counts: ${counts.join(',')}`)
    assert.match(container.textContent ?? '', /将静音 3 条发现/)

    type('#sd-accept-reason', '每程序集一份')
    const confirm = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('静音 3'))
    assert.ok(confirm !== undefined, 'the confirm button must show how many will be muted')
    click(confirm)
    await flush(8)

    assert.equal(accepted.length, 1)
    assert.equal(accepted[0].path, '**/Enums.cs', 'the family scope is a file-name glob')
    assert.equal(accepted[0].symbol, 'Thing')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('a success notice closes itself after the configured seconds', async () => {
  resetPrefs({ auto: true, notificationSeconds: 0.05, showLow: false })
  const realFetch = globalThis.fetch
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    if (href.includes('/save')) return json({ ok: true, vocabulary: STATE.vocabulary })
    return json({ ok: true, workspace: { path: '/tmp/sample-app' }, summary: { findings: [], counts: {}, filesScanned: 0, filesSkipped: 0, bytesScanned: 0, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp', startedAt: 0 }, vocabularyIssues: [] })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    const newButton = byLabel(container, '新建概念')
    click(newButton)
    await flush()
    type('#sd-id', 'device.auto_close')
    type('#sd-terms', '自动关闭')
    type('#sd-symbol', 'AutoClose')
    const save = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '保存')
    click(save)
    await flush(3)
    assert.match(container.textContent ?? '', /已保存/)
    await new Promise(resolve => setTimeout(resolve, 200))
    await flush(2)
    assert.doesNotMatch(container.textContent ?? '', /已保存/, 'the success notice must close itself')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('an accepted exception can be narrowed, removed and undone', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const state = {
    ...STATE,
    vocabulary: {
      ...STATE.vocabulary,
      document: {
        ...STATE.vocabulary.document,
        concepts: [{
          ...STATE.vocabulary.document.concepts[0],
          accepted: [{ symbol: 'ModuleName', path: '**', reason: 'old reason' }],
        }],
      },
    },
  }
  const finding = {
    id: 'duplicate-type:a/b.cs:ModuleName:3',
    detector: 'duplicate-type',
    confidence: 'high',
    path: 'Alpha/Common/SampleProvider.cs',
    line: 3,
    symbol: 'ModuleName',
    message: 'example',
    citation: 'a/b.cs::ModuleName',
    detail: { rule: 'derived-copy', members: ['A', 'B'] },
  }
  const calls = []
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/state')) return json(state)
    if (href.includes('/scan')) {
      return json({ ok: true, workspace: { path: '/tmp/sample-app' }, summary: { findings: [finding], counts: { 'duplicate-type': 1 }, filesScanned: 1, filesSkipped: 0, bytesScanned: 10, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp', startedAt: 0 }, vocabularyIssues: [] })
    }
    if (href.includes('/accept')) {
      const body = JSON.parse(String(init.body ?? '{}'))
      calls.push(body)
      return json({ ok: true, changed: body.op ?? 'added', vocabulary: state.vocabulary, concept: state.vocabulary.document.concepts[0] })
    }
    return json({ ok: true, vocabulary: state.vocabulary })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    const item = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('module_name'))
    assert.ok(item !== undefined, 'the concept must be in the tree')
    click(item)
    await flush(2)

    const edit = container.querySelector('[aria-label^="编辑 ModuleName"]')
    assert.ok(edit !== null, 'the exception row must offer edit')
    click(edit)
    await flush(2)
    assert.match(container.textContent ?? '', /编辑例外/)
    assert.match(container.textContent ?? '', /符号是观察到的写法/)

    // Narrow the glob through the custom scope.
    const customRadio = [...container.querySelectorAll('.sd-scope-option input[type="radio"]')].at(-1)
    assert.ok(customRadio !== undefined)
    click(customRadio)
    await flush(1)
    assert.ok(container.querySelector('#sd-scope-custom') !== null, 'the custom scope needs a glob field')
    type('#sd-scope-custom', '**/Common/**')
    type('#sd-exception-reason', 'only the Common copies')
    const save = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '保存')
    click(save)
    await flush(8)
    const update = calls.find(call => call.op === 'update')
    assert.ok(update !== undefined, `an update call must be sent; got ${JSON.stringify(calls)}`)
    assert.equal(update.previousPath, '**')
    assert.equal(update.path, '**/Common/**')
    assert.equal(update.reason, 'only the Common copies')
    assert.match(container.textContent ?? '', /例外已更新/)

    // Remove it, then undo from the notice.
    const remove = container.querySelector('[aria-label^="移除 ModuleName"]')
    assert.ok(remove !== null)
    click(remove)
    await flush(2)
    assert.match(container.textContent ?? '', /移除这条例外/)
    const confirm = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '移除')
    click(confirm)
    await flush(8)
    assert.ok(calls.some(call => call.op === 'remove'), 'the removal must be sent')
    assert.match(container.textContent ?? '', /重新出现/)

    const undo = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '撤销')
    assert.ok(undo !== undefined, 'the notice must offer undo')
    click(undo)
    await flush(8)
    const restore = calls.filter(call => (call.op ?? 'add') === 'add').at(-1)
    assert.equal(restore?.symbol, 'ModuleName')
    assert.equal(restore?.path, '**')
    assert.equal(restore?.reason, 'old reason')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('a concept shows how many findings its exception mutes, even after the rescan', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const finding = {
    id: 'duplicate-type:a/Common/Provider.cs:ModuleName:3',
    detector: 'duplicate-type',
    confidence: 'high',
    path: 'Alpha/Common/Provider.cs',
    line: 3,
    symbol: 'ModuleName',
    message: 'example',
    citation: 'a/Common/Provider.cs::ModuleName',
    detail: { rule: 'derived-copy', members: ['A', 'B'] },
  }
  const state = {
    ...STATE,
    vocabulary: {
      ...STATE.vocabulary,
      document: {
        ...STATE.vocabulary.document,
        concepts: [{
          ...STATE.vocabulary.document.concepts[0],
          accepted: [{ symbol: 'ModuleName', path: '**/Common/**', reason: 'every module has one' }],
        }],
      },
    },
  }
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => {
    const href = String(url)
    if (href.includes('/state')) return json(state)
    if (href.includes('/scan')) {
      // After acceptance the scan withholds the finding and says who muted it.
      return json({
        ok: true,
        workspace: { path: '/tmp/sample-app' },
        summary: {
          findings: [],
          counts: {},
          filesScanned: 1,
          filesSkipped: 0,
          bytesScanned: 10,
          durationMs: 1,
          truncated: false,
          skippedTypes: 0,
          root: '/tmp',
          startedAt: 0,
          mutedFindings: [finding],
          mutedByAccepted: [{ conceptId: 'device.module_name', index: 0, count: 1 }],
        },
        vocabularyIssues: [],
      })
    }
    return json({ ok: true, vocabulary: state.vocabulary })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    await scanNow(container)
    const item = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('module_name'))
    click(item)
    await flush(2)
    const text = container.textContent ?? ''
    assert.match(text, /当前静音 1 条/, `the row must report the muted count; got: ${text.slice(-300)}`)
    assert.doesNotMatch(text, /当前没有静音任何发现/)
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('opening the panel never scans, and the child switch controls rescan-on-follow', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const scans = []
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/state')) {
      const workspace = new URL(href, 'http://placeholder/').searchParams.get('workspace') ?? '/tmp/default'
      return json({ ...STATE, workspace: { path: workspace, title: workspace.split('/').at(-1), resolvedFrom: 'request' } })
    }
    if (href.includes('/scan')) {
      scans.push(JSON.parse(String(init.body ?? '{}')).workspace)
      return json({
        ok: true,
        workspace: { path: '/tmp' },
        summary: { findings: [], counts: {}, filesScanned: 0, filesSkipped: 0, bytesScanned: 0, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp', startedAt: 0 },
        vocabularyIssues: [],
      })
    }
    return json({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    let cwd = '/tmp/ws-a'
    const props = () => ({ useSessions: selector => selector({ current: 's1', byId: { s1: { cwd } } }) })
    const { container, root, rerender } = mountPanel(props())
    await flush(8)
    assert.equal(scans.length, 0, 'opening the panel must not scan')
    assert.match(container.textContent ?? '', /尚未扫描/, 'the panel must say nothing has been scanned')

    cwd = '/tmp/ws-b'
    rerender(props())
    await flush(8)
    assert.match(container.textContent ?? '', /ws-b/, 'following still switches the workspace')
    assert.equal(scans.length, 0, 'following alone must not scan')

    openSettings(container)
    await flush(2)
    const switches = [...container.querySelectorAll('[role="switch"]')]
    assert.equal(switches.length, 4, 'follow, rescan, low-confidence and prompt injection')
    const rescanSwitch = switches[1]
    assert.equal(rescanSwitch.getAttribute('aria-checked'), 'false', 'rescan-on-follow is off by default')
    click(rescanSwitch)
    await flush(2)
    assert.equal(container.querySelectorAll('[role="switch"]')[1].getAttribute('aria-checked'), 'true')
    click(container.querySelector('.sd-settings [aria-label="关闭"]'))
    await flush(2)

    cwd = '/tmp/ws-c'
    rerender(props())
    await flush(8)
    assert.deepEqual(scans, ['/tmp/ws-c'], 'with the child switch on, a follow switch rescans once')

    // Turning following off must disable its child switch.
    openSettings(container)
    await flush(2)
    const autoSwitch = container.querySelectorAll('[role="switch"]')[0]
    click(autoSwitch)
    await flush(2)
    const childAfter = container.querySelectorAll('[role="switch"]')[1]
    assert.equal(childAfter.getAttribute('aria-checked'), 'false')
    assert.equal(childAfter.hasAttribute('disabled'), true, 'the child switch is not available without following')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

/** A scan response shaped like the host's, for cache fixtures. */
function scanResponse(findings = []) {
  return {
    ok: true,
    workspace: { path: '/tmp/sample-app' },
    summary: {
      root: '/tmp/sample-app',
      startedAt: 0,
      durationMs: 12,
      filesScanned: 9,
      filesSkipped: 0,
      bytesScanned: 100,
      truncated: false,
      findings,
      counts: {},
      skippedTypes: 0,
    },
    vocabularyIssues: [],
  }
}

const CACHED_FINDING = {
  id: 'duplicate-type:a/Common/Provider.cs:ModuleName:3',
  detector: 'duplicate-type',
  confidence: 'high',
  path: 'Alpha/Common/Provider.cs',
  line: 3,
  symbol: 'ModuleName',
  message: 'example',
  citation: 'a/Common/Provider.cs::ModuleName',
  detail: { rule: 'derived-copy', members: ['A', 'B'] },
}

test('a remembered report is shown on entry without scanning', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  let scans = 0
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    if (href.includes('/scan')) { scans++; return json(scanResponse()) }
    return json({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel({}, {
      cache: [{ workspace: '/tmp/sample-app', at: Date.now() - 60_000, mtimeMs: 1, response: scanResponse([CACHED_FINDING]) }],
    })
    await flush(8)
    const text = container.textContent ?? ''
    assert.equal(scans, 0, 'a restored report must not trigger a scan')
    assert.match(text, /扫描于 1 分钟前/, `the footer must date the report; got: ${text.slice(-260)}`)
    assert.doesNotMatch(text, /尚未扫描/)
    const unclassified = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('未归类'))
    assert.ok(unclassified !== undefined)
    click(unclassified)
    await flush(2)
    assert.match(container.textContent ?? '', /ModuleName/, 'the remembered findings must be listed')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('an expired report is shown but labelled, still without scanning', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  let scans = 0
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    if (href.includes('/scan')) { scans++; return json(scanResponse()) }
    return json({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel({}, {
      cache: [{ workspace: '/tmp/sample-app', at: Date.now() - 20 * 60_000, mtimeMs: 1, response: scanResponse([CACHED_FINDING]) }],
    })
    await flush(8)
    const text = container.textContent ?? ''
    assert.equal(scans, 0)
    assert.match(text, /结果已过期/, 'an old report must say so')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('a changed vocabulary file is flagged on a restored report', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    return json(scanResponse())
  }
  try {
    const { container, root } = mountPanel({}, {
      // STATE.vocabulary.mtimeMs is 1, so a different recorded mtime means "changed".
      cache: [{ workspace: '/tmp/sample-app', at: Date.now(), mtimeMs: 999, response: scanResponse([CACHED_FINDING]) }],
    })
    await flush(8)
    assert.match(container.textContent ?? '', /词表已更新/, 'the report must say the vocabulary moved on')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('retention 0 disables the memory entirely', async () => {
  resetPrefs({ auto: true, autoScan: false, notificationSeconds: 3, showLow: false, scanRetentionMinutes: 0 })
  const realFetch = globalThis.fetch
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    return json(scanResponse())
  }
  try {
    const { container, root } = mountPanel({}, {
      cache: [{ workspace: '/tmp/sample-app', at: Date.now(), mtimeMs: 1, response: scanResponse([CACHED_FINDING]) }],
    })
    await flush(8)
    assert.match(container.textContent ?? '', /尚未扫描/, 'with retention 0 the panel must ask for a scan')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('the panel returns to the page it was left on', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    return json(scanResponse())
  }
  try {
    const first = mountPanel()
    await flush(8)
    const item = [...first.container.querySelectorAll('button')].find(button => button.textContent?.includes('module_name'))
    assert.ok(item !== undefined)
    click(item)
    await flush(2)
    assert.ok(first.container.querySelector('.sd-concept-id') !== null, 'the concept page must be open')
    reactAct(() => first.root.unmount())

    // A second mount is exactly what selecting another panel and coming back does.
    const second = mountPanel()
    await flush(8)
    const detail = second.container.querySelector('.sd-concept-id')
    assert.ok(detail !== null, 'the panel must reopen on the same concept page')
    assert.equal(detail.textContent, 'device.module_name')
    reactAct(() => second.root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('the toolbar is icon-only and describes each action for hover and screen readers', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => json(STATE)
  try {
    const { container, root } = mountPanel()
    await flush(6)
    const actions = [...container.querySelectorAll('.sd-actions button')]
    assert.equal(actions.length, 4, 'scan, new concept, YAML and settings')
    for (const button of actions) {
      assert.equal((button.textContent ?? '').trim(), '', `button must be icon-only: ${button.outerHTML.slice(0, 80)}`)
      const label = button.getAttribute('aria-label')
      assert.ok(label !== null && label !== '', 'every icon button needs an accessible label')
      assert.equal(button.getAttribute('data-tip'), label, 'the styled hover text matches the accessible label')
      assert.equal(button.hasAttribute('title'), false, 'no native title tooltip behind the styled one')
    }
    assert.deepEqual(
      actions.map(button => button.getAttribute('aria-label')),
      ['重新扫描', '新建概念', 'YAML', '设置'],
    )
    for (const button of actions) {
      assert.equal(button.classList.contains('sd-button'), true)
      assert.equal(button.classList.contains('sd-button-ghost'), false, 'no borderless outlier in the toolbar')
    }
    const mode = container.querySelector('.sd-mode-button')
    assert.ok(mode !== null)
    assert.equal(mode.classList.contains('sd-button-ghost'), false, 'the mode button matches the toolbar')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('the workspace mode is an icon that says which mode it is in', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async url => json(STATE)
  try {
    const { container, root } = mountPanel()
    await flush(6)
    const mode = container.querySelector('.sd-mode-button')
    assert.ok(mode !== null, 'the mode button must exist')
    assert.equal((mode.textContent ?? '').trim(), '', 'it must be icon-only')
    assert.equal(mode.getAttribute('data-mode'), 'following')
    assert.match(mode.getAttribute('aria-label') ?? '', /跟随当前工作区/)
    assert.equal(mode.getAttribute('aria-pressed'), 'false')

    click(mode)
    await flush(2)
    const pinned = container.querySelector('.sd-mode-button')
    assert.equal(pinned?.getAttribute('data-mode'), 'pinned')
    assert.match(pinned?.getAttribute('aria-label') ?? '', /已固定/)
    assert.equal(pinned?.getAttribute('data-tip'), pinned?.getAttribute('aria-label'))
    assert.equal(pinned?.getAttribute('aria-pressed'), 'true')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('the stale badge stays in the footer, is clickable and rescans', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  let scans = 0
  const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/state')) return json(STATE)
    if (href.includes('/scan')) { scans++; return json(scanResponse([CACHED_FINDING])) }
    return json({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel({}, {
      cache: [{ workspace: '/tmp/sample-app', at: Date.now() - 30 * 60_000, mtimeMs: 1, response: scanResponse([CACHED_FINDING]) }],
    })
    await flush(8)
    const footer = container.querySelector('.sd-footer')
    assert.ok(footer !== null)
    assert.equal(
      [...footer.querySelectorAll('button')].some(button => (button.textContent ?? '').includes('重新扫描')),
      false,
      'the footer must not repeat the toolbar scan button',
    )
    const badge = footer.querySelector('.sd-badge-warn')
    assert.ok(badge !== null, 'a stale report needs a visible badge')
    assert.equal(badge.getAttribute('role'), null)
    assert.equal(badge.tagName, 'BUTTON', 'the badge itself must be the rescan control')
    assert.match(badge.getAttribute('aria-label') ?? '', /点击重新扫描/)
    click(badge)
    await flush(8)
    assert.equal(scans, 1, 'clicking the badge must scan')
    assert.equal(container.querySelector('.sd-badge-warn'), null, 'a fresh report clears the badge')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

/** A switch inside the open settings dialog, by its accessible label. */
function settingSwitch(container, label) {
  const knob = container.querySelector(`.sd-settings [aria-label="${label}"]`)
  assert.ok(knob !== null, `missing settings switch: ${label}`)
  return knob
}

function jsonBody(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('one click on the injection switch flips it, writes once and settles on the echo', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  const writes = []
  let release
  const answered = new Promise(resolve => { release = resolve })
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/settings')) {
      const body = JSON.parse(String(init.body ?? '{}'))
      writes.push(body)
      await answered
      // The Host answers flat: the state plus what it actually wrote.
      return jsonBody({
        ...STATE,
        effective: { ...STATE.effective, announceToAgent: body.announceToAgent },
        applied: { announceToAgent: body.announceToAgent },
      })
    }
    if (href.includes('/state')) return jsonBody(STATE)
    return jsonBody({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    openSettings(container)
    await flush(2)
    assert.equal(settingSwitch(container, '注入 Agent 提示').getAttribute('aria-checked'), 'true')

    click(settingSwitch(container, '注入 Agent 提示'))
    // The switch answers the click; no second click and no save button.
    assert.equal(settingSwitch(container, '注入 Agent 提示').getAttribute('aria-checked'), 'false', 'one click must flip the switch')
    assert.equal(writes.length, 1, 'one click is one write')

    release()
    await flush(10)
    assert.equal(settingSwitch(container, '注入 Agent 提示').getAttribute('aria-checked'), 'false')
    assert.deepEqual(writes, [{ workspace: '/tmp/sample-app', announceToAgent: false }])
    const saved = (container.textContent ?? '').match(/插件设置已保存/g) ?? []
    assert.equal(saved.length, 1, 'the write is reported once')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('the injection switch follows the Host when the echo disagrees with the click', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/settings')) {
      // The write was accepted but the row kept its old value: the echo wins.
      return jsonBody({ ...STATE, effective: { ...STATE.effective, announceToAgent: true }, applied: { announceToAgent: true } })
    }
    if (href.includes('/state')) return jsonBody(STATE)
    return jsonBody({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    openSettings(container)
    await flush(2)
    click(settingSwitch(container, '注入 Agent 提示'))
    await flush(10)
    assert.equal(settingSwitch(container, '注入 Agent 提示').getAttribute('aria-checked'), 'true', 'the authoritative echo corrects the optimistic flip')
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('a refused injection write rolls the switch back and says so', async () => {
  resetPrefs()
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/settings')) {
      return jsonBody({ ok: false, code: 'config-readonly', message: 'The plugin row is read-only.' }, 409)
    }
    if (href.includes('/state')) return jsonBody(STATE)
    return jsonBody({ ok: true, vocabulary: STATE.vocabulary })
  }
  try {
    const { container, root } = mountPanel()
    await flush(8)
    openSettings(container)
    await flush(2)
    click(settingSwitch(container, '注入 Agent 提示'))
    await flush(10)
    assert.equal(settingSwitch(container, '注入 Agent 提示').getAttribute('aria-checked'), 'true', 'a failed write restores the old value')
    assert.match(container.textContent ?? '', /设置未能保存/)
    reactAct(() => root.unmount())
  } finally {
    globalThis.fetch = realFetch
    resetPrefs()
  }
})

test('the settings dialog groups its rows and drops the project and version blocks', async () => {
  resetPrefs()
  const { container, root } = mountPanel()
  await flush(8)
  openSettings(container)
  await flush(2)
  const dialog = container.querySelector('.sd-settings')
  assert.ok(dialog !== null, 'the settings dialog must be open')
  const text = dialog.textContent ?? ''

  const groups = [...dialog.querySelectorAll('.sd-settings-title')].map(node => node.textContent)
  assert.deepEqual(groups, ['工作区跟随', '扫描与缓存', '显示与通知', 'Agent 提示'], 'four groups, in order')
  const announceGroup = dialog.querySelector('[aria-label="注入 Agent 提示"]')?.closest('.sd-settings-section')
  assert.equal(announceGroup?.querySelector('.sd-settings-title')?.textContent, 'Agent 提示', 'the injection switch belongs to the agent group')

  assert.doesNotMatch(text, /插件版本/, 'the version belongs to the footer, not the dialog')
  assert.doesNotMatch(text, /0\.1\.0/, 'no version number inside the dialog')
  assert.match(container.querySelector('.sd-footer')?.textContent ?? '', /v0\.1\.0/, 'the footer keeps the version')

  assert.doesNotMatch(text, /词表路径/, 'the read-only project rows are gone')
  assert.doesNotMatch(text, /本项目/, 'the read-only project block is gone')
  assert.match(text, /已安装插件/, 'a pointer line replaces the project block')
  assert.match(text, /停用再启用/, 'and says the plugin has to be reloaded')

  const labels = [...dialog.querySelectorAll('button')].map(button => button.textContent?.trim() ?? '')
  assert.equal(labels.includes('完成'), false, 'edits apply immediately, so no done button')
  assert.equal(labels.includes('保存'), false, 'edits apply immediately, so no save button')

  const close = dialog.querySelector('[aria-label="关闭"]')
  assert.ok(close !== null, 'the title bar carries the close control')
  assert.equal(close.className.includes('sd-button-icon'), true)
  assert.ok(dialog.querySelector('.sd-settings-body') !== null, 'rows scroll inside their own body')

  click(close)
  await flush(2)
  assert.equal(container.querySelector('.sd-settings'), null, 'the close control dismisses the dialog')

  openSettings(container)
  await flush(2)
  click(container.querySelector('.sd-dialog-backdrop'))
  await flush(2)
  assert.equal(container.querySelector('.sd-settings'), null, 'the backdrop still dismisses the dialog')
  reactAct(() => root.unmount())
  resetPrefs()
})

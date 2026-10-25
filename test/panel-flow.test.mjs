import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createRequire } from 'node:module'
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
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true })
}
Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
window.__ModuleLoader__ = { load({ factory }) { this.exports = factory(createRequire(import.meta.url)) } }
await import('../lib/client.js')
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
  workspace: { path: '/tmp/yne20', title: 'YNE20', resolvedFrom: 'request' },
  workspaces: [{ id: 'w1', title: 'YNE20', path: '/tmp/yne20' }],
  vocabulary: {
    file: '/tmp/yne20/.dsh/semantics.yaml',
    relativeFile: '.dsh/semantics.yaml',
    exists: true,
    text: 'version: 1\n',
    document: { version: 1, meta: { project: 'YNE20' }, exclude: ['**/node_modules/**'], concepts: [CONCEPT] },
    issues: [],
    valid: true,
    mtimeMs: 1,
  },
  citationStyle: 'file+symbol',
  minConfidence: 'medium',
  version: '0.1.0',
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
  if (String(url).includes('/scan')) return json({ ok: true, workspace: { path: '/tmp/yne20' }, summary: { findings: [], counts: {}, filesScanned: 0, filesSkipped: 0, bytesScanned: 0, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp/yne20', startedAt: 0 }, vocabularyIssues: [] })
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

function mountPanel(props = {}) {
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

  const newButton = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('新建概念'))
  assert.ok(newButton !== undefined, 'the new-concept button must exist')
  click(newButton)
  await flush()

  type('#sd-id', 'archit.module_name')
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
    return new Response(JSON.stringify({ ok: true, workspace: { path: '/tmp/yne20' }, summary: { findings: [], counts: {}, filesScanned: 0, filesSkipped: 0, bytesScanned: 0, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp', startedAt: 0 }, vocabularyIssues: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const { container, root } = mountPanel()
    await flush()
    const newButton = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('新建概念'))
    click(newButton)
    await flush()
    type('#sd-id', 'archit.new_thing')
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
      return json({ ok: true, workspace: { path: '/tmp/yne20' }, summary: { findings: [finding], counts: { 'duplicate-type': 1 }, filesScanned: 1, filesSkipped: 0, bytesScanned: 10, durationMs: 1, truncated: false, skippedTypes: 0, root: '/tmp/yne20', startedAt: 0 }, vocabularyIssues: [] })
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
    const confirm = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === '接受')
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

    const toggle = container.querySelector('[role="switch"]')
    assert.ok(toggle !== null, 'the auto switch must exist')
    assert.equal(toggle.getAttribute('aria-checked'), 'true')
    click(toggle)
    await flush(4)
    assert.equal(container.querySelector('[role="switch"]')?.getAttribute('aria-checked'), 'false')

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
        workspace: { path: '/tmp/yne20' },
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

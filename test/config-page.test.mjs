import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

/**
 * The live configuration page DSH renders inside the installed-bundle detail view.
 *
 * The page owns no values: it reads the field table from GET /semantic-drift/config
 * and everything else from the settings domain's form, so this runs the real bundle
 * in jsdom against a RECORDING fake form — getSnapshot, subscribe and set — and
 * against a configForms service stub, the same way the shell hands both over.
 */

const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:65000/',
  pretendToBeVisual: true,
})
const { window } = dom
for (const key of [
  'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'Node',
  'getComputedStyle', 'localStorage', 'sessionStorage',
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true })
}
Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
// Without this flag React logs a warning for every act() call in a jsdom run.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.__ModuleLoader__ = { load({ factory }) { this.exports = factory(createRequire(import.meta.url)) } }

// Bundled from src/ rather than loaded from the committed lib/ artifact: this file
// asserts the source under review, and lib/ is only rewritten at release.
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
const bundleFile = join(outdir, 'config-page-client.js')
// The shell's module loader wrapper, spelled out without template literals so this
// file can inline the bundle exactly as the Web shell would.
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
const clientModule = window.__ModuleLoader__.exports

// The source modules, not the bundle: these two are what the labels must track.
const { dictionaries } = await import('../src/client/locales.ts')
const { configFields } = await import('../src/config.ts')

/** Values in force, keyed exactly like Config.dict; the page hides the switch. */
const VALUES = {
  vocabularyPath: '.dsh/semantics.yaml',
  announceToAgent: true,
  citationStyle: 'file+symbol',
  minConfidence: 'medium',
  timeoutMs: 30000,
  maxFindings: 5000,
  maxFileBytes: 1048576,
  maxFiles: 50000,
  detectors: ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'],
}

/** Nine fields, exactly what configFields() derives from Config.dict. */
const CONFIG = {
  ok: true,
  version: '0.1.5',
  fields: [
    { name: 'vocabularyPath', kind: 'string', description: 'Vocabulary file, relative to the workspace root.', default: '.dsh/semantics.yaml' },
    { name: 'announceToAgent', kind: 'boolean', description: 'Inject the vocabulary into every agent prompt.', default: true },
    { name: 'citationStyle', kind: 'enum', description: 'Shape of copied references.', options: ['file+symbol', 'file:line'], default: 'file+symbol' },
    { name: 'minConfidence', kind: 'enum', description: 'Lowest confidence the agent tools report.', options: ['high', 'medium', 'low'], default: 'medium' },
    { name: 'timeoutMs', kind: 'number', description: 'Wall-clock budget for one scan.', min: 1000, max: 120000, default: 30000 },
    { name: 'maxFindings', kind: 'number', description: 'Hard cap on findings returned by one scan.', min: 1, max: 50000, default: 5000 },
    { name: 'maxFileBytes', kind: 'number', description: 'Files larger than this are skipped.', min: 1024, max: 67108864, default: 1048576 },
    { name: 'maxFiles', kind: 'number', description: 'Hard cap on files visited by one scan.', min: 100, max: 200000, default: 50000 },
    { name: 'detectors', kind: 'flags', description: 'Detectors a scan runs.', options: ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'], default: ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'] },
  ],
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const calls = []
let answerConfig = () => json(CONFIG)

globalThis.fetch = async (url, init = {}) => {
  const href = String(url)
  calls.push({ url: href, method: init.method ?? 'GET', body: init.body })
  if (href.includes('/config')) return answerConfig()
  // The live form writes through configForms, never through this route.
  return json({ ok: false, code: 'unexpected', message: 'not stubbed' }, 500)
}

function configCalls() {
  return calls.filter(call => call.url.includes('/config'))
}

function settingsCalls() {
  return calls.filter(call => call.url.includes('/settings'))
}

/** A form that records every call the page makes on it. */
function makeForm(options = {}) {
  const snapshot = {
    status: 'ready',
    value: { ...VALUES },
    base: { ...VALUES },
    user: {},
    revision: 1,
    writable: true,
    ...options.snapshot,
  }
  const listeners = new Set()
  const form = {
    /** Every set(field, value) the page issued, in order. */
    sets: [],
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async set(field, value) {
      form.sets.push([field, value])
      if (options.reject !== undefined) throw options.reject
      return options.accept ?? true
    },
    /** Test-side fold of a Host answer: no read, no reload. */
    apply(patch) {
      Object.assign(snapshot.value, patch)
      for (const listener of [...listeners]) listener()
    },
  }
  return form
}

function reset() {
  calls.length = 0
  answerConfig = () => json(CONFIG)
}

const { createRoot } = await import('react-dom/client')
const { createElement, act: reactAct } = await import('react')

async function flush(times = 6) {
  for (let i = 0; i < times; i++) {
    await reactAct(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  }
}

/**
 * Mount the bundle's configuration seat.
 *
 * The shell passes { view } and nothing else, so the page must reach the settings
 * domain itself — exactly what a stub ctx.inject reproduces here.
 */
function mountPage({ form, served = new Set(['semantic-drift']), props = { view: 'page' } } = {}) {
  const registrations = []
  const service = {
    get(entryId) {
      assert.equal(entryId, 'semantic-drift', 'the page asks for the served entry id')
      return form
    },
    whileServed(namespaces, register) {
      assert.deepEqual(namespaces, ['semantic-drift', 'dsh-semantic-drift'])
      const dispose = register(served)
      return typeof dispose === 'function' ? dispose : () => undefined
    },
  }
  clientModule.apply({
    slots: {
      inject: (_key, callback) => {
        const dispose = callback()
        return typeof dispose === 'function' ? dispose : () => undefined
      },
      register: (options, component) => {
        registrations.push({ options, component })
        return () => undefined
      },
    },
    effect: (callback) => {
      const cleanup = callback()
      return typeof cleanup === 'function' ? cleanup : () => undefined
    },
    inject: (services, callback) => {
      assert.deepEqual(services, ['configForms'], 'the page needs the settings domain')
      callback({ configForms: service })
      return () => undefined
    },
  })
  const entry = registrations.find(registered => registered.options.name === 'plugins.bundle.config')
  assert.ok(entry !== undefined, 'the bundle must register the bundle settings seat')
  const face = entry.options.inject()
  assert.equal(face.namespace, 'semantic-drift', 'the seat hands the served namespace to the page')
  // A fresh container per mount: React 19 refuses a container it already rooted.
  const container = window.document.createElement('div')
  window.document.getElementById('root').replaceChildren(container)
  const root = createRoot(container)
  reactAct(() => { root.render(createElement(entry.component, { ...props, ...face })) })
  return { container, root, form }
}

/** Type into a controlled input or pick from a controlled select. */
function type(selector, value) {
  const element = window.document.querySelector(selector)
  assert.ok(element !== null, 'missing control ' + selector)
  const prototype = element.tagName === 'SELECT'
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  reactAct(() => {
    setter?.call(element, value)
    element.dispatchEvent(new window.Event('input', { bubbles: true }))
    element.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}

/**
 * Leave a text box.
 *
 * React delegates onBlur to the bubbling focusout, so a bare non-bubbling blur
 * event would never reach the handler.
 */
function leave(selector) {
  const element = window.document.querySelector(selector)
  assert.ok(element !== null, 'missing control ' + selector)
  reactAct(() => { element.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })) })
}

/** Press Enter in a focused box: the handler hands the commit to the blur. */
function pressEnter(selector) {
  const element = window.document.querySelector(selector)
  assert.ok(element !== null, 'missing control ' + selector)
  reactAct(() => {
    element.focus()
    element.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

function click(element) {
  assert.ok(element !== null && element !== undefined, 'missing element to click')
  reactAct(() => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function controls(container) {
  return [...container.querySelectorAll('input, select')]
}

test('the summary view is one line and renders no form', async () => {
  reset()
  const { container, root } = mountPage({ form: makeForm(), props: { view: 'summary' } })
  await flush(2)
  const text = (container.textContent ?? '').trim()
  assert.match(text, /项目级配置/, 'the summary must describe the block; got: ' + text)
  assert.match(text, /词表文件、引用格式、最低置信度/, 'the summary names what is configurable')
  assert.equal(container.querySelector('form, input, select'), null, 'the summary is text only')
  assert.equal(calls.length, 0, 'the summary reads nothing')
  reactAct(() => root.unmount())
})

test('the page renders the eight bundle fields and never the agent-injection switch', async () => {
  reset()
  const { container, root } = mountPage({ form: makeForm() })
  await flush()
  assert.equal(container.querySelectorAll('.sd-config-field').length, 8, 'nine row fields minus the panel-owned switch')
  assert.equal(configCalls().length, 1, 'one field-table read on mount')
  const text = container.textContent ?? ''
  for (const name of ['vocabularyPath', 'citationStyle', 'minConfidence', 'timeoutMs', 'maxFindings', 'maxFileBytes', 'maxFiles', 'detectors']) {
    assert.ok(text.includes(name), 'missing field ' + name)
  }
  assert.equal(text.includes('announceToAgent'), false, 'the injection switch belongs to the panel settings')
  assert.equal(container.querySelector('#sd-config-announceToAgent'), null)
  assert.match(text, /Vocabulary file, relative to the workspace root./, 'the Host description is shown as the hint')
  reactAct(() => root.unmount())
})

test('every field kind gets its own control: select, checkbox group, bounded number', async () => {
  reset()
  const { container, root } = mountPage({ form: makeForm() })
  await flush()

  const enumSelect = container.querySelector('[data-kind="enum"] select')
  assert.ok(enumSelect !== null, 'an enum field must be a select')
  assert.equal(container.querySelector('#sd-config-citationStyle').tagName, 'SELECT')
  assert.deepEqual([...enumSelect.options].map(option => option.value), ['file+symbol', 'file:line'])
  assert.equal(container.querySelectorAll('[data-kind="enum"] select').length, 2, 'citationStyle and minConfidence')

  const flagsField = container.querySelector('[data-kind="flags"]')
  assert.ok(flagsField !== null)
  const boxes = [...flagsField.querySelectorAll('input[type="checkbox"]')]
  assert.equal(boxes.length, 4, 'one checkbox per detector')
  assert.equal(boxes.every(box => box.checked), true, 'the value in force is checked')
  assert.equal(flagsField.querySelector('select'), null)

  const timeout = container.querySelector('#sd-config-timeoutMs')
  assert.equal(timeout.getAttribute('type'), 'number')
  assert.equal(timeout.getAttribute('min'), '1000')
  assert.equal(timeout.getAttribute('max'), '120000')
  assert.equal(timeout.value, '30000', 'the value in force is in the box')
  assert.equal(container.querySelector('#sd-config-vocabularyPath').getAttribute('type'), 'text')
  assert.equal(container.querySelector('[data-kind="boolean"]'), null, 'no boolean field survives the filter')
  reactAct(() => root.unmount())
})

test('every field the Host can send carries a localized label in both dictionaries', async () => {
  // The schema is the authority on the field set, so a field added there fails
  // this test until the page can name it in both languages.
  const shown = configFields().filter(field => field.name !== 'announceToAgent')
  assert.equal(shown.length, 8, 'the page renders eight of the nine row fields')
  for (const field of shown) {
    for (const language of ['zh', 'en']) {
      assert.equal(
        typeof dictionaries[language]['config.field.' + field.name],
        'string',
        language + ' is missing config.field.' + field.name,
      )
    }
  }
  assert.equal('config.field.announceToAgent' in dictionaries.zh, false, 'the filtered switch needs no page label')
  assert.equal('config.field.announceToAgent' in dictionaries.en, false)
  // The fixture must stay the schema's own table, or the render assertions drift.
  assert.deepEqual(CONFIG.fields.map(field => field.name), configFields().map(field => field.name))
  // A live form has no save vocabulary left: every one of those keys is gone.
  for (const retired of ['config.save', 'config.saving', 'config.saved', 'config.saveFailed', 'config.reloadHint', 'config.noChanges']) {
    assert.equal(retired in dictionaries.zh, false, retired + ' must not survive in zh')
    assert.equal(retired in dictionaries.en, false, retired + ' must not survive in en')
  }
  for (const added of ['config.readonly', 'config.unavailable', 'config.appliesNow', 'config.setFailed']) {
    assert.equal(typeof dictionaries.zh[added], 'string', 'zh is missing ' + added)
    assert.equal(typeof dictionaries.en[added], 'string', 'en is missing ' + added)
  }
})

test('the page names each field in Chinese and keeps the schema key beside it', async () => {
  reset()
  const { container, root } = mountPage({ form: makeForm() })
  await flush()
  const labels = [...container.querySelectorAll('.sd-config-label')].map(node => node.textContent ?? '')
  assert.equal(labels.length, 8, 'one label per rendered field')
  const expected = {
    vocabularyPath: '词表路径',
    citationStyle: '引用格式',
    minConfidence: '工具最低置信度',
    timeoutMs: '超时预算',
    maxFindings: '发现数上限',
    maxFileBytes: '单文件字节上限',
    maxFiles: '文件数上限',
    detectors: '检测器',
  }
  for (const [name, localized] of Object.entries(expected)) {
    const label = labels.find(text => text.includes(name))
    assert.ok(label !== undefined, 'no label carries the schema key ' + name)
    assert.ok(label.includes(localized), 'label ' + label + ' must read ' + localized)
    assert.equal(label.startsWith(localized), true, localized + ' must lead the label, not follow the key')
  }
  assert.match(container.textContent ?? '', /改动立即生效/, 'the page says the change is live')
  reactAct(() => root.unmount())
})

test('a select writes its own field at once, without re-reading the field table', async () => {
  reset()
  const form = makeForm()
  const { container, root } = mountPage({ form })
  await flush()

  type('#sd-config-minConfidence', 'high')
  await flush(2)

  assert.deepEqual(form.sets, [['minConfidence', 'high']], 'one edit is one write, with the schema key')
  assert.equal(configCalls().length, 1, 'a write must not re-read the field table')
  assert.equal(settingsCalls().length, 0, 'the live form never posts a settings patch')
  reactAct(() => root.unmount())
})

test('a checkbox group writes the whole selection at once', async () => {
  reset()
  const form = makeForm()
  const { container, root } = mountPage({ form })
  await flush()

  const contractDrift = [...container.querySelectorAll('[data-kind="flags"] input[type="checkbox"]')][1]
  click(contractDrift)
  await flush(2)

  assert.deepEqual(form.sets, [['detectors', ['duplicate-type', 'symbol-variant', 'term-unmapped']]])
  reactAct(() => root.unmount())
})

test('a text box writes on blur only, never per keystroke', async () => {
  reset()
  const form = makeForm()
  const { container, root } = mountPage({ form })
  await flush()

  type('#sd-config-timeoutMs', '6')
  type('#sd-config-timeoutMs', '60')
  type('#sd-config-timeoutMs', '60000')
  await flush(2)
  assert.deepEqual(form.sets, [], 'typing is a draft, not a write')

  leave('#sd-config-timeoutMs')
  await flush(2)
  assert.deepEqual(form.sets, [['timeoutMs', 60000]], 'the number leaves the box as a number')
  assert.equal(configCalls().length, 1, 'a write must not re-read the field table')

  // Enter is the same commit: the box hands the write to its blur.
  type('#sd-config-maxFiles', '45000')
  await flush(2)
  assert.equal(form.sets.length, 1, 'still nothing written while typing')
  pressEnter('#sd-config-maxFiles')
  await flush(2)
  assert.deepEqual(form.sets, [['timeoutMs', 60000], ['maxFiles', 45000]], 'Enter writes exactly once')
  reactAct(() => root.unmount())
})

test('a field that is edited back to its value in force writes nothing', async () => {
  reset()
  const form = makeForm()
  const { container, root } = mountPage({ form })
  await flush()

  type('#sd-config-timeoutMs', '30000')
  leave('#sd-config-timeoutMs')
  await flush(2)
  assert.deepEqual(form.sets, [], 'an unchanged box must not reach the Host')
  reactAct(() => root.unmount())
})

test('a read-only deployment disables every control and says why', async () => {
  reset()
  const { container, root } = mountPage({ form: makeForm({ snapshot: { writable: false } }) })
  await flush()

  const shown = controls(container)
  assert.equal(shown.length, 11, 'one text box, two selects, four number boxes and four detector boxes')
  assert.equal(shown.every(control => control.disabled), true, 'every control is inert')
  assert.match(container.textContent ?? '', /当前环境设置为只读/)
  assert.equal(container.querySelector('.sd-config').getAttribute('data-locked'), 'true', 'the lock is on the page root')
  reactAct(() => root.unmount())
})

test('an unavailable namespace disables every control and says why', async () => {
  reset()
  const { container, root } = mountPage({ form: makeForm({ snapshot: { status: 'loading' } }) })
  await flush()

  assert.equal(controls(container).every(control => control.disabled), true)
  assert.match(container.textContent ?? '', /插件当前未加载，暂时无法配置/)
  reactAct(() => root.unmount())
})

test('a refused write keeps the edit and still accepts the next one', async () => {
  reset()
  const form = makeForm({ reject: new Error('timeoutMs: expected number.') })
  const { container, root } = mountPage({ form })
  await flush()

  type('#sd-config-timeoutMs', '0')
  leave('#sd-config-timeoutMs')
  await flush(4)

  const text = container.textContent ?? ''
  assert.match(text, /未能写入设置/)
  assert.match(text, /timeoutMs: expected number./, 'the Host wording is shown verbatim')
  assert.equal(container.querySelector('#sd-config-timeoutMs').value, '0', 'the draft is not discarded')
  assert.equal(container.querySelector('#sd-config-timeoutMs').disabled, false, 'a refusal is not a lock')

  type('#sd-config-timeoutMs', '45000')
  leave('#sd-config-timeoutMs')
  await flush(4)
  assert.deepEqual(form.sets, [['timeoutMs', 0], ['timeoutMs', 45000]], 'the next edit still reaches the Host')
  reactAct(() => root.unmount())
})

test('the page carries no save button and no reload advice', async () => {
  reset()
  const { container, root } = mountPage({ form: makeForm() })
  await flush()

  const text = container.textContent ?? ''
  assert.equal(container.querySelectorAll('button').length, 0, 'a live form has nothing to save')
  assert.equal(text.includes('保存'), false, 'no save wording survives')
  for (const advice of ['重载', '重新加载', '刷新页面', '停用再启用']) {
    assert.equal(text.includes(advice), false, 'the page never asks to ' + advice)
  }
  reactAct(() => root.unmount())
})

test('a failed field-table read says so and retries through the button', async () => {
  reset()
  answerConfig = () => json({ ok: false, code: 'unsupported', message: 'This Host exposes no config editor.' }, 500)
  const { container, root } = mountPage({ form: makeForm() })
  await flush()

  const text = container.textContent ?? ''
  assert.match(text, /配置加载失败/)
  assert.match(text, /This Host exposes no config editor./, 'the Host wording is shown verbatim')
  assert.equal(container.querySelectorAll('.sd-config-field').length, 0)
  const retry = [...container.querySelectorAll('button')].find(button => (button.textContent ?? '').includes('重试'))
  assert.ok(retry !== undefined, 'a retry control must be offered')

  answerConfig = () => json(CONFIG)
  click(retry)
  await flush(8)
  assert.equal(container.querySelectorAll('.sd-config-field').length, 8, 'the retry loads the form')
  assert.equal(configCalls().length, 2)
  reactAct(() => root.unmount())
})

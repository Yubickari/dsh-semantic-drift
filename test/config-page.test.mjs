import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

/**
 * The settings page DSH renders inside the installed-plugin detail view.
 *
 * A static render cannot see a save, a refusal or a retry, so this runs the real
 * bundle in jsdom with `fetch` replaced by the exact payloads the Host answers:
 * `GET /semantic-drift/config` (nine fields, one of them the panel's own switch)
 * and `POST /semantic-drift/settings` (`{ patch }` → `{ ok, applied }`).
 */

const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:65000/',
  pretendToBeVisual: true,
})
const { window } = dom
for (const key of [
  'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'Node', 'getComputedStyle',
  'localStorage', 'sessionStorage',
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true })
}
Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
// Without this flag React logs a warning for every act() call in a jsdom run.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.__ModuleLoader__ = { load({ factory }) { this.exports = factory(createRequire(import.meta.url)) } }

// Bundled from `src/` rather than loaded from the committed `lib/` artifact: this
// file asserts the source under review, and `lib/` is only rewritten at release.
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
const clientModule = window.__ModuleLoader__.exports

// The source modules, not the bundle: these two are what the labels must track.
const { dictionaries } = await import('../src/client/locales.ts')
const { configFields } = await import('../src/config.ts')

/** Nine fields, exactly what `configFields()` derives from `Config.dict`. */
const CONFIG = {
  ok: true,
  version: '0.1.5',
  values: {
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
  fields: [
    { name: 'vocabularyPath', kind: 'string', description: 'Vocabulary file, relative to the workspace root.', default: '.dsh/semantics.yaml' },
    { name: 'announceToAgent', kind: 'boolean', description: 'Inject the vocabulary into every agent prompt.', default: true },
    { name: 'citationStyle', kind: 'enum', description: 'Shape of copied references.', options: ['file+symbol', 'file:line'], default: 'file+symbol' },
    { name: 'minConfidence', kind: 'enum', description: 'Lowest confidence the agent tools report.', options: ['high', 'medium', 'low'], default: 'medium' },
    { name: 'timeoutMs', kind: 'number', description: 'Wall-clock budget for one scan.', min: 1000, max: 600000, default: 30000 },
    { name: 'maxFindings', kind: 'number', description: 'Hard cap on findings returned by one scan.', min: 1, max: 100000, default: 5000 },
    { name: 'maxFileBytes', kind: 'number', description: 'Files larger than this are skipped.', min: 1024, max: 10485760, default: 1048576 },
    { name: 'maxFiles', kind: 'number', description: 'Hard cap on files visited by one scan.', min: 1, max: 1000000, default: 50000 },
    { name: 'detectors', kind: 'flags', description: 'Detectors a scan runs.', options: ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'], default: ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'] },
  ],
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const calls = []
let answerConfig = () => json(CONFIG)
let answerSettings = body => json({ ok: true, applied: body.patch })

globalThis.fetch = async (url, init = {}) => {
  const href = String(url)
  calls.push({ url: href, method: init.method ?? 'GET', body: init.body })
  if (href.includes('/config')) return answerConfig()
  if (href.includes('/settings')) return answerSettings(JSON.parse(String(init.body ?? '{}')))
  return json({ ok: false, code: 'unexpected', message: 'not stubbed' }, 500)
}

function reset() {
  calls.length = 0
  answerConfig = () => json(CONFIG)
  answerSettings = body => json({ ok: true, applied: body.patch })
}

const { createRoot } = await import('react-dom/client')
const { createElement, act: reactAct } = await import('react')

async function flush(times = 6) {
  for (let i = 0; i < times; i++) {
    await reactAct(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  }
}

/** Register the bundle's seats and mount the row-config page. */
function mountPage(props = { view: 'page' }) {
  const registrations = []
  clientModule.apply({
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, component) => { registrations.push({ options, component }); return () => undefined },
    },
    effect: callback => { callback(); return () => undefined },
  })
  const entry = registrations.find(registered => registered.options.name === 'plugins.row.config')
  assert.ok(entry !== undefined, 'the bundle must register the row settings seat')
  const container = window.document.getElementById('root')
  container.innerHTML = ''
  const root = createRoot(container)
  reactAct(() => { root.render(createElement(entry.component, props)) })
  return { container, root }
}

function click(element) {
  assert.ok(element !== null && element !== undefined, 'missing element to click')
  reactAct(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
}

/** Type into a controlled input or pick from a controlled select. */
function type(selector, value) {
  const element = window.document.querySelector(selector)
  assert.ok(element !== null, `missing control ${selector}`)
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

function saveButton(container) {
  const button = container.querySelector('.sd-config-actions button')
  assert.ok(button !== null, 'the page must render a save button')
  return button
}

function settingsCalls() {
  return calls.filter(call => call.url.includes('/settings'))
}

test('the summary view is one line and renders no form', async () => {
  reset()
  const { container, root } = mountPage({ view: 'summary' })
  await flush(2)
  const text = (container.textContent ?? '').trim()
  assert.match(text, /8 项项目级设置/, `the summary must describe the page; got: ${text}`)
  assert.equal(container.querySelector('form, input, select'), null, 'the summary is text only')
  assert.equal(settingsCalls().length, 0)
  reactAct(() => root.unmount())
})

test('the page renders the eight row fields and never the agent-injection switch', async () => {
  reset()
  const { container, root } = mountPage()
  await flush()
  const fields = [...container.querySelectorAll('.sd-config-field')]
  assert.equal(fields.length, 8, 'nine row fields minus the panel-owned switch')
  assert.equal(calls.filter(call => call.url.includes('/config')).length, 1, 'one read on mount')
  const text = container.textContent ?? ''
  for (const name of ['vocabularyPath', 'citationStyle', 'minConfidence', 'timeoutMs', 'maxFindings', 'maxFileBytes', 'maxFiles', 'detectors']) {
    assert.ok(text.includes(name), `missing field ${name}`)
  }
  assert.equal(text.includes('announceToAgent'), false, 'the injection switch belongs to the panel settings')
  assert.equal(container.querySelector('#sd-config-announceToAgent'), null)
  assert.match(text, /Vocabulary file, relative to the workspace root./, 'the Host description is shown as the hint')
  reactAct(() => root.unmount())
})

test('each field kind gets its own control: select, checkbox group, bounded number', async () => {
  reset()
  const { container, root } = mountPage()
  await flush()

  const enumField = container.querySelector('[data-kind="enum"]')
  assert.ok(enumField !== null, 'an enum field must be marked as such')
  const enumSelect = enumField.querySelector('select')
  assert.ok(enumSelect !== null, 'an enum field must be a select')
  assert.equal(enumSelect.id, 'sd-config-citationStyle')
  assert.deepEqual([...enumSelect.options].map(option => option.value), ['file+symbol', 'file:line'])
  assert.equal(container.querySelectorAll('[data-kind="enum"] select').length, 2, 'citationStyle and minConfidence')

  const flagsField = container.querySelector('[data-kind="flags"]')
  assert.ok(flagsField !== null)
  const boxes = [...flagsField.querySelectorAll('input[type="checkbox"]')]
  assert.equal(boxes.length, 4, 'one checkbox per detector')
  assert.equal(boxes.every(box => box.checked), true, 'the current selection is checked')
  assert.equal(flagsField.querySelector('select'), null)

  const numberField = container.querySelector('[data-kind="number"]')
  assert.ok(numberField !== null)
  const numberInput = numberField.querySelector('input')
  assert.equal(numberInput.getAttribute('type'), 'number')
  const timeout = container.querySelector('#sd-config-timeoutMs')
  assert.equal(timeout.getAttribute('min'), '1000')
  assert.equal(timeout.getAttribute('max'), '600000')
  assert.equal(timeout.value, '30000', 'the current value is in the box')
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
        typeof dictionaries[language][`config.field.${field.name}`],
        'string',
        `${language} is missing config.field.${field.name}`,
      )
    }
  }
  assert.equal('config.field.announceToAgent' in dictionaries.zh, false, 'the filtered switch needs no page label')
  assert.equal('config.field.announceToAgent' in dictionaries.en, false)
  // The fixture must stay the schema's own table, or the render assertions drift.
  assert.deepEqual(CONFIG.fields.map(field => field.name), configFields().map(field => field.name))
})

test('the page names each field in Chinese and keeps the schema key beside it', async () => {
  reset()
  const { container, root } = mountPage()
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
    assert.ok(label !== undefined, `no label carries the schema key ${name}`)
    assert.ok(label.includes(localized), `label "${label}" must read "${localized}"`)
    assert.equal(label.startsWith(localized), true, `"${localized}" must lead the label, not follow the key`)
  }
  // The Host description stays the only explanation, and stays as sent.
  assert.match(container.textContent ?? '', /Vocabulary file, relative to the workspace root./)
  reactAct(() => root.unmount())
})

test('saving sends one patch of the edited fields only and reports the reload', async () => {
  reset()
  const { container, root } = mountPage()
  await flush()

  type('#sd-config-minConfidence', 'high')
  type('#sd-config-timeoutMs', '60000')
  // Unchecking one detector is a list edit, not a text edit.
  const contractDrift = [...container.querySelectorAll('[data-kind="flags"] input[type="checkbox"]')][1]
  click(contractDrift)
  await flush(2)

  click(saveButton(container))
  await flush(8)

  const writes = settingsCalls()
  assert.equal(writes.length, 1, 'one click is one write')
  assert.equal(writes[0].method, 'POST')
  assert.deepEqual(JSON.parse(String(writes[0].body)), {
    patch: {
      minConfidence: 'high',
      timeoutMs: 60000,
      detectors: ['duplicate-type', 'symbol-variant', 'term-unmapped'],
    },
  }, 'only the edited fields, and the number leaves the box as a number')
  const text = container.textContent ?? ''
  assert.match(text, /已保存/)
  assert.match(text, /插件列表里停用再启用/, 'the page says how to force a reload')
  assert.equal(saveButton(container).disabled, false, 'the button comes back after the write')
  reactAct(() => root.unmount())
})

test('a refused write keeps the typed value and shows the Host message', async () => {
  reset()
  answerSettings = () => json({ ok: false, code: 'bad-request', message: 'timeoutMs: expected number.' }, 400)
  const { container, root } = mountPage()
  await flush()

  type('#sd-config-timeoutMs', '0')
  click(saveButton(container))
  await flush(8)

  const text = container.textContent ?? ''
  assert.match(text, /设置未能保存/)
  assert.match(text, /timeoutMs: expected number./, 'the Host wording is shown verbatim')
  assert.equal(container.querySelector('#sd-config-timeoutMs').value, '0', 'the edit is not discarded')
  assert.equal(settingsCalls().length, 1)
  reactAct(() => root.unmount())
})

test('an unchanged form writes nothing and says so', async () => {
  reset()
  const { container, root } = mountPage()
  await flush()
  click(saveButton(container))
  await flush(4)
  assert.equal(settingsCalls().length, 0, 'an unchanged row must not reload for nothing')
  assert.match(container.textContent ?? '', /没有需要保存的改动/)
  reactAct(() => root.unmount())
})

test('a failed read says so and retries through the button', async () => {
  reset()
  answerConfig = () => json({ ok: false, code: 'unsupported', message: 'This Host exposes no config editor.' }, 500)
  const { container, root } = mountPage()
  await flush()

  const text = container.textContent ?? ''
  assert.match(text, /配置加载失败/)
  assert.match(text, /This Host exposes no config editor./, 'the Host wording is shown verbatim')
  const retry = [...container.querySelectorAll('button')].find(button => (button.textContent ?? '').includes('重试'))
  assert.ok(retry !== undefined, 'a retry control must be offered')
  assert.equal(container.querySelectorAll('.sd-config-field').length, 0)

  answerConfig = () => json(CONFIG)
  click(retry)
  await flush(8)
  assert.equal(container.querySelectorAll('.sd-config-field').length, 8, 'the retry loads the form')
  assert.equal(calls.filter(call => call.url.includes('/config')).length, 2)
  reactAct(() => root.unmount())
})

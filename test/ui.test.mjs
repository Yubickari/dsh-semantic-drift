import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

/**
 * Render tests for the panel's pieces.
 *
 * These exist because the panel is only verifiable in a browser otherwise: the
 * editor's validation feedback, the feedback banner's controls and the tree's add
 * buttons are all markup that a failed save depends on being visible.
 */

Object.defineProperty(globalThis, 'document', {
  value: { documentElement: { lang: 'zh-CN' } },
  configurable: true,
})

// Emitted inside the repository's gitignored `.tmp/` so Node resolves `react`
// from this package's own node_modules, exactly like the built client bundle does.
const repo = fileURLToPath(new URL('..', import.meta.url))
const outdir = join(repo, '.tmp')
await mkdir(outdir, { recursive: true })
const outfile = join(outdir, 'ui-harness.mjs')
await build({
  entryPoints: [new URL('./ui-harness.tsx', import.meta.url).pathname],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  logLevel: 'warning',
})
const ui = await import(outfile)

const concept = {
  id: 'sensor.sensor_rate',
  terms: ['采样率'],
  kind: 'entity',
  canonical: { symbol: 'SensorRATE', type: 'int' },
  note: '设备采样率',
}

const duplicateIssue = {
  code: 'symbol-duplicate',
  message: 'Canonical symbol `SensorRATE` is already used by `concepts[2]`; one symbol can name only one concept.',
  severity: 'error',
  path: 'concepts[4].canonical.symbol',
  line: 21,
}

function render(element) {
  return renderToStaticMarkup(element)
}

test('a concept offers delete next to edit', () => {
  const html = render(createElement(ui.ConceptDetail, {
    concept,
    findings: [],
    showLow: false,
    onShowLow: () => undefined,
    onEdit: () => undefined,
    onDelete: () => undefined,
    muteCount: () => 0,
  }))
  assert.match(html, /删除/)
  assert.match(html, /编辑/)
  const edit = html.indexOf('编辑')
  const remove = html.indexOf('删除')
  assert.ok(edit < remove, 'delete follows edit in the header row')
  assert.match(html, /sd-button-danger/)
})

test('accepted exceptions offer edit and remove, and a clear action when plural', () => {
  const html = render(createElement(ui.ConceptDetail, {
    concept: {
      ...concept,
      accepted: [
        { symbol: 'ModuleName', path: '**', reason: 'old reason' },
        { symbol: 'ModuleName', path: '**/Common/**', reason: 'narrower' },
      ],
    },
    findings: [],
    showLow: false,
    onEdit: () => undefined,
    onDelete: () => undefined,
    onEditException: () => undefined,
    onRemoveException: () => undefined,
    onClearExceptions: () => undefined,
    muteCount: () => 2,
    onAccept: () => undefined,
    onCopy: () => undefined,
  }))
  assert.match(html, /编辑 ModuleName \*\*/)
  assert.match(html, /移除 ModuleName \*\*\/Common\/\*\*/)
  assert.match(html, /清空/)
  assert.equal((html.match(/aria-label="编辑 ModuleName/g) ?? []).length, 2, 'one edit action per exception')
})

test('the concept editor shows a duplicate-symbol issue, localized and verbatim', () => {
  const html = render(createElement(ui.ConceptEditor, {
    concept: undefined,
    initialId: 'sensor.sensor_rate_2',
    initialSymbol: 'SensorRATE',
    issues: [duplicateIssue],
    saving: false,
    onSave: () => undefined,
    onCancel: () => undefined,
  }))
  assert.match(html, /规范符号重复/, 'the localized headline must be rendered')
  assert.match(html, /already used by/, 'the host sentence carries the concrete characters')
  assert.match(html, /concepts\[4\]\.canonical\.symbol/, 'the document path must be shown')
  assert.match(html, /line 21/, 'the line must be shown')
  assert.match(html, /SensorRATE/)
})

test('the editor renders no issue block when the save had no issues', () => {
  const html = render(createElement(ui.ConceptEditor, {
    concept,
    issues: [],
    saving: false,
    onSave: () => undefined,
    onCancel: () => undefined,
  }))
  assert.doesNotMatch(html, /sd-issues/)
  assert.match(html, /sensor\.sensor_rate/)
})

test('the editor marks exactly the four required fields', () => {
  const html = render(createElement(ui.ConceptEditor, {
    concept: undefined,
    issues: [],
    saving: false,
    onSave: () => undefined,
    onCancel: () => undefined,
  }))
  assert.equal((html.match(/class="sd-required"/g) ?? []).length, 4, 'one dark-red mark per required field')
  assert.equal((html.match(/aria-required="true"/g) ?? []).length, 4, 'the same four controls say so to assistive tech')
  for (const id of ['sd-id', 'sd-terms', 'sd-kind', 'sd-symbol']) {
    const tag = new RegExp(`<(?:input|select)[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? ''
    assert.match(tag, /aria-required="true"/, `${id} must be required`)
  }
  for (const id of ['sd-type', 'sd-unit', 'sd-note']) {
    const tag = new RegExp(`<(?:input|textarea)[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? ''
    assert.doesNotMatch(tag, /aria-required="true"/, `${id} stays optional`)
  }
})

test('a banner is persistent page state with an action', () => {
  const html = render(createElement(ui.Banner, {
    kind: 'info',
    action: createElement('button', null, '重新扫描'),
  }, createElement('span', null, '尚未扫描')))
  assert.match(html, /class="sd-banner"/)
  assert.match(html, /data-kind="info"/)
  assert.match(html, /sd-banner-body/)
  assert.match(html, /sd-banner-action/)
  assert.match(html, /重新扫描/)
})

test('an error banner carries a retry action, a close control and its issues', () => {
  const html = render(createElement(ui.Banner, {
    kind: 'error',
    onDismiss: () => undefined,
    action: createElement('button', null, '重试'),
  },
  createElement('div', null, '加载失败：连不上宿主进程'),
  createElement(ui.IssueList, { issues: [duplicateIssue] }),
  ))
  assert.match(html, /data-kind="error"/)
  assert.match(html, /role="alert"/)
  assert.match(html, /连不上宿主进程/)
  assert.match(html, /规范符号重复/)
  assert.match(html, /重试/)
  assert.match(html, /aria-label="关闭"/, 'an operation error must be dismissible')
})

test('the tree has a header add button and one per group', () => {
  const html = render(createElement(ui.ConceptTree, {
    concepts: [concept, { ...concept, id: 'device.state', canonical: { symbol: 'DeviceState' } }],
    selectedId: 'sensor.sensor_rate',
    query: '',
    onQuery: () => undefined,
    filter: 'all',
    onFilter: () => undefined,
    driftCounts: new Map([['sensor.sensor_rate', 3]]),
    unclassified: 4,
    showUnclassified: true,
    onSelect: () => undefined,
    onSelectUnclassified: () => undefined,
    onAdd: () => undefined,
  }))
  const adds = html.match(/class="sd-add"/g) ?? []
  assert.equal(adds.length, 3, 'one in the header plus one per group')
  assert.match(html, /sd-tree-title/)
  assert.match(html, /本组新建概念/)
  assert.match(html, /data-active="true"/)
  assert.match(html, /未归类/)
})

test('a derived copy and a renamed contract get their own labels', () => {
  const base = {
    id: 'duplicate-type:a/x.cs:Provider:3',
    confidence: 'high',
    path: 'a/x.cs',
    line: 3,
    symbol: 'Provider',
    message: 'example',
    citation: 'a/x.cs::Provider',
  }
  const derived = render(createElement(ui.DriftList, {
    findings: [{ ...base, detector: 'duplicate-type', detail: { rule: 'derived-copy', base: 'ProviderBase' } }],
    onAccept: () => undefined,
    onCopy: () => undefined,
    showLow: true,
  }))
  assert.match(derived, /派生副本/)
  assert.doesNotMatch(derived, /建议合并/)

  const alias = render(createElement(ui.DriftList, {
    findings: [{
      ...base,
      detector: 'symbol-variant',
      expected: 'ProfileProvider',
      detail: { rule: 'contract-alias', base: 'BaseProvider', members: ['ModuleName'], literals: { BaseFileName: ['Language'] } },
    }],
    onAccept: () => undefined,
    onCopy: () => undefined,
    showLow: true,
  }))
  assert.match(alias, /同一契约另一种命名/)
  assert.match(alias, /ProfileProvider/)
})

test('a finding row names its detector, confidence and actions', () => {
  const finding = {
    id: 'duplicate-type:a/b.cs:SensorRATE:3',
    detector: 'duplicate-type',
    confidence: 'high',
    path: 'a/b.cs',
    line: 3,
    symbol: 'SensorRATE',
    message: 'example',
    citation: 'a/b.cs::SensorRATE',
    detail: { primaryPath: 'a/c.cs', primaryLine: 7, members: ['SensorRate', 'Model'] },
  }
  const html = render(createElement(ui.DriftList, {
    findings: [finding],
    onAccept: () => undefined,
    onCopy: () => undefined,
    onPromote: () => undefined,
    showLow: true,
  }))
  assert.match(html, /重复定义/)
  assert.match(html, /高/)
  assert.match(html, /a\/b\.cs:3/)
  assert.match(html, /登记为概念/)
  assert.match(html, /接受/)
})
// The settings card's rounded corners and the scrollbar inside it cannot be seen
// in a terminal, so its two layout rules are pinned here instead.
const stylesBundle = join(outdir, 'styles.mjs')
await build({
  entryPoints: [new URL('../src/client/styles.ts', import.meta.url).pathname],
  outfile: stylesBundle,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
})
const { PANEL_CSS } = await import(stylesBundle)

/** The declarations of one rule, by exact selector. */
function rule(css, selector) {
  const start = css.indexOf(selector + ' {')
  assert.ok(start >= 0, 'missing rule: ' + selector)
  return css.slice(start, css.indexOf('}', start))
}

test('the settings card clips its corners and scrolls only its body', () => {
  const card = rule(PANEL_CSS, '.sd-settings')
  assert.match(card, /overflow:\s*hidden/, 'a scrollbar on the card would run over its radius')
  assert.match(card, /padding:\s*0/, 'the title bar and the body own the padding')
  const body = rule(PANEL_CSS, '.sd-settings-body')
  assert.match(body, /overflow:\s*auto/)
  assert.match(body, /scrollbar-gutter:\s*stable/, 'a reserved gutter keeps the rows from shifting')
})

test('the light theme surface separates by border and keeps its text readable', () => {
  const dialog = rule(PANEL_CSS, '.sd-dialog')
  assert.match(dialog, /background:\s*var\(--dsw-alias-bg-base\)/, 'bg-overlay is a grey wash behind white rows in the light theme')
  assert.doesNotMatch(dialog, /background:\s*var\(--dsw-alias-bg-overlay\)/)
  assert.match(rule(PANEL_CSS, '.sd-setting-row'), /var\(--dsw-alias-border-l2\)/)
  assert.match(rule(PANEL_CSS, '.sd-number'), /var\(--dsw-alias-border-l2\)/)
  assert.match(rule(PANEL_CSS, '.sd-setting-hint'), /font-size:\s*12px/)
  const groupTitle = rule(PANEL_CSS, '.sd-settings-title')
  assert.match(groupTitle, /font-size:\s*12px/)
  assert.match(groupTitle, /font-weight:\s*600/)
  assert.doesNotMatch(groupTitle, /uppercase/)
  assert.match(rule(PANEL_CSS, '.sd-switch-track'), /border:\s*1px solid/, 'an off switch must be visible on a white page')
})

test('the required asterisk is a theme-derived dark red', () => {
  const mark = rule(PANEL_CSS, '.sd-required')
  assert.match(mark, /color:\s*var\(--dsw-alias-state-error-primary\)/, 'the fallback follows the theme error colour')
  assert.match(mark, /color-mix\(in srgb, var\(--dsw-alias-state-error-primary\)/, 'the visible colour deepens the theme red')
})

test('the saved confirmation is a footer badge, not a toast', () => {
  assert.match(
    PANEL_CSS,
    /\.sd-badge-warn,\s*\.sd-badge-success,\s*\.sd-badge-ghost \{[^}]*color:\s*#fff/,
    'success uses the same filled badge treatment as the state markers',
  )
  const success = rule(PANEL_CSS, '.sd-badge-success')
  assert.match(success, /background:\s*color-mix/, 'the saved badge has a deep success fill')
  assert.match(rule(PANEL_CSS, '.sd-footer-feedback'), /display:\s*inline-flex/)
  assert.doesNotMatch(PANEL_CSS, /\.sd-toast/, 'the toast channel is gone')
})

test('the prompt switch shares the styled toolbar tooltip', () => {
  assert.match(PANEL_CSS, /\.sd-announce\[data-tip\]:focus-within::after/, 'keyboard focus shows the same styled tip')
  assert.match(PANEL_CSS, /\.sd-announce\[data-tip\]::after \{\n  top:/, 'the tip is positioned below the switch')
})

test('the macOS header clears the window chrome', () => {
  const header = rule(PANEL_CSS, "[data-platform='darwin'] .sd-header")
  assert.match(
    header,
    /padding-top:\s*calc\(10px \+ var\(--dsh-frame-top-clearance, 0px\)\)/,
    'entry pages in the main panel pad below the traffic lights and sidebar controls',
  )
})

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
 * editor's validation feedback, the notice bar's controls and the tree's add
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
  id: 'archit.channel_num',
  terms: ['通道数'],
  kind: 'entity',
  canonical: { symbol: 'ChannelNUm', type: 'int' },
  note: '设备通道数',
}

const duplicateIssue = {
  code: 'symbol-duplicate',
  message: 'Canonical symbol `ChannelNUm` is already used by `concepts[2]`; one symbol can name only one concept.',
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
    initialId: 'archit.channel_num_2',
    initialSymbol: 'ChannelNUm',
    issues: [duplicateIssue],
    saving: false,
    onSave: () => undefined,
    onCancel: () => undefined,
  }))
  assert.match(html, /规范符号重复/, 'the localized headline must be rendered')
  assert.match(html, /already used by/, 'the host sentence carries the concrete characters')
  assert.match(html, /concepts\[4\]\.canonical\.symbol/, 'the document path must be shown')
  assert.match(html, /line 21/, 'the line must be shown')
  assert.match(html, /ChannelNUm/)
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
  assert.match(html, /archit\.channel_num/)
})

test('the notice puts the close control last, aligns it, and lists issues', () => {
  const html = render(createElement(ui.Notice, {
    notice: { kind: 'error', text: '保存失败：词表校验未通过', issues: [duplicateIssue] },
    onDismiss: () => undefined,
  }))
  assert.match(html, /sd-notice-close/, 'the close control must exist')
  assert.match(html, /规范符号重复/)
  const head = /<div class="sd-notice-head"[^>]*>(.*?)<\/div>/.exec(html)?.[1] ?? ''
  assert.match(head, /sd-notice-text[\s\S]*sd-notice-close/, 'text first, close last')
  assert.match(html, /双击关闭/, 'the dismiss hint must be in the tooltip')
})

test('a failed load offers a retry control', () => {
  const html = render(createElement(ui.Notice, {
    notice: { kind: 'error', text: '加载失败：连不上宿主进程' },
    onDismiss: () => undefined,
    onRetry: () => undefined,
  }))
  assert.match(html, /重试/)
})

test('the tree has a header add button and one per group', () => {
  const html = render(createElement(ui.ConceptTree, {
    concepts: [concept, { ...concept, id: 'device.state', canonical: { symbol: 'DeviceState' } }],
    selectedId: 'archit.channel_num',
    query: '',
    onQuery: () => undefined,
    filter: 'all',
    onFilter: () => undefined,
    driftCounts: new Map([['archit.channel_num', 3]]),
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
      expected: 'LanguageProvider',
      detail: { rule: 'contract-alias', base: 'ResourceProviderBase', members: ['ModuleName'], literals: { BaseFileName: ['Language'] } },
    }],
    onAccept: () => undefined,
    onCopy: () => undefined,
    showLow: true,
  }))
  assert.match(alias, /同一契约另一种命名/)
  assert.match(alias, /LanguageProvider/)
})

test('a finding row names its detector, confidence and actions', () => {
  const finding = {
    id: 'duplicate-type:a/b.cs:ChannelNUm:3',
    detector: 'duplicate-type',
    confidence: 'high',
    path: 'a/b.cs',
    line: 3,
    symbol: 'ChannelNUm',
    message: 'example',
    citation: 'a/b.cs::ChannelNUm',
    detail: { primaryPath: 'a/c.cs', primaryLine: 7, members: ['ChannelNum', 'Model'] },
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

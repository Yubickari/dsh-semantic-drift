import { strict as assert } from 'node:assert'
import test from 'node:test'

// `documentLanguage()` reads the document element, so the stub decides the locale.
Object.defineProperty(globalThis, 'document', {
  value: { documentElement: { lang: 'zh-CN' } },
  configurable: true,
})

const { dictionaries, maybeT, t, tf } = await import('../src/client/locales.ts')

test('both dictionaries carry exactly the same keys', () => {
  const zh = Object.keys(dictionaries.zh).sort()
  const en = Object.keys(dictionaries.en).sort()
  const missingInEn = zh.filter(key => !(key in dictionaries.en))
  const missingInZh = en.filter(key => !(key in dictionaries.zh))
  assert.deepEqual(missingInEn, [], `missing in en: ${missingInEn.join(', ')}`)
  assert.deepEqual(missingInZh, [], `missing in zh: ${missingInZh.join(', ')}`)
})

test('a Chinese document language renders Chinese copy', () => {
  assert.equal(t('tree.title'), '概念')
  assert.equal(t('action.accept'), '接受')
  assert.equal(t('notice.dismissHint'), '双击关闭')
})

test('host validation codes have a localized headline', () => {
  assert.equal(maybeT('issue.id-format'), '概念 id 格式不对：需形如 group.name')
  assert.equal(maybeT('issue.symbol-duplicate'), '规范符号重复：一个符号只能属于一个概念')
  assert.equal(maybeT('api.invalid-vocabulary'), '词表校验未通过')
  assert.equal(maybeT('issue.no-such-code'), undefined, 'unknown codes fall back to the host message')
})

test('an unknown host code is not turned into a key by accident', () => {
  assert.equal(maybeT(''), undefined)
  assert.equal(maybeT('workspace.label.extra'), undefined)
})

test('placeholders are substituted from the dictionary text', () => {
  assert.equal(tf('drift.sameMembers', { path: 'a/b.cs', count: 3 }), '与 a/b.cs 的 3 个成员完全一致')
  assert.equal(tf('drift.ruleDistance', { distance: 2 }), '编辑距离 2')
})

/**
 * Browser-side copy, in the two languages the panel ships with.
 *
 * The dictionaries are registered with the client locale service when it is
 * available (`ctx.locale.register`), and used directly otherwise, so the panel
 * follows the Language setting without a reload and still renders when the
 * locale plugin is absent.
 *
 * @module dsh-semantic-drift/client/locales
 */

const zh = {
  'entry.label': '语义',
  'panel.title': '语义词表',
  'panel.subtitle': '同一概念在代码里的不同写法',
  'action.rescan': '重新扫描',
  'action.new': '新建概念',
  'action.yaml': 'YAML',
  'action.done': '完成',
  'action.save': '保存',
  'action.cancel': '取消',
  'action.copy': '复制引用',
  'action.copyPath': '复制路径',
  'action.copied': '已复制',
  'action.accept': '接受',
  'action.edit': '编辑',
  'action.init': '创建词表',
  'action.close': '关闭',
  'search.placeholder': '搜索 id / 术语 / 符号',
  'filter.all': '全部',
  'filter.drift': '有漂移',
  'filter.clean': '无漂移',
  'tree.concepts': '概念',
  'tree.unclassified': '未归类',
  'tree.empty': '还没有概念',
  'tree.emptyHint': '先创建词表，再登记你项目里的业务概念。',
  'detail.empty': '从左侧选择一个概念。',
  'detail.terms': '术语',
  'detail.canonical': '规范写法',
  'detail.kind': '类型',
  'detail.note': '说明',
  'detail.accepted': '已接受的例外',
  'detail.drift': '漂移',
  'detail.noDrift': '没有发现漂移',
  'detail.unclassified': '未归类到概念的发现',
  'detail.unclassifiedHint': '这些发现没有对应的词表概念。把它们变成概念，或者接受它们。',
  'editor.titleNew': '新建概念',
  'editor.titleEdit': '编辑概念',
  'editor.id': '概念 id',
  'editor.idHint': '形如 device.target_temperature，小写字母与下划线',
  'editor.terms': '术语 / 别名',
  'editor.termsHint': '用逗号分隔，例如：目标温度, 设定温度',
  'editor.kind': '种类',
  'editor.symbol': '规范符号',
  'editor.symbolHint': '代码里的标识符，例如 TargetTemperature',
  'editor.type': '类型（可选）',
  'editor.unit': '单位（可选）',
  'editor.note': '说明（可选）',
  'editor.acceptedReason': '接受理由',
  'editor.acceptedReasonHint': '写清楚为什么这个写法可以保留',
  'raw.title': 'YAML 原文',
  'raw.hint': '保存前会完整校验；校验失败不会写入任何内容。',
  'scan.scanning': '扫描中…',
  'scan.emptyVocabulary': '词表还没有概念，但结构性问题仍然会被扫描出来。',
  'footer.concepts': '概念',
  'footer.drift': '漂移',
  'footer.files': '文件',
  'footer.time': '耗时',
  'footer.truncated': '结果已截断',
  'state.noWorkspace': '没有可用的工作区',
  'state.loadFailed': '加载失败',
  'state.scanFailed': '扫描失败',
  'state.saveFailed': '保存失败',
  'state.acceptFailed': '接受失败',
  'state.saved': '已保存',
  'state.accepted': '已接受',
  'confidence.high': '高',
  'confidence.medium': '中',
  'confidence.low': '低',
  'showLow': '显示低置信度',
  'detector.duplicate-type': '重复定义',
  'detector.contract-drift': '契约漂移',
  'detector.symbol-variant': '命名变体',
  'detector.term-unmapped': '术语未映射',
  'kind.entity': '实体',
  'kind.quantity': '数量',
  'kind.enum': '枚举',
  'kind.status': '状态',
  'kind.reference': '引用',
  'issue.title': '校验问题',
  'workspace.label': '工作区',
  'drift.sameMembers': '与 {path} 的 {count} 个成员完全一致',
  'drift.differFrom': '相对 {path}',
  'drift.missing': '缺少 {list}',
  'drift.extra': '多出 {list}',
  'drift.ruleNormalized': '忽略大小写与下划线后与规范写法相同',
  'drift.ruleConfusable': '已知拼写变体',
  'drift.ruleDistance': '编辑距离 {distance}',
  'drift.ruleCanonicalMissing': '术语「{term}」只出现在注释或字符串里，代码中没有规范符号',
  'drift.primary': '另一处定义',
}

const en: Record<keyof typeof zh, string> = {
  'entry.label': 'Semantics',
  'panel.title': 'Vocabulary',
  'panel.subtitle': 'One concept, several spellings',
  'action.rescan': 'Scan',
  'action.new': 'New concept',
  'action.yaml': 'YAML',
  'action.done': 'Done',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.copy': 'Copy reference',
  'action.copyPath': 'Copy path',
  'action.copied': 'Copied',
  'action.accept': 'Accept',
  'action.edit': 'Edit',
  'action.init': 'Create vocabulary',
  'action.close': 'Close',
  'search.placeholder': 'Search id, term or symbol',
  'filter.all': 'All',
  'filter.drift': 'With drift',
  'filter.clean': 'Clean',
  'tree.concepts': 'Concepts',
  'tree.unclassified': 'Unclassified',
  'tree.empty': 'No concepts yet',
  'tree.emptyHint': 'Create the vocabulary, then record the concepts your project already uses.',
  'detail.empty': 'Select a concept on the left.',
  'detail.terms': 'Terms',
  'detail.canonical': 'Canonical',
  'detail.kind': 'Kind',
  'detail.note': 'Note',
  'detail.accepted': 'Accepted exceptions',
  'detail.drift': 'Drift',
  'detail.noDrift': 'No drift found',
  'detail.unclassified': 'Findings without a concept',
  'detail.unclassifiedHint': 'These findings map to no vocabulary concept. Promote one, or accept it.',
  'editor.titleNew': 'New concept',
  'editor.titleEdit': 'Edit concept',
  'editor.id': 'Concept id',
  'editor.idHint': 'Like device.target_temperature: lowercase snake segments',
  'editor.terms': 'Terms and aliases',
  'editor.termsHint': 'Comma separated, e.g. target temperature, set point',
  'editor.kind': 'Kind',
  'editor.symbol': 'Canonical symbol',
  'editor.symbolHint': 'The identifier used in code, e.g. TargetTemperature',
  'editor.type': 'Type (optional)',
  'editor.unit': 'Unit (optional)',
  'editor.note': 'Note (optional)',
  'editor.acceptedReason': 'Reason',
  'editor.acceptedReasonHint': 'Why may this spelling stay?',
  'raw.title': 'Raw YAML',
  'raw.hint': 'The whole file is validated before saving; a failed validation writes nothing.',
  'scan.scanning': 'Scanning…',
  'scan.emptyVocabulary': 'The vocabulary has no concepts yet, but structural findings are still reported.',
  'footer.concepts': 'concepts',
  'footer.drift': 'findings',
  'footer.files': 'files',
  'footer.time': 'time',
  'footer.truncated': 'truncated',
  'state.noWorkspace': 'No workspace available',
  'state.loadFailed': 'Could not load',
  'state.scanFailed': 'Scan failed',
  'state.saveFailed': 'Save failed',
  'state.acceptFailed': 'Accept failed',
  'state.saved': 'Saved',
  'state.accepted': 'Accepted',
  'confidence.high': 'high',
  'confidence.medium': 'medium',
  'confidence.low': 'low',
  'showLow': 'Show low confidence',
  'detector.duplicate-type': 'duplicate definition',
  'detector.contract-drift': 'contract drift',
  'detector.symbol-variant': 'naming variant',
  'detector.term-unmapped': 'unmapped term',
  'kind.entity': 'entity',
  'kind.quantity': 'quantity',
  'kind.enum': 'enum',
  'kind.status': 'status',
  'kind.reference': 'reference',
  'issue.title': 'Validation issues',
  'workspace.label': 'Workspace',
  'drift.sameMembers': 'Identical to the {count} members at {path}',
  'drift.differFrom': 'Compared with {path}',
  'drift.missing': 'missing {list}',
  'drift.extra': 'extra {list}',
  'drift.ruleNormalized': 'same name after removing case and separators',
  'drift.ruleConfusable': 'known misspelling or abbreviation',
  'drift.ruleDistance': 'edit distance {distance}',
  'drift.ruleCanonicalMissing': 'the term "{term}" appears in comments or strings, but the canonical symbol appears nowhere in code',
  'drift.primary': 'other definition',
}

export type MessageKey = keyof typeof zh

let translate: ((key: MessageKey) => string) | undefined

/** Called once with the locale service's binder, when that service exists. */
export function setTranslator(binder: ((key: MessageKey) => string) | undefined): void {
  translate = binder
}

/** Document language, used when no locale service is bound. */
function documentLanguage(): 'zh' | 'en' {
  const lang = typeof document === 'undefined' ? 'en' : document.documentElement.lang
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** Translate one key. */
export function t(key: MessageKey): string {
  if (translate !== undefined) {
    try {
      const value = translate(key)
      if (typeof value === 'string' && value !== '' && value !== key) return value
    } catch {
      // Fall through to the built-in dictionaries.
    }
  }
  const dictionary = documentLanguage() === 'zh' ? zh : en
  return dictionary[key] ?? key
}

/** Translate one key and substitute `{name}` placeholders. */
export function tf(key: MessageKey, params: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  )
}

/** Dictionaries registered with the client locale service. */
export const dictionaries = { zh, en }

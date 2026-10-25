/**
 * The scope picker shared by "accept" and "edit exception".
 *
 * One component means one definition of "how many findings would this scope
 * mute", which is the number the user actually decides with: a glob that covers
 * nine sites and one that covers one are different decisions, and the dialog has
 * to say which is which before the write happens.
 *
 * @module dsh-semantic-drift/client/ScopeSelect
 */

import type { DriftFinding } from '../protocol.ts'
import { matchesGlob } from '../glob.ts'
import { tf } from './locales.ts'
import { t } from './locales.ts'

/** The four ways to scope an exception. */
export type ScopeKind = 'file' | 'family' | 'symbol' | 'custom'

/** A chosen scope. `custom` is only read when `kind === 'custom'`. */
export interface ScopeValue {
  kind: ScopeKind
  custom: string
}

/** The glob a scope produces for one anchor path; `undefined` means "everywhere". */
export function scopePathFor(anchor: string, value: ScopeValue): string | undefined {
  if (value.kind === 'symbol') return undefined
  if (value.kind === 'file') return anchor === '' ? undefined : anchor
  if (value.kind === 'family') {
    const name = anchor.split('/').at(-1) ?? ''
    return name === '' ? undefined : `**/${name}`
  }
  const trimmed = value.custom.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Findings a scope would mute: same symbol, matching path. */
export function coveredBy(findings: readonly DriftFinding[], symbol: string, path: string | undefined): DriftFinding[] {
  return findings.filter(finding => finding.symbol === symbol && matchesGlob(path, finding.path))
}

/** The scope an existing exception's glob corresponds to. */
export function scopeFromPath(path: string | undefined, sample: string): ScopeValue {
  if (path === undefined || path === '') return { kind: 'symbol', custom: '' }
  const family = sample === '' ? undefined : `**/${sample.split('/').at(-1) ?? ''}`
  if (family !== undefined && path === family) return { kind: 'family', custom: '' }
  if (/[*?[\]]/.test(path)) return { kind: 'custom', custom: path }
  return { kind: 'file', custom: '' }
}

/** Props of the scope picker. */
export interface ScopeSelectProps {
  /** Anchor path: the finding's file for an accept, the exception's glob for an edit. */
  anchor: string
  /** Symbol whose findings the scope would mute. */
  symbol: string
  findings: readonly DriftFinding[]
  value: ScopeValue
  onChange: (value: ScopeValue) => void
  /** The exception's current scope, so an edit can say what changes. */
  originalPath?: string
}

export function ScopeSelect(props: ScopeSelectProps) {
  const current = scopePathFor(props.anchor, props.value)
  const covered = coveredBy(props.findings, props.symbol, current)
  const original = props.originalPath === undefined
    ? undefined
    : coveredBy(props.findings, props.symbol, props.originalPath).length
  const kinds: ScopeKind[] = props.anchor === '' ? ['symbol', 'custom'] : ['file', 'family', 'symbol', 'custom']
  return (
    <div className="sd-field" style={{ gap: 5 }}>
      <span className="sd-label">{t('accept.scope')}</span>
      <div className="sd-scope">
        {kinds.map(kind => (
          <label key={kind} className="sd-scope-option" data-active={props.value.kind === kind}>
            <input
              type="radio"
              name="sd-accept-scope"
              checked={props.value.kind === kind}
              onChange={() => props.onChange({ ...props.value, kind })}
            />
            <span>{t(`accept.scope.${kind}`)}</span>
            <span className="sd-scope-count">
              {coveredBy(props.findings, props.symbol, scopePathFor(props.anchor, { kind, custom: props.value.custom })).length}
            </span>
          </label>
        ))}
      </div>
      {props.value.kind === 'custom' && (
        <input
          id="sd-scope-custom"
          className="sd-input sd-mono"
          value={props.value.custom}
          placeholder="**/Common/LanguageProvider.cs"
          onChange={event => props.onChange({ ...props.value, custom: event.target.value })}
          spellCheck={false}
        />
      )}
      <span className="sd-hint">
        {tf('accept.covers', { count: covered.length })}
        {original !== undefined && original !== covered.length ? `（${tf('accept.coversBefore', { count: original })}）` : ''}
      </span>
      {covered.length > 1 && (
        <div className="sd-pathlist">
          {covered.slice(0, 6).map(finding => (
            <div key={finding.id}>{finding.path}:{finding.line}</div>
          ))}
          {covered.length > 6 && <div>… {covered.length - 6}</div>}
        </div>
      )}
    </div>
  )
}

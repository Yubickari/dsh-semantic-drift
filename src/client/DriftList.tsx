/**
 * One concept's drift: the findings that mention it, plus the evidence each one
 * carries.
 *
 * A row always names its detector and its confidence: without those two facts a
 * reader cannot decide whether to trust a finding, which is the difference
 * between a report and a wall of warnings.
 *
 * @module dsh-semantic-drift/client/DriftList
 */

import type { DriftFinding } from '../protocol.ts'
import { t, tf } from './locales.ts'
import { CheckIcon, CopyIcon } from './icons.tsx'

/** Props of the drift list. */
export interface DriftListProps {
  findings: readonly DriftFinding[]
  onAccept: (finding: DriftFinding) => void
  onCopy: (text: string) => void
  /** Whether low-confidence findings are rendered. */
  showLow: boolean
  /** Empty-state copy key. */
  emptyKey?: 'detail.noDrift' | 'detail.unclassifiedHint'
}

function listOf(values: readonly string[] | undefined, limit = 8): string {
  if (values === undefined || values.length === 0) return '—'
  return values.slice(0, limit).join(', ') + (values.length > limit ? ', …' : '')
}

/** The evidence line under a finding. */
export function findingNote(finding: DriftFinding): string {
  const primary = finding.detail.primaryPath ?? ''
  switch (finding.detector) {
    case 'duplicate-type':
      return tf('drift.sameMembers', { path: primary, count: finding.detail.members?.length ?? 0 })
    case 'contract-drift': {
      const parts = [tf('drift.differFrom', { path: primary })]
      if ((finding.detail.missing?.length ?? 0) > 0) parts.push(tf('drift.missing', { list: listOf(finding.detail.missing) }))
      if ((finding.detail.extra?.length ?? 0) > 0) parts.push(tf('drift.extra', { list: listOf(finding.detail.extra) }))
      return parts.join(' · ')
    }
    case 'symbol-variant':
      if (finding.detail.rule === 'normalized') return t('drift.ruleNormalized')
      if (finding.detail.rule === 'confusable') return t('drift.ruleConfusable')
      return tf('drift.ruleDistance', { distance: finding.detail.distance ?? 0 })
    case 'term-unmapped':
      return tf('drift.ruleCanonicalMissing', { term: finding.detail.term ?? '' })
    default:
      return finding.message
  }
}

export function DriftList(props: DriftListProps) {
  const visible = props.findings.filter(finding => props.showLow || finding.confidence !== 'low')
  if (visible.length === 0) {
    return (
      <div className="sd-muted" style={{ padding: '6px 0' }}>
        {t(props.emptyKey ?? 'detail.noDrift')}
      </div>
    )
  }
  return (
    <div className="sd-drift">
      {visible.map(finding => (
        <div className="sd-drift-row" key={finding.id}>
          <span className="sd-confidence" data-level={finding.confidence}>
            {t(`confidence.${finding.confidence}`)}
          </span>
          <div className="sd-drift-main">
            <div className="sd-drift-head">
              <span className="sd-mono sd-muted">{t(`detector.${finding.detector}`)}</span>
              <span className="sd-drift-symbol">{finding.symbol}</span>
              {finding.expected !== undefined && finding.expected !== finding.symbol && (
                <>
                  <span className="sd-muted">→</span>
                  <span className="sd-drift-expected">{finding.expected}</span>
                </>
              )}
            </div>
            <div className="sd-drift-path">
              {finding.path}:{finding.line}
            </div>
            <div className="sd-drift-note">{findingNote(finding)}</div>
          </div>
          <div className="sd-drift-actions">
            <button
              type="button"
              className="sd-button sd-button-ghost"
              title={t('action.copy')}
              onClick={() => props.onCopy(finding.citation)}
            >
              <CopyIcon />
            </button>
            <button
              type="button"
              className="sd-button sd-button-ghost"
              title={t('action.accept')}
              onClick={() => props.onAccept(finding)}
            >
              <CheckIcon />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Right column: one concept and its drift.
 *
 * Read-only by default: every mutation goes through the editor (a form or the
 * raw YAML), so there is exactly one place that can produce a document, and one
 * place that reports validation issues.
 *
 * @module dsh-semantic-drift/client/ConceptDetail
 */

import type { AcceptedException, Concept, DriftFinding } from '../protocol.ts'
import { t, tf } from './locales.ts'
import { DriftList } from './DriftList.tsx'
import { EditIcon, TrashIcon } from './icons.tsx'

/** Props of the detail pane. */
export interface ConceptDetailProps {
  concept: Concept | undefined
  findings: readonly DriftFinding[]
  showLow: boolean
  onEdit: (concept: Concept) => void
  /** Ask for confirmation before removing the concept from the vocabulary. */
  onDelete: (concept: Concept) => void
  /** Change one accepted exception's scope or reason. */
  onEditException: (concept: Concept, index: number) => void
  /** Remove one accepted exception, after confirmation. */
  onRemoveException: (concept: Concept, index: number) => void
  /** Remove every accepted exception of the concept, after confirmation. */
  onClearExceptions: (concept: Concept) => void
  /**
   * How many findings one accepted exception currently mutes. Reported by the
   * host's scan, because the muted findings are not in the visible list.
   */
  muteCount: (concept: Concept, index: number) => number
  onAccept: (finding: DriftFinding) => void
  onCopy: (text: string) => void
}

/** The empty right column: no concept selected. */
export function EmptyDetail() {
  return (
    <div className="sd-empty">
      <div className="sd-empty-title">{t('detail.empty')}</div>
    </div>
  )
}

export function ConceptDetail(props: ConceptDetailProps) {
  const { concept } = props
  if (concept === undefined) return <EmptyDetail />
  const conceptFindings = props.findings.filter(finding => finding.conceptId === concept.id)
  return (
    <div>
      <div className="sd-concept-title">
        <span className="sd-concept-id sd-mono">{concept.id}</span>
        <span className="sd-tag">{t(`kind.${concept.kind}`)}</span>
        <span className="sd-spacer" />
        <button type="button" className="sd-button" onClick={() => props.onEdit(concept)}>
          <EditIcon />
          {t('action.edit')}
        </button>
        <button
          type="button"
          className="sd-button sd-button-danger"
          title={t('delete.title')}
          onClick={() => props.onDelete(concept)}
        >
          <TrashIcon />
          {t('action.delete')}
        </button>
      </div>

      <div className="sd-section">
        <div className="sd-kv">
          <div className="sd-kv-key">{t('detail.canonical')}</div>
          <div className="sd-kv-value">
            <span className="sd-code">{concept.canonical.symbol}</span>
            {concept.canonical.type !== undefined && <span className="sd-muted"> · {concept.canonical.type}</span>}
            {concept.canonical.unit !== undefined && <span className="sd-muted"> · {concept.canonical.unit}</span>}
          </div>
          <div className="sd-kv-key">{t('detail.terms')}</div>
          <div className="sd-kv-value">
            {concept.terms.map(term => (
              <span className="sd-tag" key={term}>{term}</span>
            ))}
          </div>
          {concept.note !== undefined && (
            <>
              <div className="sd-kv-key">{t('detail.note')}</div>
              <div className="sd-kv-value">{concept.note}</div>
            </>
          )}
        </div>
      </div>

      {(concept.accepted ?? []).length > 0 && (
        <div className="sd-section">
          <div className="sd-spread" style={{ marginBottom: 8 }}>
            <div className="sd-section-title" style={{ margin: 0 }}>
              {t('detail.accepted')} ({(concept.accepted ?? []).length})
            </div>
            {(concept.accepted ?? []).length > 1 && (
              <button
                type="button"
                className="sd-button sd-button-ghost"
                onClick={() => props.onClearExceptions(concept)}
              >
                {t('action.clearAll')}
              </button>
            )}
          </div>
          <div className="sd-drift">
            {(concept.accepted ?? []).map((exception, index) => (
              <div className="sd-drift-row" key={`${exception.symbol}-${index}`}>
                <div className="sd-drift-main">
                  <div className="sd-drift-head">
                    <span className="sd-drift-symbol">{exception.symbol}</span>
                    <span className="sd-mono sd-muted">{exception.path === undefined ? '**' : exception.path}</span>
                  </div>
                  <div className="sd-drift-note">{exception.reason}</div>
                  <div className="sd-meta">
                    {props.muteCount(concept, index) === 0
                      ? t('detail.mutesZero')
                      : tf('detail.mutes', { count: props.muteCount(concept, index) })}
                  </div>
                </div>
                <div className="sd-row-actions">
                  <button
                    type="button"
                    className="sd-button sd-button-ghost"
                    title={t('action.edit')}
                    aria-label={`${t('action.edit')} ${exception.symbol} ${exception.path ?? '**'}`}
                    onClick={() => props.onEditException(concept, index)}
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    className="sd-button sd-button-ghost"
                    title={t('action.remove')}
                    aria-label={`${t('action.remove')} ${exception.symbol} ${exception.path ?? '**'}`}
                    onClick={() => props.onRemoveException(concept, index)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sd-section">
        <div className="sd-spread" style={{ marginBottom: 8 }}>
          <div className="sd-section-title" style={{ margin: 0 }}>
            {t('detail.drift')} {conceptFindings.length > 0 ? `(${conceptFindings.length})` : ''}
          </div>
        </div>
        <DriftList
          findings={conceptFindings}
          onAccept={props.onAccept}
          onCopy={props.onCopy}
          showLow={props.showLow}
        />
      </div>
    </div>
  )
}

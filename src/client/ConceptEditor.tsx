/**
 * Concept form (M2).
 *
 * The form never guesses: it sends the document it believes in, and the host
 * validates the whole file before writing. Any issue comes back with a line or a
 * document path and is rendered next to the form, so a refused save explains
 * itself instead of failing silently.
 *
 * Required fields carry a dark-red asterisk and `aria-required` rather than the
 * native `required` attribute: the host owns validation, and a browser bubble
 * would replace the positioned issues rendered here.
 *
 * @module dsh-semantic-drift/client/ConceptEditor
 */

import { useState } from 'react'
import { CONCEPT_KINDS } from '../protocol.ts'
import type { Concept, ConceptKind, ValidationIssue } from '../protocol.ts'
import { IssueList } from './IssueList.tsx'
import { t } from './locales.ts'

/** The asterisk that marks a required field; the control carries `aria-required`. */
function RequiredMark() {
  return (
    <span className="sd-required" aria-hidden="true" title={t('editor.required')}>*</span>
  )
}

/** Props of the concept form. */
export interface ConceptEditorProps {
  /** Existing concept to edit, or `undefined` for a new one. */
  concept: Concept | undefined
  /** Pre-filled id for a new concept (the tree's group add uses `<group>.`). */
  initialId?: string
  /** Pre-filled canonical symbol for a new concept (a promoted finding uses it). */
  initialSymbol?: string
  /** Issues from the last failed save. */
  issues: readonly ValidationIssue[]
  saving: boolean
  onSave: (concept: Concept) => void
  onCancel: () => void
}

export function ConceptEditor(props: ConceptEditorProps) {
  const [id, setId] = useState(props.concept?.id ?? props.initialId ?? '')
  const [terms, setTerms] = useState((props.concept?.terms ?? []).join(', '))
  const [kind, setKind] = useState<ConceptKind>(props.concept?.kind ?? 'entity')
  const [symbol, setSymbol] = useState(props.concept?.canonical.symbol ?? props.initialSymbol ?? '')
  const [symbolType, setSymbolType] = useState(props.concept?.canonical.type ?? '')
  const [unit, setUnit] = useState(props.concept?.canonical.unit ?? '')
  const [note, setNote] = useState(props.concept?.note ?? '')

  const submit = (event: { preventDefault(): void }) => {
    event.preventDefault()
    const parsedTerms = terms
      .split(/[,，]/)
      .map(term => term.trim())
      .filter(term => term !== '')
    const concept: Concept = {
      id: id.trim(),
      terms: parsedTerms,
      kind,
      canonical: {
        symbol: symbol.trim(),
        ...(symbolType.trim() === '' ? {} : { type: symbolType.trim() }),
        ...(unit.trim() === '' ? {} : { unit: unit.trim() }),
      },
      ...(note.trim() === '' ? {} : { note: note.trim() }),
      ...(props.concept?.accepted === undefined ? {} : { accepted: props.concept.accepted }),
    }
    props.onSave(concept)
  }

  return (
    <form className="sd-form" onSubmit={submit}>
      <div className="sd-section-title" style={{ margin: 0 }}>
        {props.concept === undefined ? t('editor.titleNew') : t('editor.titleEdit')}
      </div>

      <div className="sd-field">
        <label className="sd-label" htmlFor="sd-id">{t('editor.id')} <RequiredMark /></label>
        <input
          id="sd-id"
          className="sd-input sd-mono"
          value={id}
          onChange={event => setId(event.target.value)}
          placeholder="device.target_temperature"
          disabled={props.concept !== undefined}
          spellCheck={false}
          aria-required="true"
        />
        <span className="sd-hint">{t('editor.idHint')}</span>
      </div>

      <div className="sd-field">
        <label className="sd-label" htmlFor="sd-terms">{t('editor.terms')} <RequiredMark /></label>
        <input
          id="sd-terms"
          className="sd-input"
          value={terms}
          onChange={event => setTerms(event.target.value)}
          placeholder="目标温度, 设定温度"
          aria-required="true"
        />
        <span className="sd-hint">{t('editor.termsHint')}</span>
      </div>

      <div className="sd-row">
        <div className="sd-field">
          <label className="sd-label" htmlFor="sd-kind">{t('editor.kind')} <RequiredMark /></label>
          <select
            id="sd-kind"
            className="sd-select"
            value={kind}
            onChange={event => setKind(event.target.value as ConceptKind)}
            style={{ maxWidth: 'none', width: '100%' }}
            aria-required="true"
          >
            {CONCEPT_KINDS.map(value => (
              <option key={value} value={value}>{t(`kind.${value}`)}</option>
            ))}
          </select>
        </div>
        <div className="sd-field">
          <label className="sd-label" htmlFor="sd-unit">{t('editor.unit')}</label>
          <input
            id="sd-unit"
            className="sd-input"
            value={unit}
            onChange={event => setUnit(event.target.value)}
            placeholder="°C"
          />
        </div>
      </div>

      <div className="sd-row">
        <div className="sd-field">
          <label className="sd-label" htmlFor="sd-symbol">{t('editor.symbol')} <RequiredMark /></label>
          <input
            id="sd-symbol"
            className="sd-input sd-mono"
            value={symbol}
            onChange={event => setSymbol(event.target.value)}
            placeholder="TargetTemperature"
            spellCheck={false}
            aria-required="true"
          />
          <span className="sd-hint">{t('editor.symbolHint')}</span>
        </div>
        <div className="sd-field">
          <label className="sd-label" htmlFor="sd-type">{t('editor.type')}</label>
          <input
            id="sd-type"
            className="sd-input"
            value={symbolType}
            onChange={event => setSymbolType(event.target.value)}
            placeholder="double"
          />
        </div>
      </div>

      <div className="sd-field">
        <label className="sd-label" htmlFor="sd-note">{t('editor.note')}</label>
        <textarea
          id="sd-note"
          className="sd-textarea"
          value={note}
          rows={2}
          onChange={event => setNote(event.target.value)}
        />
      </div>

      {props.issues.length > 0 && (
        <>
          <div className="sd-section-title" style={{ margin: 0 }}>{t('issue.title')}</div>
          <IssueList issues={props.issues} />
        </>
      )}

      <div className="sd-form-actions">
        <button type="submit" className="sd-button sd-button-primary" disabled={props.saving}>
          {t('action.save')}
        </button>
        <button type="button" className="sd-button" onClick={props.onCancel} disabled={props.saving}>
          {t('action.cancel')}
        </button>
      </div>
    </form>
  )
}

/**
 * Raw YAML editor (M2).
 *
 * The textarea shows the file exactly as it is on disk; saving validates the
 * whole thing and writes it unchanged, so a hand edit keeps its formatting. A
 * failed validation writes nothing — the store refuses before the write.
 *
 * @module dsh-semantic-drift/client/RawEditor
 */

import { useState } from 'react'
import type { ValidationIssue } from '../protocol.ts'
import { IssueList } from './IssueList.tsx'
import { t } from './locales.ts'

/** Props of the raw editor. */
export interface RawEditorProps {
  text: string
  issues: readonly ValidationIssue[]
  saving: boolean
  onSave: (text: string) => void
  onCancel: () => void
}

export function RawEditor(props: RawEditorProps) {
  const [text, setText] = useState(props.text)
  return (
    <div className="sd-raw">
      <div className="sd-spread">
        <div className="sd-section-title" style={{ margin: 0 }}>{t('raw.title')}</div>
        <div className="sd-hint">{t('raw.hint')}</div>
      </div>
      <textarea
        className="sd-textarea"
        value={text}
        onChange={event => setText(event.target.value)}
        spellCheck={false}
        rows={18}
      />
      {props.issues.length > 0 && (
        <>
          <div className="sd-section-title" style={{ margin: 0 }}>{t('issue.title')}</div>
          <IssueList issues={props.issues} />
        </>
      )}
      <div className="sd-form-actions">
        <button
          type="button"
          className="sd-button sd-button-primary"
          disabled={props.saving}
          onClick={() => props.onSave(text)}
        >
          {t('action.save')}
        </button>
        <button type="button" className="sd-button" onClick={props.onCancel} disabled={props.saving}>
          {t('action.cancel')}
        </button>
      </div>
    </div>
  )
}

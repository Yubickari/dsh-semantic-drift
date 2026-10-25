/**
 * The one-line feedback bar above the panel body.
 *
 * It is sticky on purpose: the reason a save failed must stay visible while the
 * reader scrolls to the field that caused it. Double-clicking anywhere on the bar
 * dismisses it; the close control sits at the right edge and says so.
 *
 * @module dsh-semantic-drift/client/Notice
 */

import type { ValidationIssue } from '../protocol.ts'
import { IssueList } from './IssueList.tsx'
import { CloseIcon, RefreshIcon } from './icons.tsx'
import { t } from './locales.ts'

/** One piece of feedback. */
export interface NoticeValue {
  kind: 'success' | 'error'
  text: string
  issues?: readonly ValidationIssue[]
}

/** Props of the notice bar. */
export interface NoticeProps {
  notice: NoticeValue
  onDismiss: () => void
  /** Shown as a retry control when the panel could not load at all. */
  onRetry?: () => void
}

export function Notice({ notice, onDismiss, onRetry }: NoticeProps) {
  const multiline = notice.text.length > 80
  return (
    <div
      className="sd-notice"
      data-kind={notice.kind}
      title={t('notice.dismissHint')}
      onDoubleClick={onDismiss}
    >
      <div className="sd-notice-head" data-multiline={multiline}>
        <span className="sd-notice-text">{notice.text}</span>
        {onRetry !== undefined && (
          <button
            type="button"
            className="sd-button sd-button-ghost"
            title={t('action.retry')}
            onClick={onRetry}
          >
            <RefreshIcon />
            {t('action.retry')}
          </button>
        )}
        <button
          type="button"
          className="sd-button sd-button-ghost sd-notice-close"
          title={`${t('action.close')} · ${t('notice.dismissHint')}`}
          aria-label={t('action.close')}
          onClick={onDismiss}
        >
          <CloseIcon />
        </button>
      </div>
      {notice.issues !== undefined && notice.issues.length > 0 && <IssueList issues={notice.issues} limit={6} />}
    </div>
  )
}

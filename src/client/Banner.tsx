/**
 * Persistent, page-level feedback.
 *
 * A banner explains a state that outlives one action: nothing scanned yet, an
 * invalid vocabulary, or an operation that failed without a form to point at.
 * A banner is not a toast: it stays until the state changes, or until the reader
 * dismisses an operation error with its close control.
 *
 * @module dsh-semantic-drift/client/Banner
 */

import type { ReactNode } from 'react'
import { CloseIcon } from './icons.tsx'
import { t } from './locales.ts'

/** Props of a persistent banner. */
export interface BannerProps {
  kind?: 'info' | 'error'
  /** Extra layout class, e.g. `sd-banner-detail` for the detail pane. */
  className?: string
  children: ReactNode
  /** One control that resolves the state, e.g. Rescan or YAML. */
  action?: ReactNode
  /** When set, the banner gets a close control and can be dismissed. */
  onDismiss?: () => void
}

export function Banner({ kind = 'info', className, children, action, onDismiss }: BannerProps) {
  const hasAction = action !== undefined || onDismiss !== undefined
  return (
    <div
      className={className === undefined ? 'sd-banner' : `sd-banner ${className}`}
      data-kind={kind}
      role={kind === 'error' ? 'alert' : undefined}
    >
      <div className="sd-banner-body">{children}</div>
      {hasAction && (
        <div className="sd-banner-action">
          {action}
          {onDismiss !== undefined && (
            <button
              type="button"
              className="sd-button sd-button-icon"
              title={t('action.close')}
              aria-label={t('action.close')}
              onClick={onDismiss}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

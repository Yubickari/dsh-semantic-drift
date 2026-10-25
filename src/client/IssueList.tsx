/**
 * Validation issues, rendered the way the panel shows them everywhere.
 *
 * The host reports issues in English with a stable `code`; the panel shows a
 * localized headline for that code and keeps the host's own sentence underneath,
 * because that sentence carries the concrete value (the offending id, the two
 * symbols that clash). Translating the headline but not the detail keeps the
 * message both readable and precise.
 *
 * @module dsh-semantic-drift/client/IssueList
 */

import type { ValidationIssue } from '../protocol.ts'
import { maybeT } from './locales.ts'

/** Props of the issue list. */
export interface IssueListProps {
  issues: readonly ValidationIssue[]
  /** Show at most this many; the rest is summarized as a count. */
  limit?: number
}

export function IssueList({ issues, limit }: IssueListProps) {
  if (issues.length === 0) return null
  const shown = limit === undefined ? issues : issues.slice(0, limit)
  const omitted = issues.length - shown.length
  return (
    <div className="sd-issues">
      {shown.map((issue, index) => {
        const headline = maybeT(`issue.${issue.code}`)
        return (
          <div className="sd-issue" data-severity={issue.severity} key={`${issue.code}-${index}`}>
            {headline === undefined
              ? <div>{issue.message}</div>
              : (
                  <>
                    <div className="sd-issue-title">{headline}</div>
                    <div className="sd-issue-original">{issue.message}</div>
                  </>
                )}
            {(issue.line !== undefined || issue.path !== undefined) && (
              <div className="sd-issue-where">
                {issue.line === undefined ? '' : `line ${issue.line}${issue.column === undefined ? '' : `:${issue.column}`} · `}
                {issue.path ?? ''}
              </div>
            )}
          </div>
        )
      })}
      {omitted > 0 && <div className="sd-hint">… {omitted}</div>}
    </div>
  )
}

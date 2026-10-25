/**
 * The panel: one workspace's vocabulary on the left, the selected concept and
 * its drift on the right.
 *
 * State that belongs to the file lives on the host. This component owns only
 * view state (selection, search, filter, open editor) plus the last scan result,
 * which is deliberately not persisted anywhere: a report that outlives the code
 * it describes is a lie.
 *
 * @module dsh-semantic-drift/client/Panel
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Concept, DriftFinding, ScanResponse, StateResponse, ValidationIssue } from '../protocol.ts'
import { acceptException, ApiError, fetchState, initVocabulary, runScan, saveDocument, saveRaw } from './api.ts'
import { ConceptDetail, EmptyDetail } from './ConceptDetail.tsx'
import { ConceptEditor } from './ConceptEditor.tsx'
import { ConceptTree } from './ConceptTree.tsx'
import { DriftList } from './DriftList.tsx'
import { RawEditor } from './RawEditor.tsx'
import { t } from './locales.ts'
import { CodeIcon, PlusIcon, RefreshIcon } from './icons.tsx'
import { PANEL_CSS } from './styles.ts'

/** Standard props the shell passes to a `main` entry. Both are optional so a
 * shell build without them still renders the panel against the default workspace. */
export interface PanelProps {
  useSessions?: (selector: (snapshot: unknown) => unknown) => unknown
  useWorkspaces?: (selector: (snapshot: unknown) => unknown) => unknown
}

type Selection = { kind: 'concept'; id: string } | { kind: 'unclassified' } | { kind: 'none' }

type View = { kind: 'browse' } | { kind: 'edit'; concept: Concept | undefined } | { kind: 'raw' }

interface Notice {
  kind: 'success' | 'error'
  text: string
  issues?: readonly ValidationIssue[]
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : String(error)
}

function issuesOf(error: unknown): readonly ValidationIssue[] {
  return error instanceof ApiError ? error.issues : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Current session directory from the sessions snapshot, when it exposes one. */
function sessionDirectory(snapshot: unknown): string | undefined {
  if (!isRecord(snapshot)) return undefined
  const current = snapshot.current
  const byId = snapshot.byId
  if (typeof current !== 'string' || !isRecord(byId)) return undefined
  const entry = byId[current]
  if (!isRecord(entry)) return undefined
  return typeof entry.cwd === 'string' && entry.cwd !== '' ? entry.cwd : undefined
}

/** First workspace path from the workspaces snapshot, when it exposes one. */
function workspaceDirectory(snapshot: unknown): string | undefined {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.items)) return undefined
  for (const item of snapshot.items) {
    if (isRecord(item) && typeof item.path === 'string' && item.path !== '') return item.path
  }
  return undefined
}

/** Call one shell selector hook defensively. */
function readSnapshot(hook: PanelProps['useSessions']): unknown {
  if (typeof hook !== 'function') return undefined
  try {
    return hook((snapshot: unknown) => snapshot)
  } catch {
    return undefined
  }
}

function severityOf(issues: readonly ValidationIssue[]): 'error' | 'warning' | 'none' {
  if (issues.some(issue => issue.severity === 'error')) return 'error'
  return issues.length > 0 ? 'warning' : 'none'
}

export function SemanticPanel(props: PanelProps) {
  // The shell's selector hooks must run in a fixed order, so each is called from
  // the same place on every render; a shell that does not serve one yields
  // undefined and the panel falls back to the Host's default workspace. A hook
  // that throws is caught here rather than taking the whole panel down: the
  // workspace selector in the header remains a reliable way to pick one.
  const sessionsSnapshot = readSnapshot(props.useSessions)
  const workspacesSnapshot = readSnapshot(props.useWorkspaces)
  const suggested = sessionDirectory(sessionsSnapshot) ?? workspaceDirectory(workspacesSnapshot)

  const [requested, setRequested] = useState<string | undefined>(undefined)
  const [state, setState] = useState<StateResponse | null>(null)
  const [scan, setScan] = useState<ScanResponse | null>(null)
  const [selection, setSelection] = useState<Selection>({ kind: 'none' })
  const [view, setView] = useState<View>({ kind: 'browse' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'drift' | 'clean'>('all')
  const [showLow, setShowLow] = useState(false)
  const [busy, setBusy] = useState<'load' | 'scan' | 'save' | 'accept' | 'init' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editorIssues, setEditorIssues] = useState<readonly ValidationIssue[]>([])
  const [acceptTarget, setAcceptTarget] = useState<DriftFinding | null>(null)
  const [acceptReason, setAcceptReason] = useState('')

  const effectivePath = state?.workspace.path

  const load = useCallback(async (path: string | undefined) => {
    setBusy('load')
    try {
      const next = await fetchState(path)
      setState(next)
      setNotice(current => (current?.kind === 'error' ? null : current))
    } catch (error) {
      setNotice({ kind: 'error', text: `${t('state.loadFailed')}: ${messageOf(error)}`, issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [])

  const scanPath = useCallback(async (path: string) => {
    setBusy('scan')
    try {
      setScan(await runScan(path))
    } catch (error) {
      setNotice({ kind: 'error', text: `${t('state.scanFailed')}: ${messageOf(error)}`, issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void load(requested ?? suggested)
  }, [requested, suggested, load])

  useEffect(() => {
    if (effectivePath === undefined) return
    void scanPath(effectivePath)
  }, [effectivePath, scanPath])

  const vocabulary = state?.vocabulary
  const concepts = vocabulary?.document.concepts ?? []
  const findings = useMemo(() => scan?.summary.findings ?? [], [scan])

  const visibleCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const finding of findings) {
      if (!showLow && finding.confidence === 'low') continue
      if (finding.conceptId === undefined) continue
      counts.set(finding.conceptId, (counts.get(finding.conceptId) ?? 0) + 1)
    }
    return counts
  }, [findings, showLow])

  const unclassified = useMemo(() => {
    const known = new Set(concepts.map(concept => concept.id))
    return findings.filter(finding =>
      (finding.conceptId === undefined || !known.has(finding.conceptId))
      && (showLow || finding.confidence !== 'low'),
    )
  }, [findings, concepts, showLow])

  const filteredConcepts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return concepts.filter(concept => {
      if (filter === 'drift' && (visibleCounts.get(concept.id) ?? 0) === 0) return false
      if (filter === 'clean' && (visibleCounts.get(concept.id) ?? 0) > 0) return false
      if (needle === '') return true
      return concept.id.toLowerCase().includes(needle)
        || concept.canonical.symbol.toLowerCase().includes(needle)
        || concept.terms.some(term => term.toLowerCase().includes(needle))
    })
  }, [concepts, filter, query, visibleCounts])

  const selectedConcept = selection.kind === 'concept'
    ? concepts.find(concept => concept.id === selection.id)
    : undefined

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ kind: 'success', text: `${t('action.copied')}: ${text}` })
    } catch {
      setNotice({ kind: 'error', text: `clipboard: ${text}` })
    }
  }, [])

  const refresh = useCallback(async () => {
    if (effectivePath === undefined) return
    await load(effectivePath)
    await scanPath(effectivePath)
  }, [effectivePath, load, scanPath])

  const createVocabulary = useCallback(async () => {
    if (effectivePath === undefined) return
    setBusy('init')
    try {
      const result = await initVocabulary(effectivePath)
      setState(current => (current === null ? current : { ...current, vocabulary: result.vocabulary }))
      setNotice({ kind: 'success', text: t('state.saved') })
      await scanPath(effectivePath)
    } catch (error) {
      setNotice({ kind: 'error', text: `${t('state.saveFailed')}: ${messageOf(error)}`, issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [effectivePath, scanPath])

  const submitConcept = useCallback(async (concept: Concept) => {
    if (effectivePath === undefined || vocabulary === undefined) return
    setBusy('save')
    setEditorIssues([])
    try {
      const exists = concepts.some(entry => entry.id === concept.id)
      const document = {
        ...vocabulary.document,
        concepts: exists
          ? concepts.map(entry => (entry.id === concept.id ? concept : entry))
          : [...concepts, concept],
      }
      const result = await saveDocument(effectivePath, document)
      setState(current => (current === null ? current : { ...current, vocabulary: result.vocabulary }))
      setView({ kind: 'browse' })
      setSelection({ kind: 'concept', id: concept.id })
      setNotice({ kind: 'success', text: t('state.saved') })
      await scanPath(effectivePath)
    } catch (error) {
      setEditorIssues(issuesOf(error))
      setNotice({ kind: 'error', text: `${t('state.saveFailed')}: ${messageOf(error)}`, issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [concepts, effectivePath, scanPath, vocabulary])

  const submitRaw = useCallback(async (text: string) => {
    if (effectivePath === undefined) return
    setBusy('save')
    setEditorIssues([])
    try {
      const result = await saveRaw(effectivePath, text)
      setState(current => (current === null ? current : { ...current, vocabulary: result.vocabulary }))
      setView({ kind: 'browse' })
      setNotice({ kind: 'success', text: t('state.saved') })
      await scanPath(effectivePath)
    } catch (error) {
      setEditorIssues(issuesOf(error))
      setNotice({ kind: 'error', text: `${t('state.saveFailed')}: ${messageOf(error)}`, issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [effectivePath, scanPath])

  const confirmAccept = useCallback(async () => {
    if (effectivePath === undefined || acceptTarget === null) return
    const conceptId = acceptTarget.conceptId
    if (conceptId === undefined) return
    if (acceptReason.trim() === '') return
    setBusy('accept')
    try {
      const result = await acceptException({
        workspace: effectivePath,
        conceptId,
        symbol: acceptTarget.symbol,
        path: acceptTarget.path,
        reason: acceptReason.trim(),
      })
      setState(current => (current === null ? current : { ...current, vocabulary: result.vocabulary }))
      setAcceptTarget(null)
      setAcceptReason('')
      setNotice({ kind: 'success', text: t('state.accepted') })
      await scanPath(effectivePath)
    } catch (error) {
      setNotice({ kind: 'error', text: `${t('state.acceptFailed')}: ${messageOf(error)}`, issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [acceptReason, acceptTarget, effectivePath, scanPath])

  const issuesOfVocabulary = vocabulary?.issues ?? []
  const vocabularyHealth = severityOf(issuesOfVocabulary)
  const invalid = vocabulary?.exists === true && vocabulary.valid === false

  const renderDetail = () => {
    if (view.kind === 'raw') {
      return (
        <RawEditor
          key={`raw-${vocabulary?.mtimeMs ?? 0}`}
          text={vocabulary?.text ?? ''}
          issues={editorIssues}
          saving={busy === 'save'}
          onSave={text => void submitRaw(text)}
          onCancel={() => {
            setView({ kind: 'browse' })
            setEditorIssues([])
          }}
        />
      )
    }
    if (view.kind === 'edit') {
      return (
        <ConceptEditor
          key={`edit-${view.concept?.id ?? 'new'}`}
          concept={view.concept}
          issues={editorIssues}
          saving={busy === 'save'}
          onSave={concept => void submitConcept(concept)}
          onCancel={() => {
            setView({ kind: 'browse' })
            setEditorIssues([])
          }}
        />
      )
    }
    if (state === null) {
      return <div className="sd-empty">{busy === 'load' ? '…' : t('state.loadFailed')}</div>
    }
    if (!state.vocabulary.exists) {
      return (
        <div className="sd-empty">
          <div className="sd-empty-title">{t('tree.empty')}</div>
          <div>{t('tree.emptyHint')}</div>
          <div className="sd-form-actions">
            <button
              type="button"
              className="sd-button sd-button-primary"
              onClick={() => void createVocabulary()}
              disabled={busy !== null}
            >
              {t('action.init')}
            </button>
            <button
              type="button"
              className="sd-button"
              onClick={() => setView({ kind: 'edit', concept: undefined })}
              disabled={busy !== null}
            >
              {t('action.new')}
            </button>
          </div>
        </div>
      )
    }
    if (selection.kind === 'unclassified') {
      return (
        <div>
          <div className="sd-concept-title">
            <span className="sd-concept-id">{t('detail.unclassified')}</span>
            <span className="sd-count" data-tone={unclassified.length > 0 ? 'warn' : undefined}>{unclassified.length}</span>
          </div>
          <div className="sd-hint" style={{ marginBottom: 12 }}>{t('detail.unclassifiedHint')}</div>
          <DriftList
            findings={unclassified}
            onAccept={finding => {
              setAcceptTarget(finding)
              setAcceptReason('')
            }}
            onCopy={text => void copy(text)}
            showLow
          />
        </div>
      )
    }
    if (selectedConcept === undefined) return <EmptyDetail />
    return (
      <ConceptDetail
        concept={selectedConcept}
        findings={findings}
        showLow={showLow}
        onShowLow={setShowLow}
        onEdit={concept => {
          setEditorIssues([])
          setView({ kind: 'edit', concept })
        }}
        onAccept={finding => {
          setAcceptTarget(finding)
          setAcceptReason('')
        }}
        onCopy={text => void copy(text)}
      />
    )
  }

  return (
    <div className="sd-root">
      <style>{PANEL_CSS}</style>
      <header className="sd-header">
        <div className="sd-heading">
          <div className="sd-title">{t('panel.title')}</div>
          <div className="sd-subtitle" title={effectivePath ?? ''}>
            {state?.workspace.title ?? ''}
            {state?.workspace.title !== undefined ? ' · ' : ''}
            {effectivePath ?? t('state.noWorkspace')}
          </div>
        </div>
        <span className="sd-spacer" />
        {(state?.workspaces.length ?? 0) > 0 && (
          <select
            className="sd-select"
            value={effectivePath ?? ''}
            onChange={event => setRequested(event.target.value)}
            title={t('workspace.label')}
          >
            {(state?.workspaces ?? []).map(workspace => (
              <option key={workspace.path} value={workspace.path}>{workspace.title}</option>
            ))}
          </select>
        )}
        <div className="sd-actions">
          <button
            type="button"
            className="sd-button"
            onClick={() => void scanPath(effectivePath ?? '')}
            disabled={busy !== null || effectivePath === undefined}
            title={t('action.rescan')}
          >
            <RefreshIcon />
            {busy === 'scan' ? t('scan.scanning') : t('action.rescan')}
          </button>
          <button
            type="button"
            className="sd-button"
            onClick={() => {
              setEditorIssues([])
              setView({ kind: 'edit', concept: undefined })
            }}
            disabled={busy !== null || invalid || effectivePath === undefined}
            title={t('action.new')}
          >
            <PlusIcon />
            {t('action.new')}
          </button>
          <button
            type="button"
            className="sd-button"
            onClick={() => {
              setView(view.kind === 'raw' ? { kind: 'browse' } : { kind: 'raw' })
              setEditorIssues([])
            }}
            disabled={busy !== null || effectivePath === undefined}
            title={t('action.yaml')}
          >
            <CodeIcon />
            {view.kind === 'raw' ? t('action.done') : t('action.yaml')}
          </button>
        </div>
      </header>

      <div className="sd-body">
        <ConceptTree
          concepts={filteredConcepts}
          selectedId={selection.kind === 'concept' ? selection.id : null}
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          driftCounts={visibleCounts}
          unclassified={unclassified.length}
          showUnclassified={true}
          onSelect={id => {
            setSelection({ kind: 'concept', id })
            setView({ kind: 'browse' })
          }}
          onSelectUnclassified={() => {
            setSelection({ kind: 'unclassified' })
            setView({ kind: 'browse' })
          }}
        />
        <section className="sd-detail">
          {notice !== null && (
            <div className="sd-notice" data-kind={notice.kind}>
              <div className="sd-spread">
                <span>{notice.text}</span>
                <button type="button" className="sd-button sd-button-ghost" onClick={() => setNotice(null)}>
                  {t('action.close')}
                </button>
              </div>
              {notice.issues !== undefined && notice.issues.length > 0 && (
                <div className="sd-issues">
                  {notice.issues.slice(0, 6).map((issue, index) => (
                    <div className="sd-issue" data-severity={issue.severity} key={`${issue.code}-${index}`}>
                      <div>{issue.message}</div>
                      <div className="sd-issue-where">
                        {issue.line === undefined ? '' : `line ${issue.line} · `}
                        {issue.path ?? ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {invalid && view.kind !== 'raw' && (
            <div className="sd-notice" data-kind="error">
              <div className="sd-spread">
                <span>{vocabularyHealth === 'error' ? t('issue.title') : ''} {vocabulary?.relativeFile}</span>
                <button
                  type="button"
                  className="sd-button"
                  onClick={() => {
                    setView({ kind: 'raw' })
                    setEditorIssues([])
                  }}
                >
                  <CodeIcon />
                  {t('action.yaml')}
                </button>
              </div>
              <div className="sd-issues">
                {issuesOfVocabulary
                  .filter(issue => issue.severity === 'error')
                  .slice(0, 8)
                  .map((issue, index) => (
                    <div className="sd-issue" key={`${issue.code}-${index}`}>
                      <div>{issue.message}</div>
                      <div className="sd-issue-where">
                        {issue.line === undefined ? '' : `line ${issue.line}${issue.column === undefined ? '' : `:${issue.column}`} · `}
                        {issue.path ?? ''}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {renderDetail()}
        </section>
      </div>

      <footer className="sd-footer">
        <span>
          {t('footer.concepts')} {concepts.length}
        </span>
        <span>
          {t('footer.drift')} {findings.length}
        </span>
        {scan !== null && (
          <span>
            {t('footer.files')} {scan.summary.filesScanned}
          </span>
        )}
        {scan !== null && (
          <span>
            {t('footer.time')} {scan.summary.durationMs} ms
          </span>
        )}
        {scan?.summary.truncated === true && (
          <span title={scan.summary.truncatedReason ?? ''}>⚠ {t('footer.truncated')}</span>
        )}
        <span className="sd-spacer" />
        {state !== null && <span className="sd-meta">v{state.version}</span>}
        <button type="button" className="sd-button sd-button-ghost" onClick={() => void refresh()} disabled={busy !== null}>
          {t('action.rescan')}
        </button>
      </footer>

      {acceptTarget !== null && acceptTarget.conceptId !== undefined && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
          onClick={() => setAcceptTarget(null)}
        >
          <div
            style={{
              width: 460,
              maxWidth: '90%',
              background: 'var(--dsw-alias-bg-overlay)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 12,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={event => event.stopPropagation()}
          >
            <div className="sd-label">{t('editor.acceptedReason')}</div>
            <div className="sd-hint">
              <span className="sd-code">{acceptTarget.symbol}</span> · {acceptTarget.path}
            </div>
            <input
              className="sd-input"
              autoFocus
              value={acceptReason}
              placeholder={t('editor.acceptedReasonHint')}
              onChange={event => setAcceptReason(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void confirmAccept()
              }}
            />
            <div className="sd-form-actions">
              <button
                type="button"
                className="sd-button sd-button-primary"
                onClick={() => void confirmAccept()}
                disabled={busy === 'accept' || acceptReason.trim() === ''}
              >
                {t('action.accept')}
              </button>
              <button type="button" className="sd-button" onClick={() => setAcceptTarget(null)}>
                {t('action.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

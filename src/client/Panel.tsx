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
import { defaultAcceptConcept, suggestConceptId } from './finding-actions.ts'
import { IssueList } from './IssueList.tsx'
import { Notice } from './Notice.tsx'
import { loadPreferences, savePreferences } from './preferences.ts'
import { matchesGlob } from '../glob.ts'
import type { NoticeValue } from './Notice.tsx'
import { ConceptEditor } from './ConceptEditor.tsx'
import { ConceptTree } from './ConceptTree.tsx'
import { DriftList } from './DriftList.tsx'
import { RawEditor } from './RawEditor.tsx'
import { maybeT, t, tf } from './locales.ts'
import type { MessageKey } from './locales.ts'
import { CodeIcon, PlusIcon, RefreshIcon, SettingsIcon, TrashIcon } from './icons.tsx'
import { PANEL_CSS } from './styles.ts'

/** Standard props the shell passes to a `main` entry. Both are optional so a
 * shell build without them still renders the panel against the default workspace. */
export interface PanelProps {
  useSessions?: (selector: (snapshot: unknown) => unknown) => unknown
  useWorkspaces?: (selector: (snapshot: unknown) => unknown) => unknown
}

type Selection = { kind: 'concept'; id: string } | { kind: 'unclassified' } | { kind: 'none' }

type View =
  | { kind: 'browse' }
  | { kind: 'edit'; concept: Concept | undefined; initialId?: string; initialSymbol?: string }
  | { kind: 'raw' }

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : String(error)
}

/** Positioned validation issues of a refusal, or none for a transport failure. */
function issuesOf(error: unknown): readonly ValidationIssue[] {
  return error instanceof ApiError ? error.issues : []
}

/** Save feedback that names the issue count, so a refusal is never a silent no-op. */
function saveFailureText(error: unknown, fallback: MessageKey, issues: readonly ValidationIssue[]): string {
  const base = errorText(error, fallback)
  return issues.length === 0 ? base : base + tf('state.issueCount', { count: issues.length })
}

/** A notice line: the localized cause when the code is known, else the raw text. */
function errorText(error: unknown, fallback: MessageKey): string {
  const code = error instanceof ApiError ? error.code : undefined
  const localized = code === undefined ? undefined : maybeT(`api.${code}`)
  return localized === undefined ? `${t(fallback)}: ${messageOf(error)}` : `${t(fallback)}: ${localized}`
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

  // View preferences survive a reload: whether the panel follows the current
  // session's workspace, and which workspace it was pinned to otherwise.
  const [preferences] = useState(() => loadPreferences())
  const [auto, setAuto] = useState(preferences.auto)
  const [pinned, setPinned] = useState<string | undefined>(preferences.workspace)
  const [notificationSeconds, setNotificationSeconds] = useState(preferences.notificationSeconds)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [requested, setRequested] = useState<string | undefined>(preferences.auto ? undefined : preferences.workspace)
  const [state, setState] = useState<StateResponse | null>(null)
  const [scan, setScan] = useState<ScanResponse | null>(null)
  const [selection, setSelection] = useState<Selection>({ kind: 'none' })
  const [view, setView] = useState<View>({ kind: 'browse' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'drift' | 'clean'>('all')
  const [showLow, setShowLow] = useState(preferences.showLow)
  const [busy, setBusy] = useState<'load' | 'scan' | 'save' | 'accept' | 'init' | null>(null)
  const [notice, setNotice] = useState<NoticeValue | null>(null)
  const [editorIssues, setEditorIssues] = useState<readonly ValidationIssue[]>([])
  const [acceptTarget, setAcceptTarget] = useState<DriftFinding | null>(null)
  const [acceptReason, setAcceptReason] = useState('')
  const [acceptConceptId, setAcceptConceptId] = useState<string | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Concept | null>(null)
  const [acceptScope, setAcceptScope] = useState<'file' | 'family' | 'symbol' | 'custom'>('file')
  const [acceptCustomPath, setAcceptCustomPath] = useState('')

  const effectivePath = state?.workspace.path

  const load = useCallback(async (path: string | undefined) => {
    setBusy('load')
    try {
      const next = await fetchState(path)
      setState(next)
      setNotice(current => (current?.kind === 'error' ? null : current))
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error, 'state.loadFailed'), issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [])

  const notReady = useCallback(() => {
    setNotice({ kind: 'error', text: t('state.notReady') })
  }, [])

  const scanPath = useCallback(async (path: string) => {
    if (path === '') {
      notReady()
      return
    }
    setBusy('scan')
    try {
      setScan(await runScan(path))
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error, 'state.scanFailed'), issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [])

  // Auto: follow whatever the session currently points at. Pinned: stay on the
  // workspace the user last picked, even when the session moves elsewhere.
  const target = auto ? suggested : (requested ?? pinned ?? suggested)

  useEffect(() => {
    void load(target)
  }, [target, load])

  useEffect(() => {
    savePreferences({
      auto,
      ...(pinned === undefined ? {} : { workspace: pinned }),
      notificationSeconds,
      showLow,
    })
  }, [auto, pinned, notificationSeconds, showLow])

  // A success notice closes itself after the configured delay; an error that
  // carries validation issues never does, because that is the text the user has
  // to act on. 0 disables the timer entirely.
  useEffect(() => {
    if (notice === null) return
    if (!(notificationSeconds > 0)) return
    const autoClosable = notice.kind === 'success' || (notice.issues ?? []).length === 0
    if (!autoClosable) return
    const timer = setTimeout(() => setNotice(null), notificationSeconds * 1_000)
    return () => clearTimeout(timer)
  }, [notice, notificationSeconds])

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
    if (effectivePath === undefined) {
      notReady()
      return
    }
    setBusy('init')
    try {
      const result = await initVocabulary(effectivePath)
      setState(current => (current === null ? current : { ...current, vocabulary: result.vocabulary }))
      setNotice({ kind: 'success', text: t('state.saved') })
      await scanPath(effectivePath)
    } catch (error) {
      setNotice({ kind: 'error', text: saveFailureText(error, 'state.saveFailed', issuesOf(error)), issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [effectivePath, scanPath])

  const submitConcept = useCallback(async (concept: Concept) => {
    if (effectivePath === undefined || vocabulary === undefined) {
      notReady()
      return
    }
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
      setNotice({ kind: 'error', text: saveFailureText(error, 'state.saveFailed', issuesOf(error)), issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [concepts, effectivePath, scanPath, vocabulary])

  const submitRaw = useCallback(async (text: string) => {
    if (effectivePath === undefined) {
      notReady()
      return
    }
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
      setNotice({ kind: 'error', text: saveFailureText(error, 'state.saveFailed', issuesOf(error)), issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [effectivePath, scanPath])

  /** Turn following off: keep the workspace on screen and remember it. */
  const toggleAuto = useCallback(() => {
    if (auto) {
      const keep = effectivePath ?? pinned
      setAuto(false)
      if (keep !== undefined) {
        setPinned(keep)
        setRequested(keep)
      }
    } else {
      setAuto(true)
      setRequested(undefined)
    }
  }, [auto, effectivePath, pinned])

  /** Picking a workspace pins it: an explicit choice outranks following. */
  const selectWorkspace = useCallback((path: string) => {
    setRequested(path)
    setPinned(path)
    setAuto(false)
  }, [])

  const openDelete = useCallback((concept: Concept) => {
    setDeleteTarget(concept)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (deleteTarget === null) return
    if (effectivePath === undefined || vocabulary === undefined) {
      notReady()
      return
    }
    setBusy('save')
    try {
      const document = {
        ...vocabulary.document,
        concepts: concepts.filter(concept => concept.id !== deleteTarget.id),
      }
      const result = await saveDocument(effectivePath, document)
      setState(current => (current === null ? current : { ...current, vocabulary: result.vocabulary }))
      if (selection.kind === 'concept' && selection.id === deleteTarget.id) setSelection({ kind: 'none' })
      setDeleteTarget(null)
      setNotice({ kind: 'success', text: t('state.saved') })
      await scanPath(effectivePath)
    } catch (error) {
      setNotice({
        kind: 'error',
        text: saveFailureText(error, 'state.saveFailed', issuesOf(error)),
        issues: issuesOf(error),
      })
    } finally {
      setBusy(null)
    }
  }, [concepts, deleteTarget, effectivePath, notReady, scanPath, selection, vocabulary])

  /** The glob one accept scope produces for this finding. */
  const scopePath = useCallback((finding: DriftFinding, scope: typeof acceptScope, custom: string): string | undefined => {
    if (scope === 'file') return finding.path
    if (scope === 'family') return `**/${finding.path.split('/').at(-1) ?? finding.path}`
    if (scope === 'symbol') return undefined
    const trimmed = custom.trim()
    return trimmed === '' ? undefined : trimmed
  }, [])

  /** Findings this scope would mute: same symbol, matching path. */
  const coveredFindings = useCallback((finding: DriftFinding, path: string | undefined): DriftFinding[] =>
    findings.filter(other => other.symbol === finding.symbol && matchesGlob(path, other.path)), [findings])

  const openAccept = useCallback((finding: DriftFinding) => {
    setAcceptTarget(finding)
    setAcceptReason('')
    setAcceptConceptId(defaultAcceptConcept(finding, concepts))
    const familyPath = `**/${finding.path.split('/').at(-1) ?? finding.path}`
    setAcceptCustomPath(familyPath)
    setAcceptScope(
      coveredFindings(finding, familyPath).length > coveredFindings(finding, finding.path).length ? 'family' : 'file',
    )
  }, [concepts, coveredFindings])

  const promote = useCallback((finding: DriftFinding) => {
    setEditorIssues([])
    setView({
      kind: 'edit',
      concept: undefined,
      initialId: suggestConceptId(finding, concepts),
      initialSymbol: finding.symbol,
    })
  }, [concepts])

  const confirmAccept = useCallback(async () => {
    if (effectivePath === undefined || acceptTarget === null) {
      notReady()
      return
    }
    const conceptId = acceptTarget.conceptId ?? acceptConceptId
    if (conceptId === undefined) {
      setNotice({ kind: 'error', text: t('unclassified.noConcept') })
      return
    }
    if (acceptReason.trim() === '') return
    setBusy('accept')
    try {
      const result = await acceptException({
        workspace: effectivePath,
        conceptId,
        symbol: acceptTarget.symbol,
        ...(scopePath(acceptTarget, acceptScope, acceptCustomPath) === undefined
          ? {}
          : { path: scopePath(acceptTarget, acceptScope, acceptCustomPath) as string }),
        reason: acceptReason.trim(),
      })
      setState(current => (current === null ? current : { ...current, vocabulary: result.vocabulary }))
      setAcceptTarget(null)
      setAcceptReason('')
      setAcceptConceptId(undefined)
      setNotice({ kind: 'success', text: t('state.accepted') })
      await scanPath(effectivePath)
    } catch (error) {
      setNotice({ kind: 'error', text: saveFailureText(error, 'state.acceptFailed', issuesOf(error)), issues: issuesOf(error) })
    } finally {
      setBusy(null)
    }
  }, [acceptConceptId, acceptCustomPath, acceptReason, acceptScope, acceptTarget, effectivePath, scanPath, scopePath])

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
          key={`edit-${view.concept?.id ?? view.initialId ?? 'new'}-${view.initialSymbol ?? ''}`}
          concept={view.concept}
          initialId={view.initialId}
          initialSymbol={view.initialSymbol}
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
            onAccept={openAccept}
            onCopy={text => void copy(text)}
            onPromote={promote}
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
        onEdit={concept => {
          setEditorIssues([])
          setView({ kind: 'edit', concept })
        }}
        onDelete={openDelete}
        onAccept={openAccept}
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
            onChange={event => selectWorkspace(event.target.value)}
            title={auto ? t('auto.onHint') : t('auto.offHint')}
          >
            {(state?.workspaces ?? []).map(workspace => (
              <option key={workspace.path} value={workspace.path}>{workspace.title}</option>
            ))}
            {/* A session may point at a sub-directory of a workspace, which is not
              in the registry list; without this option the select would show blank. */}
            {effectivePath !== undefined && !(state?.workspaces ?? []).some(workspace => workspace.path === effectivePath) && (
              <option value={effectivePath}>
                {effectivePath.split('/').filter(part => part !== '').at(-1)} · {t('auto.currentExtra')}
              </option>
            )}
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
          <button
            type="button"
            className="sd-button sd-button-ghost"
            title={t('settings.title')}
            aria-label={t('settings.title')}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
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
          onAdd={group => {
            setEditorIssues([])
            setView({
              kind: 'edit',
              concept: undefined,
              ...(group === undefined ? {} : { initialId: `${group}.` }),
            })
          }}
        />
        <section className="sd-detail">
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
              <IssueList issues={issuesOfVocabulary.filter(issue => issue.severity === 'error')} limit={8} />
            </div>
          )}
          {renderDetail()}
        </section>
      </div>

      {notice !== null && (
        <div className="sd-notice-dock">
          <Notice
            notice={notice}
            onDismiss={() => setNotice(null)}
            {...(notice.kind === 'error' && state === null
              ? { onRetry: () => void load(requested ?? suggested) }
              : {})}
          />
        </div>
      )}

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

      {settingsOpen && (
        <div className="sd-dialog-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="sd-dialog sd-settings" onClick={event => event.stopPropagation()}>
            <div className="sd-dialog-title">{t('settings.title')}</div>

            <div className="sd-settings-section">
              <div className="sd-settings-title">{t('settings.local')}</div>
              <div className="sd-setting-row">
                <div className="sd-setting-main">
                  <div className="sd-setting-name">{t('settings.auto')}</div>
                  <div className="sd-setting-hint">{t('settings.autoHint')}</div>
                </div>
                <button
                  type="button"
                  className="sd-switch"
                  role="switch"
                  aria-checked={auto}
                  aria-label={t('settings.auto')}
                  onClick={toggleAuto}
                >
                  <span className="sd-switch-track" data-on={auto}>
                    <span className="sd-switch-knob" />
                  </span>
                </button>
              </div>
              <div className="sd-setting-row">
                <div className="sd-setting-main">
                  <div className="sd-setting-name">{t('settings.notification')}</div>
                  <div className="sd-setting-hint">{t('settings.notificationHint')}</div>
                </div>
                <input
                  className="sd-number"
                  type="number"
                  min={0}
                  max={600}
                  step={1}
                  value={notificationSeconds}
                  aria-label={t('settings.notification')}
                  onChange={event => {
                    const next = Number(event.target.value)
                    setNotificationSeconds(Number.isFinite(next) ? Math.max(0, Math.min(600, Math.round(next))) : 3)
                  }}
                />
                <span className="sd-hint">{t('settings.seconds')}</span>
              </div>
              <div className="sd-setting-row">
                <div className="sd-setting-main">
                  <div className="sd-setting-name">{t('settings.showLow')}</div>
                  <div className="sd-setting-hint">{t('settings.showLowHint')}</div>
                </div>
                <button
                  type="button"
                  className="sd-switch"
                  role="switch"
                  aria-checked={showLow}
                  aria-label={t('settings.showLow')}
                  onClick={() => setShowLow(value => !value)}
                >
                  <span className="sd-switch-track" data-on={showLow}>
                    <span className="sd-switch-knob" />
                  </span>
                </button>
              </div>
            </div>

            <div className="sd-settings-section">
              <div className="sd-settings-title">{t('settings.project')}</div>
              <div className="sd-hint">{t('settings.projectHint')}</div>
              {(() => {
                const effective = state?.effective
                const rows: Array<[string, string]> = effective === undefined
                  ? []
                  : [
                      [t('settings.vocabularyPath'), effective.vocabularyPath],
                      [t('settings.announceToAgent'), effective.announceToAgent ? t('settings.on') : t('settings.off')],
                      [t('settings.citationStyle'), effective.citationStyle],
                      [t('settings.minConfidence'), effective.minConfidence],
                      [t('settings.budgets'), `${effective.timeoutMs} ms · ${effective.maxFindings} · ${Math.round(effective.maxFileBytes / 1024)} KB · ${effective.maxFiles}`],
                      [t('settings.detectors'), effective.detectors.join(', ')],
                    ]
                return rows.map(([name, value]) => (
                  <div className="sd-setting-row" key={name}>
                    <div className="sd-setting-main">
                      <div className="sd-setting-name">{name}</div>
                    </div>
                    <span className="sd-setting-value" title={value}>{value}</span>
                  </div>
                ))
              })()}
            </div>

            <div className="sd-form-actions">
              <button type="button" className="sd-button sd-button-primary" onClick={() => setSettingsOpen(false)}>
                {t('settings.done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget !== null && (
        <div className="sd-dialog-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="sd-dialog" onClick={event => event.stopPropagation()}>
            <div className="sd-dialog-title">{t('delete.title')}</div>
            <div className="sd-dialog-body">
              <span className="sd-code">{deleteTarget.id}</span> · <span className="sd-code">{deleteTarget.canonical.symbol}</span>
            </div>
            <div className="sd-dialog-body">{t('delete.body')}</div>
            <div className="sd-form-actions">
              <button
                type="button"
                className="sd-button sd-button-danger"
                onClick={() => void confirmDelete()}
                disabled={busy === 'save'}
              >
                <TrashIcon />
                {t('delete.confirm')}
              </button>
              <button type="button" className="sd-button" onClick={() => setDeleteTarget(null)} disabled={busy === 'save'}>
                {t('action.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {acceptTarget !== null && (
        <div className="sd-dialog-backdrop" onClick={() => setAcceptTarget(null)}>
          <div className="sd-dialog" onClick={event => event.stopPropagation()}>
            <label className="sd-label" htmlFor="sd-accept-reason">{t('editor.acceptedReason')}</label>
            <div className="sd-hint">
              <span className="sd-code">{acceptTarget.symbol}</span> · {acceptTarget.path}:{acceptTarget.line}
            </div>
            {acceptTarget.conceptId === undefined && (
              concepts.length === 0
                ? <div className="sd-hint">{t('unclassified.noConcept')}</div>
                : (
                    <div className="sd-field" style={{ gap: 5 }}>
                      <span className="sd-hint">{t('unclassified.pickConcept')}</span>
                      <select
                        className="sd-select"
                        style={{ maxWidth: 'none', width: '100%' }}
                        value={acceptConceptId ?? ''}
                        onChange={event => setAcceptConceptId(event.target.value)}
                      >
                        {concepts.map(concept => (
                          <option key={concept.id} value={concept.id}>
                            {concept.id} · {concept.canonical.symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
            )}
            <input
              id="sd-accept-reason"
              className="sd-input"
              autoFocus
              value={acceptReason}
              placeholder={t('editor.acceptedReasonHint')}
              onChange={event => setAcceptReason(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void confirmAccept()
              }}
            />
            {(() => {
              const current = scopePath(acceptTarget, acceptScope, acceptCustomPath)
              const covered = coveredFindings(acceptTarget, current)
              const options = (['file', 'family', 'symbol', 'custom'] as const).map(scope => ({
                scope,
                count: coveredFindings(acceptTarget, scopePath(acceptTarget, scope, acceptCustomPath)).length,
              }))
              return (
                <>
                  <div className="sd-field" style={{ gap: 5 }}>
                    <span className="sd-label">{t('accept.scope')}</span>
                    <div className="sd-scope">
                      {options.map(option => (
                        <label
                          key={option.scope}
                          className="sd-scope-option"
                          data-active={acceptScope === option.scope}
                        >
                          <input
                            type="radio"
                            name="sd-accept-scope"
                            checked={acceptScope === option.scope}
                            onChange={() => setAcceptScope(option.scope)}
                          />
                          <span>{t(`accept.scope.${option.scope}` as MessageKey)}</span>
                          <span className="sd-scope-count">{option.count}</span>
                        </label>
                      ))}
                    </div>
                    {acceptScope === 'custom' && (
                      <input
                        className="sd-input sd-mono"
                        value={acceptCustomPath}
                        placeholder="**/Common/LanguageProvider.cs"
                        onChange={event => setAcceptCustomPath(event.target.value)}
                        spellCheck={false}
                      />
                    )}
                    <span className="sd-hint">{tf('accept.covers', { count: covered.length })}</span>
                    {covered.length > 1 && (
                      <div className="sd-pathlist">
                        {covered.slice(0, 6).map(path => <div key={path.id}>{path.path}:{path.line}</div>)}
                        {covered.length > 6 && <div>… {covered.length - 6}</div>}
                      </div>
                    )}
                  </div>
                  <div className="sd-form-actions">
                    {concepts.length === 0 && acceptTarget.conceptId === undefined
                      ? (
                          <button
                            type="button"
                            className="sd-button sd-button-primary"
                            onClick={() => {
                              const finding = acceptTarget
                              setAcceptTarget(null)
                              if (finding !== null) promote(finding)
                            }}
                          >
                            {t('action.new')}
                          </button>
                        )
                      : (
                          <button
                            type="button"
                            className="sd-button sd-button-primary"
                            onClick={() => void confirmAccept()}
                            disabled={busy === 'accept' || acceptReason.trim() === '' || (acceptTarget.conceptId ?? acceptConceptId) === undefined}
                          >
                            {tf('accept.confirm', { count: covered.length })}
                          </button>
                        )}
                    <button type="button" className="sd-button" onClick={() => setAcceptTarget(null)}>
                      {t('action.cancel')}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

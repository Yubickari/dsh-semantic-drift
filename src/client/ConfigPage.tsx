/**
 * This plugin's own configuration page in DSH's installed-plugin detail view.
 *
 * A LIVE form: the fields come from the Host's field table, the values come from
 * the `configForms` snapshot, and every edit is written through `form.set` as it
 * happens. There is no save button and no "reload to apply" advice, because a
 * volatile field commits in place: the running service reads the new value on
 * its next read.
 *
 * The shell renders this page with `{ view }` alone and passes no form, so the
 * page asks the settings domain itself, through the handle the browser entry
 * bound before it registered the seat.
 *
 * @module dsh-semantic-drift/client/ConfigPage
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConfigField } from '../protocol.ts'
import { ApiError, fetchConfig } from './api.ts'
import { maybeT, t } from './locales.ts'
import { PANEL_CSS } from './styles.ts'

/** Props the shell passes to a `plugins.bundle.config` page. */
export interface ConfigPageProps {
  /** `summary` is the one-line text under the bundle's title. */
  view: 'summary' | 'page'
  /** The Host entry this page edits; supplied by the seat's `inject` face. */
  namespace?: string
}

/** What the settings domain reports about one namespace. */
export interface ConfigFormSnapshot {
  /** `loading` before the first describe answer, `unavailable` when the Host serves no such namespace. */
  status: 'loading' | 'ready' | 'unavailable'
  /** Values in force, keyed like `Config.dict`. */
  value?: Record<string, unknown>
  base?: Record<string, unknown>
  user?: Record<string, unknown>
  revision?: number
  /** False when the Host refuses writes to every namespace (a read-only deployment). */
  writable?: boolean
}

/** The settings domain's form for one namespace. */
export interface ConfigForm {
  getSnapshot(): ConfigFormSnapshot
  subscribe(listener: () => void): () => void
  /** Queue one field write; resolves whether the Host accepted it. */
  set(field: string, value: unknown): Promise<boolean> | boolean
}

/** The face of the `configForms` service this page uses. */
export interface ConfigFormsService {
  get(entryId: string): ConfigForm
  whileServed(namespaces: readonly string[], register: (served: unknown) => () => void): () => void
}

/** The resolved service, bound once by the browser entry. */
let bound: ConfigFormsService | undefined

/**
 * Resolve the settings face and remember it for this page's own lookups.
 *
 * A client service reaches a plugin either as the service itself or as an
 * object carrying it, so both shapes are accepted. Returns undefined when the
 * face is not the settings domain, which is how a shell without it stays quiet.
 * @param face - the fiber inject face.
 */
export function bindConfigForms(face: unknown): ConfigFormsService | undefined {
  const candidate = (face as { configForms?: unknown } | null | undefined)?.configForms ?? face
  if (candidate === null || typeof candidate !== 'object') {
    bound = undefined
    return undefined
  }
  const service = candidate as Partial<ConfigFormsService>
  if (typeof service.get !== 'function' || typeof service.whileServed !== 'function') {
    bound = undefined
    return undefined
  }
  bound = candidate as ConfigFormsService
  return bound
}

/** This page's form, or undefined while no service is bound. */
function formFor(namespace: string | undefined): ConfigForm | undefined {
  if (namespace === undefined || bound === undefined) return undefined
  try {
    const form = bound.get(namespace)
    return form === null || typeof form !== 'object' || typeof form.getSnapshot !== 'function' ? undefined : form
  } catch {
    return undefined
  }
}

/**
 * Fields the page must not render.
 *
 * The agent-prompt injection switch belongs to the panel's own settings, so this
 * form filters it out instead of offering a second control for the same row.
 */
const PANEL_OWNED = new Set(['announceToAgent'])

/** One block of feedback under the form. */
interface Feedback {
  text: string
  detail?: string
}

/** The Host's own wording for a failed request, never a generic replacement. */
function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : String(error)
}

/**
 * The value a field puts on the wire.
 *
 * A number input holds text, and an empty box must not become 0: an empty or
 * unparsable entry is sent as typed, so the Host refuses it instead of silently
 * writing a value the user never chose.
 */
function wireValue(field: ConfigField, value: unknown): unknown {
  if (field.kind !== 'number') return value
  const text = value === null || value === undefined ? '' : String(value).trim()
  if (text === '') return ''
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : text
}

/** Field equality, where a `flags` value is a list. */
function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => item === right[index])
  }
  return left === right
}

/**
 * What a control shows: the edit in progress, or the value in force.
 *
 * The draft stops overriding the field the moment the Host reports the same
 * value, so a write that landed leaves no copy behind to drift from the truth.
 */
function displayValue(field: ConfigField, current: unknown, draft: Record<string, unknown>): unknown {
  if (!Object.prototype.hasOwnProperty.call(draft, field.name)) return current
  const edited = draft[field.name]
  return sameValue(wireValue(field, edited), current) ? current : edited
}

/** Summary view: the bundle's one-line description of this page. */
function Summary() {
  return <span className="sd-config-summary">{t('config.summary')}</span>
}

/** The page's own name for a field; a field the dictionaries do not know keeps its key. */
function labelOf(field: ConfigField): string {
  return maybeT(`config.field.${field.name}`) ?? field.name
}

/**
 * The localized label, with the schema key kept beside it.
 *
 * The key is not decoration: the READMEs, the logs and the Host's field
 * descriptions all name these fields by it.
 */
function FieldLabel({ field }: { field: ConfigField }) {
  return (
    <>
      {labelOf(field)}
      <span className="sd-config-key">{field.name}</span>
    </>
  )
}

/**
 * One form row: the control its wire kind calls for, plus the Host's description.
 *
 * A text or number box holds a draft while it is being typed and hands it over on
 * blur or Enter; every other kind is a single choice, so it writes at once.
 */
function ConfigFieldRow({ field, value, disabled, onEdit, onCommit }: {
  field: ConfigField
  value: unknown
  disabled: boolean
  onEdit: (next: unknown) => void
  onCommit: (next: unknown) => void
}) {
  const id = `sd-config-${field.name}`
  const options = field.options ?? []
  const hint = field.description === undefined
    ? null
    : <div className="sd-config-hint">{field.description}</div>

  if (field.kind === 'boolean') {
    return (
      <div className="sd-config-field" data-kind="boolean">
        <label className="sd-config-check" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={event => {
              onEdit(event.target.checked)
              onCommit(event.target.checked)
            }}
          />
          <span className="sd-config-label"><FieldLabel field={field} /></span>
        </label>
        {hint}
      </div>
    )
  }

  if (field.kind === 'flags') {
    const selected = Array.isArray(value) ? value as readonly string[] : []
    return (
      <div className="sd-config-field" data-kind="flags">
        <div className="sd-config-label"><FieldLabel field={field} /></div>
        <div className="sd-config-flags" role="group" aria-label={labelOf(field)}>
          {options.map(option => (
            <label className="sd-config-flag" key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                disabled={disabled}
                onChange={event => {
                  // Declared order, so unchecking and rechecking one option does
                  // not turn an unchanged selection into an edited field.
                  const next = options.filter(item => (item === option ? event.target.checked : selected.includes(item)))
                  onEdit(next)
                  onCommit(next)
                }}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {hint}
      </div>
    )
  }

  if (field.kind === 'enum') {
    return (
      <div className="sd-config-field" data-kind="enum">
        <label className="sd-config-label" htmlFor={id}><FieldLabel field={field} /></label>
        <select
          id={id}
          className="sd-select sd-config-select"
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => {
            onEdit(event.target.value)
            onCommit(event.target.value)
          }}
        >
          {options.map(option => <option value={option} key={option}>{option}</option>)}
        </select>
        {hint}
      </div>
    )
  }

  return (
    <div className="sd-config-field" data-kind={field.kind}>
      <label className="sd-config-label" htmlFor={id}><FieldLabel field={field} /></label>
      <input
        id={id}
        className={field.kind === 'number' ? 'sd-input sd-config-number' : 'sd-input'}
        type={field.kind === 'number' ? 'number' : 'text'}
        min={field.kind === 'number' ? field.min : undefined}
        max={field.kind === 'number' ? field.max : undefined}
        value={value === null || value === undefined ? '' : String(value)}
        disabled={disabled}
        onChange={event => onEdit(event.target.value)}
        onBlur={event => onCommit(event.target.value)}
        onKeyDown={event => {
          // Enter is a blur, so a commit happens once whichever way the user
          // leaves the box.
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      {hint}
    </div>
  )
}

/** The page body: the field table, the live values, and one line of advice. */
function ConfigForm({ namespace }: { namespace?: string }) {
  const form = useMemo(() => formFor(namespace), [namespace])
  const [fields, setFields] = useState<readonly ConfigField[] | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [snapshot, setSnapshot] = useState<ConfigFormSnapshot | undefined>(() => form?.getSnapshot())
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [failure, setFailure] = useState<Feedback | undefined>(undefined)

  const load = useCallback(async () => {
    setLoadError(undefined)
    try {
      const response = await fetchConfig()
      setFields(response.fields)
    } catch (error) {
      setFields(undefined)
      setLoadError(messageOf(error))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (form === undefined) return
    const read = () => setSnapshot(form.getSnapshot())
    read()
    return form.subscribe(read)
  }, [form])

  const shown = useMemo(
    () => (fields ?? []).filter(field => !PANEL_OWNED.has(field.name)),
    [fields],
  )
  const values = (snapshot?.value ?? {}) as Record<string, unknown>
  // A form that is not ready and a read-only deployment leave the controls
  // visible but inert: what is in force is still the useful part of the page.
  const locked = snapshot === undefined || snapshot.status !== 'ready' || snapshot.writable === false
  const lock = snapshot === undefined || snapshot.status !== 'ready'
    ? t('config.unavailable')
    : snapshot.writable === false ? t('config.readonly') : undefined

  const valueOf = useCallback(
    (field: ConfigField): unknown => values[field.name] ?? field.default,
    [values],
  )

  /** Commit one field. A near-duplicate of what is in force writes nothing. */
  const commit = useCallback(async (field: ConfigField, raw: unknown) => {
    if (form === undefined || locked) return
    const next = wireValue(field, raw)
    if (sameValue(next, valueOf(field))) return
    try {
      const accepted = await form.set(field.name, next)
      setFailure(accepted === false ? { text: t('config.setFailed') } : undefined)
    } catch (error) {
      // The draft stays exactly as typed: a refused write must not discard the edit.
      setFailure({ text: t('config.setFailed'), detail: messageOf(error) })
    }
  }, [form, locked, valueOf])

  const edit = useCallback((name: string, next: unknown) => {
    setDraft(current => ({ ...current, [name]: next }))
    // Older feedback describes a write this edit has already superseded.
    setFailure(undefined)
  }, [])

  if (fields === undefined) {
    return (
      <div className="sd-config">
        <style>{PANEL_CSS}</style>
        {loadError === undefined ? (
          <div className="sd-config-hint">{t('config.loading')}</div>
        ) : (
          <div className="sd-config-status" data-kind="error" role="status">
            <div className="sd-config-status-title">{t('config.loadFailed')}</div>
            <div className="sd-config-status-detail">{loadError}</div>
            <button type="button" className="sd-button" onClick={() => void load()}>
              {t('action.retry')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="sd-config" data-locked={locked ? 'true' : 'false'}>
      <style>{PANEL_CSS}</style>
      <div className="sd-config-form">
        {shown.map(field => (
          <ConfigFieldRow
            key={field.name}
            field={field}
            value={displayValue(field, valueOf(field), draft)}
            disabled={locked}
            onEdit={next => edit(field.name, next)}
            onCommit={next => void commit(field, next)}
          />
        ))}
      </div>
      {lock !== undefined && (
        <div className="sd-config-hint" data-kind="locked" role="status">{lock}</div>
      )}
      {failure !== undefined && (
        <div className="sd-config-status" data-kind="error" role="status">
          <div className="sd-config-status-title">{failure.text}</div>
          {failure.detail !== undefined && <div className="sd-config-status-detail">{failure.detail}</div>}
        </div>
      )}
      <div className="sd-config-foot">{t('config.appliesNow')}</div>
    </div>
  )
}

/** Entry point the slot registry mounts. */
export function ConfigPage(props: ConfigPageProps) {
  return props.view === 'summary' ? <Summary /> : <ConfigForm namespace={props.namespace} />
}

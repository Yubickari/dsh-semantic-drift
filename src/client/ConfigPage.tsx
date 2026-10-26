/**
 * The settings page of this plugin's row in DSH's installed-plugin detail view.
 *
 * The shell hands over `view`, an unused `form` and its own translator, and
 * nothing else: there is no save button, no close action and no toast. This page
 * therefore owns the write, its feedback and the "reload to apply" advice, and it
 * renders its own stylesheet because it sits outside the panel's subtree.
 *
 * @module dsh-semantic-drift/client/ConfigPage
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConfigField, ConfigResponse } from '../protocol.ts'
import { ApiError, fetchConfig, saveConfigPatch } from './api.ts'
import { maybeT, t } from './locales.ts'
import { PANEL_CSS } from './styles.ts'

/** Props the shell passes to a `plugins.row.config` page. */
export interface ConfigPageProps {
  /** `summary` is the one-line text a row without a description shows. */
  view: 'summary' | 'page'
  /** Absent: a form object exists only for rows registered in `ctx.configForms`. */
  form?: unknown
  /** The shell translator; this page translates through its own dictionaries. */
  t?: (key: string) => string
}

/**
 * Fields the page must not render.
 *
 * The agent-prompt injection switch belongs to the panel's own settings, so this
 * form filters it out instead of offering a second control for the same row.
 */
const PANEL_OWNED = new Set(['announceToAgent'])

/** One block of feedback under the form. */
interface Status {
  kind: 'success' | 'error' | 'info'
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

/** What a field holds today: the row's value, or the schema default it falls back to. */
function baseline(field: ConfigField, values: Record<string, unknown>): unknown {
  return values[field.name] ?? field.default
}

/**
 * The fields that differ from what the Host reports.
 *
 * A write reloads the plugin row, so the patch carries the edited fields only: an
 * untouched field would buy a second reload for no change.
 */
function buildPatch(
  fields: readonly ConfigField[],
  values: Record<string, unknown>,
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const field of fields) {
    const next = wireValue(field, draft[field.name])
    if (!sameValue(next, baseline(field, values))) patch[field.name] = next
  }
  return patch
}

/** Summary view: the row's one-line description. */
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

/** One form row: the control its wire kind calls for, plus the Host's description. */
function ConfigFieldRow({ field, value, onChange }: {
  field: ConfigField
  value: unknown
  onChange: (next: unknown) => void
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
          <input id={id} type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} />
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
                onChange={event => onChange(
                  // Declared order, so unchecking and rechecking one option does
                  // not turn an unchanged selection into an edited field.
                  options.filter(item => (item === option ? event.target.checked : selected.includes(item))),
                )}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {hint}
      </div>
    )
  }

  return (
    <div className="sd-config-field" data-kind={field.kind}>
      <label className="sd-config-label" htmlFor={id}><FieldLabel field={field} /></label>
      {field.kind === 'enum' ? (
        <select
          id={id}
          className="sd-select sd-config-select"
          value={String(value ?? '')}
          onChange={event => onChange(event.target.value)}
        >
          {options.map(option => <option value={option} key={option}>{option}</option>)}
        </select>
      ) : (
        <input
          id={id}
          className={field.kind === 'number' ? 'sd-input sd-config-number' : 'sd-input'}
          type={field.kind === 'number' ? 'number' : 'text'}
          min={field.kind === 'number' ? field.min : undefined}
          max={field.kind === 'number' ? field.max : undefined}
          value={String(value ?? '')}
          onChange={event => onChange(event.target.value)}
        />
      )}
      {hint}
    </div>
  )
}

/** Page view: the form, one explicit save, and its inline feedback. */
function ConfigForm() {
  const [config, setConfig] = useState<ConfigResponse | undefined>(undefined)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status | undefined>(undefined)

  const load = useCallback(async () => {
    setLoadError(undefined)
    setStatus(undefined)
    try {
      const response = await fetchConfig()
      setConfig(response)
      // The form starts on what is in force, so an untouched page writes nothing.
      setDraft(Object.fromEntries(response.fields.map(field => [field.name, baseline(field, response.values)])))
    } catch (error) {
      setConfig(undefined)
      setLoadError(messageOf(error))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const fields = useMemo(
    () => (config?.fields ?? []).filter(field => !PANEL_OWNED.has(field.name)),
    [config],
  )
  const patch = useMemo(
    () => buildPatch(fields, config?.values ?? {}, draft),
    [config, draft, fields],
  )
  const changed = Object.keys(patch).length > 0

  const update = useCallback((name: string, next: unknown) => {
    setDraft(current => ({ ...current, [name]: next }))
    // Older feedback describes a write this edit has already superseded.
    setStatus(undefined)
  }, [])

  /**
   * Write the edited fields in one request.
   *
   * Never per keystroke: a row write reloads the plugin, so a live-write field
   * would reload the row on every character.
   */
  const save = useCallback(async () => {
    if (config === undefined || saving) return
    if (!changed) {
      setStatus({ kind: 'info', text: t('config.noChanges') })
      return
    }
    setSaving(true)
    setStatus(undefined)
    try {
      const echo = await saveConfigPatch(patch)
      // The row reloads around the write, so the echo is the stored truth; a
      // fresh read here would race that reload and show the old values again.
      setConfig(current => current === undefined
        ? current
        : { ...current, values: { ...current.values, ...echo.applied } })
      setStatus({ kind: 'success', text: t('config.saved'), detail: t('config.reloadHint') })
    } catch (error) {
      // The draft stays exactly as typed: a refused write must not discard the edit.
      setStatus({ kind: 'error', text: t('config.saveFailed'), detail: messageOf(error) })
    } finally {
      setSaving(false)
    }
  }, [changed, config, patch, saving])

  if (config === undefined) {
    return (
      <div className="sd-config">
        <style>{PANEL_CSS}</style>
        {loadError === undefined ? (
          <div className="sd-config-hint">{t('config.loading')}</div>
        ) : (
          <div className="sd-config-status" data-kind="error" role="status">
            <div className="sd-config-status-title">{t('config.loadFailed')}</div>
            <div className="sd-config-status-detail">{loadError}</div>
            <div className="sd-config-actions">
              <button type="button" className="sd-button" onClick={() => void load()}>
                {t('action.retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="sd-config">
      <style>{PANEL_CSS}</style>
      <div className="sd-config-form">
        {fields.map(field => (
          <ConfigFieldRow
            key={field.name}
            field={field}
            value={draft[field.name]}
            onChange={next => update(field.name, next)}
          />
        ))}
      </div>
      <div className="sd-config-actions">
        <button
          type="button"
          className="sd-button sd-button-primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? t('config.saving') : t('config.save')}
        </button>
      </div>
      {status !== undefined && (
        <div className="sd-config-status" data-kind={status.kind} role="status">
          <div className="sd-config-status-title">{status.text}</div>
          {status.detail !== undefined && <div className="sd-config-status-detail">{status.detail}</div>}
        </div>
      )}
    </div>
  )
}

/** Entry point the slot registry mounts. */
export function ConfigPage(props: ConfigPageProps) {
  return props.view === 'summary' ? <Summary /> : <ConfigForm />
}

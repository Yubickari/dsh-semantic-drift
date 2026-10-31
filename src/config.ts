/**
 * Plugin configuration.
 *
 * This schema is the single declaration of the settings: `Config.dict` is read
 * back at run time as the field table of `GET /semantic-drift/config`, and DSH
 * projects its volatile fields into the plugin settings form it renders itself.
 *
 * Every field is volatile on purpose. A volatile field is the only kind DSH
 * shows as editable, and the Loader commits an edit to one in place
 * (`_commitVolatile`) instead of disposing the row: the running service, its
 * tools, its routes and its prompt section all survive the change, and the new
 * value is live from the next read.
 *
 * The price is the shape: a volatile field reaches the plugin as a live
 * reference (`{ get() }`) rather than a plain value, so every read has to go
 * through {@link liveValue}. {@link liveConfig} is the one wrapper that does it
 * for the whole schema, which is what keeps the readers unaware of the shape.
 *
 * @module dsh-semantic-drift/config
 */

import z from '@deepseek-ai/schemastery'
import {
  CITATION_STYLES,
  CONFIDENCE_LEVELS,
  DEFAULT_VOCABULARY_PATH,
  DETECTOR_IDS,
} from './protocol.ts'
import type { ConfigField, ConfigFieldKind } from './protocol.ts'

export const Config = z.object({
  vocabularyPath: z
    .string()
    .default(DEFAULT_VOCABULARY_PATH)
    .volatile()
    .description('Vocabulary file, relative to the workspace root. The panel and every tool read and write this one file.'),

  announceToAgent: z
    .boolean()
    .default(true)
    .volatile()
    .description('Default for workspaces without their own prompt-injection choice. Turn off to keep the plugin silent in prompts.'),

  announceByWorkspace: z
    .dict(z.boolean())
    .default({})
    .volatile()
    .description('Per-workspace prompt-injection overrides, keyed by canonical workspace path. The panel writes this; the Configuration form hides it.'),

  citationStyle: z
    .union([...CITATION_STYLES])
    .default('file+symbol')
    .volatile()
    .description('Shape of copied references: `file+symbol` stays valid across edits, `file:line` is clickable but drifts.'),

  minConfidence: z
    .union([...CONFIDENCE_LEVELS])
    .default('medium')
    .volatile()
    .description('Lowest confidence the agent tools report. The panel always receives every level and filters on screen.'),

  timeoutMs: z
    .number()
    .min(1_000)
    .max(120_000)
    .default(30_000)
    .volatile()
    .description('Wall-clock budget for one scan. A scan that runs out returns the findings it already has, marked truncated.'),

  maxFindings: z
    .number()
    .min(1)
    .max(50_000)
    .default(5_000)
    .volatile()
    .description('Hard cap on findings returned by one scan.'),

  maxFileBytes: z
    .number()
    .min(1_024)
    .max(64 * 1_024 * 1_024)
    .default(1_048_576)
    .volatile()
    .description('Files larger than this are skipped and counted, never read.'),

  maxFiles: z
    .number()
    .min(100)
    .max(200_000)
    .default(50_000)
    .volatile()
    .description('Hard cap on files visited by one scan.'),

  detectors: z
    .array(z.union([...DETECTOR_IDS]))
    .default([...DETECTOR_IDS])
    .volatile()
    .description('Detectors a scan runs. An empty selection runs all of them.'),
})

/** A volatile field arrives as a live reference; every other field as its value. */
export type Volatile<T> = T | { get(): T }

/**
 * Read a config value at the moment it is used.
 * @param value - plain value, or the live reference of a volatile field.
 */
export function liveValue<T>(value: Volatile<T> | undefined): T | undefined {
  if (typeof value === 'object' && value !== null && typeof (value as { get?: unknown }).get === 'function') {
    return (value as { get(): T | undefined }).get()
  }
  return value as T | undefined
}

/**
 * Whether the prompt section announces one workspace's vocabulary.
 *
 * A workspace override wins; otherwise the `announceToAgent` default decides.
 * The key is the canonical workspace path, which is what the panel stores.
 *
 * @param value - the `announceToAgent` default in either shape; absent means on.
 * @param overrides - the `announceByWorkspace` map in either shape.
 * @param workspacePath - canonical workspace path, when one is known.
 */
export function announceEnabled(
  value: Volatile<boolean> | undefined,
  overrides?: Volatile<Record<string, boolean>> | undefined,
  workspacePath?: string,
): boolean {
  if (workspacePath !== undefined) {
    const explicit = (liveValue(overrides) ?? {})[workspacePath]
    if (typeof explicit === 'boolean') return explicit
  }
  return liveValue(value ?? true) !== false
}

/**
 * Read the whole schema live.
 *
 * One enumerable getter per `Config.dict` field, so every reader of the config
 * sees a plain value of the field's own type and still gets the value that is in
 * force now. A field the Loader did not pass falls back to the schema default, so
 * a hand-mounted context (tests, embedders) needs no full object.
 *
 * @param raw - the Loader's config: live references, bare values, or neither.
 */
export function liveConfig<T extends object>(raw: Record<string, Volatile<unknown>> | undefined): T {
  const dict = Config.dict as unknown as Record<string, { meta?: { default?: unknown } }>
  const source: Record<string, unknown> = {}
  for (const name of Object.keys(dict)) {
    Object.defineProperty(source, name, {
      enumerable: true,
      get(): unknown {
        const value = liveValue(raw?.[name]) ?? dict[name]?.meta?.default
        // Arrays are copied per read: a caller that sorts or pushes must not
        // edit the value the Loader committed.
        return Array.isArray(value) ? [...value] : value
      },
    })
  }
  return source as T
}

/** The parts of a schemastery field this module reads. */
interface SchemaField {
  type?: string
  meta?: {
    description?: string
    default?: unknown
    min?: number
    max?: number
  }
  /** Union candidates; each is a `const` schema carrying its `value`. */
  list?: readonly { value?: unknown }[]
  /** Element schema of an array. */
  inner?: SchemaField
}

/** Schema type to wire kind. A type outside this table is a bug in this module. */
const KIND_BY_TYPE: Record<string, ConfigFieldKind> = {
  boolean: 'boolean',
  number: 'number',
  string: 'string',
  union: 'enum',
  array: 'flags',
}

/** Candidate values of a union; absent when a union is not a closed set of constants. */
function optionValues(field: SchemaField | undefined): string[] | undefined {
  const values = (field?.list ?? [])
    .map(item => item.value)
    .filter((value): value is string => typeof value === 'string')
  return values.length === 0 ? undefined : values
}

/** One field, described from the schema alone. */
function describeField(name: string, field: SchemaField): ConfigField {
  const meta = field.meta ?? {}
  const kind = KIND_BY_TYPE[String(field.type)]
  // A closed contract: a field type without a wire kind is a schema change that
  // needs a form control, not a field the panel has to guess at.
  if (kind === undefined) throw new Error(`Config field "${name}" has no wire kind for type "${String(field.type)}".`)
  const options = kind === 'enum' ? optionValues(field) : kind === 'flags' ? optionValues(field.inner) : undefined
  return {
    name,
    kind,
    ...(meta.description === undefined ? {} : { description: meta.description }),
    ...(meta.default === undefined ? {} : { default: meta.default }),
    ...(typeof meta.min === 'number' ? { min: meta.min } : {}),
    ...(typeof meta.max === 'number' ? { max: meta.max } : {}),
    ...(options === undefined ? {} : { options }),
  }
}

/** Fields the panel owns; they still exist on the row but not in its form. */
const PANEL_OWNED_FIELDS = new Set(['announceByWorkspace'])

/** The field table of the settings form, in declaration order. */
export function configFields(): ConfigField[] {
  const dict = Config.dict as unknown as Record<string, SchemaField>
  return Object.entries(dict)
    .filter(([name]) => !PANEL_OWNED_FIELDS.has(name))
    .map(([name, field]) => describeField(name, field))
}


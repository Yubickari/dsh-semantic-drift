/**
 * Plugin configuration.
 *
 * This schema is the single declaration of the settings: `Config.dict` is read
 * back at run time as the field table of `GET /semantic-drift/config` and as the
 * validator of `POST /semantic-drift/settings`. DSH does not generate the form
 * from it — the plugin renders that form on its own page in the plugin detail
 * view, from this same field table — so a field's description, kind, bounds and
 * candidates are declared exactly once, here.
 *
 * `announceToAgent` is deliberately volatile. An edit to it must not dispose the
 * row: the plugin registers its prompt section unconditionally and reads the
 * switch while the prompt is assembled, so the new value takes effect on the
 * next assembly. A volatile field is committed in place by the Loader
 * (`_commitVolatile`) instead of reloading the plugin, which also keeps the
 * running service, its tools and its routes alive across the change.
 *
 * The price is the shape: a volatile field reaches the plugin as a live
 * reference (`{ get() }`) rather than a plain value. Read it through
 * {@link liveValue} — never compare the reference itself — so this module and
 * every caller agree on what "currently on" means.
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
    .description('Vocabulary file, relative to the workspace root. The panel and every tool read and write this one file.'),

  announceToAgent: z
    .boolean()
    .default(true)
    .volatile()
    .description('Inject the vocabulary into every agent prompt. Turn off to keep the plugin silent in prompts.'),

  citationStyle: z
    .union([...CITATION_STYLES])
    .default('file+symbol')
    .description('Shape of copied references: `file+symbol` stays valid across edits, `file:line` is clickable but drifts.'),

  minConfidence: z
    .union([...CONFIDENCE_LEVELS])
    .default('medium')
    .description('Lowest confidence the agent tools report. The panel always receives every level and filters on screen.'),

  timeoutMs: z
    .number()
    .min(1_000)
    .max(120_000)
    .default(30_000)
    .description('Wall-clock budget for one scan. A scan that runs out returns the findings it already has, marked truncated.'),

  maxFindings: z
    .number()
    .min(1)
    .max(50_000)
    .default(5_000)
    .description('Hard cap on findings returned by one scan.'),

  maxFileBytes: z
    .number()
    .min(1_024)
    .max(64 * 1_024 * 1_024)
    .default(1_048_576)
    .description('Files larger than this are skipped and counted, never read.'),

  maxFiles: z
    .number()
    .min(100)
    .max(200_000)
    .default(50_000)
    .description('Hard cap on files visited by one scan.'),

  detectors: z
    .array(z.union([...DETECTOR_IDS]))
    .default([...DETECTOR_IDS])
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
 * Whether the prompt section announces the vocabulary.
 * @param value - the `announceToAgent` field in either shape; absent means on.
 */
export function announceEnabled(value: Volatile<boolean> | undefined): boolean {
  return liveValue(value ?? true) !== false
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

/** The field table of the settings form, in declaration order. */
export function configFields(): ConfigField[] {
  const dict = Config.dict as unknown as Record<string, SchemaField>
  return Object.entries(dict).map(([name, field]) => describeField(name, field))
}

/** Outcome of validating a settings patch. */
export type ConfigPatchResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string }

/** A JSON object literal: not null, not an array, no exotic prototype. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

/**
 * Validate a settings patch against the schema.
 *
 * The schema is the only authority here: a key outside `Config.dict` is refused,
 * and a known key is validated by calling its own field schema, so the bounds,
 * candidates and types a write is held to cannot drift from the form that
 * advertises them. What comes back is always a plain value: a volatile field is
 * unwrapped, and null — which the schema would answer with the default — is
 * refused rather than silently overwriting a setting.
 *
 * @param patch - the decoded `patch` member, whatever its shape.
 */
export function validateConfigPatch(patch: unknown): ConfigPatchResult {
  if (!isPlainObject(patch)) return { ok: false, message: '`patch` must be an object of configuration fields.' }
  const dict = Config.dict as unknown as Record<string, SchemaField & ((candidate: unknown) => unknown)>
  const value: Record<string, unknown> = {}
  for (const [name, candidate] of Object.entries(patch)) {
    const field = dict[name]
    if (field === undefined) return { ok: false, message: `${name} is not a configuration field.` }
    // The schema answers `null` (and `undefined`) with the field's default, so a
    // patch that sent null would silently replace the value the user chose and
    // still look like it succeeded. A patch states values, never "unset".
    if (candidate === null || candidate === undefined) {
      return { ok: false, message: `${name} must not be null: send a value of the field's own type.` }
    }
    try {
      // A volatile field validates into its live reference (`{ get() }`), which is
      // a function: a patch carries plain values, and a reference that reached
      // the config write is a value no profile serializer can represent.
      value[name] = liveValue(field(candidate))
    } catch (error) {
      return { ok: false, message: `${name}: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  return { ok: true, value }
}

/**
 * A local `defineTool`.
 *
 * The host package that normally provides this helper (`@deepseek-ai/dsh-tools`)
 * cannot be imported from a plugin installed as a directory link: the link lives
 * outside the profile, and the host's own package directory is not on the
 * linked package's resolution path. A tool definition is a plain object
 * (`ToolDefinition extends ToolSchema`), so this module builds exactly that from
 * the same compact parameter description the official helper accepts, without
 * importing anything from the host. The result is one fewer resolution
 * assumption in every install mode.
 *
 * @module dsh-semantic-drift/define-tool
 */

/** One parameter as this plugin declares it. */
export interface ParameterSpec {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  required?: boolean
  enum?: readonly (string | number)[]
  items?: ParameterSpec
  default?: unknown
}

/** JSON Schema node emitted for the model. */
export interface JsonSchema {
  type?: string
  description?: string
  enum?: readonly (string | number)[]
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean
  [key: string]: unknown
}

/** A tool definition, structurally identical to the host's `ToolDefinition`. */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: JsonSchema
    render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }>
  }
  execute(args: Record<string, unknown>, exec: { agent?: unknown; signal?: AbortSignal }): Promise<unknown>
}

function isParameterMap(value: Record<string, unknown>): boolean {
  return value.type === undefined && value.properties === undefined
}

function toJsonSchema(spec: ParameterSpec): JsonSchema {
  const schema: JsonSchema = { type: spec.type }
  if (spec.description !== undefined) schema.description = spec.description
  if (spec.enum !== undefined) schema.enum = spec.enum
  if (spec.default !== undefined) schema.default = spec.default
  if (spec.items !== undefined) schema.items = toJsonSchema(spec.items)
  return schema
}

/**
 * Declare one tool.
 * @param definition - name, description, parameter map (or a ready JSON Schema) and executor.
 */
export function defineTool(definition: {
  name: string
  description: string
  parameters: Record<string, ParameterSpec> | JsonSchema
  output: ToolDefinition['output']
  execute(args: Record<string, unknown>, exec: { agent?: unknown; signal?: AbortSignal }): Promise<unknown>
}): ToolDefinition {
  const parameters = definition.parameters as Record<string, unknown>
  // `{ type: 'json' }` is the author-facing "any JSON value" node of the official
  // helper; the raw schema for unconstrained JSON is the annotation-only object.
  const outputSchema: JsonSchema = definition.output.schema.type === 'json' ? {} : definition.output.schema
  const output = { ...definition.output, schema: outputSchema }
  if (!isParameterMap(parameters)) {
    return { ...definition, parameters, output }
  }
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const [name, raw] of Object.entries(parameters)) {
    const spec = raw as ParameterSpec
    properties[name] = toJsonSchema(spec)
    if (spec.required === true) required.push(name)
  }
  return {
    ...definition,
    output,
    parameters: {
      type: 'object',
      properties,
      ...(required.length === 0 ? {} : { required }),
      additionalProperties: false,
    },
  }
}

/**
 * Plugin configuration.
 *
 * This schema is also the settings form: DSH renders one field per entry, so
 * there is no hand-written configuration UI.
 *
 * The fields are deliberately NOT marked `.volatile()`. A volatile field reaches
 * the plugin as a live reference object (`{ get() }`), which is the right shape
 * only for values the plugin never registers anything with. Here `apply` decides
 * whether to register the prompt section from `announceToAgent`, so the row must
 * re-run on an edit: ordinary lifecycle fields do exactly that, and DSH's config
 * editor writes them like any other field.
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

export const Config = z.object({
  vocabularyPath: z
    .string()
    .default(DEFAULT_VOCABULARY_PATH)
    .description('Vocabulary file, relative to the workspace root. The panel and every tool read and write this one file.'),

  announceToAgent: z
    .boolean()
    .default(true)
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

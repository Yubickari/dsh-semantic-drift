#!/usr/bin/env node

// src/cli.ts
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve as resolve4 } from "node:path";

// src/config.ts
import z from "@deepseek-ai/schemastery";

// src/protocol.ts
var VOCABULARY_VERSION = 1;
var SUPPORTED_VOCABULARY_VERSIONS = [1];
var DEFAULT_VOCABULARY_PATH = ".dsh/semantics.yaml";
var CONCEPT_KINDS = ["entity", "quantity", "enum", "status", "reference"];
var CONCEPT_LIFECYCLES = ["planned", "active", "deprecated"];
var CONFIDENCE_LEVELS = ["high", "medium", "low"];
var CITATION_STYLES = ["file+symbol", "file:line"];
var DETECTOR_IDS = ["duplicate-type", "contract-drift", "symbol-variant", "term-unmapped"];
function formatCitation(style, path, symbol, line) {
  return style === "file:line" ? `${path}:${line}` : `${path}::${symbol}`;
}

// src/config.ts
var Config = z.object({
  vocabularyPath: z.string().default(DEFAULT_VOCABULARY_PATH).volatile().description("Vocabulary file, relative to the workspace root. The panel and every tool read and write this one file."),
  announceToAgent: z.boolean().default(true).volatile().description("Default for workspaces without their own prompt-injection choice. Turn off to keep the plugin silent in prompts."),
  announceByWorkspace: z.dict(z.boolean()).default({}).volatile().description("Per-workspace prompt-injection overrides, keyed by canonical workspace path. The panel writes this; the Configuration form hides it."),
  announceDetail: z.union(["full", "compact"]).default("compact").volatile().description("Detail of the injected vocabulary section: `compact` lists id and symbol only (the default); `full` includes each note."),
  citationStyle: z.union([...CITATION_STYLES]).default("file+symbol").volatile().description("Shape of copied references: `file+symbol` stays valid across edits, `file:line` is clickable but drifts."),
  minConfidence: z.union([...CONFIDENCE_LEVELS]).default("medium").volatile().description("Lowest confidence the agent tools report. The panel always receives every level and filters on screen."),
  timeoutMs: z.number().min(1e3).max(12e4).default(3e4).volatile().description("Wall-clock budget for one scan. A scan that runs out returns the findings it already has, marked truncated."),
  maxFindings: z.number().min(1).max(5e4).default(5e3).volatile().description("Hard cap on findings returned by one scan."),
  maxFileBytes: z.number().min(1024).max(64 * 1024 * 1024).default(1048576).volatile().description("Files larger than this are skipped and counted, never read."),
  maxFiles: z.number().min(100).max(2e5).default(5e4).volatile().description("Hard cap on files visited by one scan."),
  detectors: z.array(z.union([...DETECTOR_IDS])).default([...DETECTOR_IDS]).volatile().description("Detectors a scan runs. An empty selection runs all of them.")
});
function liveValue(value) {
  if (typeof value === "object" && value !== null && typeof value.get === "function") {
    return value.get();
  }
  return value;
}
function liveConfig(raw) {
  const dict = Config.dict;
  const source = {};
  for (const name of Object.keys(dict)) {
    Object.defineProperty(source, name, {
      enumerable: true,
      get() {
        const value = liveValue(raw?.[name]) ?? dict[name]?.meta?.default;
        return Array.isArray(value) ? [...value] : value;
      }
    });
  }
  return source;
}

// src/store.ts
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { Document, isSeq, parseDocument } from "yaml";

// src/glob.ts
var REGEX_SPECIAL = /[.+^$()|\\]/;
function escapeChar(ch) {
  return REGEX_SPECIAL.test(ch) ? `\\${ch}` : ch;
}
function escapeLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toPosix(value) {
  let out = value.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  return out;
}
function globToRegExp(pattern) {
  const source = toPosix(pattern.trim());
  let out = "^";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "*") {
      if (source[i + 1] === "*") {
        while (source[i + 1] === "*") i++;
        if (source[i + 1] === "/") {
          i++;
          out += "(?:[^/]+/)*";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      continue;
    }
    if (ch === "[") {
      const end = source.indexOf("]", i + 1);
      if (end === -1) {
        out += "\\[";
      } else {
        const body = source.slice(i + 1, end).replace(/\\/g, "\\\\");
        out += `[${body}]`;
        i = end;
      }
      continue;
    }
    if (ch === "{") {
      const end = source.indexOf("}", i + 1);
      if (end === -1) {
        out += "\\{";
      } else {
        const parts = source.slice(i + 1, end).split(",").map((part) => escapeLiteral(part.trim()));
        out += `(?:${parts.join("|")})`;
        i = end;
      }
      continue;
    }
    out += escapeChar(ch);
  }
  out += "$";
  return new RegExp(out);
}
function isValidGlob(pattern) {
  if (typeof pattern !== "string") return false;
  const trimmed = pattern.trim();
  if (trimmed === "") return false;
  const withoutEscapes = trimmed.replace(/\\[[\]]/g, "");
  if ((withoutEscapes.match(/\[/g)?.length ?? 0) !== (withoutEscapes.match(/\]/g)?.length ?? 0)) return false;
  if ((trimmed.match(/\{/g)?.length ?? 0) !== (trimmed.match(/\}/g)?.length ?? 0)) return false;
  try {
    globToRegExp(trimmed);
    return true;
  } catch {
    return false;
  }
}
function compileGlobs(patterns) {
  const kept = [];
  const regexps = [];
  for (const pattern of patterns) {
    if (!isValidGlob(pattern)) continue;
    kept.push(pattern);
    regexps.push(globToRegExp(pattern));
  }
  return { patterns: kept, regexps };
}
function matchesGlobs(set, path, isDirectory = false) {
  const candidate = toPosix(path) + (isDirectory ? "/" : "");
  for (const regexp of set.regexps) {
    if (regexp.test(candidate)) return true;
  }
  return false;
}
function matchesGlob(pattern, path) {
  if (pattern === void 0 || pattern.trim() === "" || pattern.trim() === "**") return true;
  if (!isValidGlob(pattern)) return false;
  return globToRegExp(pattern).test(toPosix(path));
}

// src/store.ts
var DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/bin/**",
  "**/obj/**",
  ".git/**",
  "**/.git/**",
  "**/target/**",
  "**/vendor/**",
  "**/__pycache__/**",
  "**/.venv/**",
  ".nuget/**",
  "artifacts/**",
  ".tmp/**",
  "TestResults/**",
  "BenchmarkDotNet.Artifacts/**"
];
var CONCEPT_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
var SYMBOL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
var KNOWN_CONCEPT_KEYS = /* @__PURE__ */ new Set(["id", "terms", "kind", "canonical", "lifecycle", "note", "accepted"]);
var KNOWN_TOP_LEVEL_KEYS = /* @__PURE__ */ new Set(["version", "meta", "exclude", "concepts"]);
function today(now = /* @__PURE__ */ new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
}
function toSnakeCase(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}
function inferGroupHint(entries) {
  if (!Array.isArray(entries)) return void 0;
  const counts = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!isPlainObject(entry)) continue;
    const id = asString(entry.id);
    if (id === void 0) continue;
    const [group] = id.split(".");
    if (group !== void 0 && group !== id) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  let best;
  for (const [group, count] of counts) {
    if (best === void 0 || count > (counts.get(best) ?? 0)) best = group;
  }
  return best;
}
function suggestConceptId(id, groupHint) {
  const snake = toSnakeCase(id);
  if (snake === "") return void 0;
  if (snake.includes(".")) return snake;
  return `${groupHint ?? "domain"}.${snake}`;
}
function findLine(text, needle) {
  if (needle === void 0 || needle === "") return void 0;
  const index = text.indexOf(needle);
  if (index < 0) return void 0;
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
function emptyVocabulary(project) {
  return {
    version: VOCABULARY_VERSION,
    meta: { project: project ?? "workspace", updated: today() },
    exclude: [...DEFAULT_EXCLUDES],
    concepts: []
  };
}
function normalizeDocument(raw, text) {
  const issues = [];
  const fallback = emptyVocabulary();
  if (!isPlainObject(raw)) {
    issues.push({
      code: "document-shape",
      message: "The vocabulary file must be a mapping with a `concepts` list.",
      severity: "error",
      line: 1
    });
    return { document: fallback, issues };
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      issues.push({
        code: "unknown-key",
        message: `Unknown top-level key \`${key}\`; it is ignored.`,
        severity: "warning",
        path: key,
        line: findLine(text, `${key}:`)
      });
    }
  }
  const requestedVersion = raw.version;
  const version = typeof requestedVersion === "number" ? requestedVersion : VOCABULARY_VERSION;
  const supportedVersions = SUPPORTED_VOCABULARY_VERSIONS;
  if (requestedVersion !== void 0 && typeof requestedVersion !== "number") {
    issues.push({
      code: "version-shape",
      message: "`version` must be a number.",
      severity: "error",
      path: "version",
      line: findLine(text, "version:")
    });
  } else if (requestedVersion !== void 0 && !supportedVersions.includes(version)) {
    issues.push({
      code: "version-unsupported",
      message: `Vocabulary version ${String(requestedVersion)} is not supported; this plugin reads version ${supportedVersions.join(", ")} and writes version ${VOCABULARY_VERSION}. Upgrade the plugin before upgrading the vocabulary.`,
      severity: "error",
      path: "version",
      line: findLine(text, "version:")
    });
  }
  const metaRaw = isPlainObject(raw.meta) ? raw.meta : {};
  const project = asString(metaRaw.project);
  const updated = asString(metaRaw.updated);
  const exclude = [];
  if (raw.exclude === void 0) {
    exclude.push(...DEFAULT_EXCLUDES);
  } else if (!Array.isArray(raw.exclude)) {
    issues.push({
      code: "exclude-shape",
      message: "`exclude` must be a list of glob patterns.",
      severity: "error",
      path: "exclude",
      line: findLine(text, "exclude:")
    });
    exclude.push(...DEFAULT_EXCLUDES);
  } else {
    for (const [index, entry] of raw.exclude.entries()) {
      const pattern = asString(entry);
      if (pattern === void 0) {
        issues.push({
          code: "exclude-entry",
          message: `\`exclude[${index}]\` must be a non-empty glob pattern.`,
          severity: "error",
          path: `exclude[${index}]`,
          line: findLine(text, "exclude:")
        });
        continue;
      }
      if (!isValidGlob(pattern)) {
        issues.push({
          code: "exclude-glob",
          message: `\`exclude[${index}]\` is not a valid glob: ${pattern}`,
          severity: "error",
          path: `exclude[${index}]`,
          line: findLine(text, pattern)
        });
        continue;
      }
      exclude.push(pattern);
    }
  }
  const concepts = [];
  const groupHint = inferGroupHint(raw.concepts);
  if (raw.concepts !== void 0 && !Array.isArray(raw.concepts)) {
    issues.push({
      code: "concepts-shape",
      message: "`concepts` must be a list.",
      severity: "error",
      path: "concepts",
      line: findLine(text, "concepts:")
    });
  } else {
    for (const [index, entry] of (raw.concepts ?? []).entries()) {
      const at = `concepts[${index}]`;
      if (!isPlainObject(entry)) {
        issues.push({ code: "concept-shape", message: `\`${at}\` must be a mapping.`, severity: "error", path: at });
        continue;
      }
      for (const key of Object.keys(entry)) {
        if (!KNOWN_CONCEPT_KEYS.has(key)) {
          issues.push({
            code: "unknown-key",
            message: `Unknown key \`${key}\` in \`${at}\`; it is ignored.`,
            severity: "warning",
            path: `${at}.${key}`
          });
        }
      }
      const id = asString(entry.id);
      if (id === void 0) {
        issues.push({ code: "id-missing", message: `\`${at}.id\` is required.`, severity: "error", path: `${at}.id` });
        continue;
      }
      if (!CONCEPT_ID_PATTERN.test(id)) {
        const suggestion = suggestConceptId(id, groupHint);
        issues.push({
          code: "id-format",
          message: `Concept id \`${id}\` must have at least two lowercase, dot-separated segments (e.g. \`a.b\`): letters, digits and underscores.${suggestion === void 0 ? "" : ` Try \`${suggestion}\`.`}`,
          severity: "error",
          path: `${at}.id`,
          line: findLine(text, id),
          ...suggestion === void 0 ? {} : { suggestion }
        });
      }
      const terms = [];
      if (!Array.isArray(entry.terms) || entry.terms.length === 0) {
        issues.push({
          code: "terms-missing",
          message: `\`${at}.terms\` must list at least one Chinese term or alias.`,
          severity: "error",
          path: `${at}.terms`,
          line: findLine(text, id)
        });
      } else {
        for (const [termIndex, term] of entry.terms.entries()) {
          const value = asString(term);
          if (value === void 0) {
            issues.push({
              code: "term-empty",
              message: `\`${at}.terms[${termIndex}]\` must be a non-empty string.`,
              severity: "error",
              path: `${at}.terms[${termIndex}]`
            });
            continue;
          }
          if (!terms.includes(value)) terms.push(value);
        }
      }
      const kindRaw = asString(entry.kind);
      let kind = "entity";
      if (kindRaw === void 0 || !CONCEPT_KINDS.includes(kindRaw)) {
        issues.push({
          code: "kind-invalid",
          message: `\`${at}.kind\` must be one of ${CONCEPT_KINDS.join(", ")}.`,
          severity: "error",
          path: `${at}.kind`,
          line: findLine(text, id)
        });
      } else {
        kind = kindRaw;
      }
      const lifecycleRaw = asString(entry.lifecycle);
      let lifecycle = "active";
      if (entry.lifecycle !== void 0 && lifecycleRaw === void 0) {
        issues.push({
          code: "lifecycle-invalid",
          message: `\`${at}.lifecycle\` must be one of ${CONCEPT_LIFECYCLES.join(", ")}.`,
          severity: "error",
          path: `${at}.lifecycle`,
          line: findLine(text, id)
        });
      } else if (lifecycleRaw !== void 0) {
        if (!CONCEPT_LIFECYCLES.includes(lifecycleRaw)) {
          issues.push({
            code: "lifecycle-invalid",
            message: `\`${at}.lifecycle\` must be one of ${CONCEPT_LIFECYCLES.join(", ")}.`,
            severity: "error",
            path: `${at}.lifecycle`,
            line: findLine(text, id)
          });
        } else {
          lifecycle = lifecycleRaw;
        }
      }
      const canonicalRaw = isPlainObject(entry.canonical) ? entry.canonical : void 0;
      const symbol = canonicalRaw === void 0 ? void 0 : asString(canonicalRaw.symbol);
      if (symbol === void 0) {
        issues.push({
          code: "symbol-missing",
          message: `\`${at}.canonical.symbol\` is required.`,
          severity: "error",
          path: `${at}.canonical.symbol`,
          line: findLine(text, id)
        });
      } else if (!SYMBOL_PATTERN.test(symbol)) {
        issues.push({
          code: "symbol-format",
          message: `Canonical symbol \`${symbol}\` must be a plain identifier.`,
          severity: "error",
          path: `${at}.canonical.symbol`,
          line: findLine(text, symbol)
        });
      }
      const accepted = [];
      if (entry.accepted !== void 0) {
        if (!Array.isArray(entry.accepted)) {
          issues.push({
            code: "accepted-shape",
            message: `\`${at}.accepted\` must be a list.`,
            severity: "error",
            path: `${at}.accepted`
          });
        } else {
          for (const [acceptedIndex, item] of entry.accepted.entries()) {
            const atAccepted = `${at}.accepted[${acceptedIndex}]`;
            if (!isPlainObject(item)) {
              issues.push({ code: "accepted-shape", message: `\`${atAccepted}\` must be a mapping.`, severity: "error", path: atAccepted });
              continue;
            }
            const acceptedSymbol = asString(item.symbol);
            const reason = asString(item.reason);
            const path = asString(item.path);
            if (acceptedSymbol === void 0) {
              issues.push({
                code: "accepted-symbol",
                message: `\`${atAccepted}.symbol\` is required.`,
                severity: "error",
                path: `${atAccepted}.symbol`
              });
            }
            if (reason === void 0) {
              issues.push({
                code: "accepted-reason",
                message: `\`${atAccepted}.reason\` is required: an exception without a reason is an undocumented decision.`,
                severity: "error",
                path: `${atAccepted}.reason`
              });
            }
            if (path !== void 0 && !isValidGlob(path)) {
              issues.push({
                code: "accepted-glob",
                message: `\`${atAccepted}.path\` is not a valid glob: ${path}`,
                severity: "error",
                path: `${atAccepted}.path`
              });
            }
            if (acceptedSymbol !== void 0) {
              accepted.push({ symbol: acceptedSymbol, ...path === void 0 ? {} : { path }, reason: reason ?? "" });
            }
          }
        }
      }
      const note = asString(entry.note);
      const canonicalType = canonicalRaw === void 0 ? void 0 : asString(canonicalRaw.type);
      const canonicalUnit = canonicalRaw === void 0 ? void 0 : asString(canonicalRaw.unit);
      concepts.push({
        id,
        terms,
        kind,
        canonical: {
          symbol: symbol ?? "",
          ...canonicalType === void 0 ? {} : { type: canonicalType },
          ...canonicalUnit === void 0 ? {} : { unit: canonicalUnit }
        },
        ...lifecycle === "active" ? {} : { lifecycle },
        ...note === void 0 ? {} : { note },
        ...accepted.length === 0 ? {} : { accepted }
      });
    }
  }
  const document = {
    version: supportedVersions.includes(version) ? version : VOCABULARY_VERSION,
    ...project === void 0 && updated === void 0 ? {} : { meta: { ...project === void 0 ? {} : { project }, ...updated === void 0 ? {} : { updated } } },
    exclude,
    concepts
  };
  return { document, issues };
}
function validateCrossEntries(document, text = "") {
  const issues = [];
  const ids = /* @__PURE__ */ new Map();
  const symbols = /* @__PURE__ */ new Map();
  const terms = /* @__PURE__ */ new Map();
  for (const [index, concept] of document.concepts.entries()) {
    const at = `concepts[${index}]`;
    const line = findLine(text, concept.id);
    const firstId = ids.get(concept.id);
    if (firstId !== void 0) {
      issues.push({
        code: "id-duplicate",
        message: `Concept id \`${concept.id}\` is already used by \`concepts[${firstId}]\`.`,
        severity: "error",
        path: `${at}.id`,
        line
      });
    } else {
      ids.set(concept.id, index);
    }
    const symbol = concept.canonical.symbol;
    if (symbol !== "") {
      const firstSymbol = symbols.get(symbol);
      if (firstSymbol !== void 0) {
        issues.push({
          code: "symbol-duplicate",
          message: `Canonical symbol \`${symbol}\` is already used by \`concepts[${firstSymbol}]\`; one symbol can name only one concept.`,
          severity: "error",
          path: `${at}.canonical.symbol`,
          line: findLine(text, symbol)
        });
      } else {
        symbols.set(symbol, index);
      }
    }
    for (const term of concept.terms) {
      const seen = terms.get(term);
      if (seen !== void 0 && seen.conceptId !== concept.id) {
        issues.push({
          code: "term-duplicate",
          message: `Term \`${term}\` is already claimed by \`${seen.conceptId}\`; two concepts cannot share one term.`,
          severity: "error",
          path: `${at}.terms`,
          line: findLine(text, term)
        });
      } else if (seen === void 0) {
        terms.set(term, { index, conceptId: concept.id });
      }
    }
    if (concept.kind === "quantity" && concept.canonical.unit === void 0) {
      issues.push({
        code: "unit-missing",
        message: `Quantity concept \`${concept.id}\` has no \`canonical.unit\`; the panel will show no unit and unit comparisons cannot run.`,
        severity: "warning",
        path: `${at}.canonical.unit`,
        line
      });
    }
  }
  return issues;
}
function parseVocabularyText(text) {
  const doc = parseDocument(text, { prettyErrors: true });
  if (doc.errors.length > 0) {
    const issues2 = doc.errors.map((error) => ({
      code: "yaml-parse",
      message: error.message,
      severity: "error",
      ...error.linePos?.[0] === void 0 ? {} : { line: error.linePos[0].line, column: error.linePos[0].col }
    }));
    return { document: emptyVocabulary(), issues: issues2 };
  }
  let raw;
  try {
    raw = doc.toJS();
  } catch (error) {
    return {
      document: emptyVocabulary(),
      issues: [{ code: "yaml-parse", message: error instanceof Error ? error.message : String(error), severity: "error" }]
    };
  }
  if (raw === null || raw === void 0) {
    return { document: emptyVocabulary(), issues: [] };
  }
  const normalized = normalizeDocument(raw, text);
  const issues = [...normalized.issues, ...validateCrossEntries(normalized.document, text)];
  return { document: normalized.document, issues };
}
function hasErrors(issues) {
  return issues.some((issue) => issue.severity === "error");
}
function vocabularyFile(root, relativePath) {
  return resolve(root, relativePath);
}
var cache = /* @__PURE__ */ new Map();
async function loadVocabulary(root, relativePath) {
  const file = vocabularyFile(root, relativePath);
  let info;
  try {
    info = await stat(file);
  } catch {
    const document = emptyVocabulary(basename(root));
    return {
      file,
      relativeFile: relativePath,
      exists: false,
      document,
      issues: [],
      valid: true
    };
  }
  const cached = cache.get(file);
  if (cached !== void 0 && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.state;
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const issue = {
      code: "read-failed",
      message: `Cannot read ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      severity: "error"
    };
    const state2 = {
      file,
      relativeFile: relativePath,
      exists: true,
      document: emptyVocabulary(basename(root)),
      issues: [issue],
      valid: false,
      mtimeMs: info.mtimeMs
    };
    return state2;
  }
  const parsed = parseVocabularyText(text);
  const state = {
    file,
    relativeFile: relativePath,
    exists: true,
    text,
    document: parsed.document,
    issues: parsed.issues,
    valid: !hasErrors(parsed.issues),
    mtimeMs: info.mtimeMs
  };
  cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, state });
  return state;
}

// src/scan/index.ts
import { readFile as readFile2, stat as stat3 } from "node:fs/promises";
import { resolve as resolve3 } from "node:path";

// src/scan/types.ts
function compareLiterals(left, right) {
  const leftLiterals = left.literals;
  const rightLiterals = right.literals;
  if (leftLiterals === void 0 || rightLiterals === void 0) return "unknown";
  let comparable = 0;
  for (const member of left.members) {
    const a = leftLiterals[member];
    const b = rightLiterals[member];
    if (a === void 0 || b === void 0) continue;
    comparable++;
    if (a.length !== b.length || a.some((value) => !b.includes(value))) return "differ";
  }
  return comparable === 0 ? "unknown" : "same";
}
function stableLiterals(declarations) {
  if (declarations.length < 2) return {};
  const out = {};
  for (const member of declarations[0].members) {
    const values = declarations.map((declaration) => declaration.literals?.[member]);
    if (values.some((value) => value === void 0)) continue;
    const first = values[0];
    if (first.length !== 1) continue;
    if (values.every((value) => value !== void 0 && value.length === 1 && value[0] === first[0])) {
      out[member] = [first[0]];
    }
  }
  return out;
}
function memberValueDiffs(left, right) {
  const out = [];
  for (const member of left.members) {
    if (!right.members.includes(member)) continue;
    const a = left.literals?.[member];
    const b = right.literals?.[member];
    if (a === void 0 || b === void 0) continue;
    if (a.length === b.length && a.every((value) => b.includes(value))) continue;
    out.push({
      member,
      ...b === void 0 ? {} : { right: b.join("|") },
      ...a === void 0 ? {} : { left: a.join("|") }
    });
  }
  return out;
}
function sharedBase(declarations) {
  if (declarations.length === 0) return void 0;
  const first = declarations[0].bases;
  if (first === void 0 || first.length === 0) return void 0;
  return first.find((base) => declarations.every((declaration) => declaration.bases?.includes(base) === true));
}
function makeFinding(style, input) {
  return {
    id: `${input.detector}:${input.path}:${input.symbol}:${input.line}`,
    detector: input.detector,
    confidence: input.confidence,
    path: input.path,
    line: input.line,
    symbol: input.symbol,
    ...input.expected === void 0 ? {} : { expected: input.expected },
    ...input.conceptId === void 0 ? {} : { conceptId: input.conceptId },
    message: input.message,
    citation: formatCitation(style, input.path, input.symbol, input.line),
    detail: input.detail ?? {}
  };
}
function editDistance(left, right, limit) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  const previous = new Array(right.length + 1);
  const current = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j++) previous[j] = j;
  for (let i = 1; i <= left.length; i++) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }
    if (rowMin > limit) return limit + 1;
    for (let j = 0; j <= right.length; j++) previous[j] = current[j];
  }
  return previous[right.length];
}
function normalizedSymbol(symbol) {
  return symbol.replace(/[_-]/g, "").toLowerCase();
}
function leadingToken(symbol) {
  const firstSegment = symbol.split(/[_.]/)[0];
  const camel = /^[A-Z]+(?![a-z])|^[A-Z][a-z0-9]*|^[a-z0-9]+/.exec(firstSegment);
  return (camel?.[0] ?? firstSegment).toLowerCase();
}

// src/scan/detectors/duplicate-type.ts
function groupTypesByName(types) {
  const groups = /* @__PURE__ */ new Map();
  for (const declaration of types) {
    const list = groups.get(declaration.name);
    if (list === void 0) groups.set(declaration.name, [declaration]);
    else list.push(declaration);
  }
  return groups;
}
function sameMembers(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
}
var MIN_COMPARABLE_MEMBERS = 2;
function isEntryPoint(declaration) {
  if (!/^(program|startup|main|entrypoint)$/i.test(declaration.name)) return false;
  return declaration.members.some((member) => /^(main|mainasync)$/i.test(member));
}
function comparableDeclarations(declarations) {
  return declarations.filter(
    (declaration) => declaration.members.length >= MIN_COMPARABLE_MEMBERS && declaration.partial !== true && !isEntryPoint(declaration)
  );
}
function simpleBaseName(reference) {
  const withoutGenerics = reference.replace(/<[^>]*>/g, "");
  return (withoutGenerics.split(".").at(-1) ?? withoutGenerics).trim();
}
function shadowsBase(left, right) {
  return (left.bases ?? []).some((base) => simpleBaseName(base) === right.name);
}
function isLocalHelper(declaration) {
  return declaration.nested === true && declaration.visibility !== "public";
}
var duplicateTypeDetector = {
  id: "duplicate-type",
  finish(ctx) {
    const findings = [];
    for (const [name, declarations] of groupTypesByName(ctx.types)) {
      const comparable = comparableDeclarations(declarations);
      if (comparable.length < 2) continue;
      const units = new Set(comparable.map((declaration) => declaration.unit));
      if (units.size < 2) continue;
      const primary = comparable[0];
      const base = sharedBase(comparable);
      const concept = ctx.concepts.find((item) => item.canonical.symbol === name);
      for (const declaration of comparable.slice(1)) {
        if (declaration.unit === primary.unit || declaration.path === primary.path) continue;
        if (!sameMembers(declaration.members, primary.members)) continue;
        const relation = compareLiterals(primary, declaration);
        const valueDiffs = memberValueDiffs(primary, declaration);
        const rule = relation === "same" || relation === "unknown" ? "identical-members" : base === void 0 ? "literal-variant" : "derived-copy";
        const kindDiffers = primary.keyword !== declaration.keyword;
        const message = rule === "identical-members" ? `Type "${name}" is declared again in another compilation unit with the same ${declaration.members.length} members as ${primary.path}${relation === "same" ? " and the same values" : ""}${kindDiffers ? `, but as a ${primary.keyword} there and a ${declaration.keyword} here` : ""}.` : rule === "derived-copy" ? `Type "${name}" derives from ${base ?? "a shared base"} in another compilation unit and only fills in its own values; this is a parameterized derivative, not a copy \u2014 merging it would change which identity those values resolve against.` : `Type "${name}" repeats the member names of ${primary.path} but gives them different values (${valueDiffs.slice(0, 3).map((diff) => `${diff.member}: ${diff.right ?? "?"} -> ${diff.left ?? "?"}`).join("; ")}); the two sides no longer agree on what those names mean.`;
        findings.push(
          makeFinding(ctx.citationStyle, {
            detector: "duplicate-type",
            confidence: "high",
            path: declaration.path,
            line: declaration.line,
            symbol: name,
            ...concept === void 0 ? {} : { conceptId: concept.id },
            message,
            detail: {
              primaryPath: primary.path,
              primaryLine: primary.line,
              unit: declaration.unit,
              members: declaration.members,
              rule,
              sites: comparable.length,
              ...base === void 0 ? {} : { base },
              ...primary.literals === void 0 ? {} : { literals: primary.literals },
              ...valueDiffs.length === 0 ? {} : { valueDiffs },
              ...kindDiffers ? { kinds: [primary.keyword, declaration.keyword] } : {}
            }
          })
        );
      }
    }
    return findings;
  }
};

// src/scan/detectors/contract-drift.ts
var contractDriftDetector = {
  id: "contract-drift",
  finish(ctx) {
    const findings = [];
    for (const [name, declarations] of groupTypesByName(ctx.types)) {
      const comparable = comparableDeclarations(declarations);
      if (comparable.length < 2) continue;
      const units = new Set(comparable.map((declaration) => declaration.unit));
      if (units.size < 2) continue;
      const primary = comparable[0];
      const primaryMembers = new Set(primary.members);
      for (const declaration of comparable.slice(1)) {
        if (declaration.unit === primary.unit || declaration.path === primary.path) continue;
        if (shadowsBase(declaration, primary) || shadowsBase(primary, declaration)) continue;
        if (isLocalHelper(primary) && isLocalHelper(declaration)) continue;
        const members = new Set(declaration.members);
        if (members.size === primaryMembers.size && [...members].every((member) => primaryMembers.has(member))) continue;
        const missing = primary.members.filter((member) => !members.has(member));
        const extra = declaration.members.filter((member) => !primaryMembers.has(member));
        const valueDiffs = [];
        for (const member of declaration.members) {
          if (!primaryMembers.has(member)) continue;
          const left = declaration.literals?.[member];
          const right = primary.literals?.[member];
          if (left === void 0 || right === void 0) continue;
          if (left.length === right.length && left.every((value) => right.includes(value))) continue;
          valueDiffs.push({
            member,
            ...right === void 0 ? {} : { right: right.join("|") },
            ...left === void 0 ? {} : { left: left.join("|") }
          });
        }
        if (missing.length === primary.members.length) continue;
        const concept = ctx.concepts.find((item) => item.canonical.symbol === name);
        const difference = [
          missing.length === 0 ? "" : `missing [${missing.join(", ")}]`,
          extra.length === 0 ? "" : `extra [${extra.join(", ")}]`,
          valueDiffs.length === 0 ? "" : `values differ [${valueDiffs.slice(0, 3).map((diff) => `${diff.member}: ${diff.right ?? "?"} -> ${diff.left ?? "?"}`).join("; ")}]`
        ].filter((part) => part !== "").join(", ");
        findings.push(
          makeFinding(ctx.citationStyle, {
            detector: "contract-drift",
            confidence: "high",
            path: declaration.path,
            line: declaration.line,
            symbol: name,
            ...concept === void 0 ? {} : { conceptId: concept.id },
            message: `Type "${name}" differs between ${primary.path} and ${declaration.path}: ${difference}.`,
            detail: {
              primaryPath: primary.path,
              primaryLine: primary.line,
              unit: declaration.unit,
              members: primary.members,
              missing,
              extra,
              ...valueDiffs.length === 0 ? {} : { valueDiffs },
              rule: "diverged-members"
            }
          })
        );
      }
    }
    return findings;
  }
};

// src/scan/symbol-table.ts
var EXTENSION_LANGUAGE = {
  ".cs": "csharp",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "typescript",
  ".jsx": "typescript",
  ".mjs": "typescript",
  ".cjs": "typescript",
  ".py": "python",
  ".pyi": "python",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".swift": "swift",
  ".go": "go",
  ".rs": "rust",
  ".c": "c",
  ".h": "c",
  ".cc": "c",
  ".cpp": "c",
  ".hpp": "c",
  // Evidence-only formats: comments/strings/resources feed the term detector.
  ".resx": "other",
  ".xaml": "other",
  ".xml": "other",
  ".properties": "other",
  ".json": "other"
};
function languageOf(relPath) {
  const match = /\.([A-Za-z0-9]+)$/.exec(relPath);
  if (match === null) return void 0;
  return EXTENSION_LANGUAGE[`.${match[1].toLowerCase()}`];
}
function isScannable(relPath) {
  return languageOf(relPath) !== void 0;
}
var GENERATED_FILE = /(?:^|\/)(?:[^/]+\.(?:designer|g|g\.i|generated|assemblyinfo|assemblyattributes)\.cs|\.min\.js|\.min\.css)$/i;
var GENERATED_HEADER = /^\s*(?:\/\/|\/\*|#|<!--)[^\n]{0,80}auto-generated/im;
function isGeneratedSource(relPath, text) {
  if (GENERATED_FILE.test(relPath)) return true;
  return GENERATED_HEADER.test(text.slice(0, 2e3));
}
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}
function lineAt(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = low + high + 1 >> 1;
    if (starts[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}
function blank(count) {
  return " ".repeat(count);
}
function maskSource(text, language) {
  const code = [];
  const noise = [];
  const hashComments = language === "python" || language === "other";
  let i = 0;
  const pushBoth = (segment) => {
    code.push(blank(segment.length));
    noise.push(segment);
  };
  const pushCode = (segment) => {
    code.push(segment);
    noise.push(blank(segment.length));
  };
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      pushBoth(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      pushBoth(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "<" && text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      const stop = end === -1 ? text.length : end + 3;
      pushBoth(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (hashComments && ch === "#") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      pushBoth(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (hashComments && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      const quote = text.slice(i, i + 3);
      const end = text.indexOf(quote, i + 3);
      const stop = end === -1 ? text.length : end + 3;
      pushBoth(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "@" && next === '"') {
      let j = i + 2;
      while (j < text.length) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      pushBoth(text.slice(i, j));
      i = j;
      continue;
    }
    if (ch === "$" && next === '"') {
      let j = i + 2;
      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      pushBoth(text.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < text.length) {
        const c = text[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === ch) {
          j++;
          break;
        }
        if (c === "\n" && ch !== "`") {
          break;
        }
        j++;
      }
      pushBoth(text.slice(i, j));
      i = j;
      continue;
    }
    pushCode(ch);
    i++;
  }
  return { code: code.join(""), noise: noise.join("") };
}
var RESERVED = /* @__PURE__ */ new Set([
  "if",
  "for",
  "foreach",
  "while",
  "switch",
  "case",
  "catch",
  "try",
  "finally",
  "using",
  "return",
  "new",
  "throw",
  "lock",
  "await",
  "yield",
  "else",
  "do",
  "nameof",
  "typeof",
  "sizeof",
  "default",
  "when",
  "var",
  "get",
  "set",
  "init",
  "add",
  "remove",
  "value",
  "where",
  "select",
  "from",
  "in",
  "is",
  "as",
  "with",
  "function",
  "constructor",
  "super",
  "this",
  "base",
  "namespace",
  "import",
  "export",
  "const",
  "let"
]);
function findMatchingBrace(maskedCode, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < maskedCode.length; i++) {
    const ch = maskedCode[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
function indexOfBrace(maskedCode, from) {
  for (let i = from; i < maskedCode.length; i++) {
    const ch = maskedCode[i];
    if (ch === "{") return i;
    if (ch === ";") return -1;
  }
  return -1;
}
function splitTopLevel(source, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") depth++;
    else if (ch === "}" || ch === ")" || ch === "]" || ch === ">") depth = Math.max(0, depth - 1);
    else if (ch === separator && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}
function enumMembers(body) {
  const members = [];
  for (const part of splitTopLevel(body, ",")) {
    const match = /^\s*(?:\[[^\]]*\]\s*)*([A-Za-z_$][\w$]*)/.exec(part);
    if (match !== null && !RESERVED.has(match[1])) members.push(match[1]);
  }
  return members;
}
var LINE_PROPERTY = /^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|readonly|const|required|override|virtual|abstract|new|event|volatile|extern|async|unsafe|sealed|export|declare|default)\s+)*([A-Za-z_$][\w$]*)(?:\s*<[^>]*>)?(?:\[\])?\??\s+([A-Za-z_$][\w$]*)\s*(?:[={;(])/;
var LINE_METHOD = /^\s*(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed|new|partial|export|declare|default)\s+)*(?:<[^>]*>\s*)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
var LINE_TS_PROPERTY = /^\s*(?:readonly\s+|static\s+|declare\s+)*([A-Za-z_$][\w$]*)\??\s*[:(]/;
function bodyMembers(body, keyword, typeName, language) {
  if (keyword === "enum") return enumMembers(body);
  const names = /* @__PURE__ */ new Set();
  const lines = body.split("\n");
  let depth = 0;
  for (const rawLine of lines) {
    const line = rawLine;
    if (depth === 0) {
      const tsStyle = language === "typescript" ? LINE_TS_PROPERTY.exec(line) : null;
      if (tsStyle !== null && !RESERVED.has(tsStyle[1])) names.add(tsStyle[1]);
      const property = LINE_PROPERTY.exec(line);
      if (property !== null && !RESERVED.has(property[2])) names.add(property[2]);
      const method = LINE_METHOD.exec(line);
      if (method !== null && !RESERVED.has(method[1]) && method[1] !== typeName) names.add(method[1]);
    }
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") depth = Math.max(0, depth - 1);
    }
  }
  return [...names];
}
function positionalMembers(code, from, to) {
  const open = code.indexOf("(", from);
  if (open === -1 || open > to) return [];
  let depth = 0;
  let close = -1;
  for (let i = open; i < to; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return [];
  const names = [];
  for (const parameter of splitTopLevel(code.slice(open + 1, close), ",")) {
    const tokens = parameter.trim().split(/\s+/).filter((token) => token !== "" && !token.startsWith("["));
    const last = tokens.at(-1);
    if (last === void 0) continue;
    const name = /^([A-Za-z_$][\w$]*)\??$/.exec(last.replace(/=[\s\S]*$/, ""));
    if (name !== null && !RESERVED.has(name[1])) names.push(name[1]);
  }
  return names;
}
var MEMBER_LITERAL = /^\s*(?:(?:public|private|protected|internal|static|readonly|const|required|override|virtual|abstract|new|event)\s+)*[\w<>\[\],?.]+\s+([A-Za-z_$][\w$]*)\s*(?:=>|=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?)|(true|false))\s*;?\s*$/;
function memberLiterals(body) {
  const out = {};
  let found = false;
  for (const line of body.split("\n")) {
    const match = MEMBER_LITERAL.exec(line);
    if (match === null) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? match[5];
    if (value === void 0) continue;
    const list = out[match[1]] ?? [];
    if (!list.includes(value)) list.push(value);
    out[match[1]] = list;
    found = true;
  }
  return found ? out : void 0;
}
function enumLiterals(body) {
  const out = {};
  for (const part of splitTopLevel(body, ",")) {
    const match = /^\s*(?:\[[^\]]*\]\s*)*([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;?\s*$/.exec(part);
    if (match === null) continue;
    out[match[1]] = [match[2].replace(/\s+/g, " ").trim()];
  }
  return out;
}
var MEMBER_OVERRIDE = /\boverride\b[^;{=]*\b([A-Za-z_$][\w$]*)\s*(?:[{=;]|=>)/;
function overriddenMembers(body) {
  const out = [];
  for (const line of body.split("\n")) {
    if (!/\boverride\b/.test(line)) continue;
    const match = MEMBER_OVERRIDE.exec(line);
    if (match !== null && !out.includes(match[1])) out.push(match[1]);
  }
  return out;
}
function baseTypes(head) {
  const colon = head.indexOf(":");
  if (colon < 0) return void 0;
  const list = head.slice(colon + 1).split(",").map((part) => part.trim()).map((part) => /^(?:global::)?(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)(?:\s*<.*)?$/.exec(part)?.[1]).filter((name) => name !== void 0);
  return list.length === 0 ? void 0 : list;
}
var CS_TYPE = /(?:^|[;{}\s])(?:(?:public|internal|private|protected|static|sealed|abstract|partial|readonly|file|unsafe|new)\s+)*\b(class|struct|interface|record|enum)\s+(?:(?:struct|class)\s+)?([A-Za-z_]\w*)/g;
var TS_TYPE = /(?:^|[;{}\s])(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?\b(interface|type|enum|class)\s+([A-Za-z_$][\w$]*)/g;
function extractTypes(file, unitOf) {
  const language = file.language;
  if (language === "python") return extractPythonTypes(file, unitOf);
  if (language !== "csharp" && language !== "typescript" && language !== "java" && language !== "kotlin") return [];
  const masked = maskSource(file.text, language);
  const starts = lineStarts(file.text);
  const out = [];
  const pattern = language === "csharp" ? CS_TYPE : TS_TYPE;
  pattern.lastIndex = 0;
  const parsed = [];
  let match;
  while ((match = pattern.exec(masked.code)) !== null) {
    const keyword = match[1];
    const name = match[2];
    const declarationStart = match.index + match[0].indexOf(keyword);
    const lineStart = masked.code.lastIndexOf("\n", declarationStart) + 1;
    const prefix = masked.code.slice(lineStart, declarationStart);
    const open = indexOfBrace(masked.code, pattern.lastIndex);
    if (open === -1) continue;
    const close = findMatchingBrace(masked.code, open);
    if (close === -1) continue;
    parsed.push({
      keyword,
      name,
      start: declarationStart,
      after: pattern.lastIndex,
      open,
      close,
      partial: /\bpartial\b/.test(prefix),
      ...visibilityOf(prefix) === void 0 ? {} : { visibility: visibilityOf(prefix) }
    });
  }
  const nested = (item) => parsed.some((other) => other.open < item.start && item.start < other.close);
  for (const item of parsed) {
    const { name, keyword } = item;
    const body = masked.code.slice(item.open + 1, item.close);
    const originalBody = file.text.slice(item.open + 1, item.close);
    const members = bodyMembers(body, keyword, name, language);
    if (keyword === "record" || language === "kotlin") {
      for (const extra of positionalMembers(masked.code, item.after, item.open)) members.push(extra);
    }
    const bases = language === "csharp" ? baseTypes(masked.code.slice(item.after, item.open)) : void 0;
    const literals = {
      ...memberLiterals(originalBody) ?? {},
      ...keyword === "enum" ? enumLiterals(originalBody) : {}
    };
    const overrides = language === "csharp" ? overriddenMembers(body) : [];
    out.push({
      name,
      keyword,
      members: [...new Set(members)].sort(),
      path: file.relPath,
      line: lineAt(starts, item.start),
      unit: unitOf(file.relPath),
      language,
      ...item.partial ? { partial: true } : {},
      ...bases === void 0 ? {} : { bases },
      ...Object.keys(literals).length === 0 ? {} : { literals },
      ...overrides.length === 0 ? {} : { overrides },
      ...nested(item) ? { nested: true } : {},
      ...item.visibility === void 0 ? {} : { visibility: item.visibility }
    });
  }
  return out;
}
function visibilityOf(prefix) {
  const match = /\b(private|protected|internal|public|file)\b/.exec(prefix);
  return match === null ? void 0 : match[1];
}
var PY_CLASS = /^([ \t]*)class\s+([A-Za-z_]\w*)/gm;
function extractPythonTypes(file, unitOf) {
  const masked = maskSource(file.text, "python");
  const starts = lineStarts(file.text);
  const lines = masked.code.split("\n");
  const original = file.text.split("\n");
  const out = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = PY_CLASS.exec(line);
    PY_CLASS.lastIndex = 0;
    if (match === null) continue;
    const baseIndent = match[1].replace(/\t/g, "    ").length;
    const name = match[2];
    const members = /* @__PURE__ */ new Set();
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const bodyLine = lines[cursor];
      if (bodyLine.trim() === "") continue;
      const indent = /^[ \t]*/.exec(bodyLine)?.[0].replace(/\t/g, "    ").length ?? 0;
      if (indent <= baseIndent) break;
      const source = original[cursor];
      const selfAssign = /^\s*self\.([A-Za-z_]\w*)\s*(?::[^=]+)?=/.exec(source);
      if (selfAssign !== null) members.add(selfAssign[1]);
      const def = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(source);
      if (def !== null && !RESERVED.has(def[1])) members.add(def[1]);
      const classAssign = /^\s{1,}([A-Za-z_]\w*)\s*(?::[^=]+)?=/.exec(source);
      if (classAssign !== null) members.add(classAssign[1]);
      const annotated = /^\s{1,}([A-Za-z_]\w*)\s*:\s*[^=]+$/.exec(source);
      if (annotated !== null) members.add(annotated[1]);
    }
    out.push({
      name,
      keyword: "class",
      members: [...members].sort(),
      path: file.relPath,
      line: lineAt(starts, starts[index] ?? 0),
      unit: unitOf(file.relPath),
      language: "python",
      ...baseIndent > 0 ? { nested: true } : {},
      visibility: name.startsWith("__") ? "private" : name.startsWith("_") ? "protected" : "public"
    });
  }
  return out;
}

// src/scan/detectors/symbol-variant.ts
var KNOWN_CONFUSABLES = [
  ["params", "parms"],
  ["param", "parm"],
  ["config", "conf"],
  ["configuration", "config"],
  ["address", "adress"],
  ["enums", "enumus"],
  ["length", "lenght"],
  ["receive", "recieve"],
  ["separate", "seperate"],
  ["definition", "defination"],
  ["temperature", "temprature"],
  ["template", "templet"],
  ["message", "mesage"],
  ["response", "responce"],
  ["identifier", "identifer"],
  ["threshold", "treshold"],
  ["position", "positon"],
  ["default", "defualt"]
];
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function variantSource(symbol) {
  return [...symbol].map((character) => escapeRegExp(character)).join("[_-]?");
}
function bounded(source) {
  return `(?<![A-Za-z0-9_$])(?:${source})(?![A-Za-z0-9_$])`;
}
var PER_CONCEPT_LIMIT = 5;
var PENDING_LIMIT = 2e3;
function createSymbolVariantDetector() {
  let patterns = [];
  let combined;
  let pending = [];
  let seen = /* @__PURE__ */ new Set();
  let perConcept = /* @__PURE__ */ new Map();
  let canonicalSeen = /* @__PURE__ */ new Set();
  const reported = (conceptId, path, symbol) => {
    const key = `${conceptId}|${path}|${symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const countOf = (conceptId) => perConcept.get(conceptId) ?? 0;
  const sharesEvidence = (pattern, symbol, text) => {
    for (const term of pattern.concept.terms) {
      if (term.length >= 2 && text.includes(term)) return true;
    }
    return leadingToken(symbol) === leadingToken(pattern.canonical);
  };
  const ruleOf = (pattern, symbol) => {
    if (pattern.confusables.has(symbol.toLowerCase())) return { rule: "confusable" };
    if (normalizedSymbol(symbol) === normalizedSymbol(pattern.canonical)) return { rule: "normalized" };
    return { rule: "edit-distance", distance: editDistance(symbol, pattern.canonical, 2) };
  };
  return {
    id: "symbol-variant",
    start(ctx) {
      pending = [];
      seen = /* @__PURE__ */ new Set();
      perConcept = /* @__PURE__ */ new Map();
      canonicalSeen = /* @__PURE__ */ new Set();
      patterns = [];
      for (const concept of ctx.concepts) {
        const canonical = concept.canonical.symbol;
        if (canonical === "") continue;
        const sources = /* @__PURE__ */ new Set([variantSource(canonical)]);
        const confusables = /* @__PURE__ */ new Set();
        for (const [correct, wrong] of KNOWN_CONFUSABLES) {
          if (!canonical.includes(correct)) continue;
          const form = canonical.replace(correct, wrong);
          confusables.add(form.toLowerCase());
          sources.add(variantSource(form));
        }
        patterns.push({
          concept,
          canonical,
          canonicalLower: canonical.toLowerCase(),
          test: new RegExp(bounded([...sources].join("|")), "i"),
          sources: [...sources],
          confusables
        });
      }
      const allSources = /* @__PURE__ */ new Set();
      for (const pattern of patterns) for (const source of pattern.sources) allSources.add(source);
      combined = allSources.size === 0 ? void 0 : new RegExp(`(?<![A-Za-z0-9_$])(?:${[...allSources].join("|")})(?![A-Za-z0-9_$])`, "gi");
    },
    onFile(ctx, input) {
      if (combined === void 0 || pending.length >= PENDING_LIMIT) return;
      const code = input.masked.code;
      const starts = lineStarts(input.file.text);
      combined.lastIndex = 0;
      let match;
      while ((match = combined.exec(code)) !== null) {
        const symbol = match[0];
        if (symbol === "") {
          combined.lastIndex++;
          continue;
        }
        const pattern = patterns.find((candidate) => candidate.test.test(symbol));
        if (pattern === void 0) continue;
        if (symbol === pattern.canonical) {
          canonicalSeen.add(pattern.concept.id);
          continue;
        }
        if (symbol.toLowerCase() === pattern.canonicalLower) continue;
        if (countOf(pattern.concept.id) >= PER_CONCEPT_LIMIT) continue;
        if (!sharesEvidence(pattern, symbol, input.file.text)) continue;
        if (!reported(pattern.concept.id, input.file.relPath, symbol)) continue;
        perConcept.set(pattern.concept.id, countOf(pattern.concept.id) + 1);
        const rule = ruleOf(pattern, symbol);
        pending.push(
          makeFinding(ctx.citationStyle, {
            detector: "symbol-variant",
            confidence: "medium",
            path: input.file.relPath,
            line: lineAt(starts, match.index),
            symbol,
            expected: pattern.canonical,
            conceptId: pattern.concept.id,
            message: `"${symbol}" spells concept ${pattern.concept.id} differently from its canonical symbol "${pattern.canonical}".`,
            detail: {
              members: [pattern.canonical],
              term: pattern.concept.terms[0],
              rule: rule.rule,
              ...rule.distance === void 0 ? {} : { distance: rule.distance }
            }
          })
        );
      }
    },
    finish(ctx) {
      const findings = [...pending];
      const byName = /* @__PURE__ */ new Map();
      for (const declaration of ctx.types) {
        const list = byName.get(declaration.name);
        if (list === void 0) byName.set(declaration.name, [declaration]);
        else list.push(declaration);
      }
      for (const concept of ctx.concepts) {
        const canonical = concept.canonical.symbol;
        const canonicalDeclarations = byName.get(canonical);
        if (canonicalDeclarations === void 0 || canonicalDeclarations.length < 2) continue;
        const base = sharedBase(canonicalDeclarations);
        if (base === void 0) continue;
        const stable = stableLiterals(canonicalDeclarations);
        const members = canonicalDeclarations[0].members;
        if (Object.keys(stable).length === 0 || members.length === 0) continue;
        for (const group of byName.values()) {
          if (group[0].name === canonical) continue;
          for (const candidate of group) {
            if (candidate.bases?.includes(base) !== true) continue;
            if (candidate.members.length !== members.length || candidate.members.some((member) => !members.includes(member))) continue;
            const matches = Object.entries(stable).every(([member, values]) => {
              const own = candidate.literals?.[member];
              return own !== void 0 && values.some((value) => own.includes(value));
            });
            if (!matches) continue;
            if (findings.length >= PENDING_LIMIT) break;
            if (countOf(concept.id) >= PER_CONCEPT_LIMIT) break;
            if (!reported(concept.id, candidate.path, candidate.name)) continue;
            perConcept.set(concept.id, countOf(concept.id) + 1);
            findings.push(
              makeFinding(ctx.citationStyle, {
                detector: "symbol-variant",
                confidence: "medium",
                path: candidate.path,
                line: candidate.line,
                symbol: candidate.name,
                expected: canonical,
                conceptId: concept.id,
                message: `Type "${candidate.name}" carries the same contract as "${canonical}" (base ${base}, same members, same ${Object.keys(stable).join("/")}) under a different name.`,
                detail: {
                  members,
                  base,
                  literals: stable,
                  sites: group.length,
                  rule: "contract-alias"
                }
              })
            );
          }
        }
      }
      for (const concept of ctx.concepts) {
        const canonical = concept.canonical.symbol;
        if (canonical.length < 3) continue;
        if ((byName.get(canonical)?.length ?? 0) > 0) continue;
        if (canonicalSeen.has(concept.id)) continue;
        const lower = canonical.toLowerCase();
        const exact = [...byName.entries()].filter(([name]) => name !== canonical && name.toLowerCase() === lower);
        const prefixed = exact.length > 0 ? [] : [...byName.entries()].filter(([name]) => name.length > canonical.length && name.slice(0, canonical.length).toLowerCase() === lower && /[A-Z_$]/.test(name.charAt(canonical.length)));
        const sample = exact[0] ?? prefixed[0];
        if (sample === void 0) continue;
        const [spelling, group] = sample;
        if (findings.length >= PENDING_LIMIT) break;
        if (countOf(concept.id) >= PER_CONCEPT_LIMIT) break;
        if (!reported(concept.id, group[0].path, spelling)) continue;
        perConcept.set(concept.id, countOf(concept.id) + 1);
        const files = new Set(group.map((declaration) => declaration.path)).size;
        const examples = prefixed.slice(0, 3).map(([name]) => name);
        const message = exact.length > 0 ? `The vocabulary spells concept ${concept.id} as "${canonical}", which appears nowhere in the repository; the code spells it "${spelling}" (${group.length} declarations in ${files} files).` : `The vocabulary spells concept ${concept.id} as "${canonical}", which appears nowhere in the repository; the code writes "${spelling}" at the head of ${prefixed.length} declaration(s)${examples.length === 0 ? "" : `, e.g. ${examples.join(", ")}`}.`;
        findings.push(
          makeFinding(ctx.citationStyle, {
            detector: "symbol-variant",
            confidence: "medium",
            path: group[0].path,
            line: group[0].line,
            symbol: spelling,
            expected: canonical,
            conceptId: concept.id,
            message,
            detail: {
              members: [canonical],
              term: concept.terms[0],
              sites: exact.length > 0 ? group.length : prefixed.length,
              rule: "canonical-case"
            }
          })
        );
      }
      for (const concept of ctx.concepts) {
        const canonical = concept.canonical.symbol;
        if (canonical.length < 6) continue;
        const canonicalToken = leadingToken(canonical);
        for (const declaration of ctx.types) {
          const name = declaration.name;
          if (name === canonical) continue;
          if (name.length < 6 || canonical.length < 6) continue;
          if (Math.abs(name.length - canonical.length) > 2) continue;
          if (name[0]?.toLowerCase() !== canonical[0]?.toLowerCase()) continue;
          if (leadingToken(name) !== canonicalToken) continue;
          if (findings.length >= PENDING_LIMIT) break;
          const distance = editDistance(name, canonical, 2);
          if (distance < 1 || distance > 2) continue;
          if (countOf(concept.id) >= PER_CONCEPT_LIMIT) break;
          if (!reported(concept.id, declaration.path, name)) continue;
          perConcept.set(concept.id, countOf(concept.id) + 1);
          findings.push(
            makeFinding(ctx.citationStyle, {
              detector: "symbol-variant",
              confidence: "medium",
              path: declaration.path,
              line: declaration.line,
              symbol: name,
              expected: canonical,
              conceptId: concept.id,
              message: `Declared type "${name}" is ${distance} edits away from the canonical symbol "${canonical}".`,
              detail: { members: [canonical], rule: "edit-distance", distance }
            })
          );
        }
      }
      return findings;
    }
  };
}

// src/scan/detectors/term-unmapped.ts
var MAX_CONCEPTS = 40;
var MAX_HITS_PER_CONCEPT = 2;
function escapeRegExp2(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function createTermUnmappedDetector() {
  let entries = [];
  let termIndex = /* @__PURE__ */ new Map();
  let termRegex;
  let canonicalRegex;
  let canonicalSeen = /* @__PURE__ */ new Set();
  let hits = /* @__PURE__ */ new Map();
  return {
    id: "term-unmapped",
    start(ctx) {
      canonicalSeen = /* @__PURE__ */ new Set();
      hits = /* @__PURE__ */ new Map();
      entries = [];
      termIndex = /* @__PURE__ */ new Map();
      const terms = [];
      for (const concept of ctx.concepts) {
        if ((concept.lifecycle ?? "active") !== "active") continue;
        const canonical = concept.canonical.symbol;
        if (canonical === "") continue;
        const usable = concept.terms.filter((term) => term.length >= 2);
        if (usable.length === 0) continue;
        entries.push({ conceptId: concept.id, canonical, terms: usable });
        for (const term of usable) {
          if (termIndex.has(term)) continue;
          termIndex.set(term, concept.id);
          terms.push(term);
        }
      }
      terms.sort((left, right) => right.length - left.length);
      termRegex = terms.length === 0 ? void 0 : new RegExp(terms.map(escapeRegExp2).join("|"), "g");
      const canonicals = entries.slice(0, MAX_CONCEPTS).map((entry) => escapeRegExp2(entry.canonical));
      canonicalRegex = canonicals.length === 0 ? void 0 : new RegExp(`(?<![A-Za-z0-9_$])(?:${canonicals.join("|")})(?![A-Za-z0-9_$])`, "g");
    },
    onFile(_ctx, input) {
      const codeHaystack = input.file.language === "other" ? input.file.text : input.masked.code;
      if (canonicalRegex !== void 0) {
        canonicalRegex.lastIndex = 0;
        let canonical;
        while ((canonical = canonicalRegex.exec(codeHaystack)) !== null) canonicalSeen.add(canonical[0]);
      }
      if (termRegex === void 0) return;
      const noise = input.masked.noise;
      if (noise.trim() === "") return;
      const conceptIdsInFile = /* @__PURE__ */ new Set();
      const starts = lineStarts(input.file.text);
      termRegex.lastIndex = 0;
      let match;
      while ((match = termRegex.exec(noise)) !== null) {
        const conceptId = termIndex.get(match[0]);
        if (conceptId === void 0 || conceptIdsInFile.has(conceptId)) continue;
        const existing = hits.get(conceptId) ?? [];
        if (existing.length >= MAX_HITS_PER_CONCEPT) continue;
        conceptIdsInFile.add(conceptId);
        existing.push({ path: input.file.relPath, line: lineAt(starts, match.index), term: match[0] });
        hits.set(conceptId, existing);
      }
    },
    finish(ctx) {
      const findings = [];
      for (const entry of entries.slice(0, MAX_CONCEPTS)) {
        if (canonicalSeen.has(entry.canonical)) continue;
        for (const hit of hits.get(entry.conceptId) ?? []) {
          findings.push(
            makeFinding(ctx.citationStyle, {
              detector: "term-unmapped",
              confidence: "low",
              path: hit.path,
              line: hit.line,
              symbol: entry.canonical,
              expected: entry.canonical,
              conceptId: entry.conceptId,
              message: `Term "${hit.term}" appears here, but the canonical symbol "${entry.canonical}" never appears in the scanned code.`,
              detail: { term: hit.term, rule: "canonical-missing" }
            })
          );
        }
      }
      return findings;
    }
  };
}

// src/scan/walk.ts
import { readdir, stat as stat2 } from "node:fs/promises";
import { join, resolve as resolve2, sep } from "node:path";
var HARD_SKIP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", ".hg", ".svn", ".dsh/cache"]);
var UNIT_MARKERS = /* @__PURE__ */ new Set([
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "CMakeLists.txt"
]);
function isUnitMarker(name) {
  if (UNIT_MARKERS.has(name)) return true;
  return /\.(csproj|fsproj|vbproj|sln|gemspec)$/i.test(name);
}
function makeUnitResolver(unitDirs) {
  return (relPath) => {
    const segments = relPath.split("/");
    segments.pop();
    for (let depth = segments.length; depth > 0; depth--) {
      const candidate = segments.slice(0, depth).join("/");
      if (unitDirs.has(candidate)) return candidate;
    }
    return segments[0] ?? ".";
  };
}
async function walkWorkspace(options) {
  const root = resolve2(options.root);
  const maxFiles = options.maxFiles ?? 5e4;
  const files = [];
  const unitDirs = /* @__PURE__ */ new Set();
  let dirsVisited = 0;
  let skippedBySize = 0;
  let skippedUnreadable = 0;
  let truncated = false;
  const queue = [""];
  while (queue.length > 0) {
    if (files.length >= maxFiles) {
      truncated = true;
      break;
    }
    const relativeDir = queue.pop();
    const absoluteDir = relativeDir === "" ? root : join(root, relativeDir.split("/").join(sep));
    let entries;
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true });
    } catch {
      skippedUnreadable++;
      continue;
    }
    dirsVisited++;
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    const children = [];
    let hasMarker = false;
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (HARD_SKIP_DIRS.has(entry.name)) continue;
        const childRel2 = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
        if (matchesGlobs(options.excludes, childRel2, true)) continue;
        children.push(childRel2);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isUnitMarker(entry.name)) hasMarker = true;
      if (!isScannable(entry.name)) continue;
      const childRel = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
      if (matchesGlobs(options.excludes, childRel, false)) continue;
      const absolute = join(root, childRel.split("/").join(sep));
      let size = 0;
      let mtimeMs = 0;
      try {
        const info = await stat2(absolute);
        size = info.size;
        mtimeMs = info.mtimeMs;
      } catch {
        skippedUnreadable++;
        continue;
      }
      if (size > options.maxFileBytes) {
        skippedBySize++;
        continue;
      }
      files.push({ relPath: childRel, absPath: absolute, bytes: size, mtimeMs });
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }
    }
    if (hasMarker) unitDirs.add(relativeDir);
    queue.push(...children.reverse());
  }
  return { root, files, unitDirs, dirsVisited, skippedBySize, skippedUnreadable, truncated };
}

// src/scan/index.ts
var READ_BATCH = 8;
var PARSE_CACHE_LIMIT = 4e3;
var parseCache = /* @__PURE__ */ new Map();
var ScanError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "ScanError";
    this.code = code;
  }
};
function allDetectors() {
  return [duplicateTypeDetector, contractDriftDetector, createSymbolVariantDetector(), createTermUnmappedDetector()];
}
function compareFindings(left, right) {
  if (left.path !== right.path) return left.path < right.path ? -1 : 1;
  if (left.line !== right.line) return left.line - right.line;
  if (left.detector !== right.detector) return left.detector < right.detector ? -1 : 1;
  return left.symbol < right.symbol ? -1 : left.symbol > right.symbol ? 1 : 0;
}
function acceptedBy(finding, concepts) {
  for (const concept of concepts) {
    const accepted = concept.accepted ?? [];
    for (let index = 0; index < accepted.length; index++) {
      const exception = accepted[index];
      if (exception.symbol !== finding.symbol) continue;
      if (matchesGlob(exception.path, finding.path)) return { conceptId: concept.id, index };
    }
  }
  return void 0;
}
function confidenceRank(level) {
  return CONFIDENCE_LEVELS.indexOf(level);
}
function normalizePrefix(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}
async function scanWorkspace(options) {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const root = resolve3(options.root);
  let rootStat;
  try {
    rootStat = await stat3(root);
  } catch {
    throw new ScanError("root-missing", `Workspace directory does not exist: ${root}`);
  }
  if (!rootStat.isDirectory()) throw new ScanError("root-not-directory", `Not a directory: ${root}`);
  const deadline = startedAt + Math.max(1, options.timeoutMs);
  const excludes = compileGlobs(options.document.exclude);
  const walk = await walkWorkspace({
    root,
    excludes,
    maxFileBytes: options.maxFileBytes,
    ...options.maxFiles === void 0 ? {} : { maxFiles: options.maxFiles }
  });
  const unitOf = makeUnitResolver(walk.unitDirs);
  const prefixes = (options.paths ?? []).map(normalizePrefix).filter((prefix) => prefix !== "");
  const files = prefixes.length === 0 ? walk.files : walk.files.filter((file) => prefixes.some((prefix) => file.relPath === prefix || file.relPath.startsWith(`${prefix}/`)));
  const enabled = allDetectors().filter(
    (detector) => options.detectors === void 0 || options.detectors.includes(detector.id)
  );
  const ctx = {
    root,
    concepts: options.document.concepts,
    citationStyle: options.citationStyle,
    types: [],
    skippedTypes: 0,
    deadline,
    now,
    ...prefixes.length === 0 ? {} : { pathFilter: prefixes }
  };
  for (const detector of enabled) detector.start?.(ctx);
  const findings = [];
  let filesScanned = 0;
  let filesSkipped = walk.skippedBySize + walk.skippedUnreadable;
  let bytesScanned = 0;
  let truncated = walk.truncated;
  let truncatedReason = walk.truncated ? "limit" : void 0;
  for (let offset = 0; offset < files.length; offset += READ_BATCH) {
    if (now() > deadline) {
      truncated = true;
      truncatedReason = "timeout";
      break;
    }
    const batch = files.slice(offset, offset + READ_BATCH);
    const texts = await Promise.all(batch.map(async (file) => {
      try {
        return await readFile2(file.absPath, "utf8");
      } catch {
        return void 0;
      }
    }));
    for (const [index, file] of batch.entries()) {
      const text = texts[index];
      if (text === void 0) {
        filesSkipped++;
        continue;
      }
      if (isGeneratedSource(file.relPath, text)) {
        filesSkipped++;
        continue;
      }
      const language = languageOf(file.relPath) ?? "other";
      const source = {
        relPath: file.relPath,
        absPath: file.absPath,
        language,
        text,
        bytes: file.bytes
      };
      const masked = maskSource(text, language);
      const cached = parseCache.get(file.absPath);
      const settled = now() - file.mtimeMs > 1e3;
      const reused = settled && cached !== void 0 && cached.size === file.bytes && cached.mtimeMs === file.mtimeMs;
      const declarations = reused ? cached.declarations : extractTypes(source, unitOf);
      if (!reused) {
        parseCache.delete(file.absPath);
        parseCache.set(file.absPath, { size: file.bytes, mtimeMs: file.mtimeMs, declarations });
        if (parseCache.size > PARSE_CACHE_LIMIT) {
          const oldest = parseCache.keys().next().value;
          if (oldest !== void 0) parseCache.delete(oldest);
        }
      }
      for (const declaration of declarations) {
        if (declaration.members.length === 0) ctx.skippedTypes++;
      }
      ctx.types.push(...declarations);
      filesScanned++;
      bytesScanned += Buffer.byteLength(text);
      for (const detector of enabled) detector.onFile?.(ctx, { file: source, masked });
    }
  }
  for (const detector of enabled) findings.push(...detector.finish(ctx));
  const variantKeys = new Set(
    findings.filter((finding) => finding.detector === "symbol-variant").map((finding) => `${finding.conceptId ?? ""}|${finding.path}`)
  );
  const deduped = findings.filter(
    (finding) => finding.detector !== "term-unmapped" || !variantKeys.has(`${finding.conceptId ?? ""}|${finding.path}`)
  );
  const mutedFindings = [];
  const mutedCounts = /* @__PURE__ */ new Map();
  const unmuted = [];
  for (const finding of deduped) {
    const owner = acceptedBy(finding, ctx.concepts);
    if (owner === void 0) {
      unmuted.push(finding);
      continue;
    }
    mutedFindings.push(finding);
    const key = `${owner.conceptId}#${owner.index}`;
    const entry = mutedCounts.get(key) ?? { conceptId: owner.conceptId, index: owner.index, count: 0 };
    entry.count++;
    mutedCounts.set(key, entry);
  }
  const visible = unmuted.filter(
    (finding) => options.minConfidence === void 0 ? true : confidenceRank(finding.confidence) <= confidenceRank(options.minConfidence)
  ).sort(compareFindings);
  const capped = visible.length > options.maxFindings ? visible.slice(0, options.maxFindings) : visible;
  if (visible.length > capped.length) {
    truncated = true;
    truncatedReason = "limit";
  }
  const counts = {};
  for (const id of ["duplicate-type", "contract-drift", "symbol-variant", "term-unmapped"]) counts[id] = 0;
  for (const finding of capped) counts[finding.detector] = (counts[finding.detector] ?? 0) + 1;
  return {
    root,
    startedAt,
    durationMs: now() - startedAt,
    filesScanned,
    filesSkipped,
    bytesScanned,
    truncated,
    ...truncatedReason === void 0 ? {} : { truncatedReason },
    findings: capped,
    counts,
    skippedTypes: ctx.skippedTypes,
    mutedFindings: mutedFindings.sort(compareFindings),
    mutedByAccepted: [...mutedCounts.values()].sort(
      (left, right) => left.conceptId === right.conceptId ? left.index - right.index : left.conceptId < right.conceptId ? -1 : 1
    )
  };
}

// src/cli.ts
var EXIT_CLEAN = 0;
var EXIT_FINDINGS = 1;
var EXIT_ERROR = 2;
var CliError = class extends Error {
  code;
  issues;
  constructor(code, message, issues) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.issues = issues;
  }
};
function packageVersion() {
  const text = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  return JSON.parse(text).version;
}
function usage() {
  return [
    "Usage: dsh-semantic-drift scan [options]",
    "",
    "Options:",
    "  --all                     Report every finding (default: --changed)",
    "  --changed                 Report findings touching files changed since --base",
    "  --base <ref>              Git base ref (default: origin/main, then HEAD^)",
    "  --json                    Machine-readable output",
    "  --root <dir>              Workspace root (default: current directory)",
    "  --vocabulary <path>       Vocabulary file, relative to the root",
    `  --min-confidence <level>  ${CONFIDENCE_LEVELS.join(" | ")} (default: medium)`,
    `  --detectors <list>        Comma-separated subset of ${DETECTOR_IDS.join(", ")}`,
    "  --paths <list>            Comma-separated workspace-relative paths to scan",
    "  --version                 Print the package version",
    "  --help                    Print this help",
    "",
    "Exit codes: 0 no findings, 1 findings, 2 usage or runtime error."
  ].join("\n");
}
function optionValue(argv, index, name) {
  const token = argv[index];
  const eq = token.startsWith(`${name}=`);
  if (eq) return { value: token.slice(name.length + 1), next: index + 1 };
  const value = argv[index + 1];
  if (value === void 0 || value.startsWith("--")) throw new CliError("bad-request", `${name} needs a value.`);
  return { value, next: index + 2 };
}
function safeRelative(value, label) {
  if (isAbsolute(value)) throw new CliError("bad-request", `${label} must be relative to the workspace root.`);
  const parts = value.split(/[\\/]+/);
  if (parts.includes("..")) throw new CliError("bad-request", `${label} cannot escape the workspace root.`);
  return value;
}
function parseArgs(argv, cwd) {
  const args = argv[0] === "scan" ? argv.slice(1) : argv;
  const defaults = liveConfig(void 0);
  const options = {
    root: cwd,
    vocabulary: defaults.vocabularyPath ?? DEFAULT_VOCABULARY_PATH,
    mode: "changed",
    json: false,
    minConfidence: defaults.minConfidence,
    detectors: [...defaults.detectors.length > 0 ? defaults.detectors : DETECTOR_IDS],
    paths: []
  };
  let modeSeen;
  for (let index = 0; index < args.length; ) {
    const token = args[index];
    if (token === "--help" || token === "-h") return "help";
    if (token === "--version" || token === "-v") return "version";
    if (token === "--json") {
      options.json = true;
      index++;
      continue;
    }
    if (token === "--changed" || token === "--all") {
      const mode = token === "--all" ? "all" : "changed";
      if (modeSeen !== void 0 && modeSeen !== mode) {
        throw new CliError("bad-request", "Pass either --changed or --all, not both.");
      }
      modeSeen = mode;
      options.mode = mode;
      index++;
      continue;
    }
    if (token === "--root") {
      const parsed = optionValue(args, index, "--root");
      options.root = resolve4(cwd, parsed.value);
      index = parsed.next;
      continue;
    }
    if (token === "--vocabulary") {
      const parsed = optionValue(args, index, "--vocabulary");
      options.vocabulary = safeRelative(parsed.value, "--vocabulary");
      index = parsed.next;
      continue;
    }
    if (token === "--base") {
      const parsed = optionValue(args, index, "--base");
      options.base = parsed.value;
      index = parsed.next;
      continue;
    }
    if (token === "--min-confidence") {
      const parsed = optionValue(args, index, "--min-confidence");
      if (!CONFIDENCE_LEVELS.includes(parsed.value)) {
        throw new CliError("bad-request", `--min-confidence must be one of ${CONFIDENCE_LEVELS.join(", ")}.`);
      }
      options.minConfidence = parsed.value;
      index = parsed.next;
      continue;
    }
    if (token === "--detectors") {
      const parsed = optionValue(args, index, "--detectors");
      const values = parsed.value.split(",").map((value) => value.trim()).filter((value) => value !== "");
      const unknown = values.filter((value) => !DETECTOR_IDS.includes(value));
      if (unknown.length > 0) throw new CliError("bad-request", `Unknown detector: ${unknown.join(", ")}.`);
      if (values.length === 0) throw new CliError("bad-request", "--detectors needs at least one detector.");
      options.detectors = values;
      index = parsed.next;
      continue;
    }
    if (token === "--paths") {
      const parsed = optionValue(args, index, "--paths");
      options.paths = parsed.value.split(",").map((value) => value.trim()).filter((value) => value !== "").map((value) => safeRelative(value, "--paths"));
      index = parsed.next;
      continue;
    }
    throw new CliError("bad-request", `Unknown argument: ${token}. Use --help.`);
  }
  let rootInfo;
  try {
    rootInfo = statSync(options.root);
  } catch {
    throw new CliError("bad-request", `Workspace root does not exist: ${options.root}`);
  }
  if (!rootInfo.isDirectory()) throw new CliError("bad-request", `Workspace root is not a directory: ${options.root}`);
  return options;
}
function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
}
function hasRef(root, ref) {
  try {
    git(root, ["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}
function resolveBase(root, explicit) {
  if (explicit !== void 0 && explicit !== "") return explicit;
  for (const candidate of ["origin/main", "HEAD^"]) {
    if (hasRef(root, candidate)) return candidate;
  }
  throw new CliError("bad-request", "Cannot determine a base ref; pass --base <ref>, or use --all.");
}
function changedFiles(root, base) {
  const patterns = [
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", `${base}...HEAD`, "--"],
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", "--"],
    ["diff", "--name-only", "--cached", "--diff-filter=ACMRTUXB", "--"],
    ["ls-files", "--others", "--exclude-standard"]
  ];
  const paths = /* @__PURE__ */ new Set();
  for (const args of patterns) {
    let output;
    try {
      output = git(root, args);
    } catch (error) {
      throw new CliError("bad-request", `git ${args.join(" ")} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const line of output.split("\n")) {
      const value = line.trim();
      if (value !== "") paths.add(toPosix2(value));
    }
  }
  return [...paths].sort();
}
function toPosix2(value) {
  return value.split("\\").join("/");
}
function touchesChanged(finding, changed) {
  if (changed.has(finding.path)) return true;
  const other = finding.detail.primaryPath;
  return other !== void 0 && changed.has(other);
}
function findingView(finding) {
  return { ...finding };
}
function textOutput(options, base, changed, findings, summary) {
  const lines = [];
  const scope = options.mode === "all" ? "all files" : `${changed.length} changed file${changed.length === 1 ? "" : "s"}`;
  lines.push(`Scanned ${summary.filesScanned} files (${scope}) in ${summary.durationMs} ms.`);
  if (summary.truncated) lines.push(`Result truncated (${summary.truncatedReason ?? "limit"}).`);
  if (findings.length === 0) {
    lines.push("No drift findings.");
    return lines.join("\n");
  }
  lines.push(`${findings.length} finding${findings.length === 1 ? "" : "s"}:`);
  for (const finding of findings) {
    lines.push(`${finding.path}:${finding.line}  ${finding.symbol}  [${finding.detector}/${finding.confidence}]  ${finding.message}`);
  }
  if (base !== void 0 && options.mode === "changed") lines.push(`Changed since ${base}.`);
  return lines.join("\n");
}
async function runCli(argv, cwd = process.cwd()) {
  const write = (text) => {
    process.stdout.write(text.endsWith("\n") ? text : `${text}
`);
  };
  const fail = (error) => {
    const code = error instanceof CliError ? error.code : "failed";
    const message = error instanceof Error ? error.message : String(error);
    const issues = error instanceof CliError ? error.issues : void 0;
    if (argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ ok: false, code, message, ...issues === void 0 ? {} : { issues } })}
`);
    } else {
      process.stderr.write(`${message}
`);
    }
    return EXIT_ERROR;
  };
  try {
    const parsed = parseArgs(argv, cwd);
    if (parsed === "help") {
      write(usage());
      return EXIT_CLEAN;
    }
    if (parsed === "version") {
      write(packageVersion());
      return EXIT_CLEAN;
    }
    const options = parsed;
    const state = await loadVocabulary(options.root, options.vocabulary);
    const errors = state.issues.filter((issue) => issue.severity === "error");
    if (hasErrors(state.issues)) {
      throw new CliError("invalid-vocabulary", `${options.vocabulary} has validation errors; fix it before scanning.`, errors);
    }
    let base;
    let changed = [];
    if (options.mode === "changed") {
      base = resolveBase(options.root, options.base);
      changed = changedFiles(options.root, base);
      if (changed.length === 0) {
        if (options.json) {
          write(JSON.stringify({
            ok: true,
            workspace: options.root,
            vocabularyFile: options.vocabulary,
            mode: "changed",
            base,
            changedFiles: [],
            total: 0,
            findings: []
          }));
        } else {
          write("No changed files.");
        }
        return EXIT_CLEAN;
      }
    }
    const defaults = liveConfig(void 0);
    const summary = await scanWorkspace({
      root: options.root,
      document: state.document,
      citationStyle: defaults.citationStyle,
      timeoutMs: defaults.timeoutMs,
      maxFindings: defaults.maxFindings,
      maxFileBytes: defaults.maxFileBytes,
      maxFiles: defaults.maxFiles,
      detectors: options.detectors,
      minConfidence: options.minConfidence,
      ...options.paths.length === 0 ? {} : { paths: options.paths }
    });
    const changedSet = new Set(changed);
    const findings = options.mode === "changed" ? summary.findings.filter((finding) => touchesChanged(finding, changedSet)) : summary.findings;
    const counts = Object.fromEntries(DETECTOR_IDS.map((id) => [id, 0]));
    for (const finding of findings) counts[finding.detector] = (counts[finding.detector] ?? 0) + 1;
    if (options.json) {
      write(JSON.stringify({
        ok: true,
        workspace: options.root,
        vocabularyFile: options.vocabulary,
        vocabularyExists: state.exists,
        mode: options.mode,
        ...base === void 0 ? {} : { base },
        ...options.mode === "changed" ? { changedFiles: changed } : {},
        scanned: {
          files: summary.filesScanned,
          skipped: summary.filesSkipped,
          bytes: summary.bytesScanned,
          durationMs: summary.durationMs,
          truncated: summary.truncated,
          ...summary.truncatedReason === void 0 ? {} : { truncatedReason: summary.truncatedReason }
        },
        counts,
        total: findings.length,
        findings: findings.map(findingView)
      }));
    } else {
      write(textOutput(options, base, changed, findings, summary));
    }
    return findings.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN;
  } catch (error) {
    if (error instanceof ScanError) return fail(new CliError("bad-request", error.message));
    return fail(error);
  }
}
function isEntryPoint2() {
  const entry = process.argv[1];
  if (entry === void 0) return false;
  try {
    return realpathSync(resolve4(entry)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isEntryPoint2()) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = EXIT_ERROR;
  });
}
export {
  runCli
};

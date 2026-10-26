// dsh-semantic-drift 0.1.4 — host half (generated, do not edit)

// src/config.ts
import z from "@deepseek-ai/schemastery";

// src/protocol.ts
var PACKAGE_NAME = "dsh-semantic-drift";
var ROW_ID = "semantic-drift";
var API_PREFIX = "/semantic-drift";
var VOCABULARY_VERSION = 1;
var DEFAULT_VOCABULARY_PATH = ".dsh/semantics.yaml";
var CONCEPT_KINDS = ["entity", "quantity", "enum", "status", "reference"];
var CONFIDENCE_LEVELS = ["high", "medium", "low"];
var CITATION_STYLES = ["file+symbol", "file:line"];
var DETECTOR_IDS = ["duplicate-type", "contract-drift", "symbol-variant", "term-unmapped"];
function formatCitation(style, path, symbol, line) {
  return style === "file:line" ? `${path}:${line}` : `${path}::${symbol}`;
}

// src/config.ts
var Config = z.object({
  vocabularyPath: z.string().default(DEFAULT_VOCABULARY_PATH).description("Vocabulary file, relative to the workspace root. The panel and every tool read and write this one file."),
  announceToAgent: z.boolean().default(true).description("Inject the vocabulary into every agent prompt. Turn off to keep the plugin silent in prompts."),
  citationStyle: z.union([...CITATION_STYLES]).default("file+symbol").description("Shape of copied references: `file+symbol` stays valid across edits, `file:line` is clickable but drifts."),
  minConfidence: z.union([...CONFIDENCE_LEVELS]).default("medium").description("Lowest confidence the agent tools report. The panel always receives every level and filters on screen."),
  timeoutMs: z.number().min(1e3).max(12e4).default(3e4).description("Wall-clock budget for one scan. A scan that runs out returns the findings it already has, marked truncated."),
  maxFindings: z.number().min(1).max(5e4).default(5e3).description("Hard cap on findings returned by one scan."),
  maxFileBytes: z.number().min(1024).max(64 * 1024 * 1024).default(1048576).description("Files larger than this are skipped and counted, never read."),
  maxFiles: z.number().min(100).max(2e5).default(5e4).description("Hard cap on files visited by one scan."),
  detectors: z.array(z.union([...DETECTOR_IDS])).default([...DETECTOR_IDS]).description("Detectors a scan runs. An empty selection runs all of them.")
});

// src/prompt.ts
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
var PROMPT_SECTION = "plugin:semantic-drift";
var PROMPT_SECTION_ORDER = 210;
var MAX_LINES = 200;
var MAX_CONCEPTS = 120;
var cache = /* @__PURE__ */ new Map();
function oneLine(text, limit = 140) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}\u2026`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function conceptLines(file) {
  let info;
  try {
    info = statSync(file);
  } catch {
    return { kind: "missing" };
  }
  const cached = cache.get(file);
  if (cached !== void 0 && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return cached.body;
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { kind: "missing" };
  }
  let raw;
  try {
    raw = parseYaml(text);
  } catch (error) {
    const body2 = { kind: "invalid", message: oneLine(error instanceof Error ? error.message : String(error)) };
    cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, body: body2 });
    return body2;
  }
  if (!isRecord(raw) || !Array.isArray(raw.concepts)) {
    const body2 = { kind: "invalid", message: "the file is not a mapping with a `concepts` list" };
    cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, body: body2 });
    return body2;
  }
  const concepts = raw.concepts.filter(isRecord);
  const lines = [];
  for (const entry of concepts.slice(0, MAX_CONCEPTS)) {
    const id = typeof entry.id === "string" ? entry.id : "";
    const canonical = isRecord(entry.canonical) ? entry.canonical : {};
    const symbol = typeof canonical.symbol === "string" ? canonical.symbol : "";
    if (id === "" || symbol === "") continue;
    const kind = typeof entry.kind === "string" && CONCEPT_KINDS.includes(entry.kind) ? entry.kind : void 0;
    const note = typeof entry.note === "string" ? oneLine(entry.note) : "";
    const head = kind === void 0 ? `${id} -> ${symbol}` : `${id} (${kind}) -> ${symbol}`;
    lines.push(note === "" ? `- ${head}` : `- ${head}: ${note}`);
  }
  const body = { kind: "concepts", lines, count: concepts.length };
  cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, body });
  return body;
}
function vocabularyFileFor(ctx, config, workspace) {
  const relative = config.vocabularyPath !== void 0 && config.vocabularyPath.trim() !== "" ? config.vocabularyPath.trim() : DEFAULT_VOCABULARY_PATH;
  const context = ctx;
  const list = workspace.list();
  let ownerPath;
  try {
    const agents = context.get?.("agents");
    const sessionId = agents?.currentInitiator?.()?.id;
    if (sessionId !== void 0) {
      const registry = context.get?.("workspaceRegistry");
      const owner = registry?.list().find((item) => (item.sessionIds ?? []).some((id) => String(id) === sessionId));
      if (owner !== void 0 && typeof owner.path === "string") ownerPath = owner.path;
    }
  } catch {
    ownerPath = void 0;
  }
  const workspacePath = ownerPath ?? list[0]?.path ?? workspace.defaultDirectory();
  return { file: resolve(workspacePath, relative), workspacePath };
}
function buildPromptText(ctx, config, workspace) {
  const header = [
    "## Project vocabulary (dsh-semantic-drift)",
    "This project records its business concepts in one versioned vocabulary file.",
    "Rules:",
    "- Before adding or renaming a data field, type, enum or message, call `semantic_get` with the concept id or canonical symbol.",
    "- Name the thing exactly as `canonical.symbol` spells it.",
    "- If the concept is missing from the list below, call `semantic_upsert` to register it first.",
    "- If a known spelling must stay, call `semantic_accept` with a reason.",
    "- If a name has to differ from the canonical (an external contract, legacy serialization), record that deviation with `semantic_accept` instead of leaving it silent."
  ];
  let body;
  try {
    const { file, workspacePath } = vocabularyFileFor(ctx, config, workspace);
    const lines = conceptLines(file);
    if (lines.kind === "missing") {
      body = [
        "",
        `No concept is recorded yet for ${basename(workspacePath)} (expected vocabulary file: \`${file}\`).`,
        "When you introduce a domain term, register it with `semantic_upsert`; a vocabulary that starts empty stays empty."
      ];
    } else if (lines.kind === "invalid") {
      body = [
        "",
        `The vocabulary file \`${file}\` cannot be parsed (${lines.message}).`,
        "Treat the vocabulary as unknown, not as empty: reads report no concepts, and every write is refused until the file is fixed by hand."
      ];
    } else {
      body = ["", `Concepts (${lines.count}):`, ...lines.lines];
      if (lines.count > lines.lines.length) {
        body.push(`- ... ${lines.count - lines.lines.length} more; call \`semantic_list\` for the rest.`);
      }
    }
  } catch {
    body = ["", "The vocabulary file could not be read; call `semantic_list` to check it."];
  }
  const all = [...header, ...body];
  if (all.length <= MAX_LINES) return all.join("\n");
  return [...all.slice(0, MAX_LINES - 1), `- (truncated at ${MAX_LINES} lines)`].join("\n");
}

// src/service.ts
import { basename as basename3 } from "node:path";

// src/store.ts
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename as basename2, dirname, resolve as resolve2 } from "node:path";
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
  "**/.venv/**"
];
var CONCEPT_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
var SYMBOL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
var KNOWN_CONCEPT_KEYS = /* @__PURE__ */ new Set(["id", "terms", "kind", "canonical", "note", "accepted"]);
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
  const version = typeof raw.version === "number" ? raw.version : VOCABULARY_VERSION;
  if (raw.version !== void 0 && version !== VOCABULARY_VERSION) {
    issues.push({
      code: "version-unsupported",
      message: `Vocabulary version ${String(raw.version)} is not supported; this plugin writes version ${VOCABULARY_VERSION}.`,
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
        issues.push({
          code: "id-format",
          message: `Concept id \`${id}\` must look like \`group.name\`: lowercase letters, digits and underscores, at least one dot.`,
          severity: "error",
          path: `${at}.id`,
          line: findLine(text, id)
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
        ...note === void 0 ? {} : { note },
        ...accepted.length === 0 ? {} : { accepted }
      });
    }
  }
  const document = {
    version: VOCABULARY_VERSION,
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
function serializeVocabulary(document) {
  const plain = { version: VOCABULARY_VERSION };
  if (document.meta?.project !== void 0 || document.meta?.updated !== void 0) {
    plain.meta = {
      ...document.meta.project === void 0 ? {} : { project: document.meta.project },
      ...document.meta.updated === void 0 ? {} : { updated: document.meta.updated }
    };
  }
  plain.exclude = [...document.exclude];
  plain.concepts = document.concepts.map((concept) => ({
    id: concept.id,
    terms: [...concept.terms],
    kind: concept.kind,
    canonical: {
      symbol: concept.canonical.symbol,
      ...concept.canonical.type === void 0 ? {} : { type: concept.canonical.type },
      ...concept.canonical.unit === void 0 ? {} : { unit: concept.canonical.unit }
    },
    ...concept.note === void 0 ? {} : { note: concept.note },
    ...concept.accepted === void 0 || concept.accepted.length === 0 ? {} : {
      accepted: concept.accepted.map((entry) => ({
        symbol: entry.symbol,
        ...entry.path === void 0 ? {} : { path: entry.path },
        reason: entry.reason
      }))
    }
  }));
  const doc = new Document(plain);
  const excludeNode = doc.get("exclude", true);
  if (isSeq(excludeNode)) excludeNode.flow = true;
  for (const [index] of document.concepts.entries()) {
    const termsNode = doc.getIn(["concepts", index, "terms"], true);
    if (isSeq(termsNode)) termsNode.flow = true;
  }
  return `${doc.toString({ lineWidth: 0, minContentWidth: 0 })}`;
}
function vocabularyFile(root, relativePath) {
  return resolve2(root, relativePath);
}
var cache2 = /* @__PURE__ */ new Map();
var writeQueues = /* @__PURE__ */ new Map();
function withWriteQueue(key, run) {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  writeQueues.set(key, next.catch(() => void 0));
  return next;
}
async function loadVocabulary(root, relativePath) {
  const file = vocabularyFile(root, relativePath);
  let info;
  try {
    info = await stat(file);
  } catch {
    const document = emptyVocabulary(basename2(root));
    return {
      file,
      relativeFile: relativePath,
      exists: false,
      document,
      issues: [],
      valid: true
    };
  }
  const cached = cache2.get(file);
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
      document: emptyVocabulary(basename2(root)),
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
  cache2.set(file, { mtimeMs: info.mtimeMs, size: info.size, state });
  return state;
}
async function writeAtomic(file, text) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, file);
}
async function saveVocabulary(root, relativePath, document, options = {}) {
  const file = vocabularyFile(root, relativePath);
  const project = document.meta?.project ?? basename2(root);
  const next = {
    version: VOCABULARY_VERSION,
    meta: { project, updated: today(options.now) },
    exclude: [...document.exclude],
    concepts: document.concepts
  };
  const text = serializeVocabulary(next);
  const parsed = parseVocabularyText(text);
  if (hasErrors(parsed.issues)) return { ok: false, issues: parsed.issues };
  return withWriteQueue(file, async () => {
    const previous = cache2.get(file);
    const before = previous?.state.text ?? void 0;
    await writeAtomic(file, text);
    cache2.delete(file);
    const state = await loadVocabulary(root, relativePath);
    return { ok: true, state, changed: before !== state.text };
  });
}
async function saveRawVocabulary(root, relativePath, text) {
  const file = vocabularyFile(root, relativePath);
  const body = text.endsWith("\n") ? text : `${text}
`;
  const parsed = parseVocabularyText(body);
  if (hasErrors(parsed.issues)) return { ok: false, issues: parsed.issues };
  return withWriteQueue(file, async () => {
    const previous = cache2.get(file);
    const before = previous?.state.text ?? void 0;
    await writeAtomic(file, body);
    cache2.delete(file);
    const state = await loadVocabulary(root, relativePath);
    return { ok: true, state, changed: before !== state.text };
  });
}

// src/scan/index.ts
import { readFile as readFile2, stat as stat3 } from "node:fs/promises";
import { resolve as resolve4 } from "node:path";

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
var MAX_CONCEPTS2 = 40;
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
      const canonicals = entries.slice(0, MAX_CONCEPTS2).map((entry) => escapeRegExp2(entry.canonical));
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
      for (const entry of entries.slice(0, MAX_CONCEPTS2)) {
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
import { join, resolve as resolve3, sep } from "node:path";
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
  const root = resolve3(options.root);
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
  const root = resolve4(options.root);
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

// src/workspace.ts
import { realpath, stat as stat4 } from "node:fs/promises";
import { isAbsolute, resolve as resolve5, sep as sep2 } from "node:path";
var WorkspaceError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
};
async function canonicalDirectory(path) {
  const absolute = resolve5(path);
  let real;
  try {
    real = await realpath(absolute);
  } catch {
    throw new WorkspaceError("missing", `Directory does not exist: ${absolute}`);
  }
  let info;
  try {
    info = await stat4(real);
  } catch {
    throw new WorkspaceError("missing", `Directory does not exist: ${absolute}`);
  }
  if (!info.isDirectory()) throw new WorkspaceError("not-directory", `Not a directory: ${absolute}`);
  return real;
}
function contains(parent, child) {
  return child === parent || child.startsWith(parent.endsWith(sep2) ? parent : `${parent}${sep2}`);
}
function createWorkspaceResolver(ctx) {
  const registry = () => {
    try {
      return ctx.get("workspaceRegistry");
    } catch {
      return void 0;
    }
  };
  const workingDirectory = () => {
    try {
      return ctx.get("workingDirectory");
    } catch {
      return void 0;
    }
  };
  const defaultDirectory = () => {
    const face = workingDirectory();
    const value = face?.defaultDirectory;
    return typeof value === "string" && value !== "" ? value : process.cwd();
  };
  const list = () => {
    const face = registry();
    if (face === void 0) return [];
    try {
      return face.list().flatMap((workspace) => {
        if (typeof workspace.path !== "string" || workspace.path === "") return [];
        return [{
          id: String(workspace.id),
          title: typeof workspace.title === "string" ? workspace.title : workspace.path,
          path: workspace.path
        }];
      });
    } catch {
      return [];
    }
  };
  const resolve6 = async (requested) => {
    const workspaces = list();
    if (requested === void 0 || requested.trim() === "") {
      const fallback = workspaces[0];
      const path = await canonicalDirectory(fallback?.path ?? defaultDirectory());
      return {
        path,
        ...fallback?.title === void 0 ? {} : { title: fallback.title },
        resolvedFrom: "default"
      };
    }
    if (!isAbsolute(requested)) {
      throw new WorkspaceError("forbidden", `Workspace path must be absolute: ${requested}`);
    }
    const target = await canonicalDirectory(requested);
    for (const workspace of workspaces) {
      let canonicalRoot;
      try {
        canonicalRoot = await canonicalDirectory(workspace.path);
      } catch {
        continue;
      }
      if (!contains(canonicalRoot, target)) continue;
      return { path: target, title: workspace.title, resolvedFrom: "request" };
    }
    try {
      const canonicalDefault = await canonicalDirectory(defaultDirectory());
      if (contains(canonicalDefault, target)) return { path: target, resolvedFrom: "request" };
    } catch {
    }
    throw new WorkspaceError(
      "forbidden",
      `${target} is not a registered workspace and is not inside the Host's default directory.`
    );
  };
  const resolveForSession = async (sessionId) => {
    if (sessionId !== void 0 && sessionId !== "") {
      const registryFace = registry();
      try {
        const owner = registryFace?.list().find((workspace) => (workspace.sessionIds ?? []).some((id) => String(id) === sessionId));
        if (owner !== void 0 && typeof owner.path === "string") {
          const path = await canonicalDirectory(owner.path);
          return {
            path,
            ...typeof owner.title === "string" ? { title: owner.title } : {},
            resolvedFrom: "session"
          };
        }
      } catch {
      }
    }
    return await resolve6();
  };
  return { list, defaultDirectory, resolve: resolve6, resolveForSession };
}

// src/service.ts
var SemanticError = class extends Error {
  code;
  issues;
  constructor(code, message, issues = []) {
    super(message);
    this.name = "SemanticError";
    this.code = code;
    this.issues = issues;
  }
};
var MAX_STATE_TEXT = 1048576;
function hasErrorIssues(state) {
  return hasErrors(state.issues);
}
function refuseInvalid(state) {
  throw new SemanticError(
    "invalid-vocabulary",
    `${state.relativeFile} has validation errors; fix the file before editing it through the panel or a tool.`,
    state.issues.filter((issue) => issue.severity === "error")
  );
}
function coerceConcept(input, existing) {
  const canonical = { symbol: input.canonical?.symbol ?? existing?.canonical.symbol ?? "" };
  const type = input.canonical?.type ?? existing?.canonical.type;
  if (type !== void 0) canonical.type = type;
  const unit = input.canonical?.unit ?? existing?.canonical.unit;
  if (unit !== void 0) canonical.unit = unit;
  const note = input.note ?? existing?.note;
  const accepted = input.accepted ?? existing?.accepted;
  return {
    id: input.id ?? existing?.id ?? "",
    terms: input.terms ?? existing?.terms ?? [],
    kind: input.kind ?? existing?.kind ?? "entity",
    canonical,
    ...note === void 0 ? {} : { note },
    ...accepted === void 0 ? {} : { accepted }
  };
}
function createSemanticService(options) {
  const { config, workspace } = options;
  const relativePath = () => config.vocabularyPath !== void 0 && config.vocabularyPath.trim() !== "" ? config.vocabularyPath.trim() : DEFAULT_VOCABULARY_PATH;
  const load = async (target) => await loadVocabulary(target.path, relativePath());
  const state = async (requested) => {
    const target = await workspace.resolve(requested);
    const vocabulary = await load(target);
    const trimmed = vocabulary.text !== void 0 && vocabulary.text.length > MAX_STATE_TEXT ? { ...vocabulary, text: void 0 } : vocabulary;
    return {
      ok: true,
      workspace: {
        path: target.path,
        ...target.title === void 0 ? {} : { title: target.title },
        resolvedFrom: target.resolvedFrom
      },
      workspaces: workspace.list(),
      vocabulary: trimmed,
      citationStyle: config.citationStyle,
      minConfidence: config.minConfidence,
      version: options.version,
      effective: {
        vocabularyPath: relativePath(),
        announceToAgent: config.announceToAgent !== false,
        citationStyle: config.citationStyle,
        minConfidence: config.minConfidence,
        timeoutMs: config.timeoutMs,
        maxFindings: config.maxFindings,
        maxFileBytes: config.maxFileBytes,
        maxFiles: config.maxFiles,
        detectors: [...config.detectors ?? []]
      }
    };
  };
  const scanOnce = async (requested, overrides = {}) => {
    const target = await workspace.resolve(requested);
    const vocabulary = await load(target);
    const configured = config.detectors ?? [];
    const detectors = overrides.detectors !== void 0 && overrides.detectors.length > 0 ? overrides.detectors : configured.length > 0 ? configured : DETECTOR_IDS;
    const minConfidence = overrides.minConfidence === "all" ? void 0 : overrides.minConfidence ?? config.minConfidence;
    try {
      const summary = await scanWorkspace({
        root: target.path,
        document: vocabulary.document,
        citationStyle: config.citationStyle,
        timeoutMs: Math.min(overrides.timeoutMs ?? config.timeoutMs, 12e4),
        maxFindings: overrides.maxFindings ?? config.maxFindings,
        maxFileBytes: config.maxFileBytes,
        maxFiles: config.maxFiles,
        ...minConfidence === void 0 ? {} : { minConfidence },
        detectors,
        ...overrides.paths === void 0 ? {} : { paths: overrides.paths }
      });
      return {
        ok: true,
        workspace: {
          path: target.path,
          ...target.title === void 0 ? {} : { title: target.title }
        },
        summary,
        vocabularyIssues: vocabulary.issues
      };
    } catch (error) {
      if (error instanceof ScanError) throw new SemanticError("bad-request", error.message);
      throw error;
    }
  };
  const save = async (requested, document) => {
    const target = await workspace.resolve(requested);
    const current = await load(target);
    if (current.exists && hasErrorIssues(current)) refuseInvalid(current);
    const result = await saveVocabulary(target.path, relativePath(), document);
    if (!result.ok) {
      throw new SemanticError("invalid-vocabulary", "The vocabulary was not written because it failed validation.", result.issues);
    }
    return result.state;
  };
  const saveRaw = async (requested, text) => {
    const target = await workspace.resolve(requested);
    const result = await saveRawVocabulary(target.path, relativePath(), text);
    if (!result.ok) {
      throw new SemanticError("invalid-vocabulary", "The vocabulary was not written because it failed validation.", result.issues);
    }
    return result.state;
  };
  const init = async (requested) => {
    const target = await workspace.resolve(requested);
    const current = await load(target);
    if (current.exists) return current;
    const document = emptyVocabulary(basename3(target.path));
    const result = await saveVocabulary(target.path, relativePath(), document);
    if (!result.ok) {
      throw new SemanticError("invalid-vocabulary", "Could not create the vocabulary file.", result.issues);
    }
    return result.state;
  };
  const changeException = async (requested, input) => {
    const target = await workspace.resolve(requested);
    const current = await load(target);
    if (!current.exists) {
      throw new SemanticError("not-found", `No vocabulary file at ${current.relativeFile}.`);
    }
    if (hasErrorIssues(current)) refuseInvalid(current);
    const concept = current.document.concepts.find((entry) => entry.id === input.conceptId);
    if (concept === void 0) {
      throw new SemanticError("not-found", `No concept with id ${input.conceptId}.`);
    }
    const existing = concept.accepted ?? [];
    const op = input.op ?? "add";
    const normalizePath = (value) => {
      const trimmed = (value ?? "").trim();
      return trimmed === "" ? void 0 : trimmed;
    };
    const withAccepted = async (next, changed) => {
      const nextConcept = { ...concept };
      if (next.length === 0) delete nextConcept.accepted;
      else nextConcept.accepted = next;
      const document = {
        ...current.document,
        concepts: current.document.concepts.map((entry) => entry.id === concept.id ? nextConcept : entry)
      };
      const result = await saveVocabulary(target.path, relativePath(), document);
      if (!result.ok) {
        throw new SemanticError("invalid-vocabulary", "The exception was not written because it failed validation.", result.issues);
      }
      return { state: result.state, concept: nextConcept, changed };
    };
    if (op === "clear") {
      if (existing.length === 0) return { state: current, concept, changed: "unchanged" };
      return await withAccepted([], "removed");
    }
    const symbol = (input.symbol ?? "").trim();
    if (symbol === "") throw new SemanticError("bad-request", "symbol is required.");
    const reason = (input.reason ?? "").trim();
    const matchPath = normalizePath(input.previousPath);
    const occurrence = Number.isInteger(input.occurrence) && input.occurrence >= 0 ? input.occurrence : 0;
    const matches = existing.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.symbol === symbol && (entry.path ?? "") === (matchPath ?? ""));
    const found = matches[occurrence];
    if (op === "update" || op === "add") {
      if (reason === "") {
        throw new SemanticError("bad-request", "reason is required: an accepted exception without a reason is an undocumented decision.");
      }
    }
    if (op === "add") {
      const path2 = normalizePath(input.path);
      if (existing.some((entry) => entry.symbol === symbol && (entry.path ?? "") === (path2 ?? ""))) {
        return { state: current, concept, changed: "unchanged" };
      }
      return await withAccepted(
        [...existing, { symbol, ...path2 === void 0 ? {} : { path: path2 }, reason }],
        "added"
      );
    }
    if (found === void 0) {
      if (op === "remove") {
        const misplaced = input.previousPath === void 0 && normalizePath(input.path) !== void 0 && existing.some((entry) => entry.symbol === symbol && (entry.path ?? "") === (normalizePath(input.path) ?? ""));
        if (misplaced) {
          throw new SemanticError(
            "not-found",
            `No accepted exception for ${symbol} (whole symbol). To remove the entry at ${normalizePath(input.path)}, pass it as \`previousPath\`: \`path\` is the scope an update moves to.`
          );
        }
        return { state: current, concept, changed: "unchanged" };
      }
      throw new SemanticError(
        "not-found",
        `No accepted exception for ${symbol}${matchPath === void 0 ? " (whole symbol)" : ` at ${matchPath}`}.`
      );
    }
    if (op === "remove") {
      return await withAccepted(existing.filter((_, index) => index !== found.index), "removed");
    }
    const path = normalizePath(input.path);
    const clash = existing.some(
      (entry, index) => index !== found.index && entry.symbol === symbol && (entry.path ?? "") === (path ?? "")
    );
    if (clash) {
      throw new SemanticError("conflict", `An identical exception for ${symbol} already exists.`);
    }
    return await withAccepted(
      existing.map(
        (entry, index) => index === found.index ? { symbol, ...path === void 0 ? {} : { path }, reason } : entry
      ),
      "updated"
    );
  };
  const upsert = async (requested, input) => {
    const target = await workspace.resolve(requested);
    const current = await load(target);
    if (hasErrorIssues(current)) refuseInvalid(current);
    const id = input.concept.id?.trim();
    if (id === void 0 || id === "") throw new SemanticError("bad-request", "concept.id is required.");
    const existing = current.document.concepts.find((entry) => entry.id === id);
    const mode = input.mode ?? "merge";
    let next;
    if (existing !== void 0 && mode === "replace") {
      next = coerceConcept(input.concept);
    } else {
      next = coerceConcept(input.concept, existing);
    }
    if (next.terms.length === 0) {
      throw new SemanticError("invalid-vocabulary", "concept.terms must list at least one term.", [
        { code: "terms-missing", message: "`terms` must list at least one Chinese term or alias.", severity: "error", path: "concept.terms" }
      ]);
    }
    if (next.canonical.symbol === "") {
      throw new SemanticError("invalid-vocabulary", "concept.canonical.symbol is required.", [
        { code: "symbol-missing", message: "`canonical.symbol` is required.", severity: "error", path: "concept.canonical.symbol" }
      ]);
    }
    const document = {
      ...current.document,
      concepts: existing === void 0 ? [...current.document.concepts, next] : current.document.concepts.map((entry) => entry.id === id ? next : entry)
    };
    const result = await saveVocabulary(target.path, relativePath(), document);
    if (!result.ok) {
      throw new SemanticError("invalid-vocabulary", "The concept was not written because the document failed validation.", result.issues);
    }
    return { state: result.state, concept: next, created: existing === void 0 };
  };
  const inFlight = /* @__PURE__ */ new Map();
  const scan = (requested, overrides = {}) => {
    const key = [
      requested ?? "",
      overrides.detectors?.join(",") ?? "",
      overrides.minConfidence ?? "",
      overrides.paths?.join(",") ?? "",
      overrides.maxFindings ?? "",
      overrides.timeoutMs ?? ""
    ].join("|");
    const running = inFlight.get(key);
    if (running !== void 0) return running;
    const promise = scanOnce(requested, overrides).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  };
  return {
    listWorkspaces: () => workspace.list(),
    resolve: async (requested) => await workspace.resolve(requested),
    state,
    scan,
    save,
    saveRaw,
    init,
    changeException,
    upsert
  };
}
function statusForError(error) {
  if (error instanceof WorkspaceError) return error.code === "forbidden" ? 403 : 404;
  if (error instanceof SemanticError) {
    if (error.code === "not-found") return 404;
    if (error.code === "invalid-vocabulary" || error.code === "bad-request") return 400;
    if (error.code === "unsupported") return 501;
    return 400;
  }
  return 500;
}

// src/routes.ts
var DOCUMENT_LIMIT = 8 * 1024 * 1024;
var RAW_LIMIT = 8 * 1024 * 1024;
var JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
function writeJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(payload);
}
function failure(code, message, issues) {
  return { ok: false, code, message, ...issues === void 0 || issues.length === 0 ? {} : { issues } };
}
function sendFailure(res, error) {
  if (error instanceof WorkspaceError) {
    const code = error.code === "forbidden" ? "forbidden" : "not-found";
    writeJson(res, statusForError(error), failure(code, error.message));
    return;
  }
  if (error instanceof SemanticError) {
    const known = /* @__PURE__ */ new Set(["bad-request", "invalid-vocabulary", "not-found", "conflict", "unsupported"]);
    const code = known.has(error.code) ? error.code : "bad-request";
    writeJson(res, statusForError(error), failure(code, error.message, error.issues));
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  writeJson(res, 500, { ok: false, code: "unsupported", message, detail: message });
}
function sameOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  return true;
}
async function readBody(req, limit) {
  return await new Promise((resolve6, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new SemanticError("bad-request", `Request body exceeds ${limit} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve6(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (error) => reject(error));
  });
}
async function readJson(req, limit) {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new SemanticError("content-type", "A JSON content type is required for this request.");
  }
  const text = await readBody(req, limit);
  if (text.trim() === "") return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SemanticError("bad-json", `Malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SemanticError("bad-json", "The request body must be a JSON object.");
  }
  return parsed;
}
function stringParam(url, name) {
  const value = url.searchParams.get(name);
  return value === null || value === "" ? void 0 : value;
}
function optionalString(value) {
  return typeof value === "string" && value !== "" ? value : void 0;
}
function writeWorkspace(value) {
  const workspace = optionalString(value);
  if (workspace === void 0) {
    throw new SemanticError(
      "bad-request",
      "A write request must name its workspace (`workspace` in the body); refusing to fall back to the Host default directory."
    );
  }
  return workspace;
}
function makeSemanticRoutes(service, diagnostics = () => ({}), hooks = {}) {
  const healthRoute = {
    kind: "exact",
    path: `${API_PREFIX}/health`,
    handler: (req, res) => {
      if (req.method !== "GET") return writeJson(res, 405, failure("method-not-allowed", "Use GET."));
      if (!sameOrigin(req)) return writeJson(res, 403, failure("forbidden", "Cross-site request refused."));
      writeJson(res, 200, { ok: true, ...diagnostics() });
    }
  };
  const state = {
    kind: "exact",
    path: `${API_PREFIX}/state`,
    handler: async (req, res) => {
      try {
        if (req.method !== "GET") return writeJson(res, 405, failure("method-not-allowed", "Use GET."));
        if (!sameOrigin(req)) return writeJson(res, 403, failure("forbidden", "Cross-site request refused."));
        const url = new URL(req.url ?? "/", "http://localhost");
        writeJson(res, 200, await service.state(stringParam(url, "workspace")));
      } catch (error) {
        sendFailure(res, error);
      }
    }
  };
  const scan = {
    kind: "exact",
    path: `${API_PREFIX}/scan`,
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") return writeJson(res, 405, failure("method-not-allowed", "Use POST."));
        if (!sameOrigin(req)) return writeJson(res, 403, failure("forbidden", "Cross-site request refused."));
        const body = await readJson(req, 64 * 1024);
        const detectors = Array.isArray(body.detectors) ? body.detectors.filter((value) => typeof value === "string") : void 0;
        const paths = Array.isArray(body.paths) ? body.paths.filter((value) => typeof value === "string") : void 0;
        const minConfidence = body.minConfidence === "all" ? "all" : body.minConfidence === "high" || body.minConfidence === "medium" || body.minConfidence === "low" ? body.minConfidence : void 0;
        writeJson(res, 200, await service.scan(optionalString(body.workspace), {
          ...detectors === void 0 ? {} : { detectors },
          ...paths === void 0 ? {} : { paths },
          ...minConfidence === void 0 ? {} : { minConfidence }
        }));
      } catch (error) {
        sendFailure(res, error);
      }
    }
  };
  const save = {
    kind: "exact",
    path: `${API_PREFIX}/save`,
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") return writeJson(res, 405, failure("method-not-allowed", "Use POST."));
        if (!sameOrigin(req)) return writeJson(res, 403, failure("forbidden", "Cross-site request refused."));
        const body = await readJson(req, DOCUMENT_LIMIT);
        const document = body.document;
        if (document === void 0 || typeof document !== "object") {
          return writeJson(res, 400, failure("bad-request", "`document` is required."));
        }
        const vocabulary = await service.save(writeWorkspace(body.workspace), document);
        writeJson(res, 200, { ok: true, vocabulary });
      } catch (error) {
        sendFailure(res, error);
      }
    }
  };
  const raw = {
    kind: "exact",
    path: `${API_PREFIX}/raw`,
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") return writeJson(res, 405, failure("method-not-allowed", "Use POST."));
        if (!sameOrigin(req)) return writeJson(res, 403, failure("forbidden", "Cross-site request refused."));
        const body = await readJson(req, RAW_LIMIT);
        if (typeof body.text !== "string") return writeJson(res, 400, failure("bad-request", "`text` is required."));
        const vocabulary = await service.saveRaw(writeWorkspace(body.workspace), body.text);
        writeJson(res, 200, { ok: true, vocabulary });
      } catch (error) {
        sendFailure(res, error);
      }
    }
  };
  const init = {
    kind: "exact",
    path: `${API_PREFIX}/init`,
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") return writeJson(res, 405, failure("method-not-allowed", "Use POST."));
        if (!sameOrigin(req)) return writeJson(res, 403, failure("forbidden", "Cross-site request refused."));
        const body = await readJson(req, 16 * 1024);
        const vocabulary = await service.init(writeWorkspace(body.workspace));
        writeJson(res, 200, { ok: true, vocabulary });
      } catch (error) {
        sendFailure(res, error);
      }
    }
  };
  const settings = {
    kind: "exact",
    path: `${API_PREFIX}/settings`,
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") return writeJson(res, 405, failure("method-not-allowed", "Use POST."));
        if (!sameOrigin(req)) return writeJson(res, 403, failure("forbidden", "Cross-site request refused."));
        const body = await readJson(req, 4 * 1024);
        const announce = body.announceToAgent;
        if (typeof announce !== "boolean") {
          throw new SemanticError("bad-request", "`announceToAgent` must be a boolean.");
        }
        if (hooks.editConfig === void 0) {
          throw new SemanticError(
            "unsupported",
            "This Host exposes no config editor; edit the plugin row under Settings \u2192 Plugins."
          );
        }
        await hooks.editConfig({ announceToAgent: announce });
        const workspace = optionalString(body.workspace);
        if (workspace === void 0) return writeJson(res, 200, { ok: true, announceToAgent: announce });
        writeJson(res, 200, await service.state(workspace));
      } catch (error) {
        sendFailure(res, error);
      }
    }
  };
  const accept = {
    kind: "exact",
    path: `${API_PREFIX}/accept`,
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") return writeJson(res, 405, failure("method-not-allowed", "Use POST."));
        if (!sameOrigin(req)) return writeJson(res, 403, failure("forbidden", "Cross-site request refused."));
        const body = await readJson(req, 64 * 1024);
        const conceptId = optionalString(body.conceptId);
        if (conceptId === void 0) return writeJson(res, 400, failure("bad-request", "`conceptId` is required."));
        const rawOp = typeof body.op === "string" ? body.op : void 0;
        const ops = ["add", "update", "remove", "clear"];
        if (rawOp !== void 0 && !ops.includes(rawOp)) {
          return writeJson(res, 400, failure("bad-request", `Unknown op ${rawOp}; use ${ops.join(", ")}.`));
        }
        const op = rawOp ?? "add";
        const symbol = optionalString(body.symbol);
        if (op !== "clear" && symbol === void 0) {
          return writeJson(res, 400, failure("bad-request", "`symbol` is required for this op."));
        }
        const reason = optionalString(body.reason);
        if ((op === "add" || op === "update") && reason === void 0) {
          return writeJson(res, 400, failure(
            "bad-request",
            "`reason` is required: an exception without a reason is an undocumented decision."
          ));
        }
        const occurrence = typeof body.occurrence === "number" && Number.isInteger(body.occurrence) ? body.occurrence : void 0;
        const result = await service.changeException(writeWorkspace(body.workspace), {
          op,
          conceptId,
          ...symbol === void 0 ? {} : { symbol },
          ...optionalString(body.path) === void 0 ? {} : { path: optionalString(body.path) },
          ...optionalString(body.previousPath) === void 0 ? {} : { previousPath: optionalString(body.previousPath) },
          ...reason === void 0 ? {} : { reason },
          ...occurrence === void 0 ? {} : { occurrence }
        });
        writeJson(res, 200, {
          ok: true,
          vocabulary: result.state,
          concept: result.concept,
          changed: result.changed
        });
      } catch (error) {
        sendFailure(res, error);
      }
    }
  };
  return [healthRoute, settings, state, scan, save, raw, init, accept];
}

// src/define-tool.ts
function isParameterMap(value) {
  return value.type === void 0 && value.properties === void 0;
}
function toJsonSchema(spec) {
  const schema = { type: spec.type };
  if (spec.description !== void 0) schema.description = spec.description;
  if (spec.enum !== void 0) schema.enum = spec.enum;
  if (spec.default !== void 0) schema.default = spec.default;
  if (spec.items !== void 0) schema.items = toJsonSchema(spec.items);
  return schema;
}
function defineTool(definition) {
  const parameters = definition.parameters;
  const outputSchema = definition.output.schema.type === "json" ? {} : definition.output.schema;
  const output = { ...definition.output, schema: outputSchema };
  if (!isParameterMap(parameters)) {
    return { ...definition, parameters, output };
  }
  const properties = {};
  const required = [];
  for (const [name, raw] of Object.entries(parameters)) {
    const spec = raw;
    properties[name] = toJsonSchema(spec);
    if (spec.required === true) required.push(name);
  }
  return {
    ...definition,
    output,
    parameters: {
      type: "object",
      properties,
      ...required.length === 0 ? {} : { required },
      additionalProperties: false
    }
  };
}

// src/tools.ts
function renderJson(_args, value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}
function json(value) {
  return value;
}
function refused(code, message) {
  return json({ ok: false, code, message });
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function sessionOf(exec) {
  const agent = exec.agent;
  const id = agent?.session?.id ?? agent?.session?.header?.id;
  return typeof id === "string" && id !== "" ? id : void 0;
}
function splitList(value) {
  if (value === void 0) return [];
  return value.split(/[,\n]/).map((part) => part.trim()).filter((part) => part !== "");
}
function conceptView(concept) {
  return {
    id: concept.id,
    terms: concept.terms,
    kind: concept.kind,
    canonical: concept.canonical,
    ...concept.note === void 0 ? {} : { note: concept.note },
    ...concept.accepted === void 0 || concept.accepted.length === 0 ? {} : { accepted: concept.accepted }
  };
}
function findingView(finding) {
  return {
    detector: finding.detector,
    confidence: finding.confidence,
    path: finding.path,
    line: finding.line,
    symbol: finding.symbol,
    ...finding.expected === void 0 ? {} : { expected: finding.expected },
    ...finding.conceptId === void 0 ? {} : { conceptId: finding.conceptId },
    citation: finding.citation,
    message: finding.message,
    ...Object.keys(finding.detail).length === 0 ? {} : { detail: finding.detail }
  };
}
function toolError(error) {
  if (error instanceof SemanticError) {
    return json({
      ok: false,
      code: error.code,
      message: error.message,
      ...error.issues.length === 0 ? {} : { issues: error.issues }
    });
  }
  return refused("failed", messageOf(error));
}
function buildSemanticTools(host) {
  const { service } = host;
  const list = defineTool({
    name: "semantic_list",
    description: [
      "List the project vocabulary: one entry per concept, with its dotted id, canonical symbol, kind and note.",
      "Use it before naming a field, type, enum or message so the new name matches the recorded concept.",
      "`hasDrift` is expensive: it runs a scan and returns each concept's finding count."
    ].join(" "),
    parameters: {
      group: { type: "string", description: 'Only concepts whose id starts with this group, e.g. "device".' },
      query: { type: "string", description: "Case-insensitive match against id, terms and canonical symbol." },
      hasDrift: { type: "boolean", description: "Run a scan and keep only concepts with findings (costs one scan)." }
    },
    output: { schema: { type: "json" }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec));
        const state = await service.state(target.path);
        const query = args.query?.trim().toLowerCase() ?? "";
        const group = args.group?.trim();
        let concepts = state.vocabulary.document.concepts;
        if (group !== void 0) concepts = concepts.filter((concept) => concept.id === group || concept.id.startsWith(`${group}.`));
        if (query !== "") {
          concepts = concepts.filter(
            (concept) => concept.id.toLowerCase().includes(query) || concept.canonical.symbol.toLowerCase().includes(query) || concept.terms.some((term) => term.toLowerCase().includes(query))
          );
        }
        let counts;
        if (args.hasDrift === true) {
          const scan2 = await service.scan(target.path, { minConfidence: "medium" });
          counts = /* @__PURE__ */ new Map();
          for (const finding of scan2.summary.findings) {
            const key = finding.conceptId ?? `symbol:${finding.symbol}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          concepts = concepts.filter((concept) => (counts?.get(concept.id) ?? 0) > 0);
        }
        return json({
          ok: true,
          workspace: state.workspace.path,
          vocabularyFile: state.vocabulary.relativeFile,
          vocabularyExists: state.vocabulary.exists,
          total: state.vocabulary.document.concepts.length,
          valid: state.vocabulary.valid,
          ...state.vocabulary.issues.length === 0 ? {} : { issues: state.vocabulary.issues.slice(0, 3) },
          concepts: concepts.map((concept) => ({
            ...conceptView(concept),
            ...counts === void 0 ? {} : { driftCount: counts.get(concept.id) ?? 0 }
          }))
        });
      } catch (error) {
        return toolError(error);
      }
    }
  });
  const get = defineTool({
    name: "semantic_get",
    description: [
      "Read one concept by id or by canonical symbol, including its accepted exceptions.",
      "Call this before changing a data model: it says which spelling the project treats as canonical.",
      "Add `includeDrift` to also scan this concept for drift (costs one scan)."
    ].join(" "),
    parameters: {
      id: { type: "string", description: 'Concept id, e.g. "device.target_temperature".' },
      symbol: { type: "string", description: "Canonical symbol, when the id is unknown." },
      includeDrift: { type: "boolean", description: "Run a scan and return findings for this concept (default false)." }
    },
    output: { schema: { type: "json" }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec));
        const state = await service.state(target.path);
        const id = args.id?.trim();
        const symbol = args.symbol?.trim();
        if ((id === void 0 || id === "") && (symbol === void 0 || symbol === "")) {
          return refused("missing-argument", "Pass either id or symbol.");
        }
        const concept = state.vocabulary.document.concepts.find(
          (entry) => id !== void 0 && id !== "" && entry.id === id || symbol !== void 0 && symbol !== "" && entry.canonical.symbol === symbol
        );
        if (concept === void 0) {
          return refused("concept-not-found", `No concept matches ${id ?? ""}${symbol === void 0 ? "" : `/${symbol}`}.`);
        }
        let findings;
        let truncated;
        if (args.includeDrift === true) {
          const scan2 = await service.scan(target.path, { minConfidence: "medium" });
          findings = scan2.summary.findings.filter((finding) => finding.conceptId === concept.id).map(findingView);
          truncated = scan2.summary.truncated;
        }
        return json({
          ok: true,
          workspace: state.workspace.path,
          valid: state.vocabulary.valid,
          ...state.vocabulary.issues.length === 0 ? {} : { issues: state.vocabulary.issues.slice(0, 3) },
          concept: conceptView(concept),
          ...findings === void 0 ? {} : { drift: findings, driftTruncated: truncated }
        });
      } catch (error) {
        return toolError(error);
      }
    }
  });
  const upsert = defineTool({
    name: "semantic_upsert",
    description: [
      "Create or update one vocabulary concept, using the same validation the panel uses.",
      "Validation failures are returned as `ok:false` with positioned `issues`; nothing is written then.",
      "In merge mode (the default) omitted fields keep their current value, so a partial update is safe."
    ].join(" "),
    parameters: {
      conceptId: { type: "string", required: true, description: 'Dotted id, e.g. "device.target_temperature". Required and cannot be renamed.' },
      terms: { type: "string", description: "Comma separated Chinese terms and aliases. Required when creating." },
      kind: { type: "string", enum: [...CONCEPT_KINDS], description: "Concept kind. Defaults to entity when creating." },
      symbol: { type: "string", required: true, description: "Canonical symbol. Required when creating; must be unique across the vocabulary." },
      symbolType: { type: "string", description: "Free-text canonical type, for display." },
      unit: { type: "string", description: "Canonical unit; meaningful for kind=quantity." },
      note: { type: "string", description: "One sentence describing the concept." },
      mode: { type: "string", enum: ["merge", "replace"], description: "merge keeps omitted fields; replace rebuilds the entry (default merge)." }
    },
    output: { schema: { type: "json" }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec));
        const terms = splitList(args.terms);
        const concept = { id: args.conceptId };
        if (terms.length > 0) concept.terms = terms;
        if (args.kind !== void 0) concept.kind = args.kind;
        if (args.note !== void 0) concept.note = args.note;
        if (args.symbol !== void 0 || args.symbolType !== void 0 || args.unit !== void 0) {
          const canonical = {};
          if (args.symbol !== void 0 && args.symbol !== "") canonical.symbol = args.symbol;
          if (args.symbolType !== void 0) canonical.type = args.symbolType;
          if (args.unit !== void 0) canonical.unit = args.unit;
          concept.canonical = canonical;
        }
        const result = await service.upsert(target.path, {
          concept,
          ...args.mode === "merge" || args.mode === "replace" ? { mode: args.mode } : {}
        });
        return json({
          ok: true,
          created: result.created,
          concept: conceptView(result.concept),
          vocabularyFile: result.state.relativeFile
        });
      } catch (error) {
        return toolError(error);
      }
    }
  });
  const scan = defineTool({
    name: "drift_scan",
    description: [
      "Scan the workspace for drift between the vocabulary and the code, and return structured findings.",
      "The scan is read-only: it opens files for reading and never writes, renames or deletes anything.",
      "Findings carry `detector`, `confidence` and a `citation` in the format configured for the project."
    ].join(" "),
    parameters: {
      detectors: { type: "string", description: `Comma separated subset of: ${DETECTOR_IDS.join(", ")}. Default: all configured.` },
      paths: { type: "string", description: "Comma separated workspace-relative directories or files to restrict the scan to." },
      minConfidence: { type: "string", enum: [...CONFIDENCE_LEVELS], description: "Keep findings at or above this level. Default: the plugin setting." },
      concept: { type: "string", description: "Only return findings for this concept id." },
      limit: { type: "integer", description: "Maximum findings returned (default 200)." }
    },
    output: { schema: { type: "json" }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec));
        const detectors = splitList(args.detectors).filter(
          (value) => DETECTOR_IDS.includes(value)
        );
        const paths = splitList(args.paths);
        const minConfidence = CONFIDENCE_LEVELS.includes(args.minConfidence ?? "") ? args.minConfidence : void 0;
        const result = await service.scan(target.path, {
          ...detectors.length === 0 ? {} : { detectors },
          ...paths.length === 0 ? {} : { paths },
          ...minConfidence === void 0 ? {} : { minConfidence }
        });
        const requestedLimit = Number.isFinite(args.limit) && args.limit !== void 0 ? Math.max(1, Math.trunc(args.limit)) : 200;
        const concept = args.concept?.trim();
        const matching = concept === void 0 || concept === "" ? result.summary.findings : result.summary.findings.filter((finding) => finding.conceptId === concept);
        return json({
          ok: true,
          workspace: result.workspace.path,
          scanned: {
            files: result.summary.filesScanned,
            skipped: result.summary.filesSkipped,
            bytes: result.summary.bytesScanned,
            durationMs: result.summary.durationMs,
            truncated: result.summary.truncated,
            ...result.summary.truncatedReason === void 0 ? {} : { truncatedReason: result.summary.truncatedReason }
          },
          counts: result.summary.counts,
          total: matching.length,
          returned: Math.min(matching.length, requestedLimit),
          findings: matching.slice(0, requestedLimit).map(findingView),
          ...matching.length > requestedLimit ? { omitted: matching.length - requestedLimit, hint: "Narrow with detectors, paths, minConfidence or concept, or raise limit." } : {},
          ...result.vocabularyIssues.some((issue) => issue.severity === "error") ? { vocabularyIssues: result.vocabularyIssues.filter((issue) => issue.severity === "error") } : {}
        });
      } catch (error) {
        return toolError(error);
      }
    }
  });
  const accept = defineTool({
    name: "semantic_accept",
    description: [
      "Manage accepted exceptions: add one, change its scope or reason, remove one, or clear a concept.",
      "An exception needs a reason: it is a documented decision, not a silenced warning.",
      "`path` is a glob; without it the symbol is accepted everywhere. Removing an exception makes the findings it muted reappear on the next scan.",
      "To change or remove an existing exception, locate it with `previousPath` (and `occurrence` when the same symbol and path repeat); `path` is the scope an update moves to, not the lookup key."
    ].join(" "),
    parameters: {
      action: {
        type: "string",
        enum: ["add", "update", "remove", "clear"],
        description: "add (default), update, remove, or clear every exception of the concept."
      },
      conceptId: { type: "string", required: true, description: "Concept the exception belongs to." },
      symbol: { type: "string", description: "The observed spelling. Required for every action except clear." },
      path: { type: "string", description: 'add/update: the scope to accept or move to, as a workspace-relative glob, e.g. "src/Legacy/**". Omit for the whole symbol. Not a lookup key for update/remove.' },
      previousPath: { type: "string", description: "update/remove: locate the existing exception by its current path. Omit for the whole-symbol one. This is the field that picks the entry to change." },
      reason: { type: "string", description: "Required for add and update. Why this spelling is allowed to stay." },
      occurrence: { type: "integer", description: "Which duplicate to target when a hand-edited file repeats the same symbol and path (default 0)." }
    },
    output: { schema: { type: "json" }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec));
        const action = args.action ?? "add";
        const result = await service.changeException(target.path, {
          op: action,
          conceptId: args.conceptId,
          ...args.symbol === void 0 ? {} : { symbol: args.symbol },
          ...args.path === void 0 ? {} : { path: args.path },
          ...args.previousPath === void 0 ? {} : { previousPath: args.previousPath },
          ...args.reason === void 0 ? {} : { reason: args.reason },
          ...args.occurrence === void 0 ? {} : { occurrence: args.occurrence }
        });
        return json({ ok: true, changed: result.changed, concept: conceptView(result.concept) });
      } catch (error) {
        return toolError(error);
      }
    }
  });
  return [list, get, upsert, scan, accept];
}

// src/index.ts
var VERSION = "0.1.4";
var inject = ["tools", "systemPrompt", "webServer"];
var CONSOLE_LOGGER = (name) => ({
  info: (message) => console.info(`[${name}] ${message}`),
  warn: (message) => console.warn(`[${name}] ${message}`)
});
function loggerOf(ctx, name) {
  let underlying;
  try {
    underlying = ctx.logger?.(name);
  } catch {
    underlying = void 0;
  }
  if (underlying === void 0) return CONSOLE_LOGGER(name);
  return {
    info: (message) => {
      try {
        underlying?.info(message);
      } catch {
      }
    },
    warn: (message) => {
      try {
        underlying?.warn(message);
      } catch {
      }
    }
  };
}
function apply(ctx, rawConfig) {
  const context = ctx;
  const config = rawConfig;
  const log = loggerOf(context, PACKAGE_NAME);
  const health = { tools: 0, routes: 0, prompt: false };
  const workspace = createWorkspaceResolver(context);
  const service = createSemanticService({ config, workspace, version: VERSION });
  context.effect(() => {
    let disposers = [];
    try {
      disposers = buildSemanticTools({ service, resolveForSession: (id) => workspace.resolveForSession(id) }).map((tool) => ctx.tools.register(tool));
    } catch (error) {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
        }
      }
      log.warn(`agent tools were not registered: ${error instanceof Error ? error.message : String(error)}`);
      return () => void 0;
    }
    health.tools = disposers.length;
    log.info(`${disposers.length} agent tools registered`);
    return () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    };
  }, "semantic-drift: agent tools");
  const webServer = context.webServer ?? (() => {
    try {
      return context.get("webServer");
    } catch {
      return void 0;
    }
  })();
  const isOurEntry = (entry) => {
    if (entry === void 0) return false;
    if (entry.name === PACKAGE_NAME || entry.patchId === ROW_ID || entry.id === ROW_ID) return true;
    return typeof entry.id === "string" && entry.id.endsWith(`:${ROW_ID}`);
  };
  const editPluginConfig = async (patch) => {
    let editor;
    try {
      editor = context.get("configEditor");
    } catch {
      editor = void 0;
    }
    if (editor === void 0) {
      throw new SemanticError("unsupported", "This Host exposes no config editor; edit the plugin row under Settings \u2192 Plugins.");
    }
    const withConfig = editor.configuration?.() ?? [];
    const entry = withConfig.map((item) => item.entry).find(isOurEntry) ?? editor.entries().find(isOurEntry);
    if (entry === void 0) {
      const seen = (editor.entries() ?? []).map((candidate) => candidate.name ?? candidate.id).slice(0, 6);
      throw new SemanticError(
        "unsupported",
        `${PACKAGE_NAME} is not a Loader entry in this profile (saw: ${seen.join(", ") || "none"}); edit it under Settings \u2192 Plugins.`
      );
    }
    await editor.edit(entry, (current) => ({ ...current, ...patch }));
  };
  if (webServer !== void 0) {
    context.effect(() => {
      const disposers = [];
      try {
        for (const route of makeSemanticRoutes(service, () => ({
          version: VERSION,
          vocabularyPath: config.vocabularyPath,
          announceToAgent: config.announceToAgent !== false,
          citationStyle: config.citationStyle,
          minConfidence: config.minConfidence,
          detectors: config.detectors,
          tools: health.tools,
          routes: health.routes,
          promptSection: health.prompt
        }), { editConfig: editPluginConfig })) disposers.push(webServer.register(route));
      } catch (error) {
        for (const dispose of disposers) {
          try {
            dispose();
          } catch {
          }
        }
        log.warn(`routes were not registered: ${error instanceof Error ? error.message : String(error)}`);
        return () => void 0;
      }
      health.routes = disposers.length;
      log.info(`${disposers.length} routes registered`);
      return () => {
        for (const dispose of disposers.splice(0).reverse()) dispose();
      };
    }, "semantic-drift: routes");
  } else {
    log.info("no webServer service: the panel is unavailable, tools and prompt stay active");
  }
  context.effect(() => {
    if (config.announceToAgent === false) {
      health.prompt = false;
      return () => void 0;
    }
    const dispose = ctx.systemPrompt.section({
      name: PROMPT_SECTION,
      order: PROMPT_SECTION_ORDER,
      text: () => {
        try {
          return buildPromptText(context, config, workspace);
        } catch {
          return "";
        }
      }
    });
    health.prompt = true;
    return () => {
      health.prompt = false;
      dispose();
    };
  }, "semantic-drift: prompt section");
}
export {
  Config,
  VERSION,
  apply,
  inject
};

# dsh-semantic-drift

**English** · [简体中文](README.zh.md)

One versioned vocabulary file, one read-only scanner, one panel: see where the
same concept is spelled several ways across a codebase — and decide which
spelling is the canonical one.

A DSH plugin for the DeepSeek Harness Web GUI. It works on any repository and
needs no build system, language server or database.

```
Sidebar: Semantics
┌───────────────────────────────┬──────────────────────────────────────────────┐
│ concept                       │ device.target_temperature                    │
│  device                   2   │ canonical  TargetTemp : °C                   │
│   target_temperature          │ terms      target temperature, set point     │
│   device_state                │ ───────────────────────────────────────────  │
│  network                  1   │ drift (2)                                    │
│   NetworkStatus               │   target_temp        high   naming variant   │
│ unclassified              1   │   src/Device/Panel.cs:42                     │
│                               │   NetworkStatus      high   duplicate        │
│                               │   src/Debug/Enums/Status.cs:11               │
└───────────────────────────────┴──────────────────────────────────────────────┘
```

## Contents

- [dsh-semantic-drift](#dsh-semantic-drift)
  - [Contents](#contents)
  - [What it solves](#what-it-solves)
  - [Install](#install)
  - [Quick start](#quick-start)
  - [The vocabulary file](#the-vocabulary-file)
  - [Detectors](#detectors)
  - [Agent tools](#agent-tools)
  - [Configuration](#configuration)
  - [Guarantees](#guarantees)
  - [Limitations, and where it is wrong](#limitations-and-where-it-is-wrong)
  - [Relationship to SchemaNode](#relationship-to-schemanode)
  - [Development](#development)
  - [License](#license)

## What it solves

The same business concept gets translated again at every layer — the database
column, the DTO, the client field, the protocol enum, the UI label — and the
translations drift apart. Nothing records that "these five identifiers are
supposed to mean one thing", so nothing can check them.

This plugin adds exactly one artifact:

```
.dsh/semantics.yaml   —  the concepts, their canonical spelling, their terms
```

and three ways to use it:

| | |
|---|---|
| **Vocabulary** | a versioned list of `concept → canonical symbol` in one YAML file |
| **Findings** | a read-only scan that reports where the code disagrees with it |
| **Adjudication** | the panel and five agent tools to accept, edit, or promote a finding |

## Install

DSH installs plugins through a profile. Add the bundle, then enable its row:

```bash
# from GitHub (works today; the repository starts private)
dsh plugin --profile desktop add github:Yubickari/dsh-semantic-drift

# or from a local checkout
dsh plugin --profile desktop add link:/path/to/dsh-semantic-drift
```

The Web GUI offers the same thing under **Settings → Plugins → Install from
source** with the same spec. After installation, refresh the page once so the
browser half loads, then pick **Semantics** in the sidebar.

`lib/` is committed, so installing from a git source needs no build step.
Publishing to npm is possible but not required; the unscoped name
`dsh-semantic-drift` is free.

## Quick start

1. Open the **Semantics** panel in a workspace.
2. Press **Create vocabulary** — this writes `.dsh/semantics.yaml` with the
   default exclusions and no concepts.
3. Press **Scan**. Before any concept exists you still get structural findings
   ("the same type is defined twice"), which is the cold-start value: the scan
   does not need your vocabulary to find duplicated contracts.
4. Register a concept with **New concept** (or the `semantic_upsert` tool) and
   scan again. Vocabulary-dependent findings (naming variants, unmapped terms)
   now have something to compare against.
5. Accept a finding you intend to keep, with a **reason**. The exception is
   written into the vocabulary, so the next scan stays quiet about it and the
   next reader learns why.

## The vocabulary file

```yaml
version: 1
meta:
  project: demo
  updated: 2026-10-25
exclude: ["**/node_modules/**", "**/bin/**", "**/obj/**"]
concepts:
  - id: device.target_temperature      # group.name, unique
    terms: ["target temperature", "set point"]   # what humans call it
    kind: quantity                     # entity | quantity | enum | status | reference
    canonical:
      symbol: TargetTemperature        # what the code must call it
      type: double
      unit: "°C"
    note: The temperature the device is asked to reach.
    accepted:                          # decided exceptions, each with a reason
      - symbol: TargetTemp
        path: src/Legacy/**            # a glob; omit to accept the symbol everywhere
        reason: public field kept for one release
```

`terms` may be written in any language: the scanner matches them as plain text in
comments, strings and resource files. The examples in this English file use
English terms; the [Chinese README](README.zh.md) uses Chinese ones.

Validation runs before every write; a document that fails is never written, and
the reported issue carries the YAML line or the document path:

* `id` must be unique and look like `group.name`;
* `canonical.symbol` must be a plain identifier and unique across concepts;
* `terms` must be non-empty and cannot be shared between two concepts;
* every `accepted` entry needs a `reason`;
* every glob must parse;
* a YAML syntax error is reported with its line and column, and the file is left
  untouched.

Saving is canonical and idempotent: saving the same document twice produces the
same bytes. Hand edits in the raw editor keep their own formatting.

## Detectors

| Detector | Confidence | Signal |
|---|---|---|
| `duplicate-type` | high | the same type is declared in two compilation units with identical members |
| `contract-drift` | high | the same type is declared in two units and the members differ (the two sides disagree) |
| `symbol-variant` | medium | a spelling variant of `canonical.symbol`: case/separator form, a known confusable, or edit distance ≤ 2 on a declared name |
| `term-unmapped` | low | a declared term appears in comments or resources, but the canonical symbol never appears in code |

Two filters keep the list short: a variant only fires when the file also mentions
one of the concept's terms, or when both spellings share the same leading token;
and a "contract drift" pair must share at least one member, so two unrelated
classes that happen to be named `MainWindow` are not reported.

Deliberate exclusions, because comparing them produces only noise: entry-point
classes (`Program`/`Startup` with a `Main`), `partial` declarations (one file
never shows the whole member list), generated files (`*.Designer.cs`, `*.g.cs`,
`auto-generated` headers), and declarations with fewer than two members.

Language coverage: C# (`class`/`struct`/`interface`/`record`/`enum`), TypeScript
(`interface`/`type`/`enum`/`class`), Python (`class`) for the structural
detectors; every other whitelisted extension still contributes comment/string
evidence for `term-unmapped`.

## Agent tools

Five tools, available in every session, sharing the panel's validation:

| Tool | Purpose |
|---|---|
| `semantic_list` | list concepts; `hasDrift` runs a scan and filters to concepts with findings |
| `semantic_get` | one concept by id or symbol, plus its accepted exceptions; `includeDrift` adds a scan |
| `semantic_upsert` | create or update a concept (`merge` keeps omitted fields, `replace` rebuilds it) |
| `drift_scan` | structured findings with detector, confidence and citation |
| `semantic_accept` | record an accepted exception; `reason` is required |

Every refusal is a value (`{ ok: false, code, message }`), never an exception, and
`drift_scan` is documented as read-only. Renaming a data field without calling
`semantic_get` first is exactly the failure this plugin exists to prevent, so with
`announceToAgent` on, the concepts and that rule are injected into the prompt as
one section (at most 200 lines, summarized past 120 concepts).

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `vocabularyPath` | `.dsh/semantics.yaml` | vocabulary file, relative to the workspace root |
| `announceToAgent` | `true` | inject the vocabulary section into agent prompts |
| `citationStyle` | `file+symbol` | `path/File.cs::Symbol` or `path/File.cs:123` |
| `minConfidence` | `medium` | lowest confidence the **tools** report; the panel always receives every level and filters on screen |
| `timeoutMs` | `30000` | wall-clock budget for one scan |
| `maxFindings` | `5000` | hard cap per scan |
| `maxFileBytes` | `1048576` | larger files are skipped and counted |
| `maxFiles` | `50000` | hard cap on files visited |
| `detectors` | all four | which detectors a scan runs |

The settings form is generated from this schema by DSH; there is no hand-written
configuration UI. Changing a setting reloads the plugin row.

## Guarantees

* **The scan never writes.** It opens files for reading and nothing else; the
  vocabulary is the only file the plugin ever writes.
* **One write path.** The panel and the tools both go through the store, which
  serializes writes per file, validates before writing, and writes atomically.
* **No daemon, no watcher, no index.** No background process, no file watcher, no
  cache directory. A scan is computed from disk when you ask for it.
* **Bounded.** A deadline and a finding cap always end a scan, and the result
  says which one did.
* **Workspace-scoped.** A request can only read and write inside a registered
  DSH workspace (or the Host's default directory); anything else is refused.

Typical cost on a real 1,700-file C# repository: **~1.2 s**, ~18 MB read, no
files changed.

## Limitations, and where it is wrong

This is a lexical tool. It knows identifiers, member names and comment text, not
meaning.

* **A name is not a contract.** Two types with one name may be unrelated; the
  shared-member filter removes most of that, not all.
* **Member lists are parsed with regular expressions**, not a compiler. An exotic
  declaration is skipped (and counted) rather than guessed. Files that are
  generated are skipped entirely.
* **Edit distance is a blunt instrument.** It only runs over declared type names
  of at least six characters, and only together with a shared leading token or a
  term in the same file. Expect a few "same concept?" findings at medium
  confidence — that is what `accepted` is for.
* **`term-unmapped` is a heuristic** (low confidence, folded by default): a term
  in a comment does not prove the code should have that symbol.
* **No unit checking** is implemented. `canonical.unit` is displayed and stored,
  but D5 (unit drift) is not part of this version.
* **Single-token variants are missed** when the canonical and the observed
  spelling differ by more than two edits (`SetTemp` vs `TargetTemperature`). That
  is a "different name", not a "misspelling"; the vocabulary-with-terms model is
  how a project records that, and `term-unmapped` reports the comment side.
* **The panel cannot open a file** in an editor; it copies a citation in the
  configured style instead. There is no auto-fix, by design: the scan is trusted
  only because it never touches your code.
* **No screenshot yet.** The layout above is a sketch of the real panel; a
  screenshot of live data will replace it once the first visual check is done.

## Relationship to SchemaNode

The design borrows three judgements from
[kurapica/schema-node-csharp](https://github.com/kurapica/schema-node-csharp):
semantics deserve to be an independent, versioned entity; a small enumerable
vocabulary is more maintainable than an open-ended type system; drift has to be
observable and adjudicable rather than remembered. It borrows **no
implementation** — no meta/property/relation/function model, no semantic
compilation, no code generation. One YAML file and a scanner.

## Development

```bash
pnpm install
pnpm test          # node --test, 34 tests, no test framework
pnpm build         # esbuild → lib/index.js (host) + lib/client.js (browser)
```

`src/` is the source of truth; `lib/` is the built artifact and is committed so a
git install needs no build. The browser half is wrapped in DSH's
`window.__ModuleLoader__.load({ id, factory })` contract with React left external.
The host half imports only `yaml` and `@deepseek-ai/schemastery`.

## License

MIT

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
    - [Following the workspace](#following-the-workspace)
    - [Panel settings](#panel-settings)
    - [Editing an accepted exception](#editing-an-accepted-exception)
    - [The unclassified list](#the-unclassified-list)
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

### Following the workspace

**Settings → Follow the workspace** makes the panel follow the current DSH
workspace: switching sessions switches the vocabulary. It does **not** scan —
opening the panel or switching to it never starts work on its own, so moving
between workspaces and plugins stays cheap. Turning following off pins the
workspace you last picked from the dropdown; the choice is remembered per browser
(not stored in the project). Picking a workspace from the dropdown pins it too,
because an explicit choice outranks following.

Its child switch, **Rescan automatically**, is only enabled while following is on
and only fires when following moves the panel to another workspace. Manual scans,
and the rescan after a save, an accept or a removal, are not affected by it: those
are consequences of an action you just took.

A workspace that has not been scanned says so — both above the body and in the
footer — with a Scan button, instead of looking like a workspace with no drift.

A selected concept carries **Edit** and **Delete** next to its title. Deleting
removes the entry and every accepted exception it recorded from the vocabulary
file; no code is touched, and findings only it covered return to the unclassified
list.

### Panel settings

The gear at the top right opens the panel's own settings:

- **Follow the workspace** — the switch described above.
- **Rescan automatically** — its child switch; disabled until following is on,
  and it only rescans when following switches workspace.
- **Notifications close after N seconds** — `0` keeps them until dismissed.
  Notices that carry validation issues never close themselves; they are the text
  you have to act on.
- **Show low-confidence findings** — the same toggle that used to sit beside the
  drift list.
- **This project (read-only)** — the effective plugin settings (vocabulary path,
  prompt injection, citation style, tool confidence floor, scan budgets,
  detectors). They belong to the plugin row, so they are edited under
  **Settings → Plugins → Semantic Drift**, and shown here so one page answers
  "what is this panel actually doing".

Every item shown here is a per-browser preference: it never enters
`.dsh/semantics.yaml` and never changes the repository.

### Editing an accepted exception

An accepted exception is a record, not a stamp: each row in the concept detail
carries **Edit** and **Remove**, and the section header offers **Clear all** when a
concept has more than one.

- **Edit** reopens the scope picker with the current glob selected and shows how
  many findings the new scope would mute next to the current count, so a glob
  that was too wide can be narrowed without guessing. The reason is editable; the
  symbol is not, because it is the observed spelling — remove and re-accept to
  change it.
- **Remove** names the finding count that will reappear and asks for confirmation.
  The success notice then offers **Undo**, which re-adds the exception as it was.
- **Clear all** removes every exception of a concept after a confirmation that
  states the count; undo restores the whole set.
- An operation loads the file again inside the store before writing, so it applies
  to what is on disk rather than to the snapshot the browser held.
- The **current mute count** on a row comes from the scan and its mute
  attribution, not from the visible finding list: a muted finding is by
  definition not in that list. A row that reports "mutes nothing" most likely has
  a scope that matches nothing — that is itself worth seeing, which is why the
  number is shown rather than hidden.

### The unclassified list

The tree's **unclassified** row lists findings that no vocabulary concept owns.
The structural detectors compare code with code, so they need no vocabulary at
all: that list holds real findings before the first concept exists. A finding
moves under a concept automatically only when that concept's `canonical.symbol`
equals the type name; otherwise the decision is yours — accept it under a concept
you pick in the dialog, or record it as a new concept, which pre-fills the
suggested id and the canonical symbol. Adding terms alone does not reclassify
anything, because terms drive the naming and term detectors, not the structural
ones.

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
| `duplicate-type` | high | **same members and same values** in two units: a real copy, and merging it is a safe suggestion |
| | high | *derived copy*: same member names, different values, one base type every declaration shares — a parameterized derivative, never reported as a merge candidate |
| | high | *same names, different values*: no shared base, so the two sides simply disagree about what those names mean |
| `contract-drift` | high | the same type in two units with different members, or with different **values** for the same members |
| `symbol-variant` | medium | a spelling variant of `canonical.symbol` (case/separator form, a known confusable, edit distance ≤ 2), or *same contract, other name*: a type with the same base, member set and stable literal as the canonical type |
| `term-unmapped` | low | a declared term appears in comments or resources, but the canonical symbol never appears in code |

Member **values** are compared too, when they are simple single-line literals. That
closes a real false negative: two enums whose members swapped values used to look
identical because only names were compared.

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
| `semantic_accept` | manage accepted exceptions: `add` (default), `update` its scope or reason, `remove` one, or `clear` a concept; `reason` is required to add or update |

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
* **Diagnosable.** `GET /semantic-drift/health` reports what this activation
  mounted — tool count, route count, whether the prompt section is registered —
  plus the effective settings, so a half-mounted plugin is visible instead of
  silent. The panel is a thin view over that same service.

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
pnpm typecheck     # tsc over the browser half: catches undefined identifiers
pnpm test          # typecheck + node --test, 80 tests, no test framework
pnpm build         # esbuild → lib/index.js (host) + lib/client.js (browser)
```

`tsc` deliberately covers only the browser half: it needs no host package types,
and it is the check that catches a helper renamed in one place but called in
another — a class of bug that a bundler happily ships and that a static render
never reaches. The four flow tests in `test/panel-flow.test.mjs` then load the
built `lib/client.js` in jsdom, stub `fetch` with the host's real payloads, and
drive the panel the way a user does.

`src/` is the source of truth; `lib/` is the built artifact and is committed so a
git install needs no build. The browser half is wrapped in DSH's
`window.__ModuleLoader__.load({ id, factory })` contract with React left external.
The host half imports only `yaml` and `@deepseek-ai/schemastery`.

## License

MIT

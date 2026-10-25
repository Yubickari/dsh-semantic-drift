# dsh-semantic-drift

**English** · [简体中文](README.zh.md)

A DSH plugin that keeps one versioned vocabulary of a project's business concepts,
shows where the code spells them differently, and gives a person and an agent a
place to decide which spelling is canonical.

---

## Where the idea comes from

It borrows three judgements from
[kurapica/schema-node-csharp](https://github.com/kurapica/schema-node-csharp):

1. **Semantics deserve to be an independent, versioned artifact** — not something
   re-derived from the code on every read.
2. **A small, enumerable vocabulary** is easier to keep correct than an open-ended
   type system.
3. **Drift has to be observable and adjudicable**, not something a team is expected
   to remember.

It borrows no implementation. There is no Meta/Property/Relation model, no semantic
compilation, no code generation. There is one YAML file, one read-only scanner, one
panel, and five agent tools.

## What it can do

- **Record each concept once.** An id, the human terms, a kind, the canonical
  symbol (plus type and unit when they matter) and a note — in one YAML file you
  review and diff like code.
- **Find drift without a build system.** The same type declared twice, two copies
  that have diverged, a spelling variant of a canonical name, a term used in
  comments but never in code. No compiler, language server or database involved.
- **Work from an empty vocabulary.** The structural detectors compare code with
  code, so a fresh project has findings before its first concept exists.
- **Tell a copy from a derivative.** Identical members and values are a copy;
  identical members with different values under one base are a parameterized
  derivative that must not be merged; a same-shaped type under another name is a
  renamed contract.
- **Adjudicate instead of silencing.** An accepted exception carries a reason and
  the smallest scope that covers the case, and it can be edited, reworded, removed
  or undone later. Each one shows how many findings it actually mutes.
- **Put the vocabulary in the agent's context.** Five tools plus a prompt section
  tell an agent what to call things, and ask it to record a deviation instead of
  inventing a name silently.

## What it cannot do

- **It is lexical, not semantic.** It compares identifiers, member names and
  comment text. Two unrelated types that share a name can still be reported.
- **It does not enforce anything.** The prompt rules are advice; an agent can
  deviate, and the only defence is that the deviation must be recorded.
- **It does not fix code.** No auto-rename, no auto-merge, no patch. The scan is
  trusted precisely because it never writes your source.
- **Structural detection covers three languages** — C#, TypeScript and Python
  declarations. Other files contribute comment/string evidence only.
- **Units are stored, not checked.** `canonical.unit` is displayed and validated
  as a string; a unit drift detector is not part of this version.
- **One workspace, one vocabulary.** There is no cross-repository view.

## Install

DSH installs plugins through a profile. Add the bundle, then enable its row:

```bash
# from a local checkout (works today)
dsh plugin --profile desktop add link:/path/to/dsh-semantic-drift

# from GitHub, once the repository is public
dsh plugin --profile desktop add github:Yubickari/dsh-semantic-drift
```

The Web GUI offers the same thing under **Settings → Plugins → Install from
source**. After installing, refresh the page once so the browser half loads, then
pick **Semantic Drift Vocabulary** in the sidebar.

`lib/` is committed, so installing from a git source needs no build step. The
unscoped npm name `dsh-semantic-drift` is free but not required.

## Quick start

1. Open **Semantic Drift Vocabulary** in a workspace.
2. Press **Create vocabulary** — this writes `.dsh/semantics.yaml` with the default
   exclusions and no concepts.
3. Press **Scan**. Before any concept exists you still get structural findings
   ("the same type is defined twice"), which is the cold-start value: the scan does
   not need your vocabulary to find duplicated contracts.
4. Register a concept with **New concept** (or the `semantic_upsert` tool) and scan
   again. Vocabulary-dependent findings — naming variants, unmapped terms — now
   have something to compare against.
5. Accept a finding you intend to keep: choose the **scope** (this file, every
   directory with the same file name, the whole symbol, or a custom glob), read the
   count it will mute, and write a **reason**. The exception is written into the
   vocabulary, so the next scan stays quiet about it and the next reader learns why.

## The panel

- **Left tree**: concepts grouped by id prefix, with a finding count per group, a
  group-level add button, a search field and a quick-create button.
- **Concept detail**: the concept's fields, the findings attributed to it, and its
  accepted exceptions — each with **Edit**, **Remove**, and a **Clear all** action
  when there is more than one. A row reads "mutes N now"; when N is 0 the scope
  most likely matches nothing, which is itself worth seeing.
- **Toolbar**: icon-only scan, new concept, raw YAML and settings. Every icon
  describes itself immediately on hover and to a screen reader. The toolbar holds
  the only scan button; the footer only reports.
- **Workspace mode**: an icon next to the workspace picker — a crosshair while the
  panel follows the session's workspace, a pushpin while it is pinned. Clicking it
  switches modes, exactly like the setting.
- **Scan memory**: re-opening the panel shows the report this tab already has for
  that workspace (default 10 minutes, configurable) instead of asking for a scan.
  The footer dates it; past the retention it raises a filled amber badge, and the
  same badge appears when the vocabulary file has changed since the scan. Both
  badges are the rescan control.
- **Remembered page**: the panel returns to the concept (or the unclassified list)
  it was on, and only restores a concept that still exists. Search, filters and open
  editors are deliberately not remembered.
- **Raw YAML**: edit the file directly; a save is validated before it is written and
  every problem carries its YAML line.
- **Unclassified**: findings no concept owns. They exist before the first concept,
  because structural detectors need no vocabulary. Accept one under a concept, or
  promote it into a new concept with the id and symbol pre-filled.
- **Settings** (the gear): follow-the-workspace, rescan-on-follow, how long a scan
  is kept, how long notices stay, low-confidence findings, and a read-only view of
  the plugin's effective configuration. These are per-browser preferences; none of
  them touches the repository.

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
comments, strings and resource files. This English README uses English terms; the
[Chinese README](README.zh.md) uses Chinese ones.

Validation runs before every write; a document that fails is never written, and the
reported issue carries the YAML line or the document path:

* `id` must be unique and look like `group.name`;
* `canonical.symbol` must be a plain identifier and unique across concepts;
* `terms` must be non-empty and cannot be shared between two concepts;
* every `accepted` entry needs a `reason`;
* every glob must parse;
* a YAML syntax error is reported with its line and column, and the file is left
  untouched.

Saving is canonical and idempotent: saving the same document twice produces the same
bytes. Hand edits in the raw editor keep their own formatting.

## Detectors

| Detector | Confidence | Signal |
|---|---|---|
| `duplicate-type` | high | **same members and same values** in two units: a real copy, and merging it is a safe suggestion |
| | high | *derived copy*: same member names, different values, one base type every declaration shares — a parameterized derivative, never a merge candidate |
| | high | *same names, different values*: no shared base, so the two sides disagree about what those names mean |
| `contract-drift` | high | the same type in two units with different members, or with different **values** for the same members. Skipped when one type shadows its own base (the "missing" members are inherited) or when both are private nested helpers |
| `symbol-variant` | medium | a spelling variant of `canonical.symbol` (case/separator form, a known confusable, edit distance ≤ 2), or *same contract, other name*: a type with the same base, member set and stable literal as the canonical type |
| | medium | *vocabulary spelling is not in the code*: `canonical.symbol` appears nowhere as a code token while a different-case spelling is declared or heads a declaration |
| `term-unmapped` | low | a declared term appears in comments or resources, but the canonical symbol never appears in code |

Member **values** are compared when they are simple single-line literals: two enums
whose members swapped values used to look identical when only names were compared.
A copy declared as a `struct` on one side and a `class` on the other says so in the
message, because the marshalling and identity rules differ even when the members do
not.

Two filters keep the list short: a variant only fires when the file also mentions
one of the concept's terms, or when both spellings share the same leading token; and
a contract-drift pair must share at least one member, so two unrelated classes that
happen to be named `MainWindow` are not reported.

Deliberately excluded, because comparing them produces only noise: entry-point
classes (`Program`/`Startup` with a `Main`), `partial` declarations (one file never
shows the whole member list), generated files (`*.Designer.cs`, `*.g.cs`,
`auto-generated` headers), declarations with fewer than two members, subclasses that
shadow a base of the same name, and private nested helpers.

Language coverage: C# (`class`/`struct`/`interface`/`record`/`enum`), TypeScript
(`interface`/`type`/`enum`/`class`) and Python (`class`) for the structural
detectors; every other whitelisted extension still contributes comment/string
evidence for `term-unmapped`.

## Working with an agent

Five tools, available in every session, sharing the panel's validation:

| Tool | Purpose |
|---|---|
| `semantic_list` | list concepts; `hasDrift` runs a scan and filters to concepts with findings |
| `semantic_get` | one concept by id or symbol, plus its accepted exceptions; `includeDrift` adds a scan |
| `semantic_upsert` | create or update a concept (`merge` keeps omitted fields, `replace` rebuilds it) |
| `drift_scan` | structured findings with detector, confidence and citation |
| `semantic_accept` | `add` (default), `update` scope or reason, `remove` one, `clear` a concept; `reason` is required to add or update. `previousPath` locates the entry to change — `path` is the scope an update moves to |

With `announceToAgent` on, every session receives one prompt section: the concepts
of the workspace it runs in, and the rules that go with them — look the concept up
before naming something, spell it exactly as the canonical symbol does, register a
missing concept first, record a deliberate deviation with a reason. The section is
capped at 200 lines and summarized past 120 concepts.

A refusal is always a value (`{ ok: false, code, message, issues }`), never an
exception, so an agent can react to it. A vocabulary file that cannot be parsed is
reported as `valid: false` with its first issues — reads do not pretend the project
has no concepts, and writes are refused until it is fixed.

The loop this is built for:

1. the agent receives a task and calls `semantic_get` for the concept it is about
   to touch;
2. a missing concept is registered with `semantic_upsert` before any code is
   written;
3. after editing, `drift_scan` shows whether the change introduced a variant or a
   divergence;
4. a finding that is intentional is accepted with a reason and a narrow scope;
5. the vocabulary diff is reviewed like any other change.

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
* **One write path.** Panel and tools both go through the store, which serializes
  writes per file, validates before writing, and writes atomically.
* **No daemon, no watcher, no index.** A scan is computed from disk when you ask for
  it.
* **Bounded.** A deadline and a finding cap always end a scan, and the result says
  which one did.
* **Cheap to repeat.** The declarations of unchanged files are reused, keyed by path,
  size and mtime (a file touched within the last second is always re-parsed), and
  two identical scans that overlap share one computation. Findings themselves are
  never cached.
* **Workspace-scoped.** A request can only read and write inside a registered DSH
  workspace (or the Host's default directory). A write must name its workspace: a
  write that omits it is refused rather than falling back to the default directory.
* **One deliberate exception to "compute on demand".** The browser keeps the last
  scan per workspace in `sessionStorage` for a bounded time, only to re-render the
  panel without rescanning. It never enters the repository, a closed tab forgets it,
  the agent tools never read it, and the footer dates it.
* **Diagnosable.** `GET /semantic-drift/health` reports what this activation mounted
  — tool count, route count, whether the prompt section is registered — plus the
  effective settings.

## Limits

This is a lexical tool. It knows identifiers, member names and comment text, not
meaning.

* **A name is not a contract.** Two types with one name may be unrelated; the
  shared-member filter removes most of that, not all.
* **Member lists are parsed with regular expressions**, not a compiler. An exotic
  declaration is skipped and counted rather than guessed; generated files are
  skipped entirely.
* **Edit distance is a blunt instrument.** It only runs over declared type names of
  at least six characters, together with a shared leading token or a term in the same
  file. Expect a few "same concept?" findings at medium confidence — that is what
  `accepted` is for.
* **`term-unmapped` is a heuristic** (low confidence, folded by default): a term in a
  comment does not prove the code should have that symbol.
* **A rename across tokens is missed** when the two spellings differ by more than two
  edits (`SetTemp` vs `TargetTemperature`). That is a different name, not a
  misspelling; record it as a concept with terms, and let `term-unmapped` report the
  comment side.
* **The panel cannot open a file** in an editor; it copies a citation in the
  configured style instead. There is no auto-fix, by design.

## Development

```bash
pnpm install
pnpm test      # typecheck + node --test
pnpm build     # esbuild -> lib/index.js (host) + lib/client.js (browser)
```

Three layers of tests, each for a failure the one before it cannot see:

- `test/*.test.ts` — the store, the scanner, the detectors, the service and the
  locale dictionaries, against hand-made fixtures;
- `test/fiber.test.ts` — mounts the **built** host artifact on a fake context and
  drives its tools, routes and prompt section the way the host does;
- `test/*.test.mjs` — renders components and drives the **built** browser bundle in
  jsdom, stubbing `fetch` with the host's real payloads.

`tsc` deliberately covers only the browser half: it needs no host package types, and
it is the check that catches a helper renamed in one place but called in another — a
class of bug a bundler happily ships and a static render never reaches.

`src/` is the source of truth; `lib/` is the built artifact and is committed, so a
git install needs no build. The browser half is wrapped in DSH's
`window.__ModuleLoader__.load({ id, factory })` contract with React left external.
The host half imports only `yaml` and `@deepseek-ai/schemastery`.

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md), which also states the rule
this repository is held to: **no real project may be identifiable anywhere** — code,
tests, fixtures, documentation or commit messages — because the projects this plugin
is developed against are private.

## License

MIT

# dsh-semantic-drift

**English** · [简体中文](README.zh.md)

A DSH plugin that keeps **one versioned vocabulary** of a project's business
concepts, shows where the code spells them differently, and gives a person and an
agent a place to decide which spelling is canonical.

DSH shows the plugin as **Semantic Drift Vocabulary** (语义漂移词表).

## Contents

- [Where it comes from](#where-it-comes-from)
- [What it does](#what-it-does)
- [What it does not do](#what-it-does-not-do)
- [Install](#install)
- [Getting started](#getting-started)
- [Modules](#modules)
  - [The vocabulary file](#the-vocabulary-file)
  - [Detectors](#detectors)
  - [Agent tools and prompt injection](#agent-tools-and-prompt-injection)
  - [The panel](#the-panel)
  - [Configuration](#configuration)
- [How it works](#how-it-works)
  - [Token cost](#token-cost)
  - [Guarantees](#guarantees)
  - [Limits](#limits)
  - [Development](#development)
- [License](#license)

## Where it comes from

The idea is borrowed from
[kurapica/schema-node-csharp](https://github.com/kurapica/schema-node-csharp),
which argues three things this plugin takes as given:

1. **Semantics deserve to be an independent, versioned artifact** — not something
   re-derived from the code on every read.
2. **A small, enumerable vocabulary** is easier to keep correct than an open-ended
   type system.
3. **Drift has to be observable and adjudicable**, not something a team is expected
   to remember.

No implementation is borrowed. There is no Meta/Property/Relation model, no semantic
compilation, no code generation. One YAML file, one read-only scanner, one panel,
five agent tools.

## What it does

**It records what things are called.** Each concept gets one entry: a dotted id,
the human terms for it, a kind, the canonical symbol (plus type and unit when they
matter) and a note. The file is versioned with the project, so a rename is a diff
someone can review.

**It finds where the code disagrees.** A read-only scan compares the tree with the
vocabulary and reports:

- the same type declared twice — with the member *values* compared, not just names;
- two copies that have diverged (missing members, extra members, swapped enum values);
- a copy that is really a parameterized derivative, which must not be merged;
- a spelling variant of a canonical name, including a canonical spelling the code
  never uses at all;
- a term that appears in comments or resources but never in code.

It works from an empty vocabulary too: the structural detectors compare code with
code, so a fresh project has findings before its first concept exists.

**It gives the decision a home.** An accepted exception carries a reason and the
smallest scope that covers the case. It can be edited, reworded, removed or undone
later, and each one reports how many findings it actually mutes right now. The
decision is a line in the vocabulary file, not a memory in someone's head.

**It puts the vocabulary in front of the agent.** Every session receives one prompt
section with the concepts of the workspace it runs in, plus the rules: look the
concept up before naming something, spell it exactly as the canonical symbol does,
register a missing concept first, record a deliberate deviation with a reason. Five
tools let the agent read, register, scan and adjudicate.

**It costs tokens, and you can turn that off.** The prompt section is the recurring
cost; the panel's settings switch disables it per profile, and the scan itself costs
nothing until someone asks for it. Numbers are in [Token cost](#token-cost).

## What it does not do

- **It is lexical, not semantic.** It compares identifiers, member names and comment
  text. Two unrelated types that share a name can still be reported.
- **It does not enforce anything.** The prompt rules are advice. An agent can
  deviate, and the only defence is that the deviation must be recorded.
- **It does not fix code.** No auto-rename, no auto-merge, no patch. The scan is
  trusted precisely because it never writes your source.
- **Structural detection covers three languages** — C#, TypeScript and Python
  declarations. Other files contribute comment/string evidence only.
- **Units are stored, not checked.** `canonical.unit` is displayed and validated as
  a string; there is no unit-drift detector.
- **One workspace, one vocabulary.** No cross-repository view.
- **It never decides for you** whether the vocabulary file is committed. That is a
  project decision; if you commit it, the team shares and reviews it.

## Install

Once published, any of these installs the bundle into a profile:

```bash
# from npm
dsh plugin --profile desktop add dsh-semantic-drift

# from GitHub
dsh plugin --profile desktop add github:Yubickari/dsh-semantic-drift

# from a local checkout
dsh plugin --profile desktop add link:/path/to/dsh-semantic-drift
```

The Web GUI offers the same under **Settings → Plugins → Install from source**.
After installing, refresh the page once so the browser half loads, then pick
**Semantic Drift Vocabulary** in the sidebar.

`lib/` is committed, so installing from a git source needs no build step. The
plugin needs DSH `>=0.2.1-rc.3`.

## Getting started

1. Open **Semantic Drift Vocabulary** in a workspace.
2. Press **Create vocabulary** — writes `.dsh/semantics.yaml` with the default
   exclusions and no concepts.
3. Press **Scan**. With no concepts yet you still get structural findings ("the same
   type is defined twice"), which is the cold-start value.
4. Register a concept with **New concept** (or `semantic_upsert`) and scan again.
   Vocabulary-dependent findings now have something to compare against.
5. Accept a finding you intend to keep: choose the **scope** (this file, every
   directory with the same file name, the whole symbol, or a custom glob), read the
   count it will mute, and write a **reason**.

## Modules

### The vocabulary file

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
comments, strings and resource files.

Validation runs before every write; a document that fails is never written, and the
reported issue carries the YAML line or the document path:

* `id` must be unique and look like `group.name`;
* `canonical.symbol` must be a plain identifier and unique across concepts;
* `terms` must be non-empty and cannot be shared between two concepts;
* every `accepted` entry needs a `reason`;
* every glob must parse;
* a YAML syntax error is reported with its line and column, and the file is left
  untouched.

Saving is canonical and idempotent. Hand edits in the raw editor keep their own
formatting.

### Detectors

| Detector | Confidence | Signal |
|---|---|---|
| `duplicate-type` | high | **same members and same values** in two units: a real copy, and merging it is a safe suggestion |
| | high | *derived copy*: same member names, different values, one shared base type — a parameterized derivative, never a merge candidate |
| | high | *same names, different values*: no shared base, so the two sides disagree about what those names mean |
| `contract-drift` | high | the same type in two units with different members, or with different **values** for the same members. Skipped when one type shadows its own base, or when both are private nested helpers |
| `symbol-variant` | medium | a spelling variant of `canonical.symbol` (case/separator form, a known confusable, edit distance ≤ 2), or *same contract, other name*: same base, members and stable literal as the canonical type |
| | medium | *vocabulary spelling is not in the code*: `canonical.symbol` appears nowhere as a code token while another case form is declared or heads a declaration |
| `term-unmapped` | low | a declared term appears in comments or resources, but the canonical symbol never appears in code |

Member **values** are compared when they are simple single-line literals: two enums
whose members swapped values used to look identical when only names were compared. A
copy declared as a `struct` on one side and a `class` on the other says so in the
message.

Two filters keep the list short: a variant only fires when the file also mentions a
term of the concept, or both spellings share the same leading token; a contract-drift
pair must share at least one member.

Deliberately excluded: entry-point classes (`Program`/`Startup` with a `Main`),
`partial` declarations, generated files (`*.Designer.cs`, `*.g.cs`, `auto-generated`
headers), declarations with fewer than two members, subclasses that shadow a base of
the same name, and private nested helpers.

### Agent tools and prompt injection

| Tool | Purpose |
|---|---|
| `semantic_list` | list concepts; `hasDrift` runs a scan and filters to concepts with findings |
| `semantic_get` | one concept by id or symbol, plus its accepted exceptions; `includeDrift` adds a scan |
| `semantic_upsert` | create or update a concept (`merge` keeps omitted fields, `replace` rebuilds it) |
| `drift_scan` | structured findings with detector, confidence and citation |
| `semantic_accept` | `add` (default), `update` scope or reason, `remove` one, `clear` a concept; `reason` is required to add or update. `previousPath` locates the entry to change |

With `announceToAgent` on, every session receives one prompt section: the concepts
of the workspace it runs in and the rules that go with them. The section is capped
at 200 lines and summarized past 120 concepts. Turn it off in the panel to stop the
recurring token cost; the tools stay available.

A refusal is always a value (`{ ok: false, code, message, issues }`), never an
exception. A vocabulary file that cannot be parsed is reported as `valid: false`
with its first issues.

The loop this is built for:

1. the agent receives a task and calls `semantic_get` for the concept it is about to
   touch;
2. a missing concept is registered with `semantic_upsert` before any code is written;
3. after editing, `drift_scan` shows whether the change introduced a variant or a
   divergence;
4. a finding that is intentional is accepted with a reason and a narrow scope;
5. the vocabulary diff is reviewed like any other change.

### The panel

- **Left tree** — concepts grouped by id prefix, a finding count per group, a group
  add button, search, and a quick-create button.
- **Concept detail** — the fields, the findings attributed to the concept, and its
  accepted exceptions with **Edit**, **Remove** and (when there is more than one)
  **Clear all**. A row reads "mutes N now"; 0 means the scope matches nothing, which
  is worth seeing.
- **Toolbar** — icon-only scan, new concept, raw YAML and settings; every icon
  describes itself immediately on hover and to a screen reader. The toolbar holds the
  only scan button; the footer reports.
- **Workspace mode** — a crosshair while the panel follows the session's workspace,
  a pushpin while it is pinned; clicking switches.
- **Scan memory** — re-opening the panel shows the report this tab already has for
  that workspace (default 10 minutes, configurable). The footer dates it; past the
  retention it raises an amber badge, and so does an edited vocabulary file. Both
  badges are the rescan control.
- **Remembered page** — the panel returns to the concept (or unclassified list) it
  was on, only if that concept still exists.
- **Unclassified** — findings no concept owns; they exist before the first concept.
- **Settings** — follow-the-workspace, rescan-on-follow, scan retention, notice
  duration, low-confidence findings, and the **prompt injection switch** (a plugin
  setting, written through the Host). The rest are per-browser preferences.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `vocabularyPath` | `.dsh/semantics.yaml` | vocabulary file, relative to the workspace root |
| `announceToAgent` | `true` | inject the vocabulary section into agent prompts |
| `citationStyle` | `file+symbol` | `path/File.cs::Symbol` or `path/File.cs:123` |
| `minConfidence` | `medium` | lowest confidence the **tools** report; the panel receives every level |
| `timeoutMs` | `30000` | wall-clock budget for one scan |
| `maxFindings` | `5000` | hard cap per scan |
| `maxFileBytes` | `1048576` | larger files are skipped and counted |
| `maxFiles` | `50000` | hard cap on files visited |
| `detectors` | all four | which detectors a scan runs |

The settings form is generated from this schema by DSH. Changing a setting reloads
the plugin row.

## How it works

### Token cost

Measured on a real 18-concept vocabulary:

| Part | Size | Estimated tokens | Varies with |
|---|---|---|---|
| 5 tool schemas | 5,474 chars | ~1,400–1,800 | never |
| Prompt section | 1,749 chars | ~500–700 | concept count |
| Prompt section, empty vocabulary | ~250 chars | ~80–120 | — |
| Prompt section, 120-concept cap | ~8,000 chars | ~2,500–3,500 | cap |

So a session in a small-vocabulary project costs roughly **2,000–2,500 extra tokens
per request**, and a full vocabulary up to **4,000–5,000**. System-prompt caching
usually discounts the stable part, but a workspace switch or a vocabulary edit
invalidates it.

What you can do about it:

- **Turn the injection off** in the panel settings: removes the section (~500–3,500
  tokens) and keeps the tools.
- **Keep the vocabulary small**: it is a vocabulary of concepts, not a dictionary of
  every field.
- **Disable the plugin row** to remove even the tool schemas.

### Guarantees

* **The scan never writes.** The vocabulary is the only file the plugin ever writes.
* **One write path.** Panel and tools share the store: per-file serialization,
  validate-before-write, atomic replacement.
* **No daemon, no watcher, no index.** A scan is computed from disk when asked for.
* **Bounded.** A deadline and a finding cap always end a scan and the result says
  which one did.
* **Cheap to repeat.** Parsed declarations of unchanged files are reused (path, size,
  mtime; a file touched in the last second is always re-parsed); identical overlapping
  scans share one computation. Findings themselves are never cached.
* **Workspace-scoped.** Reads and writes stay inside a registered DSH workspace (or
  the Host's default directory). A write must name its workspace, otherwise it is
  refused rather than falling back to the default directory.
* **One deliberate exception to "compute on demand".** The browser keeps the last
  scan per workspace in `sessionStorage` for a bounded time. It never enters the
  repository, a closed tab forgets it, the tools never read it, and the footer dates
  it.
* **Diagnosable.** `GET /semantic-drift/health` reports what this activation mounted
  and the effective settings.

### Limits

This is a lexical tool. It knows identifiers, member names and comment text, not
meaning.

* A name is not a contract; the shared-member filter removes most false positives,
  not all.
* Member lists are parsed with regular expressions; an exotic declaration is skipped
  and counted, never guessed.
* Edit distance is blunt: declared type names of at least six characters, together
  with a shared leading token or a term in the same file.
* `term-unmapped` is a heuristic (low confidence, folded by default).
* A rename across tokens (`SetTemp` vs `TargetTemperature`) is not a misspelling;
  record it as a concept with terms.
* The panel cannot open a file; it copies a citation in the configured style.
* The prompt section resolves the workspace by the session's registered workspace.
  If the session runs in a directory that is not a registered workspace, the section
  falls back to the first registered workspace; the tools still act on the session's
  own directory.

### Development

```bash
pnpm install
pnpm test      # typecheck + node --test
pnpm build     # esbuild -> lib/index.js (host) + lib/client.js (browser)
```

Three layers of tests, each for a failure the previous one cannot see:

- `test/*.test.ts` — store, scanner, detectors, service and locale dictionaries,
  against hand-made fixtures;
- `test/fiber.test.ts` — mounts the **built** host artifact on a fake context and
  drives its tools, routes and prompt section;
- `test/*.test.mjs` — renders components and drives the **built** browser bundle in
  jsdom, stubbing `fetch` with real payloads.

`tsc` covers only the browser half: it catches a helper renamed in one place but
called in another — a class of bug a bundler ships happily.

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md), including the rule that no
real project may be identifiable anywhere in this repository.

## License

MIT

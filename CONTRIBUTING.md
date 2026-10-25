# Contributing

Thanks for taking a look. This is a small plugin; the rules below are short.

## Ground rules

- **The scan stays read-only.** A pull request that opens a file for writing outside
  the navigation/store path will be refused, whatever it improves.
- **One write path.** Panel and tools both go through `src/store.ts`: validate,
  serialize per file, write atomically. Do not add a second way to write.
- **No new background work.** No watcher, no index, no daemon, no timer that scans.
  A scan happens when a person or a tool asks for one.
- **Tests describe behaviour, not implementation.** Fixtures are hand-made.

## Testing and privacy (important)

The plugin is developed against real codebases, and those codebases are private.
Nothing about a real project may enter this repository — not in code, tests,
fixtures, comments, documentation, commit messages, pull-request text, or issues.

Concretely, before you commit:

1. **Anonymize every observation.** Replace project names, repository names,
  module/namespace names, concept ids, symbol names and file paths with invented
  ones. Keep the *shape* of the case (a case-only variant, a digit in a name, a
  derived copy), not its content.
2. **No absolute local paths.** No `/Users/<name>/...`, `/home/<name>/...` or
  `C:\Users\<name>\...` anywhere in the tree or in a commit message.
3. **No "we tested on X" claims.** Say what happened, not where: "the first field
  test", "a 1,600-file C# repository", "a case-only spelling variant". Numbers
  such as file counts are fine; identifiers and names are not.
4. **Write the decision, not the discovery story.** The commit message should
  explain why the change is right; the private context that led to it belongs in
  your local notes.

The test suite enforces the mechanical half of this:

- `test/hygiene.test.ts` fails on a home-directory path in a tracked file or in a
  commit message;
- set `SEMANTIC_DRIFT_DENYLIST` (comma-separated tokens) before `pnpm test` to
  also fail on any private name you are working with locally. The list lives in
  your environment, never in the repository.

## Development

```bash
pnpm install
pnpm test      # typecheck + node --test
pnpm build     # esbuild -> lib/index.js (host) + lib/client.js (browser)
```

`lib/` is committed so a git install needs no build: rebuild before committing.

## Style

- Comments explain *why*. A comment that restates the next line is noise.
- A new detector rule needs: a fixture that would be reported, a fixture that must
  stay quiet, and a line in the detector table in both READMEs.
- Chinese and English UI copy change together (`src/client/locales.ts`).

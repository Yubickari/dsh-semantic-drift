# CLI reference (0.3.0)

`dsh-semantic-drift` ships one read-only command for CI and local gates. It reads
the vocabulary and the source tree, prints findings, and **never writes** the
vocabulary, code, or any other file.

## Install and run

The CLI is a `bin` in the npm package; no global install is required:

```bash
npx dsh-semantic-drift@0.3.0 scan --changed --json
npx dsh-semantic-drift@0.3.0 scan --all --json
```

From a checkout:

```bash
node lib/cli.js scan --changed --json
```

## Synopsis

```text
dsh-semantic-drift scan [options]
```

`scan` is optional; flags alone work too, but the documented form keeps room for
future subcommands.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--changed` | on | Report findings touching files changed since `--base` |
| `--all` | — | Report every finding (mutually exclusive with `--changed`) |
| `--base <ref>` | `origin/main`, then `HEAD^` | Git base for `--changed` |
| `--json` | off | Machine-readable output |
| `--root <dir>` | current directory | Workspace root |
| `--vocabulary <path>` | `.dsh/semantics.yaml` | Vocabulary path, relative to root |
| `--min-confidence <level>` | `medium` | `high`, `medium` or `low`; also the fail threshold |
| `--detectors <list>` | all four | Comma-separated detector ids |
| `--paths <list>` | — | Comma-separated workspace-relative paths to scan |
| `--version` | — | Print the package version |
| `--help` | — | Print help |

`--changed` still scans the whole workspace; it only filters the **findings** to
those whose `path` or `detail.primaryPath` is in the changed set. This is
deliberate: `duplicate-type` and `contract-drift` compare two declarations, and
the other side may be in a file this change did not touch. A changed-files-only
scan would be fast but wrong.

The changed set includes commits since the base, the working tree, the index and
untracked files. Without a git repository, `--changed` exits 2 and points at
`--all`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | No findings at or above `--min-confidence` |
| `1` | At least one finding |
| `2` | Usage, vocabulary, git or scan error |

`--json` does not change the exit code. A CI step can rely on the code alone.

## JSON output

```json
{
  "ok": true,
  "workspace": "/repo",
  "vocabularyFile": ".dsh/semantics.yaml",
  "vocabularyExists": true,
  "mode": "changed",
  "base": "origin/main",
  "changedFiles": ["src/Device.cs"],
  "scanned": {
    "files": 154,
    "skipped": 0,
    "bytes": 17400000,
    "durationMs": 647,
    "truncated": false
  },
  "counts": {
    "duplicate-type": 0,
    "contract-drift": 0,
    "symbol-variant": 1,
    "term-unmapped": 0
  },
  "total": 1,
  "findings": [
    {
      "detector": "symbol-variant",
      "confidence": "medium",
      "path": "src/Device.cs",
      "line": 12,
      "symbol": "target_temp",
      "expected": "TargetTemperature",
      "citation": "src/Device.cs::target_temp",
      "message": "..."
    }
  ]
}
```

`counts` is recomputed after the changed-path filter, so it always adds up to
`total`. The full finding shape is the same one the `drift_scan` tool returns;
`detail` is present when the detector has evidence to share.

Errors are JSON too when `--json` is set:

```json
{ "ok": false, "code": "invalid-vocabulary", "message": "...", "issues": [] }
```

## Examples

```bash
# A pull request gate
npx dsh-semantic-drift@0.3.0 scan --changed \
  --base "$GITHUB_BASE_SHA" --json

# Everything, locally
npx dsh-semantic-drift@0.3.0 scan --all --json

# One detector, one directory
npx dsh-semantic-drift@0.3.0 scan --all --detectors symbol-variant \
  --paths src/Device --json
```

A complete GitHub Actions workflow is in
[github-action.yml](github-action.yml). It needs no secrets and no pnpm
install because `npx` fetches the package.

## Guarantees and limits

- Read-only: no vocabulary write, no code write, no watcher, no background job.
- No network calls; the only network use is the `npx` install itself.
- Scanning budget comes from the plugin schema defaults (30 s, 5,000 findings,
  1 MB per file, 50,000 files). `truncated` says the scan stopped early.
- `--paths` restricts the scan roots; `--changed` filters the result. Both can
  be combined.
- A finding outside the changed set is intentionally hidden by `--changed`; use
  `--all` when auditing the whole repository.
- The CLI is a separate `bin`, not a DSH route: `GET /semantic-drift/health`
  still reports five tools and nine routes.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot determine a base ref` | Pass `--base <ref>` or use `--all` |
| `not a git repository` | Use `--all`, or run in a checkout |
| `invalid-vocabulary` | Fix the reported line/path; the CLI refuses to scan an invalid file |
| Exit `1` in a clean-looking tree | Run without `--changed` to see findings outside the diff, or lower `--min-confidence` |
| `--changed` hides a known finding | The finding's `path` and `primaryPath` are both outside the diff; use `--all` |

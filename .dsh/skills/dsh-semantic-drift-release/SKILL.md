---
name: dsh-semantic-drift-release
description: "Release dsh-semantic-drift through its GitHub, npm OIDC and tag pipeline, then verify or update the awesome-dsh-plugin/dsh-market listing. Use only when the user explicitly asks to cut a release or update the marketplace entry."
whenToUse: "Use when the user asks to set the plugin version, push it to GitHub, publish the vX.Y.Z tag, or update the dsh-market/awesome-dsh-plugin entry. Not for ordinary code changes or internal pre-release test builds."
---

# Release dsh-semantic-drift

This is a runbook, not an automatic routine. **Do not tag, publish, or open a
marketplace PR until the user explicitly asks for that release.**

## Current facts (verify at run time)

- GitHub: `Yubickari/dsh-semantic-drift`.
- npm: `dsh-semantic-drift`; releases are published by
  `.github/workflows/release.yml` on a pushed `v*` tag through **OIDC trusted
  publishing**, with provenance. The repository holds no npm token.
- Tag format: `vX.Y.Z`; the workflow fails unless the tag equals
  `package.json.version`.
- Internal test builds use `X.Y.Z-pre.N` and are **not tagged or published**.
  A pushed prerelease tag would be published to npm `latest`, so never push one.
- Marketplace: the plugin is listed in
  `awesome-dsh-plugin/awesome-dsh-plugin` by the merged PR **#9889**, entry
  `data/plugins/Yubickari__dsh-semantic-drift.yml`, category `tools`.
  **The entry has no version field.** dsh-market reads the awesome-list index and
  resolves the npm version automatically; a version-only release needs no market
  PR. See `references/marketplace.md` for the exact entry and update rules.
- Always read the current `package.json`, `git status` and `npm view`; do not trust
  a version snapshot in this skill.
- `CONTRIBUTING.md`'s old Releasing section predates the OIDC publishing and
  branch-protection flow. **This skill and `.github/workflows/release.yml` are the
  authority**; do not follow the `NPM_TOKEN`/direct-tag instructions there.

## Choose the mode

| Mode | Version | Tag / npm | Marketplace |
|---|---|---|---|
| Internal test build | `X.Y.Z-pre.N` | No tag, no npm publish | No change |
| Public release | `X.Y.Z` (no prerelease) | `vX.Y.Z` tag -> npm publish | Only if the one-liner description changed |

Versioning follows `CONTRIBUTING.md`: `0.x` minor may contain a breaking change;
patch is for fixes; docs/pipeline-only changes still get a patch. A public release
of an internal `X.Y.Z-pre.N` normally becomes `X.Y.Z` unless the changes include
a compatibility break that warrants a different SemVer step.

## Public release flow (summary)

1. **Preconditions.** Explicit user instruction; `git status --short` clean; on
   `main` or a clean release branch; `gh auth status`; `git tag -l vX.Y.Z` empty;
   `npm view dsh-semantic-drift version` noted.
2. **Set the version.** Update `package.json.version`, `src/index.ts` `VERSION`,
   and the top of `CHANGELOG.md`. The two versions must match.
3. **Build and preflight.** `pnpm build`; `pnpm release:check`. If pnpm's non-TTY
   module check blocks the wrapper, run `node scripts/preflight.mjs` (it rebuilds,
   tests and packs) and `./node_modules/.bin/tsc --noEmit`.
4. **Commit and PR.** Commit the source **and** rebuilt `lib/`; push a release
   branch; open a PR with `gh pr create`; wait for both CI matrix jobs; merge with
   `gh pr merge --merge --delete-branch` (merge commit, not squash).
5. **Tag.** `git switch main && git pull --ff-only`; `git tag -a vX.Y.Z -m
   "X.Y.Z"`; `git push origin vX.Y.Z`; watch the Release workflow.
6. **Verify.** `npm view dsh-semantic-drift version`, dist-tags, provenance; the
   GitHub Release; a clean profile install and `/semantic-drift/health` (5 tools,
   9 routes); the panel footer version.
7. **Marketplace.** Confirm the index shows the new npm version; no entry edit for
   a version-only release. If the one-liner description no longer matches the
   release, update only `data/plugins/Yubickari__dsh-semantic-drift.yml` via a PR.
   Never edit the generated READMEs and never re-add the entry.

The exact commands, expected output and failure handling are in
`references/release-runbook.md`.

## Marketplace rules (confirmed)

- **No version field exists in the listing.** The version shown by dsh-market comes
  from the npm registry, linked by the package's `repository` field. A new npm
  version is picked up after the index rebuild; editing a version into the YAML
  would be rejected.
- **Only a content change needs a market PR**: description, category, icon, or
  screenshots. The file is `data/plugins/Yubickari__dsh-semantic-drift.yml`; a PR
  may touch at most 3 entries and must touch only your own.
- The READMEs are generated; do not edit them. The entry is already merged
  (PR #9889), so update it in place, never open a second "add" entry.
- dsh-market is a consumer of `dsh-plugin-catalog` / the awesome-list index; there
  is no separate dsh-market upload or version field. Check
  `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` (or
  `https://awesome-dsh-plugin.com/index.json`) after the release.

## Hard stops

- Do not add an npm token or secret; trusted publishing is the configured path.
- Do not push a tag before the release PR is merged; the workflow checks the tag
  against the manifest and the committed `lib/`.
- Do not force-push, rewrite, or delete a published tag/Release.
- Do not announce success until npm, provenance, the GitHub Release and the panel
  health all match.
- Do not change another plugin's marketplace entry; do not edit generated READMEs.
- If a release or marketplace step fails, stop and report the exact failing command
  and link; do not improvise a second publish path.

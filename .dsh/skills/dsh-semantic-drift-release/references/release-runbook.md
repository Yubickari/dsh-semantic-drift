# dsh-semantic-drift release runbook

Read this only after the user has explicitly asked for a release. Replace
`X.Y.Z` with the chosen public version and `release/X.Y.Z` with the branch.

## 0. Preconditions

```bash
cd /Users/lijiajian/Code/dsh-semantic-drift
git status --short                 # must be clean apart from changes being committed
git switch main
git pull --ff-only
gh auth status                     # repo + workflow scopes
npm view dsh-semantic-drift version
npm view dsh-semantic-drift dist-tags
git tag -l "vX.Y.Z"                # must be empty
```

Stop on a dirty tree, a failed `gh auth`, or an existing tag. Read `package.json` before choosing the version. If it carries a prerelease
suffix, a public release must remove it unless the changes warrant a different
SemVer step.

## 1. Set the version

Edit all three, in one commit:

1. `package.json` → `"version": "X.Y.Z"`.
2. `src/index.ts` → `export const VERSION = 'X.Y.Z'` (a test enforces the match).
3. `CHANGELOG.md` → a new top section for `X.Y.Z` describing the user-visible
   change and the release type.

Do not tag an internal `X.Y.Z-pre.N` build. A pushed prerelease tag would be
published to npm `latest` by the current workflow.

## 2. Build and preflight

```bash
pnpm build
pnpm release:check
```

Expected tail:

```text
✔ preflight passed: version X.Y.Z · no vX.Y.Z tag yet · lib/ rebuilt · tests pass · package contents (10 files)
```

`preflight` checks version/VERSION sync, rebuilds `lib/`, runs the tests, and runs
`npm pack --dry-run`. It normally leaves `lib/` modified; commit that together with
the source.

If pnpm's non-TTY module check refuses to proceed, use the equivalent direct
commands instead of changing the environment:

```bash
node scripts/preflight.mjs
./node_modules/.bin/tsc --noEmit
```

## 3. Commit, PR, CI

```bash
git switch -c release/X.Y.Z
git add -A                         # source + rebuilt lib/ + CHANGELOG + package.json
git commit -m "Release X.Y.Z: <one-line summary>"
git push -u origin release/X.Y.Z
gh pr create --base main --head release/X.Y.Z \
  --title "Release X.Y.Z" \
  --body "<why this release; what changed; how it was verified>"
gh pr checks --watch
```

Both CI matrix jobs must pass (`test (22.18.0)`, `test (24)`). Merge with a merge
commit, not squash:

```bash
gh pr merge <PR> --merge --delete-branch
```

Squashing breaks the tag target's ancestry; the release tag must point at a commit
that is on `main`.

## 4. Tag and publish

```bash
git switch main
git pull --ff-only
git tag -a vX.Y.Z -m "X.Y.Z"
git push origin vX.Y.Z
RUN=$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN" --exit-status
```

The workflow:

- checks `vX.Y.Z` equals `package.json.version`;
- runs tests, builds, and verifies the committed `lib/` matches a fresh build;
- publishes with `npm publish --provenance --access public` through OIDC;
- creates the GitHub Release named `vX.Y.Z`.

Do not re-push a tag after a failed run. Read the log and fix the cause.

## 5. Verify

```bash
npm view dsh-semantic-drift version
npm view dsh-semantic-drift dist-tags
gh release view vX.Y.Z --json name,tagName,isPrerelease
curl -s https://registry.npmjs.org/dsh-semantic-drift/X.Y.Z \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("user:",j._npmUser?.name);console.log("provenance:",j.dist?.attestations?.provenance?.predicateType)})'
```

Expected: version `X.Y.Z`; `latest = X.Y.Z`; `_npmUser = GitHub Actions`;
`predicateType = https://slsa.dev/provenance/v1`; Release name `vX.Y.Z`, not
prerelease.

Clean-profile acceptance:

```bash
dsh plugin --profile <clean-profile> add dsh-semantic-drift@X.Y.Z
curl -s http://127.0.0.1:<port>/semantic-drift/health
# expect {"ok":true,"version":"X.Y.Z","tools":5,"routes":9,...}
```

Open the panel once and confirm the footer shows `vX.Y.Z` and the plugin scans.

## 6. Marketplace

See `marketplace.md`. Quick check:

```bash
curl -s https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json \
  | grep -o 'dsh-semantic-drift[^,}]*' | head
```

The listing is versionless; the npm version is resolved from the registry. Do not
add a `version:` key. Only open a market PR if the one-line description, category,
icon, or screenshots need to change.

## Failure map

| Symptom | Cause | Action |
|---|---|---|
| `tag ... does not match package.json` | tag/version mismatch | fix the version, recreate the tag only if it was never pushed successfully |
| CI "committed bundle matches the source" | `lib/` not rebuilt or not committed | `pnpm build`, commit `lib/`, push |
| `OIDC permission denied` | trusted publisher lacks "publish directly" | fix npm package settings, do not add a token |
| `E409 cannot publish over the existing version` | version already on npm | choose a new patch; never force |
| `EOTP` | fallback token cannot bypass 2FA | restore trusted publishing; do not commit a token |
| PR checks pending/conflicted | branch protection or generated files | fix the branch; do not force-push `main` |
| Release is `vvX.Y.Z` | workflow prefixed an already-prefixed tag | use `name: ${{ github.ref_name }}` |
| `npm view` still shows the old version | registry/CDN delay | wait; do not republish |

## Hard stops

- Never publish a prerelease tag.
- Never add `NPM_TOKEN` or any npm secret to the repo.
- Never squash the release PR or tag a commit not on `main`.
- Never edit generated marketplace READMEs, another plugin's entry, or a second
  copy of this plugin's entry.
- Never announce success before npm, provenance, GitHub Release, health and the
  panel version all agree.

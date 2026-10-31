# dsh-market / awesome-dsh-plugin listing

Confirmed on 2026-10-31 against the live repository and the merged PR.

## Where the listing lives

- Repository: `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`
- Entry file: `data/plugins/Yubickari__dsh-semantic-drift.yml`
- Current entry (merged by PR **#9889**, 2026-10-27):

```yaml
url: https://github.com/Yubickari/dsh-semantic-drift
name: Yubickari/dsh-semantic-drift
category: tools
description:
  en: One versioned vocabulary of a project's business concepts, a read-only drift scan, and the same naming rules in every agent prompt.
  zh: 一份按项目维护的业务概念词表、只读命名漂移扫描，以及注入每个 Agent 提示的同一套命名规则。
```

- PR: `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9889`
- The READMEs are generated from `data/plugins/*.yml`; do not edit them.
- The list is also the dsh-market index source (`dsh-plugin-catalog`). dsh-market
  consumes that index; there is no separate dsh-market upload.

## What “update the version” means here

**The entry has no version field.** The version shown by dsh-market comes from the
npm registry, linked by the published package's `repository` field. Therefore:

| Release change | Marketplace action |
|---|---|
| Only the plugin version changes | **No marketplace PR.** Publish npm, verify the index/dsh-market picks up the new version. Do not add a `version:` key. |
| The one-line description, category, icon, or screenshots change | Open one PR editing only `data/plugins/Yubickari__dsh-semantic-drift.yml` (and, for screenshots, add `screenshots.json` in your own repo). |
| The plugin is removed or broken | Follow the list's removal/update process; do not silently duplicate the entry. |

The current one-liner still describes the core plugin. The 0.1.6 interaction work
does not change the core claim, so a version-only release should require no market
PR. Re-read the entry against the release before deciding.

## Verify the index after an npm release

```bash
npm view dsh-semantic-drift version
npm view dsh-semantic-drift dist-tags
curl -s https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json \
  | grep -o 'dsh-semantic-drift[^,}]*' | head
# mirror: https://awesome-dsh-plugin.com/index.json
```

If the index still shows the old version after a reasonable delay, do not edit a
version field (none exists). Check:
1. npm `latest` is the new version;
2. the published package's `repository` points at
   `github.com/Yubickari/dsh-semantic-drift`;
3. the index/catalog has rebuilt; then check dsh-market again.
If it remains stale, report it to the list maintainers instead of opening an entry
edit that cannot fix it.

## Update the one-liner (only when it changed)

Use the existing fork `Yubickari/awesome-dsh-plugin` from PR #9889, or fork again.

```bash
git clone https://github.com/Yubickari/awesome-dsh-plugin.git
cd awesome-dsh-plugin
git switch main
git pull --ff-only
git switch -c update-dsh-semantic-drift
# edit ONLY data/plugins/Yubickari__dsh-semantic-drift.yml
git diff -- data/plugins/Yubickari__dsh-semantic-drift.yml
```

Rules from the list's contributing guide:

- Keep the `url` exactly `https://github.com/Yubickari/dsh-semantic-drift`.
- Keep `name: Yubickari/dsh-semantic-drift`.
- `category: tools` is the current fit (valid values include `tools`; a maintainer
  may re-file it, do not agonize).
- `description.en` is required; `description.zh` is optional but keep both in sync.
- Quote a description containing `: ` (colon + space) in YAML.
- Do not edit the generated READMEs; do not touch another entry; one PR may add at
  most 3 entries, and this is an update to one.
- Optional preview only: `npm ci && node scripts/generate-readme.mjs`; commit the
  generated files only if they match, otherwise leave them out.

Commit and PR:

```bash
git add data/plugins/Yubickari__dsh-semantic-drift.yml
git commit -m "Update Yubickari/dsh-semantic-drift description"
git push origin update-dsh-semantic-drift
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --base main --head Yubickari:update-dsh-semantic-drift \
  --title "Update Yubickari/dsh-semantic-drift" \
  --body "Updates only data/plugins/Yubickari__dsh-semantic-drift.yml: <what changed and why>."
```

Wait for the submission gate and review. Do not open a second "add" PR for the same
plugin; the entry already exists.

## dsh-market note

[dsh-market](https://github.com/dsh-market/dsh-market) is a consumer of the index,
not a second listing file. Its plugin card/version follows the npm package. No
dsh-market-specific version field, upload, or PR is part of this release.

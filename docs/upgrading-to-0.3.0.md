# Upgrading to 0.3.0

0.3.0 is the last **schema v1** release. It does **not** require a vocabulary
migration: existing `version: 1` files stay valid. The changes are additive plus
one default change.

## Summary

| Change | What to do |
|---|---|
| `announceDetail` now defaults to `compact` | Nothing. Set `announceDetail: full` if you want notes in the prompt |
| Optional `lifecycle` on concepts | Nothing. Use `planned` for registered-but-unbuilt concepts |
| Batch `semantic_upsert` | Optional; single calls keep working |
| Read-only CLI (`scan`) | Optional; use it in CI |
| 0.2.2 health/state fix | Included; nothing to configure |
| Schema v1 frozen | No action; v2 is still a draft |

## Steps

1. **Install 0.3.0** in a profile:

   ```bash
   dsh plugin --profile desktop add dsh-semantic-drift@0.3.0
   ```

2. **Check the effective settings**:

   ```bash
   curl -s http://127.0.0.1:52882/semantic-drift/health
   curl -s http://127.0.0.1:52882/semantic-drift/state
   ```

   `announceDetail` should read `compact` unless you had set `full` explicitly.
   Five tools and nine routes stay the same.

3. **Decide on prompt detail.** If the notes are valuable, set
   `announceDetail` to `full` in the plugin configuration. Explicit values are
   preserved; only configurations that never set the field move to `compact`.

4. **Mark planned concepts.** Add `lifecycle: planned` to concepts that are
   registered but not implemented:

   ```yaml
   concepts:
     - id: device.target_temperature
       terms: ["target temperature"]
       kind: quantity
       lifecycle: planned
       canonical:
         symbol: TargetTemperature
   ```

   `active` is the default and is omitted on save. `deprecated` keeps a concept
   for history. Both planned and deprecated concepts are skipped by
   `term-unmapped` and marked in the prompt as `[planned]` / `[deprecated]`.

5. **Try batch registration** when onboarding a vocabulary:

   ```json
   {
     "concepts": [
       { "conceptId": "device.state", "terms": "设备状态", "kind": "status", "symbol": "DeviceState" },
       { "conceptId": "device.mode", "terms": "设备模式", "kind": "status", "symbol": "DeviceMode", "lifecycle": "planned" }
     ]
   }
   ```

   Each item reports its own issues; one bad item does not block the rest.

6. **Add a CI gate** (optional):

   ```bash
   npx dsh-semantic-drift@0.3.0 scan --changed --json
   ```

   See [cli.md](cli.md) for flags, exit codes and the JSON shape.

## Downgrade warning

`lifecycle` is a v1 optional field. A 0.2.x plugin treats it as an unknown key,
ignores it, and **drops it on the next save**. If you must downgrade:

1. back up `.dsh/semantics.yaml`;
2. do not save through the old plugin;
3. restore the backup after switching back.

This is a limitation of older readers, not a version bump: 0.3.0 still writes
`version: 1` on purpose. Bumping the version would have locked old plugins out of
every file, including files that never use `lifecycle`.

## What is not in 0.3.0

- **No schema v2**: no `behaviors`, function fingerprints or `semantic_upgrade`.
- **No first-vocabulary injection prompt** (#32; planned 0.4.0).
- **No metrics export** (#27; backlog/0.4.x).
- **No `defaultGroup`** in batch upsert; id suggestions only.
- **No 0.3.1**: 0.3.0 is the planned v1 close-out. A patch release only follows a
  release-blocking bug.

## Related docs

- [release-plan-0.3.0.md](release-plan-0.3.0.md) — scope, acceptance and release
  checklist.
- [schema-evolution.md](schema-evolution.md) — v1 freeze and the v2 draft.
- [cli.md](cli.md) — CLI reference.
- [github-action.yml](github-action.yml) — Actions example.

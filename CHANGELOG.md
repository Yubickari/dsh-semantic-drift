# Changelog

## 0.1.5

- The panel's settings dialog was rebuilt around what actually belongs to the browser:
  workspace following, scanning and cache, display and notices, in four groups, plus
  the agent-prompt switch. Every change takes effect immediately and the **Save** /
  **Done** buttons are gone — the dialog closes with the × in its title bar.
- Project-level settings (vocabulary path, citation style, tool minimum confidence,
  the three scan budgets, and the detector set) moved out of the panel to this
  plugin's own page under **Settings → Installed Plugins**. Saving writes the plugin
  row and reloads it; a value that does not take effect needs the plugin disabled and
  enabled again in the list, or a page reload.
- Corrected a wrong claim in both READMEs: DSH does **not** render the settings form
  from the schemastery schema. The plugin contributes the `plugins.row.config` page,
  the form reads its fields and current values from `GET /semantic-drift/config`,
  saving goes through `POST /semantic-drift/settings`, and the Host applies the patch
  with its config editor before reloading the row.
- `announceToAgent` is a volatile field now: the switch is committed in place, the
  prompt section stays registered and returns an empty text while it is off, so one
  click turns the injection on or off without reloading the plugin row. The previous
  behaviour reported a save and left the switch where it was.
- New read-only `GET /semantic-drift/config` route: the mounted surface is nine routes
  now instead of eight.
- The version is shown only in the panel footer (`vX.Y.Z`); the settings dialog no
  longer repeats it.

## 0.1.4

- Published through **OIDC trusted publishing**: the release workflow holds no npm
  token and no secret to rotate, and the tarball carries a provenance statement
  signed by GitHub Actions. No runtime change.
- A trusted publisher entry that allows direct publishing (and dist-tags) is now
  required for a release; the previous token fallback stays documented for rollback.

## 0.1.3

- The GitHub release title is the tag (`v0.1.3`), not `vv0.1.3`: the workflow
  prefixed a name that already starts with `v`.
- Release notes stay generated from the commits since the previous tag.

## 0.1.2

A small release that exercises the automated pipeline (tag -> tests -> npm publish
-> GitHub release). One user-visible change:

- The settings dialog shows the plugin version next to the effective configuration,
  so an update can be confirmed without scrolling to the footer.

## 0.1.1

First public release.

- One versioned vocabulary per workspace (`.dsh/semantics.yaml`), validated before
  every write and written atomically.
- Four detectors, ten rules: duplicated types (copy / parameterized derivative /
  divergent values), contract drift that ignores inheritance and nested helpers,
  spelling variants including a canonical spelling the code never uses, and unmapped
  terms.
- Accepted exceptions as records: reason + minimal scope, editable, rewordable,
  removable, undoable, each reporting how many findings it mutes right now.
- Five agent tools and one prompt section, with a panel switch to turn the injection
  off and stop its recurring token cost.
- Panel: concept tree and detail, drift list, raw YAML editor, unclassified findings,
  scan memory with a dated report, remembered page, workspace following or pinning.
- Read-only scan, no daemon, no index; parsed files reused between runs; workspace
  scoped; a write must name its workspace.

## 0.1.0

Development builds. Same feature set before the first public release; no public tag.

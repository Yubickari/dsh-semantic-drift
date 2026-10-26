# Changelog

## 0.1.5

- The panel's settings dialog was rebuilt around what actually belongs to the browser:
  workspace following, scanning and cache, display and notices, in four groups, plus
  the agent-prompt switch. Every change takes effect immediately and the **Save** /
  **Done** buttons are gone — the dialog closes with the × in its title bar.
- Project-level settings (vocabulary path, citation style, tool minimum confidence,
  the three scan budgets, and the detector set) moved out of the panel to the bundle's
  **Configuration** block under **Plugins → Installed Plugins →
  `dsh-semantic-drift`**. The plugin registers that block into the
  `plugins.bundle.config` seat and supplies the field table, the labels and the
  controls; the form and the writes are DSH's own live config form, which addresses the
  plugin by its profile entry id (`semantic-drift`) and needs no save channel from us.
- Every configuration field is schemastery **volatile** now, so DSH shows it as
  editable and commits an edit in place without unmounting the plugin row: a change is
  in force from the next read, and there is nothing to save, reload or toggle.
- `announceToAgent` stays in the panel, in its agent-prompt group, and the
  Configuration block leaves it out when it renders. The switch keeps working the same
  way — committed in place, the prompt section stays registered and returns an empty
  text while it is off, so one click turns the injection on or off and the next prompt
  assembly already reflects it. The previous behaviour reported a save and left the
  switch where it was.
- New read-only `GET /semantic-drift/config` route: the mounted surface is nine routes
  now instead of eight. It answers the field table alone — names, kinds, descriptions,
  defaults, bounds, options — and no values.
- `POST /semantic-drift/settings` carries one field now, `announceToAgent`, the only
  thing the panel writes; the retired `patch` member is refused with 400, so no caller
  writes a field behind DSH's form.
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

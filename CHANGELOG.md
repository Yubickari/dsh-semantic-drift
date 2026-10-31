# Changelog

## 0.1.6

An interaction pass across the panel and the agent-prompt switch.

- **Required concept fields** — `id`, `terms`, `kind` and `canonical.symbol` carry
  the dark-red asterisk and `aria-required`; the optional type, unit and note keep
  their "(optional)" labels. A refused save keeps its positioned issues in the
  form and does not repeat them in a banner or badge.
- **Feedback channels are now final** — success confirmations (**Save**, copy,
  accept, restore) use the filled footer badge treatment shared with the state
  markers; click to dismiss, or let the **Notifications close after** setting close
  it. Operation failures that need detail use dismissible banners with their
  issues and, where useful, retry. There is no toast.
- **Prompt injection moved to the header** — the switch sits beside the workspace
  mode and is stored per workspace in the hidden `announceByWorkspace` map on the
  plugin row. Workspaces without an entry keep the `announceToAgent` default. The
  settings dialog is down to three groups.
- **macOS window chrome** — the header pads by `--dsh-frame-top-clearance` and
  marks itself `data-window-drag`, so its title clears the traffic lights and the
  collapsed-sidebar controls while the blank header strip stays draggable.

## 0.1.6-pre.3

Same internal 0.1.6 pass; this corrects the feedback channel chosen in pre.2.

- The toast is gone. **Save** and the other operation confirmations now use the
  footer badge channel, with the same filled badge treatment as the stale-scan
  and changed-vocabulary state markers. The badge closes on click, or after the
  **Notifications close after** seconds (0 keeps it).
- Failures that need detail are dismissible **banners** with their positioned
  issues and a retry control where one applies. Validation issues remain inline
  in the form that caused them.
- The prompt switch now carries the same immediate styled hover tip as the
  toolbar buttons, and the tip says that turning it on adds roughly 500-3,500
  tokens per request.

## 0.1.6-pre.2

Still the 0.1.6 interaction pass, still internal and unpublished. This cut
standardizes feedback, moves the prompt switch to the workspace header, and makes
the panel clear the macOS window chrome.

- **Feedback channels** are now four, with one lifetime each: validation issues
  stay in the form, persistent banners describe page state (never scanned, invalid
  vocabulary), toasts report one action's result at the bottom, and footer badges
  stay state flags. The READMEs document the table.
- A saved result is a filled toast at the bottom of the panel, white on a deep
  success colour. Clicking it dismisses it; otherwise it closes after the
  **Notifications close after** seconds (0 keeps it). Errors without positioned
  issues use the same toast; errors that the form can explain stay in the form.
- The prompt-injection switch moved from the settings dialog to the panel header,
  beside the workspace-follow control. Its value is now **per workspace**: the
  header switch writes a hidden `announceByWorkspace` map on the plugin row
  (`POST /semantic-drift/settings` carries the workspace), and the prompt section
  reads that map live. Workspaces without an entry keep the `announceToAgent`
  default. The settings dialog is down to three groups.
- On macOS the header pads by `--dsh-frame-top-clearance` and marks itself
  `data-window-drag`, the same convention the Plugins and Automation tasks pages
  use, so the title no longer lands under the traffic lights or the collapsed
  sidebar controls; the blank header strip remains a window drag region.

## 0.1.6-pre.1

Internal build: 0.1.6 is an interaction pass, and this first cut fixes the
concept form's error feedback and required-field signalling. It is not tagged or
published; the pre-release suffix keeps it off npm's `latest` line until the pass
is done.

- A refused concept save no longer repeats itself in the bottom notice. The form
  already renders every positioned issue under its fields, so a missing id, term
  or canonical symbol stays in the form where it can be corrected. A failure with
  no positioned issue (for example an unreachable host) still uses the bottom
  notice, because the form has nothing to point at.
- The concept form marks its four required fields — `id`, `terms`, `kind` and
  `canonical.symbol` — with a dark-red asterisk, and the same controls expose
  `aria-required`. The optional type, unit and note keep their "(optional)"
  labels. No native `required` attribute is used: the host owns validation, and
  the browser's own bubble would replace the in-form issues.

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

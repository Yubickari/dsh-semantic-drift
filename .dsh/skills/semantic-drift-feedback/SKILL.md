---
name: semantic-drift-feedback
description: "Design or change user-facing feedback in the dsh-semantic-drift panel: inline validation, persistent banners, and footer success badges. Use when adding, changing, or reviewing an error, confirmation, notice, banner, badge, or notification."
whenToUse: "Use for any message, error, success confirmation, banner, badge, or notification in dsh-semantic-drift, or when reviewing a UI change that reports an operation's result."
---

# Feedback design for dsh-semantic-drift

The panel has a small, deliberate feedback system. Keep it small: a new channel is a
design change, not a default.

## Hard rules

- **There is no toast and no bottom overlay.** Do not reintroduce one, and do not
  route an operation result through a floating bar.
- **One message, one channel.** A validation issue rendered inside a form must not
  also appear in a banner or a badge. A page-level state must not also be a badge.
- **Success is a footer badge.** `Save`, copy, accept, restore and the other
  operation confirmations use the same filled badge treatment as the state markers
  in the footer.
- **Failure with detail is a banner.** An operation failure that has no inline form
  issue uses a dismissible banner with its positioned issues and, where it applies,
  a retry control.
- **Use the theme.** Colours come from `--dsw-alias-*`; the only literal shades are
  the dark mixtures used to keep white text readable on the filled badges.

## Channels and lifetimes

| Channel | Component / selector | Use it for | Lifetime |
|---|---|---|---|
| Inline validation | `IssueList`, `.sd-issue` | A field or document issue in the form that caused it | Until the form is corrected or resubmitted; never repeated elsewhere |
| Banner | `Banner` (`.sd-banner`) | Page state (never scanned, invalid vocabulary) or an operation failure with no inline form | Page state persists; an operation error is dismissible and carries its issues/retry |
| Footer badge | `.sd-badge-success`, `.sd-badge-warn`, `.sd-footer-feedback` | Success confirmations and state flags | Success: click to dismiss, or auto-close after **Notifications close after** seconds (0 keeps it). State flags stay while the state does |
| Badge action | `.sd-badge-ghost` | A follow-up beside a success badge, e.g. **Undo** | Same as the success badge it accompanies |

## Decision table

| Situation | Channel |
|---|---|
| A concept id, term, symbol, raw YAML line or other form field is invalid | Inline `IssueList` only |
| A save is refused and the form already shows every issue | Inline only; no banner and no badge |
| The vocabulary cannot be parsed, or no scan has happened yet | Persistent `Banner` |
| A save/accept/settings request fails with no form to point at | Error `Banner`, dismissible, issues listed, retry when the panel cannot load |
| The panel cannot load at all | Error `Banner` with a retry action |
| A save/copy/accept/restore/exception operation succeeds | Footer success badge |
| A successful operation has an immediate follow-up | Footer success badge plus a `.sd-badge-ghost` action |
| Scan is stale, the vocabulary changed, the result is truncated | Footer state marker (`.sd-badge-warn` / footer text) |

## Visual contract

- **Footer success badge:** a filled pill in the footer feedback group. 11px, white
  text, success colour mixed with its dark shade for contrast, ellipsis when long,
  max width set by `.sd-footer-feedback`. It is a button: clicking dismisses it.
- **State marker:** `.sd-badge-warn` keeps the amber fill and white text. The
  success badge shares the same base rule; do not fork the shape or typography.
- **Action badge:** `.sd-badge-ghost` uses the surface/border tokens and primary
  label colour; it is a secondary action, not a second confirmation.
- **Error banner:** `data-kind="error"`, `role="alert"`, border/text in the error
  token, a close control, and the issue list in the body. The banner action area is
  a flex row; the close control is separate from the optional retry.
- **Tooltips:** use the existing `data-tip` contract (`sd-button-icon[data-tip]`,
  `sd-tip-above[data-tip]`, and `.sd-announce[data-tip]`), not a native `title`.
  The prompt-injection switch's tip must say that turning it on adds roughly
  500-3,500 tokens per request.
- **macOS header:** an entry page in the main panel pads its header by
  `--dsh-frame-top-clearance` and marks the header `data-window-drag`; do not
  hard-code traffic-light offsets. The shell's no-drag rule keeps controls
  clickable.

## Code map

| Concern | Where |
|---|---|
| Feedback state, auto-close, rendering | `src/client/Panel.tsx` (`FeedbackValue`, `notice`, the success badge in the footer, the error banner above the body) |
| Persistent banners and dismiss control | `src/client/Banner.tsx` |
| Inline validation | `src/client/IssueList.tsx`; used by `ConceptEditor.tsx` and `RawEditor.tsx` |
| Footer/banner/badge styles | `src/client/styles.ts` (`.sd-badge-*`, `.sd-footer-feedback`, `.sd-banner*`, `.sd-announce[data-tip]`) |
| Copy, both languages | `src/client/locales.ts` (`state.saved`, `feedback.dismissHint`, `header.announceTip`, `settings.announceHint`, ...) |
| Behaviour tests | `test/panel-flow.test.mjs`, `test/ui.test.mjs`, `test/docs.test.ts`, `test/locales.test.ts` |
| Channel documentation | `README.md` / `README.zh.md` → "Feedback channels" / "提示通道" |

## Auto-close and dismissal

- The success badge is the only auto-closing channel. `notificationSeconds` is a
  browser preference, default 3 seconds; 0 keeps the badge until dismissed.
- Error banners do not auto-close; the reader closes them. The error banner's retry
  is shown when the panel has no state to render.
- The success badge's action (e.g. Undo) is a sibling button; do not nest a button
  inside the badge button. The action stops its own click from dismissing the badge.
- Keep `aria-live="polite"` on the footer feedback group and `role="alert"` on the
  error banner.

## Adding or changing a message

1. Pick the channel from the decision table. If none fits, stop and discuss the
   design; do not add a toast.
2. Add the key to both dictionaries in `src/client/locales.ts`.
3. In `Panel.tsx`, set the `notice` value with the smallest shape: success text,
   optional action; error text, optional issues/retry. Suppress the global notice
   when an inline form already shows the issues.
4. Reuse the existing selectors. Add CSS only for a genuinely new visual variant;
   theme tokens only.
5. Add tests:
   - `panel-flow.test.mjs`: the flow, dismissal, auto-close, and no duplicate channel.
   - `ui.test.mjs`: markup/accessibility of a new component or badge variant.
   - `docs.test.ts`: if the channel table or its vocabulary changes.
   - `locales.test.ts`: both dictionaries stay in sync.
6. Update the README feedback table if the channel rules changed.
7. Run `pnpm test` (or the underlying `tsc --noEmit` + `node --test` when pnpm's
   TTY module check blocks the wrapper). This skill does not require a build unless
   the change also touches the shipped client bundle and the user asks to build.

## Current invariants worth preserving

- Concept save and raw YAML save: inline issues only, no banner/badge duplicate.
- Operation success: footer badge, not a banner, not a toast.
- Operation failure: dismissible banner, not a footer badge.
- The prompt-injection switch lives in the header beside the workspace mode, is
  per workspace (`announceByWorkspace` map on the plugin row), and has the styled
  token-cost tooltip.
- The client bundle must not contain `.sd-toast`; `test/ui.test.mjs` asserts this.

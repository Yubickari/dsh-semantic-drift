/**
 * Panel stylesheet.
 *
 * Rendered as one `<style>` element inside the panel subtree, so unmounting the
 * panel removes it and no global stylesheet can leak into another plugin. Colors
 * are the Host's own theme tokens (`--dsw-alias-*`), so light, dark and any skin
 * apply without the panel knowing about them.
 *
 * @module dsh-semantic-drift/client/styles
 */

export const PANEL_CSS = `
.sd-root {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  line-height: 1.5;
}
.sd-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  flex: none;
  min-height: 52px;
}
.sd-heading { display: flex; flex-direction: column; min-width: 0; }
.sd-title { font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.sd-subtitle {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 46vw;
}
.sd-spacer { flex: 1; }
.sd-spread { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sd-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.sd-body { display: flex; flex: 1; min-height: 0; }
.sd-tree {
  width: 268px;
  flex: none;
  border-right: 1px solid var(--dsw-alias-border-l1);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sd-tree-tools { padding: 10px 12px 6px; display: flex; flex-direction: column; gap: 8px; flex: none; }
.sd-tree-list { flex: 1; overflow: auto; padding: 4px 6px 12px; }
.sd-detail { flex: 1; overflow: auto; padding: 18px 22px 28px; min-width: 0; }
.sd-footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 16px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  min-height: 30px;
}
.sd-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.sd-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.sd-button:disabled { opacity: .55; cursor: default; }
.sd-button-primary {
  background: var(--dsw-alias-brand-primary);
  border-color: transparent;
  /* The on-brand text colour has to follow the theme: a hard-coded white is
     invisible wherever the brand accent is light (the dark theme). The base
     background is by definition the colour the page uses behind everything, so
     it contrasts with the accent in both themes. */
  color: var(--dsw-alias-bg-base);
}
.sd-button-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); filter: brightness(1.08); }
.sd-button-ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.sd-button-icon { position: relative; width: 28px; padding: 0; justify-content: center; }
/* A native title tooltip waits a second and sometimes never shows; this one is
   immediate, styled, and shares the label the screen reader already gets. */
.sd-button-icon[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .18);
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity .1s ease .12s, transform .1s ease .12s;
  pointer-events: none;
  z-index: 30;
}
.sd-button-icon[data-tip]:hover::after,
.sd-button-icon[data-tip]:focus-visible::after { opacity: 1; transform: translateY(0); }
.sd-button-icon:disabled[data-tip]::after { display: none; }
.sd-spin { animation: sd-spin 1s linear infinite; }
@keyframes sd-spin { to { transform: rotate(360deg); } }
.sd-button-danger { color: var(--dsw-alias-state-error-primary); }
.sd-button-danger:hover:not(:disabled) { border-color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-bg-layer-2); }
.sd-mode-button[data-mode='pinned'] { color: var(--dsw-alias-brand-primary); }
.sd-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  flex: none;
}
.sd-switch:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.sd-switch:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary); }
.sd-switch-track {
  position: relative;
  display: inline-block;
  width: 30px;
  height: 17px;
  border-radius: 9px;
  background: var(--dsw-alias-border-l2);
  transition: background .14s ease;
  flex: none;
}
.sd-switch-track[data-on='true'] { background: var(--dsw-alias-brand-primary); }
.sd-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-base);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .25);
  transition: transform .14s ease;
}
.sd-switch-track[data-on='true'] .sd-switch-knob { transform: translateX(13px); }
.sd-button-ghost:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.sd-input, .sd-select, .sd-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  padding: 6px 9px;
  outline: none;
}
.sd-input:focus, .sd-select:focus, .sd-textarea:focus { border-color: var(--dsw-alias-brand-primary); }
.sd-textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; resize: vertical; }
.sd-select { height: 28px; padding: 0 8px; max-width: 240px; }
.sd-search { position: relative; }
.sd-search .sd-input { padding-left: 28px; }
.sd-search-icon { position: absolute; left: 8px; top: 7px; color: var(--dsw-alias-label-secondary); pointer-events: none; }
.sd-filters { display: flex; gap: 4px; }
.sd-chip {
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  height: 22px;
  padding: 0 9px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.sd-chip:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.sd-chip[data-active='true'] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l1);
}
.sd-group { margin-top: 6px; }
.sd-group {
  display: flex;
  flex-direction: column;
}
.sd-group-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sd-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .01em;
  padding: 6px 6px;
  cursor: pointer;
  border-radius: 6px;
}
.sd-group-head:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.sd-add {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity .12s ease;
}
.sd-group-row:hover .sd-add { opacity: 1; }
.sd-add:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.sd-add:focus-visible { opacity: 1; border-color: var(--dsw-alias-brand-primary); }
.sd-tree-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 0;
}
.sd-tree-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.sd-tree-head .sd-add { opacity: 1; margin-left: auto; }
.sd-caret { transition: transform .12s ease; display: inline-flex; }
.sd-caret[data-open='false'] { transform: rotate(-90deg); }
.sd-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 5px 8px 5px 21px;
  border-radius: 6px;
  cursor: pointer;
}
.sd-item:hover { background: var(--dsw-alias-bg-layer-2); }
.sd-item:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary); }
/* Selected: a neutral raised surface plus a stronger border, so it reads in
   both light and dark themes without borrowing the brand accent. */
.sd-item[data-active='true'] {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l1) inset;
}
.sd-item[data-active='true']:hover { background: var(--dsw-alias-bg-layer-2); }
.sd-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-item-symbol {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sd-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
}
.sd-count[data-tone='warn'] { color: var(--dsw-alias-state-warn-primary); }
.sd-section { margin-bottom: 24px; }
.sd-section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--dsw-alias-label-secondary);
  margin: 0 0 8px;
}
.sd-concept-title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.sd-concept-id { font-size: 17px; font-weight: 600; }
.sd-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sd-kv { display: grid; grid-template-columns: 96px 1fr; gap: 6px 14px; align-items: baseline; }
.sd-kv-key { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.sd-kv-value { min-width: 0; overflow-wrap: anywhere; }
.sd-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 5px;
  padding: 1px 6px;
  font-size: 11px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  margin: 0 4px 4px 0;
}
.sd-tag-strong { color: var(--dsw-alias-label-primary); }
.sd-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-2);
  border-radius: 5px;
  padding: 1px 5px;
}
.sd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 220px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
  padding: 30px;
}
.sd-empty-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 600; }
.sd-drift { display: flex; flex-direction: column; gap: 8px; }
.sd-drift-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 9px 11px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-1);
}
.sd-confidence {
  flex: none;
  border-radius: 5px;
  font-size: 10px;
  letter-spacing: .04em;
  text-transform: uppercase;
  padding: 1px 6px;
  margin-top: 2px;
  border: 1px solid currentColor;
}
.sd-confidence[data-level='high'] { color: var(--dsw-alias-state-warn-primary); }
.sd-confidence[data-level='medium'] { color: var(--dsw-alias-brand-primary); }
.sd-confidence[data-level='low'] { color: var(--dsw-alias-state-idle-primary); }
.sd-drift-main { flex: 1; min-width: 0; }
.sd-drift-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.sd-drift-symbol { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sd-drift-expected { color: var(--dsw-alias-state-warn-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sd-drift-path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.sd-drift-note { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-top: 3px; overflow-wrap: anywhere; }
.sd-drift-actions { display: flex; gap: 4px; flex: none; }
.sd-issues { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
.sd-issue {
  border-left: 3px solid var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-bg-layer-1);
  padding: 6px 10px;
  border-radius: 0 6px 6px 0;
  font-size: 12px;
}
.sd-issue[data-severity='warning'] { border-left-color: var(--dsw-alias-state-warn-primary); }
.sd-issue-where { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.sd-issue-title { font-weight: 600; }
.sd-issue-original { color: var(--dsw-alias-label-secondary); font-size: 11px; margin-top: 2px; overflow-wrap: anywhere; }
.sd-notice-dock {
  flex: none;
  padding: 0 16px 6px;
}
.sd-notice {
  position: relative;
  margin: 0;
  padding: 7px 9px 7px 11px;
  border-radius: 7px;
  font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-overlay);
  cursor: default;
}
.sd-notice-head { display: flex; align-items: center; gap: 10px; }
.sd-notice-head[data-multiline='true'] { align-items: flex-start; }
.sd-notice-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sd-notice-close { flex: none; margin-left: auto; }
.sd-notice[data-kind='error'] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.sd-notice[data-kind='success'] { border-color: var(--dsw-alias-state-success-primary); }
.sd-notice[data-kind='info'] { border-color: var(--dsw-alias-border-l2); }
.sd-form { display: flex; flex-direction: column; gap: 14px; max-width: 620px; }
.sd-field { display: flex; flex-direction: column; gap: 5px; }
.sd-label { font-size: 12px; font-weight: 600; }
.sd-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.sd-row { display: flex; gap: 10px; }
.sd-row > * { flex: 1; }
.sd-form-actions { display: flex; gap: 8px; align-items: center; }
.sd-raw { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.sd-raw .sd-textarea { flex: 1; min-height: 340px; }
.sd-muted { color: var(--dsw-alias-label-secondary); }
.sd-warn { color: var(--dsw-alias-state-warn-primary); }
.sd-dialog {
  width: 460px;
  max-width: 90%;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sd-settings { width: 560px; max-height: 78vh; overflow: auto; }
.sd-settings-section { display: flex; flex-direction: column; gap: 10px; }
.sd-settings-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--dsw-alias-label-secondary);
}
.sd-setting-row[data-disabled='true'] { opacity: .55; }
.sd-setting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.sd-setting-main { flex: 1; min-width: 0; }
.sd-setting-name { font-size: 13px; }
.sd-setting-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
.sd-setting-value {
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sd-number {
  width: 72px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  padding: 4px 8px;
  text-align: right;
}
.sd-scope { display: flex; flex-direction: column; gap: 4px; }
.sd-scope-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  cursor: pointer;
  font-size: 12px;
}
.sd-scope-option[data-active='true'] {
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
}
.sd-scope-count { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.sd-pathlist {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  max-height: 92px;
  overflow: auto;
  overflow-wrap: anywhere;
}
.sd-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  opacity: .55;
  transition: opacity .12s ease;
}
.sd-drift-row:hover .sd-row-actions, .sd-drift-row:focus-within .sd-row-actions { opacity: 1; }
.sd-dialog-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .28);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.sd-dialog-title { font-size: 14px; font-weight: 600; }
.sd-dialog-body { color: var(--dsw-alias-label-secondary); font-size: 12px; overflow-wrap: anywhere; }
.sd-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.sd-clickable { cursor: pointer; }
.sd-clickable:hover { text-decoration: underline; }
`

/** Inline style helpers, so components read as layout rather than CSS strings. */
export const style = {
  row: { display: 'flex', alignItems: 'center', gap: 8 } as const,
  spread: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as const,
  column: { display: 'flex', flexDirection: 'column', gap: 6 } as const,
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 4 } as const,
} as const

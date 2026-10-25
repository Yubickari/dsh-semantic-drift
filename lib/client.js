// dsh-semantic-drift 0.1.0 — browser half (generated, do not edit)
window.__ModuleLoader__.load({
  id: "dsh-semantic-drift",
  factory: (require) => {
    var module = { exports: {} };
    "use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/protocol.ts
var PANEL_ID = "semantic-drift";
var API_PREFIX = "/semantic-drift";
var CONCEPT_KINDS = ["entity", "quantity", "enum", "status", "reference"];

// src/client/Panel.tsx
var import_react4 = require("react");

// src/client/api.ts
var BASE = API_PREFIX.replace(/^\//, "");
var ApiError = class extends Error {
  code;
  issues;
  constructor(code, message, issues = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.issues = issues;
  }
};
async function call(path, init = {}) {
  let response;
  try {
    response = await fetch(`${BASE}/${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...init.body === void 0 ? {} : { "content-type": "application/json" },
        ...init.headers ?? {}
      }
    });
  } catch (error) {
    throw new ApiError("unreachable", error instanceof Error ? error.message : String(error));
  }
  const text = await response.text();
  let body;
  try {
    body = text === "" ? {} : JSON.parse(text);
  } catch {
    throw new ApiError("unexpected", `The host answered with ${response.status} and a non-JSON body.`);
  }
  if (body !== null && typeof body === "object" && body.ok === false) {
    const failure = body;
    throw new ApiError(failure.code, failure.message, failure.issues ?? []);
  }
  if (!response.ok) throw new ApiError("unexpected", `The host answered with ${response.status}.`);
  return body;
}
async function fetchState(workspace) {
  const query = workspace === void 0 ? "" : `?workspace=${encodeURIComponent(workspace)}`;
  return await call(`state${query}`);
}
async function runScan(workspace) {
  return await call("scan", { method: "POST", body: JSON.stringify({ workspace }) });
}
async function saveDocument(workspace, document2) {
  const request = { workspace, document: document2 };
  return await call("save", { method: "POST", body: JSON.stringify(request) });
}
async function saveRaw(workspace, text) {
  const request = { workspace, text };
  return await call("raw", { method: "POST", body: JSON.stringify(request) });
}
async function initVocabulary(workspace) {
  return await call("init", { method: "POST", body: JSON.stringify({ workspace }) });
}
async function acceptException(request) {
  return await call("accept", { method: "POST", body: JSON.stringify(request) });
}

// src/client/locales.ts
var zh = {
  "entry.label": "\u8BED\u4E49",
  "panel.title": "\u8BED\u4E49\u8BCD\u8868",
  "panel.subtitle": "\u540C\u4E00\u6982\u5FF5\u5728\u4EE3\u7801\u91CC\u7684\u4E0D\u540C\u5199\u6CD5",
  "action.rescan": "\u91CD\u65B0\u626B\u63CF",
  "action.new": "\u65B0\u5EFA\u6982\u5FF5",
  "action.yaml": "YAML",
  "action.done": "\u5B8C\u6210",
  "action.save": "\u4FDD\u5B58",
  "action.cancel": "\u53D6\u6D88",
  "action.copy": "\u590D\u5236\u5F15\u7528",
  "action.copyPath": "\u590D\u5236\u8DEF\u5F84",
  "action.copied": "\u5DF2\u590D\u5236",
  "action.accept": "\u63A5\u53D7",
  "action.edit": "\u7F16\u8F91",
  "action.init": "\u521B\u5EFA\u8BCD\u8868",
  "action.close": "\u5173\u95ED",
  "search.placeholder": "\u641C\u7D22 id / \u672F\u8BED / \u7B26\u53F7",
  "filter.all": "\u5168\u90E8",
  "filter.drift": "\u6709\u6F02\u79FB",
  "filter.clean": "\u65E0\u6F02\u79FB",
  "tree.concepts": "\u6982\u5FF5",
  "tree.unclassified": "\u672A\u5F52\u7C7B",
  "tree.empty": "\u8FD8\u6CA1\u6709\u6982\u5FF5",
  "tree.emptyHint": "\u5148\u521B\u5EFA\u8BCD\u8868\uFF0C\u518D\u767B\u8BB0\u4F60\u9879\u76EE\u91CC\u7684\u4E1A\u52A1\u6982\u5FF5\u3002",
  "detail.empty": "\u4ECE\u5DE6\u4FA7\u9009\u62E9\u4E00\u4E2A\u6982\u5FF5\u3002",
  "detail.terms": "\u672F\u8BED",
  "detail.canonical": "\u89C4\u8303\u5199\u6CD5",
  "detail.kind": "\u7C7B\u578B",
  "detail.note": "\u8BF4\u660E",
  "detail.accepted": "\u5DF2\u63A5\u53D7\u7684\u4F8B\u5916",
  "detail.drift": "\u6F02\u79FB",
  "detail.noDrift": "\u6CA1\u6709\u53D1\u73B0\u6F02\u79FB",
  "detail.unclassified": "\u672A\u5F52\u7C7B\u5230\u6982\u5FF5\u7684\u53D1\u73B0",
  "detail.unclassifiedHint": "\u8FD9\u4E9B\u53D1\u73B0\u6CA1\u6709\u5F52\u5230\u4EFB\u4F55\u8BCD\u8868\u6982\u5FF5\u4E0B\u3002\u7ED3\u6784\u6027\u53D1\u73B0\uFF08\u91CD\u590D\u5B9A\u4E49\u3001\u5951\u7EA6\u6F02\u79FB\uFF09\u4E0D\u4F9D\u8D56\u8BCD\u8868\uFF0C\u7A7A\u8BCD\u8868\u4E5F\u4F1A\u4EA7\u751F\uFF1B\u53EA\u6709\u5F53\u67D0\u4E2A\u6982\u5FF5\u7684\u89C4\u8303\u7B26\u53F7\u4E0E\u8BE5\u7C7B\u578B\u540C\u540D\u65F6\uFF0C\u5B83\u4EEC\u624D\u4F1A\u81EA\u52A8\u5F52\u5230\u90A3\u4E2A\u6982\u5FF5\u3002\u4E5F\u53EF\u4EE5\u5728\u8FD9\u91CC\u628A\u53D1\u73B0\u767B\u8BB0\u4E3A\u6982\u5FF5\uFF0C\u6216\u63A5\u53D7\u5B83\u3002",
  "editor.titleNew": "\u65B0\u5EFA\u6982\u5FF5",
  "editor.titleEdit": "\u7F16\u8F91\u6982\u5FF5",
  "editor.id": "\u6982\u5FF5 id",
  "editor.idHint": "\u5F62\u5982 device.target_temperature\uFF0C\u5C0F\u5199\u5B57\u6BCD\u4E0E\u4E0B\u5212\u7EBF",
  "editor.terms": "\u672F\u8BED / \u522B\u540D",
  "editor.termsHint": "\u7528\u9017\u53F7\u5206\u9694\uFF0C\u4F8B\u5982\uFF1A\u76EE\u6807\u6E29\u5EA6, \u8BBE\u5B9A\u6E29\u5EA6",
  "editor.kind": "\u79CD\u7C7B",
  "editor.symbol": "\u89C4\u8303\u7B26\u53F7",
  "editor.symbolHint": "\u4EE3\u7801\u91CC\u7684\u6807\u8BC6\u7B26\uFF0C\u4F8B\u5982 TargetTemperature",
  "editor.type": "\u7C7B\u578B\uFF08\u53EF\u9009\uFF09",
  "editor.unit": "\u5355\u4F4D\uFF08\u53EF\u9009\uFF09",
  "editor.note": "\u8BF4\u660E\uFF08\u53EF\u9009\uFF09",
  "editor.acceptedReason": "\u63A5\u53D7\u7406\u7531",
  "editor.acceptedReasonHint": "\u5199\u6E05\u695A\u4E3A\u4EC0\u4E48\u8FD9\u4E2A\u5199\u6CD5\u53EF\u4EE5\u4FDD\u7559",
  "raw.title": "YAML \u539F\u6587",
  "raw.hint": "\u4FDD\u5B58\u524D\u4F1A\u5B8C\u6574\u6821\u9A8C\uFF1B\u6821\u9A8C\u5931\u8D25\u4E0D\u4F1A\u5199\u5165\u4EFB\u4F55\u5185\u5BB9\u3002",
  "scan.scanning": "\u626B\u63CF\u4E2D\u2026",
  "scan.emptyVocabulary": "\u8BCD\u8868\u8FD8\u6CA1\u6709\u6982\u5FF5\uFF0C\u4F46\u7ED3\u6784\u6027\u95EE\u9898\u4ECD\u7136\u4F1A\u88AB\u626B\u63CF\u51FA\u6765\u3002",
  "footer.concepts": "\u6982\u5FF5",
  "footer.drift": "\u6F02\u79FB",
  "footer.files": "\u6587\u4EF6",
  "footer.time": "\u8017\u65F6",
  "footer.truncated": "\u7ED3\u679C\u5DF2\u622A\u65AD",
  "state.noWorkspace": "\u6CA1\u6709\u53EF\u7528\u7684\u5DE5\u4F5C\u533A",
  "state.loadFailed": "\u52A0\u8F7D\u5931\u8D25",
  "state.scanFailed": "\u626B\u63CF\u5931\u8D25",
  "state.saveFailed": "\u4FDD\u5B58\u5931\u8D25",
  "state.acceptFailed": "\u63A5\u53D7\u5931\u8D25",
  "state.saved": "\u5DF2\u4FDD\u5B58",
  "state.accepted": "\u5DF2\u63A5\u53D7",
  "confidence.high": "\u9AD8",
  "confidence.medium": "\u4E2D",
  "confidence.low": "\u4F4E",
  "showLow": "\u663E\u793A\u4F4E\u7F6E\u4FE1\u5EA6",
  "detector.duplicate-type": "\u91CD\u590D\u5B9A\u4E49",
  "detector.contract-drift": "\u5951\u7EA6\u6F02\u79FB",
  "detector.symbol-variant": "\u547D\u540D\u53D8\u4F53",
  "detector.term-unmapped": "\u672F\u8BED\u672A\u6620\u5C04",
  "kind.entity": "\u5B9E\u4F53",
  "kind.quantity": "\u6570\u91CF",
  "kind.enum": "\u679A\u4E3E",
  "kind.status": "\u72B6\u6001",
  "kind.reference": "\u5F15\u7528",
  "issue.title": "\u6821\u9A8C\u95EE\u9898",
  "workspace.label": "\u5DE5\u4F5C\u533A",
  "notice.dismissHint": "\u53CC\u51FB\u5173\u95ED",
  "action.retry": "\u91CD\u8BD5",
  "state.notReady": "\u9762\u677F\u8FD8\u6CA1\u52A0\u8F7D\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
  "state.issueCount": "\uFF08{count} \u5904\u95EE\u9898\uFF09",
  "tree.title": "\u6982\u5FF5",
  "tree.addInGroup": "\u5728\u672C\u7EC4\u65B0\u5EFA\u6982\u5FF5",
  "action.promote": "\u767B\u8BB0\u4E3A\u6982\u5FF5",
  "unclassified.pickConcept": "\u63A5\u53D7\u540E\u5F52\u5230\u54EA\u4E2A\u6982\u5FF5",
  "unclassified.noConcept": "\u8BCD\u8868\u91CC\u8FD8\u6CA1\u6709\u6982\u5FF5\u3002\u5148\u65B0\u5EFA\u4E00\u4E2A\u6982\u5FF5\uFF0C\u518D\u63A5\u53D7\u8FD9\u4E2A\u53D1\u73B0\u3002",
  "issue.<unknown>": "\u6821\u9A8C\u672A\u901A\u8FC7",
  "api.forbidden": "\u8BE5\u76EE\u5F55\u4E0D\u662F\u5DF2\u6CE8\u518C\u7684\u5DE5\u4F5C\u533A",
  "api.not-found": "\u627E\u4E0D\u5230\u76EE\u6807",
  "api.invalid-vocabulary": "\u8BCD\u8868\u6821\u9A8C\u672A\u901A\u8FC7",
  "api.bad-request": "\u8BF7\u6C42\u53C2\u6570\u4E0D\u5BF9",
  "api.bad-json": "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON",
  "api.content-type": "\u8BF7\u6C42\u7F3A\u5C11 JSON content-type",
  "api.unreachable": "\u8FDE\u4E0D\u4E0A\u5BBF\u4E3B\u8FDB\u7A0B",
  "api.unexpected": "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u610F\u5916\u7ED3\u679C",
  "issue.document-shape": "\u8BCD\u8868\u7ED3\u6784\u4E0D\u5BF9\uFF1A\u5E94\u4E3A\u5E26 concepts \u5217\u8868\u7684\u6620\u5C04",
  "issue.unknown-key": "\u5B58\u5728\u672A\u77E5\u5B57\u6BB5\uFF08\u5DF2\u5FFD\u7565\uFF09",
  "issue.version-unsupported": "\u8BCD\u8868\u7248\u672C\u4E0D\u53D7\u652F\u6301",
  "issue.exclude-shape": "exclude \u5FC5\u987B\u662F glob \u5217\u8868",
  "issue.exclude-entry": "exclude \u6761\u76EE\u4E0D\u80FD\u4E3A\u7A7A",
  "issue.exclude-glob": "exclude \u91CC\u6709\u975E\u6CD5 glob",
  "issue.concepts-shape": "concepts \u5FC5\u987B\u662F\u5217\u8868",
  "issue.concept-shape": "\u6982\u5FF5\u6761\u76EE\u5FC5\u987B\u662F\u6620\u5C04",
  "issue.id-missing": "\u7F3A\u5C11\u6982\u5FF5 id",
  "issue.id-format": "\u6982\u5FF5 id \u683C\u5F0F\u4E0D\u5BF9\uFF1A\u9700\u5F62\u5982 group.name",
  "issue.terms-missing": "\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u672F\u8BED\u6216\u522B\u540D",
  "issue.term-empty": "\u672F\u8BED\u4E0D\u80FD\u4E3A\u7A7A",
  "issue.kind-invalid": "kind \u53D6\u503C\u4E0D\u5408\u6CD5",
  "issue.symbol-missing": "\u7F3A\u5C11\u89C4\u8303\u7B26\u53F7",
  "issue.symbol-format": "\u89C4\u8303\u7B26\u53F7\u5FC5\u987B\u662F\u5408\u6CD5\u6807\u8BC6\u7B26",
  "issue.accepted-shape": "accepted \u5FC5\u987B\u662F\u5217\u8868",
  "issue.accepted-symbol": "\u4F8B\u5916\u6761\u76EE\u7F3A\u5C11 symbol",
  "issue.accepted-reason": "\u4F8B\u5916\u6761\u76EE\u7F3A\u5C11 reason\uFF08\u5FC5\u987B\u5199\u660E\u7406\u7531\uFF09",
  "issue.accepted-glob": "\u4F8B\u5916\u7684 path \u4E0D\u662F\u5408\u6CD5 glob",
  "issue.unit-missing": "\u6570\u91CF\u578B\u6982\u5FF5\u5EFA\u8BAE\u586B\u5199\u5355\u4F4D",
  "issue.id-duplicate": "\u6982\u5FF5 id \u91CD\u590D",
  "issue.symbol-duplicate": "\u89C4\u8303\u7B26\u53F7\u91CD\u590D\uFF1A\u4E00\u4E2A\u7B26\u53F7\u53EA\u80FD\u5C5E\u4E8E\u4E00\u4E2A\u6982\u5FF5",
  "issue.term-duplicate": "\u672F\u8BED\u91CD\u590D\uFF1A\u4E00\u4E2A\u672F\u8BED\u53EA\u80FD\u5C5E\u4E8E\u4E00\u4E2A\u6982\u5FF5",
  "issue.yaml-parse": "YAML \u8BED\u6CD5\u9519\u8BEF",
  "issue.read-failed": "\u8BFB\u4E0D\u4E86\u8BCD\u8868\u6587\u4EF6",
  "drift.sameMembers": "\u4E0E {path} \u7684 {count} \u4E2A\u6210\u5458\u5B8C\u5168\u4E00\u81F4",
  "drift.differFrom": "\u76F8\u5BF9 {path}",
  "drift.missing": "\u7F3A\u5C11 {list}",
  "drift.extra": "\u591A\u51FA {list}",
  "drift.ruleNormalized": "\u5FFD\u7565\u5927\u5C0F\u5199\u4E0E\u4E0B\u5212\u7EBF\u540E\u4E0E\u89C4\u8303\u5199\u6CD5\u76F8\u540C",
  "drift.ruleConfusable": "\u5DF2\u77E5\u62FC\u5199\u53D8\u4F53",
  "drift.ruleDistance": "\u7F16\u8F91\u8DDD\u79BB {distance}",
  "drift.ruleCanonicalMissing": "\u672F\u8BED\u300C{term}\u300D\u53EA\u51FA\u73B0\u5728\u6CE8\u91CA\u6216\u5B57\u7B26\u4E32\u91CC\uFF0C\u4EE3\u7801\u4E2D\u6CA1\u6709\u89C4\u8303\u7B26\u53F7",
  "drift.primary": "\u53E6\u4E00\u5904\u5B9A\u4E49"
};
var en = {
  "entry.label": "Semantics",
  "panel.title": "Vocabulary",
  "panel.subtitle": "One concept, several spellings",
  "action.rescan": "Scan",
  "action.new": "New concept",
  "action.yaml": "YAML",
  "action.done": "Done",
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.copy": "Copy reference",
  "action.copyPath": "Copy path",
  "action.copied": "Copied",
  "action.accept": "Accept",
  "action.edit": "Edit",
  "action.init": "Create vocabulary",
  "action.close": "Close",
  "search.placeholder": "Search id, term or symbol",
  "filter.all": "All",
  "filter.drift": "With drift",
  "filter.clean": "Clean",
  "tree.concepts": "Concepts",
  "tree.unclassified": "Unclassified",
  "tree.empty": "No concepts yet",
  "tree.emptyHint": "Create the vocabulary, then record the concepts your project already uses.",
  "detail.empty": "Select a concept on the left.",
  "detail.terms": "Terms",
  "detail.canonical": "Canonical",
  "detail.kind": "Kind",
  "detail.note": "Note",
  "detail.accepted": "Accepted exceptions",
  "detail.drift": "Drift",
  "detail.noDrift": "No drift found",
  "detail.unclassified": "Findings without a concept",
  "detail.unclassifiedHint": "These findings belong to no vocabulary concept. Structural findings (duplicate definition, contract drift) do not need a vocabulary and appear even when it is empty; they move under a concept only when some concept canonical symbol equals the type name. You can also record a finding as a concept, or accept it here.",
  "editor.titleNew": "New concept",
  "editor.titleEdit": "Edit concept",
  "editor.id": "Concept id",
  "editor.idHint": "Like device.target_temperature: lowercase snake segments",
  "editor.terms": "Terms and aliases",
  "editor.termsHint": "Comma separated, e.g. target temperature, set point",
  "editor.kind": "Kind",
  "editor.symbol": "Canonical symbol",
  "editor.symbolHint": "The identifier used in code, e.g. TargetTemperature",
  "editor.type": "Type (optional)",
  "editor.unit": "Unit (optional)",
  "editor.note": "Note (optional)",
  "editor.acceptedReason": "Reason",
  "editor.acceptedReasonHint": "Why may this spelling stay?",
  "raw.title": "Raw YAML",
  "raw.hint": "The whole file is validated before saving; a failed validation writes nothing.",
  "scan.scanning": "Scanning\u2026",
  "scan.emptyVocabulary": "The vocabulary has no concepts yet, but structural findings are still reported.",
  "footer.concepts": "concepts",
  "footer.drift": "findings",
  "footer.files": "files",
  "footer.time": "time",
  "footer.truncated": "truncated",
  "state.noWorkspace": "No workspace available",
  "state.loadFailed": "Could not load",
  "state.scanFailed": "Scan failed",
  "state.saveFailed": "Save failed",
  "state.acceptFailed": "Accept failed",
  "state.saved": "Saved",
  "state.accepted": "Accepted",
  "confidence.high": "high",
  "confidence.medium": "medium",
  "confidence.low": "low",
  "showLow": "Show low confidence",
  "detector.duplicate-type": "duplicate definition",
  "detector.contract-drift": "contract drift",
  "detector.symbol-variant": "naming variant",
  "detector.term-unmapped": "unmapped term",
  "kind.entity": "entity",
  "kind.quantity": "quantity",
  "kind.enum": "enum",
  "kind.status": "status",
  "kind.reference": "reference",
  "issue.title": "Validation issues",
  "workspace.label": "Workspace",
  "notice.dismissHint": "Double-click to dismiss",
  "action.retry": "Retry",
  "state.notReady": "The panel is still loading; try again in a moment.",
  "state.issueCount": " ({count} issues)",
  "tree.title": "Concepts",
  "tree.addInGroup": "New concept in this group",
  "action.promote": "Record as concept",
  "unclassified.pickConcept": "Accept under which concept",
  "unclassified.noConcept": "The vocabulary has no concepts yet. Create one first, then accept this finding.",
  "issue.<unknown>": "Validation failed",
  "api.forbidden": "That directory is not a registered workspace",
  "api.not-found": "Not found",
  "api.invalid-vocabulary": "Vocabulary validation failed",
  "api.bad-request": "Bad request",
  "api.bad-json": "The request body is not valid JSON",
  "api.content-type": "A JSON content type is required",
  "api.unreachable": "Cannot reach the Host process",
  "api.unexpected": "Unexpected Host response",
  "issue.document-shape": "The file is not a mapping with a concepts list",
  "issue.unknown-key": "Unknown field (ignored)",
  "issue.version-unsupported": "Unsupported vocabulary version",
  "issue.exclude-shape": "exclude must be a list of globs",
  "issue.exclude-entry": "Empty exclude entry",
  "issue.exclude-glob": "Invalid glob in exclude",
  "issue.concepts-shape": "concepts must be a list",
  "issue.concept-shape": "A concept entry must be a mapping",
  "issue.id-missing": "Missing concept id",
  "issue.id-format": "Concept id must look like group.name",
  "issue.terms-missing": "At least one term or alias is required",
  "issue.term-empty": "A term cannot be empty",
  "issue.kind-invalid": "Invalid kind",
  "issue.symbol-missing": "Missing canonical symbol",
  "issue.symbol-format": "The canonical symbol must be a plain identifier",
  "issue.accepted-shape": "accepted must be a list",
  "issue.accepted-symbol": "An exception needs a symbol",
  "issue.accepted-reason": "An exception needs a reason",
  "issue.accepted-glob": "The exception path is not a valid glob",
  "issue.unit-missing": "A quantity concept usually declares a unit",
  "issue.id-duplicate": "Duplicate concept id",
  "issue.symbol-duplicate": "Duplicate canonical symbol",
  "issue.term-duplicate": "Duplicate term across concepts",
  "issue.yaml-parse": "YAML syntax error",
  "issue.read-failed": "The vocabulary file cannot be read",
  "drift.sameMembers": "Identical to the {count} members at {path}",
  "drift.differFrom": "Compared with {path}",
  "drift.missing": "missing {list}",
  "drift.extra": "extra {list}",
  "drift.ruleNormalized": "same name after removing case and separators",
  "drift.ruleConfusable": "known misspelling or abbreviation",
  "drift.ruleDistance": "edit distance {distance}",
  "drift.ruleCanonicalMissing": 'the term "{term}" appears in comments or strings, but the canonical symbol appears nowhere in code',
  "drift.primary": "other definition"
};
var translate;
function setTranslator(binder) {
  translate = binder;
}
function documentLanguage() {
  const lang = typeof document === "undefined" ? "en" : document.documentElement.lang;
  return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
}
function t(key) {
  if (translate !== void 0) {
    try {
      const value = translate(key);
      if (typeof value === "string" && value !== "" && value !== key) return value;
    } catch {
    }
  }
  const dictionary = documentLanguage() === "zh" ? zh : en;
  return dictionary[key] ?? key;
}
function maybeT(key) {
  if (!Object.prototype.hasOwnProperty.call(zh, key)) return void 0;
  return t(key);
}
function tf(key, params) {
  return t(key).replace(
    /\{(\w+)\}/g,
    (match, name) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}
var dictionaries = { zh, en };

// src/client/icons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var base = (size) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true
});
function SidebarIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...base(size), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 3.5h10v9H3z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5.4 6.2h5.2M5.4 8.4h3.1" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11.4 8.4h.1M8.1 10.6h3.4", strokeDasharray: "0.1 2.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "10.4", cy: "8.4", r: "1.5", strokeWidth: "1.1" })
  ] });
}
function SearchIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...base(size), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "7", cy: "7", r: "4.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.2 10.2 13.4 13.4" })
  ] });
}
function RefreshIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...base(size), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13 8a5 5 0 1 1-1.6-3.7" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13 2.6V5h-2.4" })
  ] });
}
function PlusIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...base(size), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 3.2v9.6M3.2 8h9.6" }) });
}
function CodeIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...base(size), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5.6 4.4 2.6 8l3 3.6M10.4 4.4 13.4 8l-3 3.6" }) });
}
function CaretIcon({ size = 12 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...base(size), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4.2 6.2 8 10l3.8-3.8" }) });
}
function CopyIcon({ size = 13 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...base(size), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "5.6", y: "2.8", width: "7.6", height: "8.4", rx: "1.4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.4 13.2H4.2a1.4 1.4 0 0 1-1.4-1.4V5.2" })
  ] });
}
function CheckIcon({ size = 13 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...base(size), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3.2 8.4 6.4 11.6 12.8 4.8" }) });
}
function CloseIcon({ size = 12 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...base(size), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 4l8 8M12 4l-8 8" }) });
}
function EditIcon({ size = 13 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...base(size), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.6 2.9l2.5 2.5-7 7-3.2.7.7-3.2z" }) });
}

// src/client/DriftList.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function listOf(values, limit = 8) {
  if (values === void 0 || values.length === 0) return "\u2014";
  return values.slice(0, limit).join(", ") + (values.length > limit ? ", \u2026" : "");
}
function findingNote(finding) {
  const primary = finding.detail.primaryPath ?? "";
  switch (finding.detector) {
    case "duplicate-type":
      return tf("drift.sameMembers", { path: primary, count: finding.detail.members?.length ?? 0 });
    case "contract-drift": {
      const parts = [tf("drift.differFrom", { path: primary })];
      if ((finding.detail.missing?.length ?? 0) > 0) parts.push(tf("drift.missing", { list: listOf(finding.detail.missing) }));
      if ((finding.detail.extra?.length ?? 0) > 0) parts.push(tf("drift.extra", { list: listOf(finding.detail.extra) }));
      return parts.join(" \xB7 ");
    }
    case "symbol-variant":
      if (finding.detail.rule === "normalized") return t("drift.ruleNormalized");
      if (finding.detail.rule === "confusable") return t("drift.ruleConfusable");
      return tf("drift.ruleDistance", { distance: finding.detail.distance ?? 0 });
    case "term-unmapped":
      return tf("drift.ruleCanonicalMissing", { term: finding.detail.term ?? "" });
    default:
      return finding.message;
  }
}
function DriftList(props) {
  const visible = props.findings.filter((finding) => props.showLow || finding.confidence !== "low");
  if (visible.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "sd-muted", style: { padding: "6px 0" }, children: t(props.emptyKey ?? "detail.noDrift") });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "sd-drift", children: visible.map((finding) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sd-drift-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sd-confidence", "data-level": finding.confidence, children: t(`confidence.${finding.confidence}`) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sd-drift-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sd-drift-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sd-mono sd-muted", children: t(`detector.${finding.detector}`) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sd-drift-symbol", children: finding.symbol }),
        finding.expected !== void 0 && finding.expected !== finding.symbol && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sd-muted", children: "\u2192" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sd-drift-expected", children: finding.expected })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sd-drift-path", children: [
        finding.path,
        ":",
        finding.line
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "sd-drift-note", children: findingNote(finding) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sd-drift-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "sd-button sd-button-ghost",
          title: t("action.copy"),
          onClick: () => props.onCopy(finding.citation),
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CopyIcon, {})
        }
      ),
      props.onPromote !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "sd-button sd-button-ghost",
          title: t("action.promote"),
          "aria-label": t("action.promote"),
          onClick: () => props.onPromote?.(finding),
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PlusIcon, {})
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "sd-button sd-button-ghost",
          title: t("action.accept"),
          "aria-label": t("action.accept"),
          onClick: () => props.onAccept(finding),
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CheckIcon, {})
        }
      )
    ] })
  ] }, finding.id)) });
}

// src/client/ConceptDetail.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function EmptyDetail() {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-empty", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-empty-title", children: t("detail.empty") }) });
}
function ConceptDetail(props) {
  const { concept } = props;
  if (concept === void 0) return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(EmptyDetail, {});
  const conceptFindings = props.findings.filter((finding) => finding.conceptId === concept.id);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-concept-title", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-concept-id sd-mono", children: concept.id }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-tag", children: t(`kind.${concept.kind}`) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: "sd-button", onClick: () => props.onEdit(concept), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(EditIcon, {}),
        t("action.edit")
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-section", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-kv", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-kv-key", children: t("detail.canonical") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-kv-value", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-code", children: concept.canonical.symbol }),
        concept.canonical.type !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "sd-muted", children: [
          " \xB7 ",
          concept.canonical.type
        ] }),
        concept.canonical.unit !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "sd-muted", children: [
          " \xB7 ",
          concept.canonical.unit
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-kv-key", children: t("detail.terms") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-kv-value", children: concept.terms.map((term) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-tag", children: term }, term)) }),
      concept.note !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-kv-key", children: t("detail.note") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-kv-value", children: concept.note })
      ] })
    ] }) }),
    (concept.accepted ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-section-title", children: t("detail.accepted") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-drift", children: (concept.accepted ?? []).map((exception, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-drift-row", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-drift-main", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-drift-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-drift-symbol", children: exception.symbol }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-mono sd-muted", children: exception.path === void 0 ? "**" : exception.path })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-drift-note", children: exception.reason })
      ] }) }, `${exception.symbol}-${index}`)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-spread", style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-section-title", style: { margin: 0 }, children: [
          t("detail.drift"),
          " ",
          conceptFindings.length > 0 ? `(${conceptFindings.length})` : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "sd-meta", style: { display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: "checkbox",
              checked: props.showLow,
              onChange: (event) => props.onShowLow(event.target.checked)
            }
          ),
          t("showLow")
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        DriftList,
        {
          findings: conceptFindings,
          onAccept: props.onAccept,
          onCopy: props.onCopy,
          showLow: props.showLow
        }
      )
    ] })
  ] });
}

// src/client/finding-actions.ts
function snakeCase(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}
function segment(raw, fallback) {
  const value = snakeCase(raw);
  if (value === "") return fallback;
  return /^[a-z]/.test(value) ? value : `g_${value}`;
}
function defaultAcceptConcept(finding, concepts) {
  if (finding.conceptId !== void 0) return finding.conceptId;
  const bySymbol = concepts.find((concept) => concept.canonical.symbol === finding.symbol);
  return bySymbol?.id ?? concepts[0]?.id;
}
function suggestConceptId(finding, existing) {
  const group = segment(finding.path.split("/")[0] ?? "", "concept");
  const base2 = `${group}.${segment(finding.symbol, "concept")}`;
  let candidate = base2;
  let suffix = 2;
  while (existing.some((concept) => concept.id === candidate)) {
    candidate = `${base2}_${suffix}`;
    suffix++;
  }
  return candidate;
}

// src/client/IssueList.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function IssueList({ issues, limit }) {
  if (issues.length === 0) return null;
  const shown = limit === void 0 ? issues : issues.slice(0, limit);
  const omitted = issues.length - shown.length;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sd-issues", children: [
    shown.map((issue, index) => {
      const headline = maybeT(`issue.${issue.code}`);
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sd-issue", "data-severity": issue.severity, children: [
        headline === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: issue.message }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sd-issue-title", children: headline }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sd-issue-original", children: issue.message })
        ] }),
        (issue.line !== void 0 || issue.path !== void 0) && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sd-issue-where", children: [
          issue.line === void 0 ? "" : `line ${issue.line}${issue.column === void 0 ? "" : `:${issue.column}`} \xB7 `,
          issue.path ?? ""
        ] })
      ] }, `${issue.code}-${index}`);
    }),
    omitted > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sd-hint", children: [
      "\u2026 ",
      omitted
    ] })
  ] });
}

// src/client/Notice.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function Notice({ notice, onDismiss, onRetry }) {
  const multiline = notice.text.length > 80;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      className: "sd-notice",
      "data-kind": notice.kind,
      title: t("notice.dismissHint"),
      onDoubleClick: onDismiss,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sd-notice-head", "data-multiline": multiline, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "sd-notice-text", children: notice.text }),
          onRetry !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-ghost",
              title: t("action.retry"),
              onClick: onRetry,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(RefreshIcon, {}),
                t("action.retry")
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-ghost sd-notice-close",
              title: `${t("action.close")} \xB7 ${t("notice.dismissHint")}`,
              "aria-label": t("action.close"),
              onClick: onDismiss,
              children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CloseIcon, {})
            }
          )
        ] }),
        notice.issues !== void 0 && notice.issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(IssueList, { issues: notice.issues, limit: 6 })
      ]
    }
  );
}

// src/client/ConceptEditor.tsx
var import_react = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function ConceptEditor(props) {
  const [id, setId] = (0, import_react.useState)(props.concept?.id ?? props.initialId ?? "");
  const [terms, setTerms] = (0, import_react.useState)((props.concept?.terms ?? []).join(", "));
  const [kind, setKind] = (0, import_react.useState)(props.concept?.kind ?? "entity");
  const [symbol, setSymbol] = (0, import_react.useState)(props.concept?.canonical.symbol ?? props.initialSymbol ?? "");
  const [symbolType, setSymbolType] = (0, import_react.useState)(props.concept?.canonical.type ?? "");
  const [unit, setUnit] = (0, import_react.useState)(props.concept?.canonical.unit ?? "");
  const [note, setNote] = (0, import_react.useState)(props.concept?.note ?? "");
  const submit = (event) => {
    event.preventDefault();
    const parsedTerms = terms.split(/[,，]/).map((term) => term.trim()).filter((term) => term !== "");
    const concept = {
      id: id.trim(),
      terms: parsedTerms,
      kind,
      canonical: {
        symbol: symbol.trim(),
        ...symbolType.trim() === "" ? {} : { type: symbolType.trim() },
        ...unit.trim() === "" ? {} : { unit: unit.trim() }
      },
      ...note.trim() === "" ? {} : { note: note.trim() },
      ...props.concept?.accepted === void 0 ? {} : { accepted: props.concept.accepted }
    };
    props.onSave(concept);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("form", { className: "sd-form", onSubmit: submit, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "sd-section-title", style: { margin: 0 }, children: props.concept === void 0 ? t("editor.titleNew") : t("editor.titleEdit") }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "sd-label", htmlFor: "sd-id", children: t("editor.id") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "input",
        {
          id: "sd-id",
          className: "sd-input sd-mono",
          value: id,
          onChange: (event) => setId(event.target.value),
          placeholder: "device.target_temperature",
          disabled: props.concept !== void 0,
          spellCheck: false
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "sd-hint", children: t("editor.idHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "sd-label", htmlFor: "sd-terms", children: t("editor.terms") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "input",
        {
          id: "sd-terms",
          className: "sd-input",
          value: terms,
          onChange: (event) => setTerms(event.target.value),
          placeholder: "\u76EE\u6807\u6E29\u5EA6, \u8BBE\u5B9A\u6E29\u5EA6"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "sd-hint", children: t("editor.termsHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "sd-label", htmlFor: "sd-kind", children: t("editor.kind") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "select",
          {
            id: "sd-kind",
            className: "sd-select",
            value: kind,
            onChange: (event) => setKind(event.target.value),
            style: { maxWidth: "none", width: "100%" },
            children: CONCEPT_KINDS.map((value) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value, children: t(`kind.${value}`) }, value))
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "sd-label", htmlFor: "sd-unit", children: t("editor.unit") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            id: "sd-unit",
            className: "sd-input",
            value: unit,
            onChange: (event) => setUnit(event.target.value),
            placeholder: "\xB0C"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "sd-label", htmlFor: "sd-symbol", children: t("editor.symbol") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            id: "sd-symbol",
            className: "sd-input sd-mono",
            value: symbol,
            onChange: (event) => setSymbol(event.target.value),
            placeholder: "TargetTemperature",
            spellCheck: false
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "sd-hint", children: t("editor.symbolHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "sd-label", htmlFor: "sd-type", children: t("editor.type") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            id: "sd-type",
            className: "sd-input",
            value: symbolType,
            onChange: (event) => setSymbolType(event.target.value),
            placeholder: "double"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "sd-label", htmlFor: "sd-note", children: t("editor.note") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "textarea",
        {
          id: "sd-note",
          className: "sd-textarea",
          value: note,
          rows: 2,
          onChange: (event) => setNote(event.target.value)
        }
      )
    ] }),
    props.issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "sd-section-title", style: { margin: 0 }, children: t("issue.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(IssueList, { issues: props.issues })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "submit", className: "sd-button sd-button-primary", disabled: props.saving, children: t("action.save") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "sd-button", onClick: props.onCancel, disabled: props.saving, children: t("action.cancel") })
    ] })
  ] });
}

// src/client/ConceptTree.tsx
var import_react2 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
function groupConcepts(concepts) {
  const groups = /* @__PURE__ */ new Map();
  for (const concept of concepts) {
    const name = concept.id.split(".")[0] ?? "other";
    const list = groups.get(name);
    if (list === void 0) groups.set(name, [concept]);
    else list.push(concept);
  }
  return [...groups.entries()].map(([name, list]) => ({ name, concepts: list })).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
}
function ConceptTree(props) {
  const [collapsed, setCollapsed] = (0, import_react2.useState)({});
  const groups = groupConcepts(props.concepts);
  const toggle = (name) => {
    setCollapsed((current) => ({ ...current, [name]: current[name] !== true }));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("aside", { className: "sd-tree", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-tree-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-tree-title", children: t("tree.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-count", children: props.concepts.length }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "button",
        {
          type: "button",
          className: "sd-add",
          title: t("action.new"),
          "aria-label": t("action.new"),
          onClick: () => props.onAdd(),
          children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(PlusIcon, { size: 15 })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-tree-tools", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-search", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-search-icon", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(SearchIcon, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "input",
          {
            className: "sd-input",
            value: props.query,
            placeholder: t("search.placeholder"),
            onChange: (event) => props.onQuery(event.target.value),
            spellCheck: false
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "sd-filters", children: ["all", "drift", "clean"].map((value) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "button",
        {
          type: "button",
          className: "sd-chip",
          "data-active": props.filter === value,
          onClick: () => props.onFilter(value),
          children: t(value === "all" ? "filter.all" : value === "drift" ? "filter.drift" : "filter.clean")
        },
        value
      )) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-tree-list", children: [
      groups.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-empty", style: { minHeight: 120, padding: 16 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "sd-empty-title", children: t("tree.empty") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { children: t("tree.emptyHint") })
      ] }),
      groups.map((group) => {
        const open = collapsed[group.name] !== true;
        return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-group-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("button", { type: "button", className: "sd-group-head", onClick: () => toggle(group.name), children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-caret", "data-open": open, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(CaretIcon, {}) }),
              group.name,
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-count", children: group.concepts.length })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "button",
              {
                type: "button",
                className: "sd-add",
                title: t("tree.addInGroup"),
                "aria-label": t("tree.addInGroup"),
                onClick: () => props.onAdd(group.name),
                children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(PlusIcon, { size: 13 })
              }
            )
          ] }),
          open && group.concepts.map((concept) => {
            const drift = props.driftCounts.get(concept.id) ?? 0;
            return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
              "button",
              {
                type: "button",
                className: "sd-item",
                "data-active": props.selectedId === concept.id,
                onClick: () => props.onSelect(concept.id),
                title: concept.id,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-item-name", children: concept.id.split(".").slice(1).join(".") || concept.id }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-item-symbol", children: concept.canonical.symbol }),
                  drift > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-count", "data-tone": "warn", children: drift })
                ]
              },
              concept.id
            );
          })
        ] }, group.name);
      }),
      props.showUnclassified && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "sd-group", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
        "button",
        {
          type: "button",
          className: "sd-item",
          "data-active": props.selectedId === null,
          onClick: props.onSelectUnclassified,
          style: { paddingLeft: 8 },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-item-name", children: t("tree.unclassified") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-count", "data-tone": props.unclassified > 0 ? "warn" : void 0, children: props.unclassified })
          ]
        }
      ) })
    ] })
  ] });
}

// src/client/RawEditor.tsx
var import_react3 = require("react");
var import_jsx_runtime8 = require("react/jsx-runtime");
function RawEditor(props) {
  const [text, setText] = (0, import_react3.useState)(props.text);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-raw", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-spread", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sd-section-title", style: { margin: 0 }, children: t("raw.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sd-hint", children: t("raw.hint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "textarea",
      {
        className: "sd-textarea",
        value: text,
        onChange: (event) => setText(event.target.value),
        spellCheck: false,
        rows: 18
      }
    ),
    props.issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sd-section-title", style: { margin: 0 }, children: t("issue.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(IssueList, { issues: props.issues })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          type: "button",
          className: "sd-button sd-button-primary",
          disabled: props.saving,
          onClick: () => props.onSave(text),
          children: t("action.save")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", className: "sd-button", onClick: props.onCancel, disabled: props.saving, children: t("action.cancel") })
    ] })
  ] });
}

// src/client/styles.ts
var PANEL_CSS = `
.sd-root {
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
  color: #fff;
}
.sd-button-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); filter: brightness(1.08); }
.sd-button-ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
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
.sd-notice {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0 0 12px;
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
.sd-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.sd-clickable { cursor: pointer; }
.sd-clickable:hover { text-decoration: underline; }
`;

// src/client/Panel.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function messageOf(error) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
function saveFailureText(error, fallback, issues) {
  const base2 = errorText(error, fallback);
  return issues.length === 0 ? base2 : base2 + tf("state.issueCount", { count: issues.length });
}
function errorText(error, fallback) {
  const code = error instanceof ApiError ? error.code : void 0;
  const localized = code === void 0 ? void 0 : maybeT(`api.${code}`);
  return localized === void 0 ? `${t(fallback)}: ${messageOf(error)}` : `${t(fallback)}: ${localized}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function sessionDirectory(snapshot) {
  if (!isRecord(snapshot)) return void 0;
  const current = snapshot.current;
  const byId = snapshot.byId;
  if (typeof current !== "string" || !isRecord(byId)) return void 0;
  const entry = byId[current];
  if (!isRecord(entry)) return void 0;
  return typeof entry.cwd === "string" && entry.cwd !== "" ? entry.cwd : void 0;
}
function workspaceDirectory(snapshot) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.items)) return void 0;
  for (const item of snapshot.items) {
    if (isRecord(item) && typeof item.path === "string" && item.path !== "") return item.path;
  }
  return void 0;
}
function readSnapshot(hook) {
  if (typeof hook !== "function") return void 0;
  try {
    return hook((snapshot) => snapshot);
  } catch {
    return void 0;
  }
}
function severityOf(issues) {
  if (issues.some((issue) => issue.severity === "error")) return "error";
  return issues.length > 0 ? "warning" : "none";
}
function SemanticPanel(props) {
  const sessionsSnapshot = readSnapshot(props.useSessions);
  const workspacesSnapshot = readSnapshot(props.useWorkspaces);
  const suggested = sessionDirectory(sessionsSnapshot) ?? workspaceDirectory(workspacesSnapshot);
  const [requested, setRequested] = (0, import_react4.useState)(void 0);
  const [state, setState] = (0, import_react4.useState)(null);
  const [scan, setScan] = (0, import_react4.useState)(null);
  const [selection, setSelection] = (0, import_react4.useState)({ kind: "none" });
  const [view, setView] = (0, import_react4.useState)({ kind: "browse" });
  const [query, setQuery] = (0, import_react4.useState)("");
  const [filter, setFilter] = (0, import_react4.useState)("all");
  const [showLow, setShowLow] = (0, import_react4.useState)(false);
  const [busy, setBusy] = (0, import_react4.useState)(null);
  const [notice, setNotice] = (0, import_react4.useState)(null);
  const [editorIssues, setEditorIssues] = (0, import_react4.useState)([]);
  const [acceptTarget, setAcceptTarget] = (0, import_react4.useState)(null);
  const [acceptReason, setAcceptReason] = (0, import_react4.useState)("");
  const [acceptConceptId, setAcceptConceptId] = (0, import_react4.useState)(void 0);
  const effectivePath = state?.workspace.path;
  const load = (0, import_react4.useCallback)(async (path) => {
    setBusy("load");
    try {
      const next = await fetchState(path);
      setState(next);
      setNotice((current) => current?.kind === "error" ? null : current);
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error, "state.loadFailed"), issues: issuesOf(error) });
    } finally {
      setBusy(null);
    }
  }, []);
  const notReady = (0, import_react4.useCallback)(() => {
    setNotice({ kind: "error", text: t("state.notReady") });
  }, []);
  const scanPath = (0, import_react4.useCallback)(async (path) => {
    if (path === "") {
      notReady();
      return;
    }
    setBusy("scan");
    try {
      setScan(await runScan(path));
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error, "state.scanFailed"), issues: issuesOf(error) });
    } finally {
      setBusy(null);
    }
  }, []);
  (0, import_react4.useEffect)(() => {
    void load(requested ?? suggested);
  }, [requested, suggested, load]);
  (0, import_react4.useEffect)(() => {
    if (effectivePath === void 0) return;
    void scanPath(effectivePath);
  }, [effectivePath, scanPath]);
  const vocabulary = state?.vocabulary;
  const concepts = vocabulary?.document.concepts ?? [];
  const findings = (0, import_react4.useMemo)(() => scan?.summary.findings ?? [], [scan]);
  const visibleCounts = (0, import_react4.useMemo)(() => {
    const counts = /* @__PURE__ */ new Map();
    for (const finding of findings) {
      if (!showLow && finding.confidence === "low") continue;
      if (finding.conceptId === void 0) continue;
      counts.set(finding.conceptId, (counts.get(finding.conceptId) ?? 0) + 1);
    }
    return counts;
  }, [findings, showLow]);
  const unclassified = (0, import_react4.useMemo)(() => {
    const known = new Set(concepts.map((concept) => concept.id));
    return findings.filter(
      (finding) => (finding.conceptId === void 0 || !known.has(finding.conceptId)) && (showLow || finding.confidence !== "low")
    );
  }, [findings, concepts, showLow]);
  const filteredConcepts = (0, import_react4.useMemo)(() => {
    const needle = query.trim().toLowerCase();
    return concepts.filter((concept) => {
      if (filter === "drift" && (visibleCounts.get(concept.id) ?? 0) === 0) return false;
      if (filter === "clean" && (visibleCounts.get(concept.id) ?? 0) > 0) return false;
      if (needle === "") return true;
      return concept.id.toLowerCase().includes(needle) || concept.canonical.symbol.toLowerCase().includes(needle) || concept.terms.some((term) => term.toLowerCase().includes(needle));
    });
  }, [concepts, filter, query, visibleCounts]);
  const selectedConcept = selection.kind === "concept" ? concepts.find((concept) => concept.id === selection.id) : void 0;
  const copy = (0, import_react4.useCallback)(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ kind: "success", text: `${t("action.copied")}: ${text}` });
    } catch {
      setNotice({ kind: "error", text: `clipboard: ${text}` });
    }
  }, []);
  const refresh = (0, import_react4.useCallback)(async () => {
    if (effectivePath === void 0) return;
    await load(effectivePath);
    await scanPath(effectivePath);
  }, [effectivePath, load, scanPath]);
  const createVocabulary = (0, import_react4.useCallback)(async () => {
    if (effectivePath === void 0) {
      notReady();
      return;
    }
    setBusy("init");
    try {
      const result = await initVocabulary(effectivePath);
      setState((current) => current === null ? current : { ...current, vocabulary: result.vocabulary });
      setNotice({ kind: "success", text: t("state.saved") });
      await scanPath(effectivePath);
    } catch (error) {
      setNotice({ kind: "error", text: saveFailureText(error, "state.saveFailed", issuesOf(error)), issues: issuesOf(error) });
    } finally {
      setBusy(null);
    }
  }, [effectivePath, scanPath]);
  const submitConcept = (0, import_react4.useCallback)(async (concept) => {
    if (effectivePath === void 0 || vocabulary === void 0) {
      notReady();
      return;
    }
    setBusy("save");
    setEditorIssues([]);
    try {
      const exists = concepts.some((entry) => entry.id === concept.id);
      const document2 = {
        ...vocabulary.document,
        concepts: exists ? concepts.map((entry) => entry.id === concept.id ? concept : entry) : [...concepts, concept]
      };
      const result = await saveDocument(effectivePath, document2);
      setState((current) => current === null ? current : { ...current, vocabulary: result.vocabulary });
      setView({ kind: "browse" });
      setSelection({ kind: "concept", id: concept.id });
      setNotice({ kind: "success", text: t("state.saved") });
      await scanPath(effectivePath);
    } catch (error) {
      setEditorIssues(issuesOf(error));
      setNotice({ kind: "error", text: saveFailureText(error, "state.saveFailed", issuesOf(error)), issues: issuesOf(error) });
    } finally {
      setBusy(null);
    }
  }, [concepts, effectivePath, scanPath, vocabulary]);
  const submitRaw = (0, import_react4.useCallback)(async (text) => {
    if (effectivePath === void 0) {
      notReady();
      return;
    }
    setBusy("save");
    setEditorIssues([]);
    try {
      const result = await saveRaw(effectivePath, text);
      setState((current) => current === null ? current : { ...current, vocabulary: result.vocabulary });
      setView({ kind: "browse" });
      setNotice({ kind: "success", text: t("state.saved") });
      await scanPath(effectivePath);
    } catch (error) {
      setEditorIssues(issuesOf(error));
      setNotice({ kind: "error", text: saveFailureText(error, "state.saveFailed", issuesOf(error)), issues: issuesOf(error) });
    } finally {
      setBusy(null);
    }
  }, [effectivePath, scanPath]);
  const openAccept = (0, import_react4.useCallback)((finding) => {
    setAcceptTarget(finding);
    setAcceptReason("");
    setAcceptConceptId(defaultAcceptConcept(finding, concepts));
  }, [concepts]);
  const promote = (0, import_react4.useCallback)((finding) => {
    setEditorIssues([]);
    setView({
      kind: "edit",
      concept: void 0,
      initialId: suggestConceptId(finding, concepts),
      initialSymbol: finding.symbol
    });
  }, [concepts]);
  const confirmAccept = (0, import_react4.useCallback)(async () => {
    if (effectivePath === void 0 || acceptTarget === null) {
      notReady();
      return;
    }
    const conceptId = acceptTarget.conceptId ?? acceptConceptId;
    if (conceptId === void 0) {
      setNotice({ kind: "error", text: t("unclassified.noConcept") });
      return;
    }
    if (acceptReason.trim() === "") return;
    setBusy("accept");
    try {
      const result = await acceptException({
        workspace: effectivePath,
        conceptId,
        symbol: acceptTarget.symbol,
        path: acceptTarget.path,
        reason: acceptReason.trim()
      });
      setState((current) => current === null ? current : { ...current, vocabulary: result.vocabulary });
      setAcceptTarget(null);
      setAcceptReason("");
      setAcceptConceptId(void 0);
      setNotice({ kind: "success", text: t("state.accepted") });
      await scanPath(effectivePath);
    } catch (error) {
      setNotice({ kind: "error", text: saveFailureText(error, "state.acceptFailed", issuesOf(error)), issues: issuesOf(error) });
    } finally {
      setBusy(null);
    }
  }, [acceptConceptId, acceptReason, acceptTarget, effectivePath, scanPath]);
  const issuesOfVocabulary = vocabulary?.issues ?? [];
  const vocabularyHealth = severityOf(issuesOfVocabulary);
  const invalid = vocabulary?.exists === true && vocabulary.valid === false;
  const renderDetail = () => {
    if (view.kind === "raw") {
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        RawEditor,
        {
          text: vocabulary?.text ?? "",
          issues: editorIssues,
          saving: busy === "save",
          onSave: (text) => void submitRaw(text),
          onCancel: () => {
            setView({ kind: "browse" });
            setEditorIssues([]);
          }
        },
        `raw-${vocabulary?.mtimeMs ?? 0}`
      );
    }
    if (view.kind === "edit") {
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        ConceptEditor,
        {
          concept: view.concept,
          initialId: view.initialId,
          initialSymbol: view.initialSymbol,
          issues: editorIssues,
          saving: busy === "save",
          onSave: (concept) => void submitConcept(concept),
          onCancel: () => {
            setView({ kind: "browse" });
            setEditorIssues([]);
          }
        },
        `edit-${view.concept?.id ?? view.initialId ?? "new"}-${view.initialSymbol ?? ""}`
      );
    }
    if (state === null) {
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-empty", children: busy === "load" ? "\u2026" : t("state.loadFailed") });
    }
    if (!state.vocabulary.exists) {
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-empty-title", children: t("tree.empty") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { children: t("tree.emptyHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-form-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-primary",
              onClick: () => void createVocabulary(),
              disabled: busy !== null,
              children: t("action.init")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "sd-button",
              onClick: () => setView({ kind: "edit", concept: void 0 }),
              disabled: busy !== null,
              children: t("action.new")
            }
          )
        ] })
      ] });
    }
    if (selection.kind === "unclassified") {
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-concept-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sd-concept-id", children: t("detail.unclassified") }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sd-count", "data-tone": unclassified.length > 0 ? "warn" : void 0, children: unclassified.length })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-hint", style: { marginBottom: 12 }, children: t("detail.unclassifiedHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          DriftList,
          {
            findings: unclassified,
            onAccept: openAccept,
            onCopy: (text) => void copy(text),
            onPromote: promote,
            showLow: true
          }
        )
      ] });
    }
    if (selectedConcept === void 0) return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(EmptyDetail, {});
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      ConceptDetail,
      {
        concept: selectedConcept,
        findings,
        showLow,
        onShowLow: setShowLow,
        onEdit: (concept) => {
          setEditorIssues([]);
          setView({ kind: "edit", concept });
        },
        onAccept: openAccept,
        onCopy: (text) => void copy(text)
      }
    );
  };
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("style", { children: PANEL_CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("header", { className: "sd-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-title", children: t("panel.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-subtitle", title: effectivePath ?? "", children: [
          state?.workspace.title ?? "",
          state?.workspace.title !== void 0 ? " \xB7 " : "",
          effectivePath ?? t("state.noWorkspace")
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sd-spacer" }),
      (state?.workspaces.length ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "select",
        {
          className: "sd-select",
          value: effectivePath ?? "",
          onChange: (event) => setRequested(event.target.value),
          title: t("workspace.label"),
          children: (state?.workspaces ?? []).map((workspace) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: workspace.path, children: workspace.title }, workspace.path))
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "button",
          {
            type: "button",
            className: "sd-button",
            onClick: () => void scanPath(effectivePath ?? ""),
            disabled: busy !== null || effectivePath === void 0,
            title: t("action.rescan"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(RefreshIcon, {}),
              busy === "scan" ? t("scan.scanning") : t("action.rescan")
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "button",
          {
            type: "button",
            className: "sd-button",
            onClick: () => {
              setEditorIssues([]);
              setView({ kind: "edit", concept: void 0 });
            },
            disabled: busy !== null || invalid || effectivePath === void 0,
            title: t("action.new"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(PlusIcon, {}),
              t("action.new")
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "button",
          {
            type: "button",
            className: "sd-button",
            onClick: () => {
              setView(view.kind === "raw" ? { kind: "browse" } : { kind: "raw" });
              setEditorIssues([]);
            },
            disabled: busy !== null || effectivePath === void 0,
            title: t("action.yaml"),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CodeIcon, {}),
              view.kind === "raw" ? t("action.done") : t("action.yaml")
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        ConceptTree,
        {
          concepts: filteredConcepts,
          selectedId: selection.kind === "concept" ? selection.id : null,
          query,
          onQuery: setQuery,
          filter,
          onFilter: setFilter,
          driftCounts: visibleCounts,
          unclassified: unclassified.length,
          showUnclassified: true,
          onSelect: (id) => {
            setSelection({ kind: "concept", id });
            setView({ kind: "browse" });
          },
          onSelectUnclassified: () => {
            setSelection({ kind: "unclassified" });
            setView({ kind: "browse" });
          },
          onAdd: (group) => {
            setEditorIssues([]);
            setView({
              kind: "edit",
              concept: void 0,
              ...group === void 0 ? {} : { initialId: `${group}.` }
            });
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "sd-detail", children: [
        notice !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          Notice,
          {
            notice,
            onDismiss: () => setNotice(null),
            ...notice.kind === "error" && state === null ? { onRetry: () => void load(requested ?? suggested) } : {}
          }
        ),
        invalid && view.kind !== "raw" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-notice", "data-kind": "error", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-spread", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
              vocabularyHealth === "error" ? t("issue.title") : "",
              " ",
              vocabulary?.relativeFile
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
              "button",
              {
                type: "button",
                className: "sd-button",
                onClick: () => {
                  setView({ kind: "raw" });
                  setEditorIssues([]);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CodeIcon, {}),
                  t("action.yaml")
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(IssueList, { issues: issuesOfVocabulary.filter((issue) => issue.severity === "error"), limit: 8 })
        ] }),
        renderDetail()
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("footer", { className: "sd-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
        t("footer.concepts"),
        " ",
        concepts.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
        t("footer.drift"),
        " ",
        findings.length
      ] }),
      scan !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
        t("footer.files"),
        " ",
        scan.summary.filesScanned
      ] }),
      scan !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
        t("footer.time"),
        " ",
        scan.summary.durationMs,
        " ms"
      ] }),
      scan?.summary.truncated === true && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { title: scan.summary.truncatedReason ?? "", children: [
        "\u26A0 ",
        t("footer.truncated")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sd-spacer" }),
      state !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "sd-meta", children: [
        "v",
        state.version
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "sd-button sd-button-ghost", onClick: () => void refresh(), disabled: busy !== null, children: t("action.rescan") })
    ] }),
    acceptTarget !== null && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "div",
      {
        style: {
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10
        },
        onClick: () => setAcceptTarget(null),
        children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "div",
          {
            style: {
              width: 460,
              maxWidth: "90%",
              background: "var(--dsw-alias-bg-overlay)",
              border: "1px solid var(--dsw-alias-border-l2)",
              borderRadius: 12,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12
            },
            onClick: (event) => event.stopPropagation(),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-label", children: t("editor.acceptedReason") }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-hint", children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sd-code", children: acceptTarget.symbol }),
                " \xB7 ",
                acceptTarget.path,
                ":",
                acceptTarget.line
              ] }),
              acceptTarget.conceptId === void 0 && (concepts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-hint", children: t("unclassified.noConcept") }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-field", style: { gap: 5 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sd-hint", children: t("unclassified.pickConcept") }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "select",
                  {
                    className: "sd-select",
                    style: { maxWidth: "none", width: "100%" },
                    value: acceptConceptId ?? "",
                    onChange: (event) => setAcceptConceptId(event.target.value),
                    children: concepts.map((concept) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("option", { value: concept.id, children: [
                      concept.id,
                      " \xB7 ",
                      concept.canonical.symbol
                    ] }, concept.id))
                  }
                )
              ] })),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                "input",
                {
                  className: "sd-input",
                  autoFocus: true,
                  value: acceptReason,
                  placeholder: t("editor.acceptedReasonHint"),
                  onChange: (event) => setAcceptReason(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") void confirmAccept();
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-form-actions", children: [
                concepts.length === 0 && acceptTarget.conceptId === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "sd-button sd-button-primary",
                    onClick: () => {
                      const finding = acceptTarget;
                      setAcceptTarget(null);
                      if (finding !== null) promote(finding);
                    },
                    children: t("action.new")
                  }
                ) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "sd-button sd-button-primary",
                    onClick: () => void confirmAccept(),
                    disabled: busy === "accept" || acceptReason.trim() === "" || (acceptTarget.conceptId ?? acceptConceptId) === void 0,
                    children: t("action.accept")
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "sd-button", onClick: () => setAcceptTarget(null), children: t("action.cancel") })
              ] })
            ]
          }
        )
      }
    )
  ] });
}

// src/client/index.ts
var inject = ["slots"];
var PANEL_ORDER = 30;
var NS = "semantic-drift";
function apply(ctx) {
  try {
    const locale = ctx.locale;
    if (locale !== void 0) {
      ctx.effect(() => locale.register(NS, dictionaries), "semantic-drift: dictionaries");
      setTranslator(locale.bind(NS));
    }
  } catch {
  }
  const disposers = [];
  try {
    disposers.push(ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
      name: "sidebar.panellist",
      id: PANEL_ID,
      order: PANEL_ORDER,
      label: () => t("entry.label")
    }, SidebarIcon)));
    disposers.push(ctx.slots.inject("main", () => ctx.slots.register({
      name: "main",
      key: PANEL_ID
    }, SemanticPanel)));
  } catch (error) {
    for (const dispose of disposers.splice(0)) dispose();
    console.warn(`[${NS}] panel registration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}
    return module.exports;
  },
});

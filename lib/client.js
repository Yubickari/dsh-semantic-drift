// dsh-semantic-drift 0.1.0 — browser half (generated, do not edit)
window.__ModuleLoader__.load({
  id: "dsh-semantic-drift",
  factory: (require) => {
    var module = { exports: {} };
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
  "entry.label": "\u8BED\u4E49\u8BCD\u8868",
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
  "rule.derived-copy": "\u6D3E\u751F\u526F\u672C",
  "rule.literal-variant": "\u540C\u540D\u4E0D\u540C\u503C",
  "rule.contract-alias": "\u540C\u4E00\u5951\u7EA6\u53E6\u4E00\u79CD\u547D\u540D",
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
  "action.delete": "\u5220\u9664",
  "action.remove": "\u79FB\u9664",
  "action.clearAll": "\u6E05\u7A7A",
  "action.undo": "\u64A4\u9500",
  "exception.editTitle": "\u7F16\u8F91\u4F8B\u5916",
  "exception.symbolFixed": "\u7B26\u53F7\u662F\u89C2\u5BDF\u5230\u7684\u5199\u6CD5\uFF0C\u4E0D\u53EF\u4FEE\u6539\uFF1B\u8981\u6362\u7B26\u53F7\u8BF7\u79FB\u9664\u540E\u91CD\u65B0\u63A5\u53D7\u3002",
  "exception.removeTitle": "\u79FB\u9664\u8FD9\u6761\u4F8B\u5916\uFF1F",
  "exception.removeBody": "\u79FB\u9664\u540E\uFF0C\u5F53\u524D\u88AB\u5B83\u9759\u97F3\u7684 {count} \u6761\u53D1\u73B0\u4F1A\u91CD\u65B0\u51FA\u73B0\u3002\u4EE3\u7801\u4E0D\u4F1A\u88AB\u6539\u52A8\u3002",
  "exception.clearTitle": "\u6E05\u7A7A\u8FD9\u4E2A\u6982\u5FF5\u7684\u5168\u90E8\u4F8B\u5916\uFF1F",
  "exception.clearBody": "\u5171 {count} \u6761\u4F8B\u5916\u4F1A\u88AB\u79FB\u9664\uFF0C\u88AB\u5B83\u4EEC\u9759\u97F3\u7684\u53D1\u73B0\u4F1A\u91CD\u65B0\u51FA\u73B0\u3002",
  "state.exceptionSaved": "\u4F8B\u5916\u5DF2\u66F4\u65B0",
  "state.exceptionRemoved": "\u5DF2\u79FB\u9664\u4F8B\u5916\uFF0C{count} \u6761\u53D1\u73B0\u91CD\u65B0\u51FA\u73B0",
  "state.exceptionsCleared": "\u5DF2\u6E05\u7A7A {count} \u6761\u4F8B\u5916",
  "state.restored": "\u5DF2\u64A4\u9500\u79FB\u9664",
  "accept.coversBefore": "\u539F\u4E3A {count} \u6761",
  "settings.title": "\u8BBE\u7F6E",
  "settings.local": "\u672C\u6D4F\u89C8\u5668",
  "settings.project": "\u672C\u9879\u76EE\uFF08\u53EA\u8BFB\uFF09",
  "settings.projectHint": "\u8FD9\u4E9B\u662F\u63D2\u4EF6\u884C\u7684\u914D\u7F6E\uFF0C\u4FEE\u6539\u8BF7\u5230 \u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u8BED\u4E49\u6F02\u79FB\u3002",
  "settings.auto": "\u81EA\u52A8\u8DDF\u968F\u5DE5\u4F5C\u533A",
  "settings.autoHint": "\u5F00\u542F\u65F6\u8DDF\u968F\u5F53\u524D DSH \u5DE5\u4F5C\u533A\u7684\u5207\u6362\uFF08\u53EA\u5207\u6362\u8BCD\u8868\uFF0C\u4E0D\u81EA\u52A8\u626B\u63CF\uFF09\uFF1B\u5173\u95ED\u540E\u56FA\u5B9A\u5728\u4E0A\u6B21\u9009\u62E9\u7684\u5DE5\u4F5C\u533A\u3002",
  "header.following": "\u8DDF\u968F\u5F53\u524D\u5DE5\u4F5C\u533A \xB7 \u70B9\u51FB\u56FA\u5B9A",
  "header.pinned": "\u5DF2\u56FA\u5B9A\uFF1A\u4E0D\u8DDF\u968F\u4F1A\u8BDD \xB7 \u70B9\u51FB\u6062\u590D\u8DDF\u968F",
  "settings.scanRetention": "\u7ED3\u679C\u4FDD\u7559\u65F6\u95F4",
  "settings.scanRetentionHint": "\u91CD\u65B0\u8FDB\u5165\u9762\u677F\u65F6\u590D\u7528\u8FD9\u6BB5\u65F6\u95F4\u5185\u7684\u626B\u63CF\u7ED3\u679C\uFF1B0 \u8868\u793A\u4E0D\u590D\u7528\uFF08\u6BCF\u6B21\u8FDB\u5165\u90FD\u8981\u624B\u52A8\u626B\u63CF\uFF09\u3002",
  "settings.minutes": "\u5206\u949F",
  "footer.scannedAgo": "\u626B\u63CF\u4E8E {age}",
  "footer.scanExpired": "\u7ED3\u679C\u5DF2\u8FC7\u671F",
  "footer.vocabularyChanged": "\u8BCD\u8868\u5DF2\u66F4\u65B0\uFF0C\u5EFA\u8BAE\u91CD\u626B",
  "age.now": "\u521A\u521A",
  "age.minutes": "{count} \u5206\u949F\u524D",
  "age.hours": "{count} \u5C0F\u65F6\u524D",
  "age.days": "{count} \u5929\u524D",
  "settings.autoScan": "\u81EA\u52A8\u91CD\u65B0\u626B\u63CF",
  "settings.autoScanHint": "\u4EC5\u5728\u5DE5\u4F5C\u533A\u968F\u4F1A\u8BDD\u5207\u6362\u65F6\u91CD\u626B\uFF1B\u6253\u5F00\u9762\u677F\u3001\u624B\u52A8\u9009\u62E9\u5DE5\u4F5C\u533A\u3001\u4FDD\u5B58\u4E0E\u63A5\u53D7\u90FD\u4E0D\u4F1A\u56E0\u6B64\u89E6\u53D1\u626B\u63CF\u3002",
  "settings.autoScanNeedsAuto": "\u9700\u8981\u5148\u5F00\u542F\u300C\u81EA\u52A8\u8DDF\u968F\u5DE5\u4F5C\u533A\u300D",
  "scan.never": "\u5C1A\u672A\u626B\u63CF",
  "scan.neverHint": "\u70B9\u300C\u91CD\u65B0\u626B\u63CF\u300D\u83B7\u53D6\u5F53\u524D\u5DE5\u4F5C\u533A\u7684\u6F02\u79FB\u7ED3\u679C\u3002",
  "settings.notification": "\u901A\u77E5\u81EA\u52A8\u5173\u95ED",
  "settings.notificationHint": "\u5355\u4F4D\u79D2\uFF1B0 \u8868\u793A\u4E0D\u81EA\u52A8\u5173\u95ED\u3002\u5E26\u6821\u9A8C\u95EE\u9898\u7684\u9519\u8BEF\u63D0\u793A\u4E0D\u4F1A\u81EA\u52A8\u5173\u95ED\u3002",
  "settings.seconds": "\u79D2",
  "settings.showLow": "\u663E\u793A\u4F4E\u7F6E\u4FE1\u5EA6\u53D1\u73B0",
  "settings.showLowHint": "\u4F4E\u7F6E\u4FE1\u5EA6\u6765\u81EA\u81EA\u7136\u8BED\u8A00\u63A8\u65AD\uFF08\u4F8B\u5982\u6CE8\u91CA\u91CC\u7684\u672F\u8BED\uFF09\uFF0C\u9ED8\u8BA4\u6298\u53E0\u3002",
  "settings.done": "\u5B8C\u6210",
  "settings.vocabularyPath": "\u8BCD\u8868\u8DEF\u5F84",
  "settings.announceToAgent": "\u6CE8\u5165 Agent \u63D0\u793A",
  "settings.citationStyle": "\u5F15\u7528\u683C\u5F0F",
  "settings.minConfidence": "\u5DE5\u5177\u6700\u4F4E\u7F6E\u4FE1\u5EA6",
  "settings.budgets": "\u626B\u63CF\u9884\u7B97",
  "settings.detectors": "\u68C0\u6D4B\u5668",
  "settings.on": "\u5F00",
  "settings.off": "\u5173",
  "accept.scope": "\u63A5\u53D7\u8303\u56F4",
  "accept.scope.file": "\u4EC5\u6B64\u6587\u4EF6",
  "accept.scope.family": "\u540C\u6587\u4EF6\u540D\u7684\u6240\u6709\u76EE\u5F55",
  "accept.scope.symbol": "\u6574\u4E2A\u7B26\u53F7",
  "accept.scope.custom": "\u81EA\u5B9A\u4E49 glob",
  "accept.covers": "\u5C06\u9759\u97F3 {count} \u6761\u53D1\u73B0",
  "accept.coversNone": "\u5F53\u524D\u8303\u56F4\u5185\u6CA1\u6709\u53D1\u73B0",
  "accept.pathList": "\u8986\u76D6\u7684\u8DEF\u5F84",
  "accept.confirm": "\u63A5\u53D7\uFF08\u9759\u97F3 {count} \u6761\uFF09",
  "detail.mutes": "\u5F53\u524D\u9759\u97F3 {count} \u6761",
  "detail.mutesZero": "\u5F53\u524D\u6CA1\u6709\u9759\u97F3\u4EFB\u4F55\u53D1\u73B0\uFF08\u53EF\u80FD\u662F\u8303\u56F4\u5199\u9519\u4E86\uFF09",
  "delete.title": "\u5220\u9664\u8FD9\u4E2A\u6982\u5FF5\uFF1F",
  "delete.body": "\u5B83\u4EE5\u53CA\u5B83\u8BB0\u5F55\u7684\u6240\u6709\u300C\u5DF2\u63A5\u53D7\u4F8B\u5916\u300D\u4F1A\u4ECE\u8BCD\u8868\u6587\u4EF6\u4E2D\u79FB\u9664\u3002\u4EE3\u7801\u4E0D\u4F1A\u88AB\u6539\u52A8\uFF1B\u88AB\u8FD9\u4E2A\u53D1\u73B0\u8986\u76D6\u7684\u6761\u76EE\u4F1A\u56DE\u5230\u300C\u672A\u5F52\u7C7B\u300D\u3002",
  "delete.confirm": "\u5220\u9664\u6982\u5FF5",
  "auto.label": "\u81EA\u52A8",
  "auto.onHint": "\u8DDF\u968F\u5F53\u524D DSH \u5DE5\u4F5C\u533A\uFF1A\u5207\u6362\u4F1A\u8BDD\u65F6\u81EA\u52A8\u5207\u6362\u5DE5\u4F5C\u533A\u5E76\u91CD\u65B0\u626B\u63CF",
  "auto.offHint": "\u56FA\u5B9A\u5728\u4E0A\u6B21\u9009\u62E9\u7684\u5DE5\u4F5C\u533A\uFF0C\u4E0D\u518D\u8DDF\u968F\u4F1A\u8BDD\u5207\u6362",
  "auto.currentExtra": "\u5F53\u524D\u76EE\u5F55",
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
  "entry.label": "Vocabulary",
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
  "rule.derived-copy": "derived copy",
  "rule.literal-variant": "same names, different values",
  "rule.contract-alias": "same contract, other name",
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
  "action.delete": "Delete",
  "action.remove": "Remove",
  "action.clearAll": "Clear all",
  "action.undo": "Undo",
  "exception.editTitle": "Edit exception",
  "exception.symbolFixed": "The symbol is the observed spelling and cannot be edited; remove and re-accept to change it.",
  "exception.removeTitle": "Remove this exception?",
  "exception.removeBody": "The {count} findings it mutes now will reappear. No code is touched.",
  "exception.clearTitle": "Clear every exception of this concept?",
  "exception.clearBody": "All {count} exceptions are removed, and the findings they mute reappear.",
  "state.exceptionSaved": "Exception updated",
  "state.exceptionRemoved": "Exception removed; {count} findings reappear",
  "state.exceptionsCleared": "Cleared {count} exceptions",
  "state.restored": "Removal undone",
  "accept.coversBefore": "was {count}",
  "settings.title": "Settings",
  "settings.local": "This browser",
  "settings.project": "This project (read-only)",
  "settings.projectHint": "These are the plugin row settings; edit them under Settings \u2192 Plugins \u2192 Semantic Drift.",
  "settings.auto": "Follow the workspace",
  "settings.autoHint": "On: follow the current DSH workspace and switch the vocabulary with it (no scan). Off: stay on the workspace you last picked.",
  "header.following": "Following the session workspace \xB7 click to pin",
  "header.pinned": "Pinned \xB7 click to follow again",
  "settings.scanRetention": "Keep scan results for",
  "settings.scanRetentionHint": "Reuse a scan this recent when the panel is re-opened; 0 disables it, so every entry needs a manual scan.",
  "settings.minutes": "min",
  "footer.scannedAgo": "scanned {age}",
  "footer.scanExpired": "result is stale",
  "footer.vocabularyChanged": "vocabulary changed, rescan",
  "age.now": "just now",
  "age.minutes": "{count} min ago",
  "age.hours": "{count} h ago",
  "age.days": "{count} d ago",
  "settings.autoScan": "Rescan automatically",
  "settings.autoScanHint": "Only when the workspace follows the session: switching workspaces rescans. Opening the panel, picking a workspace by hand, saving or accepting never trigger a scan.",
  "settings.autoScanNeedsAuto": "Requires Follow the workspace",
  "scan.never": "Not scanned yet",
  "scan.neverHint": "Press Scan to read this workspace.",
  "settings.notification": "Notifications close after",
  "settings.notificationHint": "Seconds; 0 keeps them until dismissed. Errors that carry validation issues never close themselves.",
  "settings.seconds": "s",
  "settings.showLow": "Show low-confidence findings",
  "settings.showLowHint": "Low confidence comes from natural-language evidence such as a term in a comment; folded by default.",
  "settings.done": "Done",
  "settings.vocabularyPath": "Vocabulary path",
  "settings.announceToAgent": "Inject into agent prompts",
  "settings.citationStyle": "Citation style",
  "settings.minConfidence": "Tools minimum confidence",
  "settings.budgets": "Scan budgets",
  "settings.detectors": "Detectors",
  "settings.on": "on",
  "settings.off": "off",
  "accept.scope": "Accept scope",
  "accept.scope.file": "This file only",
  "accept.scope.family": "Every directory with this file name",
  "accept.scope.symbol": "The whole symbol",
  "accept.scope.custom": "Custom glob",
  "accept.covers": "This will mute {count} findings",
  "accept.coversNone": "Nothing in this scope",
  "accept.pathList": "Covered paths",
  "accept.confirm": "Accept ({count} muted)",
  "detail.mutes": "mutes {count} now",
  "detail.mutesZero": "mutes nothing right now (the scope may be wrong)",
  "delete.title": "Delete this concept?",
  "delete.body": "It and every accepted exception it records are removed from the vocabulary file. No code is touched; findings that only it covered return to the unclassified list.",
  "delete.confirm": "Delete concept",
  "auto.label": "Auto",
  "auto.onHint": "Follow the current DSH workspace: switching sessions switches the workspace and rescans",
  "auto.offHint": "Stay on the workspace you last picked instead of following sessions",
  "auto.currentExtra": "current directory",
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
function PinIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...base(size), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.6 2.6 13.4 6.4M8.4 3.8 12.2 7.6M6.2 5.2l4.6 4.6-2 2-4.6-4.6zM6.2 12.4 2.8 15.8" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.2 8.2 6.4 11" })
  ] });
}
function FollowIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...base(size), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "8", cy: "8", r: "4.4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "8", cy: "8", r: "1.2", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 1.4v1.9M8 12.7v1.9M1.4 8h1.9M12.7 8h1.9" })
  ] });
}
function SettingsIcon({ size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...base(size), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M2.6 4.6h10.8M2.6 8h10.8M2.6 11.4h10.8" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "6.2", cy: "4.6", r: "1.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "10.4", cy: "8", r: "1.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "5.4", cy: "11.4", r: "1.5" })
  ] });
}
function TrashIcon({ size = 13 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...base(size), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 4.6h10M6.4 4.6V3.4h3.2v1.2M4.4 4.6l.6 8.2h6l.6-8.2M6.6 7v3.6M9.4 7v3.6" }) });
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
function findingLabel(finding) {
  const rule = finding.detail.rule;
  if (rule === "derived-copy") return t("rule.derived-copy");
  if (rule === "literal-variant") return t("rule.literal-variant");
  if (rule === "contract-alias") return t("rule.contract-alias");
  return t(`detector.${finding.detector}`);
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
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sd-mono sd-muted", children: findingLabel(finding) }),
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
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "button",
        {
          type: "button",
          className: "sd-button sd-button-danger",
          title: t("delete.title"),
          onClick: () => props.onDelete(concept),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(TrashIcon, {}),
            t("action.delete")
          ]
        }
      )
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
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-spread", style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-section-title", style: { margin: 0 }, children: [
          t("detail.accepted"),
          " (",
          (concept.accepted ?? []).length,
          ")"
        ] }),
        (concept.accepted ?? []).length > 1 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "sd-button sd-button-ghost",
            onClick: () => props.onClearExceptions(concept),
            children: t("action.clearAll")
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-drift", children: (concept.accepted ?? []).map((exception, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-drift-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-drift-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-drift-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-drift-symbol", children: exception.symbol }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sd-mono sd-muted", children: exception.path === void 0 ? "**" : exception.path })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-drift-note", children: exception.reason }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-meta", children: props.muteCount(concept, index) === 0 ? t("detail.mutesZero") : tf("detail.mutes", { count: props.muteCount(concept, index) }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-row-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-ghost",
              title: t("action.edit"),
              "aria-label": `${t("action.edit")} ${exception.symbol} ${exception.path ?? "**"}`,
              onClick: () => props.onEditException(concept, index),
              children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(EditIcon, {})
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-ghost",
              title: t("action.remove"),
              "aria-label": `${t("action.remove")} ${exception.symbol} ${exception.path ?? "**"}`,
              onClick: () => props.onRemoveException(concept, index),
              children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(TrashIcon, {})
            }
          )
        ] })
      ] }, `${exception.symbol}-${index}`)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sd-spread", style: { marginBottom: 8 }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sd-section-title", style: { margin: 0 }, children: [
        t("detail.drift"),
        " ",
        conceptFindings.length > 0 ? `(${conceptFindings.length})` : ""
      ] }) }),
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
          notice.action !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-ghost",
              onClick: () => notice.action?.run(),
              children: notice.action.label
            }
          ),
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

// src/client/preferences.ts
var KEY = "dsh-semantic-drift:prefs";
function defaultPreferences() {
  return { auto: true, autoScan: false, notificationSeconds: 3, showLow: false, scanRetentionMinutes: 10 };
}
function loadPreferences() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw === null || raw === void 0) return defaultPreferences();
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return defaultPreferences();
    const record = parsed;
    const seconds = typeof record.notificationSeconds === "number" && Number.isFinite(record.notificationSeconds) ? Math.max(0, Math.min(600, record.notificationSeconds)) : 3;
    return {
      auto: typeof record.auto === "boolean" ? record.auto : true,
      autoScan: record.autoScan === true,
      ...typeof record.workspace === "string" && record.workspace !== "" ? { workspace: record.workspace } : {},
      notificationSeconds: seconds,
      showLow: record.showLow === true,
      scanRetentionMinutes: typeof record.scanRetentionMinutes === "number" && Number.isFinite(record.scanRetentionMinutes) ? Math.max(0, Math.min(1440, Math.round(record.scanRetentionMinutes))) : 10
    };
  } catch {
    return defaultPreferences();
  }
}
function savePreferences(preferences) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(preferences));
  } catch {
  }
}

// src/client/scan-cache.ts
var KEY2 = "dsh-semantic-drift:scan-cache";
var MAX_ENTRIES = 3;
var MAX_CHARS = 15e5;
var PRUNE_FACTOR = 4;
function storage() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return void 0;
  }
}
function isEntry(value) {
  if (value === null || typeof value !== "object") return false;
  const entry = value;
  return typeof entry.workspace === "string" && typeof entry.at === "number" && typeof entry.response === "object" && entry.response !== null;
}
function read() {
  const store2 = storage();
  if (store2 === void 0) return [];
  try {
    const raw = store2.getItem(KEY2);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}
function write(entries) {
  const store2 = storage();
  if (store2 === void 0) return;
  try {
    if (entries.length === 0) store2.removeItem(KEY2);
    else store2.setItem(KEY2, JSON.stringify(entries));
  } catch {
  }
}
function rememberScan(input) {
  if (!(input.retentionMinutes > 0)) return;
  const entry = {
    workspace: input.workspace,
    at: input.now ?? Date.now(),
    ...input.mtimeMs === void 0 ? {} : { mtimeMs: input.mtimeMs },
    response: input.response
  };
  let encoded;
  try {
    encoded = JSON.stringify(entry);
  } catch {
    return;
  }
  if (encoded.length > MAX_CHARS) return;
  const kept = read().filter((item) => item.workspace !== entry.workspace);
  kept.push(entry);
  const now = input.now ?? Date.now();
  const horizon = input.retentionMinutes * 6e4 * PRUNE_FACTOR;
  write(kept.filter((item) => now - item.at <= horizon).slice(-MAX_ENTRIES));
}
function recallScan(input) {
  if (!(input.retentionMinutes > 0)) return void 0;
  const now = input.now ?? Date.now();
  const entry = read().find((item) => item.workspace === input.workspace);
  if (entry === void 0) return void 0;
  const ageMs = Math.max(0, now - entry.at);
  return {
    response: entry.response,
    at: entry.at,
    ageMs,
    expired: ageMs > input.retentionMinutes * 6e4,
    ...entry.mtimeMs === void 0 ? {} : { mtimeMs: entry.mtimeMs }
  };
}

// src/client/view-memory.ts
var KEY3 = "dsh-semantic-drift:view";
function store() {
  try {
    return globalThis.localStorage;
  } catch {
    return void 0;
  }
}
function read2() {
  const storage2 = store();
  if (storage2 === void 0) return void 0;
  try {
    const raw = storage2.getItem(KEY3);
    if (raw === null) return void 0;
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return void 0;
    const view = parsed;
    if (typeof view.workspace !== "string" || view.selection === void 0 || view.selection === null) return void 0;
    const selection = view.selection;
    if (selection.kind === "unclassified") return { workspace: view.workspace, selection: { kind: "unclassified" } };
    if (selection.kind === "concept" && typeof selection.id === "string" && selection.id !== "") {
      return { workspace: view.workspace, selection: { kind: "concept", id: selection.id } };
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function rememberSelection(workspace, selection) {
  const storage2 = store();
  if (storage2 === void 0) return;
  try {
    storage2.setItem(KEY3, JSON.stringify({ workspace, selection }));
  } catch {
  }
}
function recallSelection(workspace) {
  const view = read2();
  return view !== void 0 && view.workspace === workspace ? view.selection : void 0;
}
function forgetSelection() {
  const storage2 = store();
  if (storage2 === void 0) return;
  try {
    storage2.removeItem(KEY3);
  } catch {
  }
}

// src/glob.ts
var REGEX_SPECIAL = /[.+^$()|\\]/;
function escapeChar(ch) {
  return REGEX_SPECIAL.test(ch) ? `\\${ch}` : ch;
}
function escapeLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toPosix(value) {
  let out = value.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  return out;
}
function globToRegExp(pattern) {
  const source = toPosix(pattern.trim());
  let out = "^";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "*") {
      if (source[i + 1] === "*") {
        while (source[i + 1] === "*") i++;
        if (source[i + 1] === "/") {
          i++;
          out += "(?:[^/]+/)*";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      continue;
    }
    if (ch === "[") {
      const end = source.indexOf("]", i + 1);
      if (end === -1) {
        out += "\\[";
      } else {
        const body = source.slice(i + 1, end).replace(/\\/g, "\\\\");
        out += `[${body}]`;
        i = end;
      }
      continue;
    }
    if (ch === "{") {
      const end = source.indexOf("}", i + 1);
      if (end === -1) {
        out += "\\{";
      } else {
        const parts = source.slice(i + 1, end).split(",").map((part) => escapeLiteral(part.trim()));
        out += `(?:${parts.join("|")})`;
        i = end;
      }
      continue;
    }
    out += escapeChar(ch);
  }
  out += "$";
  return new RegExp(out);
}
function isValidGlob(pattern) {
  if (typeof pattern !== "string") return false;
  const trimmed = pattern.trim();
  if (trimmed === "") return false;
  const withoutEscapes = trimmed.replace(/\\[[\]]/g, "");
  if ((withoutEscapes.match(/\[/g)?.length ?? 0) !== (withoutEscapes.match(/\]/g)?.length ?? 0)) return false;
  if ((trimmed.match(/\{/g)?.length ?? 0) !== (trimmed.match(/\}/g)?.length ?? 0)) return false;
  try {
    globToRegExp(trimmed);
    return true;
  } catch {
    return false;
  }
}
function matchesGlob(pattern, path) {
  if (pattern === void 0 || pattern.trim() === "" || pattern.trim() === "**") return true;
  if (!isValidGlob(pattern)) return false;
  return globToRegExp(pattern).test(toPosix(path));
}

// src/client/ScopeSelect.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function scopePathFor(anchor, value) {
  if (value.kind === "symbol") return void 0;
  if (value.kind === "file") return anchor === "" ? void 0 : anchor;
  if (value.kind === "family") {
    const name = anchor.split("/").at(-1) ?? "";
    return name === "" ? void 0 : `**/${name}`;
  }
  const trimmed = value.custom.trim();
  return trimmed === "" ? void 0 : trimmed;
}
function coveredBy(findings, symbol, path) {
  return findings.filter((finding) => finding.symbol === symbol && matchesGlob(path, finding.path));
}
function scopeFromPath(path, sample) {
  if (path === void 0 || path === "") return { kind: "symbol", custom: "" };
  const family = sample === "" ? void 0 : `**/${sample.split("/").at(-1) ?? ""}`;
  if (family !== void 0 && path === family) return { kind: "family", custom: "" };
  if (/[*?[\]]/.test(path)) return { kind: "custom", custom: path };
  return { kind: "file", custom: "" };
}
function ScopeSelect(props) {
  const current = scopePathFor(props.anchor, props.value);
  const covered = coveredBy(props.findings, props.symbol, current);
  const original = props.originalCount ?? (props.originalPath === void 0 ? void 0 : coveredBy(props.findings, props.symbol, props.originalPath).length);
  const kinds = props.anchor === "" ? ["symbol", "custom"] : ["file", "family", "symbol", "custom"];
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-field", style: { gap: 5 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "sd-label", children: t("accept.scope") }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "sd-scope", children: kinds.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "sd-scope-option", "data-active": props.value.kind === kind, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "input",
        {
          type: "radio",
          name: "sd-accept-scope",
          checked: props.value.kind === kind,
          onChange: () => props.onChange({ ...props.value, kind })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: t(`accept.scope.${kind}`) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "sd-scope-count", children: coveredBy(props.findings, props.symbol, scopePathFor(props.anchor, { kind, custom: props.value.custom })).length })
    ] }, kind)) }),
    props.value.kind === "custom" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "input",
      {
        id: "sd-scope-custom",
        className: "sd-input sd-mono",
        value: props.value.custom,
        placeholder: "**/Common/LanguageProvider.cs",
        onChange: (event) => props.onChange({ ...props.value, custom: event.target.value }),
        spellCheck: false
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "sd-hint", children: [
      tf("accept.covers", { count: covered.length }),
      original !== void 0 && original !== covered.length ? `\uFF08${tf("accept.coversBefore", { count: original })}\uFF09` : ""
    ] }),
    covered.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sd-pathlist", children: [
      covered.slice(0, 6).map((finding) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
        finding.path,
        ":",
        finding.line
      ] }, finding.id)),
      covered.length > 6 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
        "\u2026 ",
        covered.length - 6
      ] })
    ] })
  ] });
}

// src/client/ConceptEditor.tsx
var import_react = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("form", { className: "sd-form", onSubmit: submit, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "sd-section-title", style: { margin: 0 }, children: props.concept === void 0 ? t("editor.titleNew") : t("editor.titleEdit") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "sd-label", htmlFor: "sd-id", children: t("editor.id") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-hint", children: t("editor.idHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "sd-label", htmlFor: "sd-terms", children: t("editor.terms") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "input",
        {
          id: "sd-terms",
          className: "sd-input",
          value: terms,
          onChange: (event) => setTerms(event.target.value),
          placeholder: "\u76EE\u6807\u6E29\u5EA6, \u8BBE\u5B9A\u6E29\u5EA6"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-hint", children: t("editor.termsHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "sd-label", htmlFor: "sd-kind", children: t("editor.kind") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "select",
          {
            id: "sd-kind",
            className: "sd-select",
            value: kind,
            onChange: (event) => setKind(event.target.value),
            style: { maxWidth: "none", width: "100%" },
            children: CONCEPT_KINDS.map((value) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value, children: t(`kind.${value}`) }, value))
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "sd-label", htmlFor: "sd-unit", children: t("editor.unit") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "sd-label", htmlFor: "sd-symbol", children: t("editor.symbol") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "sd-hint", children: t("editor.symbolHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "sd-label", htmlFor: "sd-type", children: t("editor.type") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "sd-label", htmlFor: "sd-note", children: t("editor.note") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
    props.issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "sd-section-title", style: { margin: 0 }, children: t("issue.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(IssueList, { issues: props.issues })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "sd-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "submit", className: "sd-button sd-button-primary", disabled: props.saving, children: t("action.save") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "sd-button", onClick: props.onCancel, disabled: props.saving, children: t("action.cancel") })
    ] })
  ] });
}

// src/client/ConceptTree.tsx
var import_react2 = require("react");
var import_jsx_runtime8 = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("aside", { className: "sd-tree", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-tree-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-tree-title", children: t("tree.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-count", children: props.concepts.length }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          type: "button",
          className: "sd-add",
          title: t("action.new"),
          "aria-label": t("action.new"),
          onClick: () => props.onAdd(),
          children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PlusIcon, { size: 15 })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-tree-tools", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-search", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-search-icon", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(SearchIcon, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sd-filters", children: ["all", "drift", "clean"].map((value) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-tree-list", children: [
      groups.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-empty", style: { minHeight: 120, padding: 16 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sd-empty-title", children: t("tree.empty") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { children: t("tree.emptyHint") })
      ] }),
      groups.map((group) => {
        const open = collapsed[group.name] !== true;
        return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sd-group-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { type: "button", className: "sd-group-head", onClick: () => toggle(group.name), children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-caret", "data-open": open, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(CaretIcon, {}) }),
              group.name,
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-count", children: group.concepts.length })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              "button",
              {
                type: "button",
                className: "sd-add",
                title: t("tree.addInGroup"),
                "aria-label": t("tree.addInGroup"),
                onClick: () => props.onAdd(group.name),
                children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PlusIcon, { size: 13 })
              }
            )
          ] }),
          open && group.concepts.map((concept) => {
            const drift = props.driftCounts.get(concept.id) ?? 0;
            return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
              "button",
              {
                type: "button",
                className: "sd-item",
                "data-active": props.selectedId === concept.id,
                onClick: () => props.onSelect(concept.id),
                title: concept.id,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-item-name", children: concept.id.split(".").slice(1).join(".") || concept.id }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-item-symbol", children: concept.canonical.symbol }),
                  drift > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-count", "data-tone": "warn", children: drift })
                ]
              },
              concept.id
            );
          })
        ] }, group.name);
      }),
      props.showUnclassified && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sd-group", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
        "button",
        {
          type: "button",
          className: "sd-item",
          "data-active": props.selectedId === null,
          onClick: props.onSelectUnclassified,
          style: { paddingLeft: 8 },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-item-name", children: t("tree.unclassified") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sd-count", "data-tone": props.unclassified > 0 ? "warn" : void 0, children: props.unclassified })
          ]
        }
      ) })
    ] })
  ] });
}

// src/client/RawEditor.tsx
var import_react3 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
function RawEditor(props) {
  const [text, setText] = (0, import_react3.useState)(props.text);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-raw", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-spread", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-section-title", style: { margin: 0 }, children: t("raw.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-hint", children: t("raw.hint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "textarea",
      {
        className: "sd-textarea",
        value: text,
        onChange: (event) => setText(event.target.value),
        spellCheck: false,
        rows: 18
      }
    ),
    props.issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sd-section-title", style: { margin: 0 }, children: t("issue.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(IssueList, { issues: props.issues })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sd-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "button",
        {
          type: "button",
          className: "sd-button sd-button-primary",
          disabled: props.saving,
          onClick: () => props.onSave(text),
          children: t("action.save")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className: "sd-button", onClick: props.onCancel, disabled: props.saving, children: t("action.cancel") })
    ] })
  ] });
}

// src/client/styles.ts
var PANEL_CSS = `
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
  color: #fff;
}
.sd-button-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); filter: brightness(1.08); }
.sd-button-ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.sd-button-icon { width: 28px; padding: 0; justify-content: center; }
.sd-spin { animation: sd-spin 1s linear infinite; }
@keyframes sd-spin { to { transform: rotate(360deg); } }
.sd-button-danger { color: var(--dsw-alias-state-error-primary); }
.sd-button-danger:hover:not(:disabled) { border-color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-bg-layer-2); }
.sd-mode-button[data-mode='pinned'] { color: var(--dsw-alias-brand-primary); }
.sd-mode-button[data-mode='following'] { color: var(--dsw-alias-label-secondary); }
.sd-mode-button[data-mode='pinned']:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }
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
`;

// src/client/Panel.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
function ageText(ageMs) {
  const minutes = Math.floor(ageMs / 6e4);
  if (minutes < 1) return t("age.now");
  if (minutes < 60) return tf("age.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tf("age.hours", { count: hours });
  return tf("age.days", { count: Math.floor(hours / 24) });
}
function messageOf(error) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
function issuesOf(error) {
  return error instanceof ApiError ? error.issues : [];
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
  const [preferences] = (0, import_react4.useState)(() => loadPreferences());
  const [auto, setAuto] = (0, import_react4.useState)(preferences.auto);
  const [autoScan, setAutoScan] = (0, import_react4.useState)(preferences.autoScan);
  const [pinned, setPinned] = (0, import_react4.useState)(preferences.workspace);
  const [notificationSeconds, setNotificationSeconds] = (0, import_react4.useState)(preferences.notificationSeconds);
  const [settingsOpen, setSettingsOpen] = (0, import_react4.useState)(false);
  const [requested, setRequested] = (0, import_react4.useState)(preferences.auto ? void 0 : preferences.workspace);
  const [state, setState] = (0, import_react4.useState)(null);
  const [scan, setScan] = (0, import_react4.useState)(null);
  const [selection, setSelection] = (0, import_react4.useState)({ kind: "none" });
  const [view, setView] = (0, import_react4.useState)({ kind: "browse" });
  const [query, setQuery] = (0, import_react4.useState)("");
  const [filter, setFilter] = (0, import_react4.useState)("all");
  const [showLow, setShowLow] = (0, import_react4.useState)(preferences.showLow);
  const [scanRetentionMinutes, setScanRetentionMinutes] = (0, import_react4.useState)(preferences.scanRetentionMinutes);
  const [scanAt, setScanAt] = (0, import_react4.useState)(null);
  const [scanMtime, setScanMtime] = (0, import_react4.useState)(void 0);
  const [busy, setBusy] = (0, import_react4.useState)(null);
  const [notice, setNotice] = (0, import_react4.useState)(null);
  const [editorIssues, setEditorIssues] = (0, import_react4.useState)([]);
  const [acceptTarget, setAcceptTarget] = (0, import_react4.useState)(null);
  const [acceptReason, setAcceptReason] = (0, import_react4.useState)("");
  const [acceptConceptId, setAcceptConceptId] = (0, import_react4.useState)(void 0);
  const [deleteTarget, setDeleteTarget] = (0, import_react4.useState)(null);
  const [acceptScope, setAcceptScope] = (0, import_react4.useState)({ kind: "file", custom: "" });
  const [exceptionEdit, setExceptionEdit] = (0, import_react4.useState)(null);
  const [editScope, setEditScope] = (0, import_react4.useState)({ kind: "symbol", custom: "" });
  const [editReason, setEditReason] = (0, import_react4.useState)("");
  const [exceptionRemove, setExceptionRemove] = (0, import_react4.useState)(null);
  const [exceptionClear, setExceptionClear] = (0, import_react4.useState)(null);
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
  const vocabularyMtimeRef = (0, import_react4.useRef)(void 0);
  const scanRetentionRef = (0, import_react4.useRef)(scanRetentionMinutes);
  (0, import_react4.useEffect)(() => {
    vocabularyMtimeRef.current = state?.vocabulary.mtimeMs;
  }, [state?.vocabulary.mtimeMs]);
  (0, import_react4.useEffect)(() => {
    scanRetentionRef.current = scanRetentionMinutes;
  }, [scanRetentionMinutes]);
  const scanPath = (0, import_react4.useCallback)(async (path) => {
    if (path === "") {
      notReady();
      return void 0;
    }
    setBusy("scan");
    try {
      const result = await runScan(path);
      const at = Date.now();
      setScan(result);
      setScanAt(at);
      setScanMtime(vocabularyMtimeRef.current);
      rememberScan({
        workspace: path,
        response: result,
        retentionMinutes: scanRetentionRef.current,
        ...vocabularyMtimeRef.current === void 0 ? {} : { mtimeMs: vocabularyMtimeRef.current },
        now: at
      });
      return result;
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error, "state.scanFailed"), issues: issuesOf(error) });
      return void 0;
    } finally {
      setBusy(null);
    }
  }, [notReady]);
  const target = auto ? suggested : requested ?? pinned ?? suggested;
  (0, import_react4.useEffect)(() => {
    void load(target);
  }, [target, load]);
  (0, import_react4.useEffect)(() => {
    savePreferences({
      auto,
      autoScan,
      ...pinned === void 0 ? {} : { workspace: pinned },
      notificationSeconds,
      showLow,
      scanRetentionMinutes
    });
  }, [auto, autoScan, pinned, notificationSeconds, showLow, scanRetentionMinutes]);
  (0, import_react4.useEffect)(() => {
    if (notice === null) return;
    if (!(notificationSeconds > 0)) return;
    const autoClosable = notice.kind === "success" || (notice.issues ?? []).length === 0;
    if (!autoClosable) return;
    const timer = setTimeout(() => setNotice(null), notificationSeconds * 1e3);
    return () => clearTimeout(timer);
  }, [notice, notificationSeconds]);
  const lastScannedPath = (0, import_react4.useRef)(void 0);
  (0, import_react4.useEffect)(() => {
    if (effectivePath === void 0) return;
    const previous = lastScannedPath.current;
    lastScannedPath.current = effectivePath;
    if (previous === void 0) return;
    if (previous === effectivePath) return;
    setScan(null);
    setScanAt(null);
    setScanMtime(void 0);
    setSelection({ kind: "none" });
    if (!auto || !autoScan) return;
    void scanPath(effectivePath);
  }, [auto, autoScan, effectivePath, scanPath]);
  (0, import_react4.useEffect)(() => {
    if (effectivePath === void 0) return;
    if (scan !== null) return;
    const recalled = recallScan({ workspace: effectivePath, retentionMinutes: scanRetentionMinutes });
    if (recalled === void 0) return;
    setScan(recalled.response);
    setScanAt(recalled.at);
    setScanMtime(recalled.mtimeMs);
  }, [effectivePath, scan, scanRetentionMinutes]);
  (0, import_react4.useEffect)(() => {
    if (effectivePath === void 0) return;
    if (selection.kind !== "none") return;
    const remembered = recallSelection(effectivePath);
    if (remembered === void 0) return;
    if (remembered.kind === "concept") {
      const exists = state?.vocabulary.document.concepts.some((concept) => concept.id === remembered.id);
      if (exists !== true) return;
      setSelection({ kind: "concept", id: remembered.id });
      return;
    }
    setSelection({ kind: "unclassified" });
  }, [effectivePath, selection.kind, state?.vocabulary.document.concepts]);
  (0, import_react4.useEffect)(() => {
    if (effectivePath === void 0) return;
    if (selection.kind === "concept") rememberSelection(effectivePath, { kind: "concept", id: selection.id });
    else if (selection.kind === "unclassified") rememberSelection(effectivePath, { kind: "unclassified" });
  }, [effectivePath, selection]);
  const vocabulary = state?.vocabulary;
  const concepts = vocabulary?.document.concepts ?? [];
  const findings = (0, import_react4.useMemo)(() => scan?.summary.findings ?? [], [scan]);
  const mutedFindings = (0, import_react4.useMemo)(() => scan?.summary.mutedFindings ?? [], [scan]);
  const allFindings = (0, import_react4.useMemo)(() => [...findings, ...mutedFindings], [findings, mutedFindings]);
  const scanAgeMs = scanAt === null ? void 0 : Math.max(0, Date.now() - scanAt);
  const scanExpired = scanAgeMs !== void 0 && scanRetentionMinutes > 0 && scanAgeMs > scanRetentionMinutes * 6e4;
  const scanVocabularyChanged = scan !== null && scanMtime !== void 0 && state?.vocabulary.mtimeMs !== void 0 && scanMtime !== state.vocabulary.mtimeMs;
  const muteCountOf = (0, import_react4.useCallback)((concept, index) => {
    const reported = scan?.summary.mutedByAccepted?.find((entry) => entry.conceptId === concept.id && entry.index === index);
    if (reported !== void 0) return reported.count;
    const exception = concept.accepted?.[index];
    if (exception === void 0) return 0;
    return coveredBy(allFindings, exception.symbol, exception.path).length;
  }, [allFindings, scan]);
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
  const toggleAuto = (0, import_react4.useCallback)(() => {
    if (auto) {
      const keep = effectivePath ?? pinned;
      setAuto(false);
      if (keep !== void 0) {
        setPinned(keep);
        setRequested(keep);
      }
    } else {
      setAuto(true);
      setRequested(void 0);
    }
  }, [auto, effectivePath, pinned]);
  const selectWorkspace = (0, import_react4.useCallback)((path) => {
    setRequested(path);
    setPinned(path);
    setAuto(false);
  }, []);
  const openDelete = (0, import_react4.useCallback)((concept) => {
    setDeleteTarget(concept);
  }, []);
  const confirmDelete = (0, import_react4.useCallback)(async () => {
    if (deleteTarget === null) return;
    if (effectivePath === void 0 || vocabulary === void 0) {
      notReady();
      return;
    }
    setBusy("save");
    try {
      const document2 = {
        ...vocabulary.document,
        concepts: concepts.filter((concept) => concept.id !== deleteTarget.id)
      };
      const result = await saveDocument(effectivePath, document2);
      setState((current) => current === null ? current : { ...current, vocabulary: result.vocabulary });
      if (selection.kind === "concept" && selection.id === deleteTarget.id) {
        setSelection({ kind: "none" });
        forgetSelection();
      }
      setDeleteTarget(null);
      setNotice({ kind: "success", text: t("state.saved") });
      await scanPath(effectivePath);
    } catch (error) {
      setNotice({
        kind: "error",
        text: saveFailureText(error, "state.saveFailed", issuesOf(error)),
        issues: issuesOf(error)
      });
    } finally {
      setBusy(null);
    }
  }, [concepts, deleteTarget, effectivePath, notReady, scanPath, selection, vocabulary]);
  const runException = (0, import_react4.useCallback)(async (input) => {
    if (effectivePath === void 0) {
      notReady();
      return void 0;
    }
    setBusy("accept");
    try {
      const result = await acceptException({ workspace: effectivePath, ...input });
      setState((current) => current === null ? current : { ...current, vocabulary: result.vocabulary });
      await scanPath(effectivePath);
      return result;
    } catch (error) {
      setNotice({
        kind: "error",
        text: saveFailureText(error, "state.acceptFailed", issuesOf(error)),
        issues: issuesOf(error)
      });
      return void 0;
    } finally {
      setBusy(null);
    }
  }, [effectivePath, notReady, scanPath]);
  const restoreExceptions = (0, import_react4.useCallback)(async (conceptId, exceptions) => {
    if (effectivePath === void 0) {
      notReady();
      return;
    }
    setBusy("accept");
    try {
      let last;
      for (const exception of exceptions) {
        last = await acceptException({
          workspace: effectivePath,
          op: "add",
          conceptId,
          symbol: exception.symbol,
          ...exception.path === void 0 ? {} : { path: exception.path },
          reason: exception.reason
        });
      }
      if (last !== void 0) {
        setState((current) => current === null ? current : { ...current, vocabulary: last.vocabulary });
      }
      await scanPath(effectivePath);
      setNotice({ kind: "success", text: t("state.restored") });
    } catch (error) {
      setNotice({
        kind: "error",
        text: saveFailureText(error, "state.acceptFailed", issuesOf(error)),
        issues: issuesOf(error)
      });
    } finally {
      setBusy(null);
    }
  }, [effectivePath, notReady, scanPath]);
  const occurrenceOf = (0, import_react4.useCallback)((concept, index) => {
    const list = concept.accepted ?? [];
    const target2 = list[index];
    if (target2 === void 0) return 0;
    return list.slice(0, index).filter((entry) => entry.symbol === target2.symbol && (entry.path ?? "") === (target2.path ?? "")).length;
  }, []);
  const openExceptionEdit = (0, import_react4.useCallback)((concept, index) => {
    const exception = concept.accepted?.[index];
    if (exception === void 0) return;
    setEditScope(scopeFromPath(exception.path, exception.path ?? ""));
    setEditReason(exception.reason);
    setExceptionEdit({ concept, index });
  }, []);
  const submitExceptionEdit = (0, import_react4.useCallback)(async () => {
    if (exceptionEdit === null) return;
    const exception = exceptionEdit.concept.accepted?.[exceptionEdit.index];
    if (exception === void 0) {
      setExceptionEdit(null);
      return;
    }
    if (editReason.trim() === "") return;
    const path = scopePathFor(exception.path ?? "", editScope);
    const result = await runException({
      op: "update",
      conceptId: exceptionEdit.concept.id,
      symbol: exception.symbol,
      ...exception.path === void 0 ? {} : { previousPath: exception.path },
      ...path === void 0 ? {} : { path },
      reason: editReason.trim(),
      occurrence: occurrenceOf(exceptionEdit.concept, exceptionEdit.index)
    });
    if (result === void 0) return;
    setExceptionEdit(null);
    setNotice({ kind: "success", text: t("state.exceptionSaved") });
  }, [editReason, editScope, exceptionEdit, occurrenceOf, runException]);
  const openExceptionRemove = (0, import_react4.useCallback)((concept, index) => {
    if (concept.accepted?.[index] === void 0) return;
    setExceptionRemove({ concept, index });
  }, []);
  const confirmExceptionRemove = (0, import_react4.useCallback)(async () => {
    if (exceptionRemove === null) return;
    const exception = exceptionRemove.concept.accepted?.[exceptionRemove.index];
    if (exception === void 0) {
      setExceptionRemove(null);
      return;
    }
    const conceptId = exceptionRemove.concept.id;
    const mutes = coveredBy(findings, exception.symbol, exception.path).length;
    const result = await runException({
      op: "remove",
      conceptId,
      symbol: exception.symbol,
      ...exception.path === void 0 ? {} : { previousPath: exception.path },
      occurrence: occurrenceOf(exceptionRemove.concept, exceptionRemove.index)
    });
    if (result === void 0) return;
    setExceptionRemove(null);
    setNotice({
      kind: "success",
      text: tf("state.exceptionRemoved", { count: mutes }),
      action: { label: t("action.undo"), run: () => {
        void restoreExceptions(conceptId, [exception]);
      } }
    });
  }, [exceptionRemove, findings, occurrenceOf, restoreExceptions, runException]);
  const openExceptionClear = (0, import_react4.useCallback)((concept) => {
    const count = (concept.accepted ?? []).length;
    if (count === 0) return;
    setExceptionClear({ concept, count });
  }, []);
  const confirmExceptionClear = (0, import_react4.useCallback)(async () => {
    if (exceptionClear === null) return;
    const conceptId = exceptionClear.concept.id;
    const removed = exceptionClear.concept.accepted ?? [];
    const result = await runException({ op: "clear", conceptId });
    if (result === void 0) return;
    setExceptionClear(null);
    setNotice({
      kind: "success",
      text: tf("state.exceptionsCleared", { count: removed.length }),
      action: { label: t("action.undo"), run: () => {
        void restoreExceptions(conceptId, removed);
      } }
    });
  }, [exceptionClear, restoreExceptions, runException]);
  const openAccept = (0, import_react4.useCallback)((finding) => {
    setAcceptTarget(finding);
    setAcceptReason("");
    setAcceptConceptId(defaultAcceptConcept(finding, concepts));
    const family = { kind: "family", custom: "" };
    const familyCount = coveredBy(findings, finding.symbol, scopePathFor(finding.path, family)).length;
    const fileCount = coveredBy(findings, finding.symbol, finding.path).length;
    setAcceptScope(familyCount > fileCount ? family : { kind: "file", custom: "" });
  }, [concepts, findings]);
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
        ...scopePathFor(acceptTarget.path, acceptScope) === void 0 ? {} : { path: scopePathFor(acceptTarget.path, acceptScope) },
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
  }, [acceptConceptId, acceptReason, acceptScope, acceptTarget, effectivePath, scanPath]);
  const issuesOfVocabulary = vocabulary?.issues ?? [];
  const vocabularyHealth = severityOf(issuesOfVocabulary);
  const invalid = vocabulary?.exists === true && vocabulary.valid === false;
  const renderDetail = () => {
    if (view.kind === "raw") {
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
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
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
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
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-empty", children: busy === "load" ? "\u2026" : t("state.loadFailed") });
    }
    if (!state.vocabulary.exists) {
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-empty-title", children: t("tree.empty") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { children: t("tree.emptyHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-form-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-primary",
              onClick: () => void createVocabulary(),
              disabled: busy !== null,
              children: t("action.init")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
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
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-concept-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-concept-id", children: t("detail.unclassified") }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-count", "data-tone": unclassified.length > 0 ? "warn" : void 0, children: unclassified.length })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-hint", style: { marginBottom: 12 }, children: t("detail.unclassifiedHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
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
    if (selectedConcept === void 0) return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(EmptyDetail, {});
    return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      ConceptDetail,
      {
        concept: selectedConcept,
        findings,
        showLow,
        onEdit: (concept) => {
          setEditorIssues([]);
          setView({ kind: "edit", concept });
        },
        onDelete: openDelete,
        onEditException: openExceptionEdit,
        onRemoveException: openExceptionRemove,
        onClearExceptions: openExceptionClear,
        muteCount: muteCountOf,
        onAccept: openAccept,
        onCopy: (text) => void copy(text)
      }
    );
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("style", { children: PANEL_CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("header", { className: "sd-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-title", children: t("panel.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-subtitle", title: effectivePath ?? "", children: [
          state?.workspace.title ?? "",
          state?.workspace.title !== void 0 ? " \xB7 " : "",
          effectivePath ?? t("state.noWorkspace")
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-spacer" }),
      (state?.workspaces.length ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "select",
        {
          className: "sd-select",
          value: effectivePath ?? "",
          onChange: (event) => selectWorkspace(event.target.value),
          title: auto ? t("auto.onHint") : t("auto.offHint"),
          children: [
            (state?.workspaces ?? []).map((workspace) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: workspace.path, children: workspace.title }, workspace.path)),
            effectivePath !== void 0 && !(state?.workspaces ?? []).some((workspace) => workspace.path === effectivePath) && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("option", { value: effectivePath, children: [
              effectivePath.split("/").filter((part) => part !== "").at(-1),
              " \xB7 ",
              t("auto.currentExtra")
            ] })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        "button",
        {
          type: "button",
          className: "sd-button sd-button-ghost sd-button-icon sd-mode-button",
          "data-mode": auto ? "following" : "pinned",
          title: auto ? t("header.following") : t("header.pinned"),
          "aria-label": auto ? t("header.following") : t("header.pinned"),
          "aria-pressed": !auto,
          onClick: toggleAuto,
          children: auto ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(FollowIcon, {}) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PinIcon, {})
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "button",
          {
            type: "button",
            className: "sd-button sd-button-icon",
            onClick: () => void scanPath(effectivePath ?? ""),
            disabled: busy !== null || effectivePath === void 0,
            title: busy === "scan" ? t("scan.scanning") : t("action.rescan"),
            "aria-label": busy === "scan" ? t("scan.scanning") : t("action.rescan"),
            children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: busy === "scan" ? "sd-spin" : void 0, style: { display: "inline-flex" }, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RefreshIcon, {}) })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "button",
          {
            type: "button",
            className: "sd-button sd-button-icon",
            onClick: () => {
              setEditorIssues([]);
              setView({ kind: "edit", concept: void 0 });
            },
            disabled: busy !== null || invalid || effectivePath === void 0,
            title: t("action.new"),
            "aria-label": t("action.new"),
            children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PlusIcon, {})
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "button",
          {
            type: "button",
            className: "sd-button sd-button-icon",
            onClick: () => {
              setView(view.kind === "raw" ? { kind: "browse" } : { kind: "raw" });
              setEditorIssues([]);
            },
            disabled: busy !== null || effectivePath === void 0,
            title: view.kind === "raw" ? t("action.done") : t("action.yaml"),
            "aria-label": view.kind === "raw" ? t("action.done") : t("action.yaml"),
            children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(CodeIcon, {})
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "button",
          {
            type: "button",
            className: "sd-button sd-button-ghost sd-button-icon",
            title: t("settings.title"),
            "aria-label": t("settings.title"),
            onClick: () => setSettingsOpen(true),
            children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(SettingsIcon, {})
          }
        )
      ] })
    ] }),
    scan === null && state?.vocabulary.exists === true && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-notice-dock", style: { paddingTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-notice", "data-kind": "info", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-notice-head", style: { alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "sd-notice-text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("strong", { children: t("scan.never") }),
        " \xB7 ",
        t("scan.neverHint")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "button",
        {
          type: "button",
          className: "sd-button",
          onClick: () => void scanPath(effectivePath ?? ""),
          disabled: busy !== null || effectivePath === void 0,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RefreshIcon, {}),
            t("action.rescan")
          ]
        }
      )
    ] }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "sd-detail", children: [
        invalid && view.kind !== "raw" && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-notice", "data-kind": "error", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-spread", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { children: [
              vocabularyHealth === "error" ? t("issue.title") : "",
              " ",
              vocabulary?.relativeFile
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
              "button",
              {
                type: "button",
                className: "sd-button",
                onClick: () => {
                  setView({ kind: "raw" });
                  setEditorIssues([]);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(CodeIcon, {}),
                  t("action.yaml")
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(IssueList, { issues: issuesOfVocabulary.filter((issue) => issue.severity === "error"), limit: 8 })
        ] }),
        renderDetail()
      ] })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-notice-dock", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      Notice,
      {
        notice,
        onDismiss: () => setNotice(null),
        ...notice.kind === "error" && state === null ? { onRetry: () => void load(requested ?? suggested) } : {}
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("footer", { className: "sd-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { children: [
        t("footer.concepts"),
        " ",
        concepts.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { children: [
        t("footer.drift"),
        " ",
        findings.length
      ] }),
      scan === null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: t("scan.never") }),
      scan !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { children: [
        t("footer.files"),
        " ",
        scan.summary.filesScanned
      ] }),
      scan !== null && scanAgeMs !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: tf("footer.scannedAgo", { age: ageText(scanAgeMs) }) }),
      scan !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "sd-muted", children: [
        t("footer.time"),
        " ",
        scan.summary.durationMs,
        " ms"
      ] }),
      scanExpired && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-warn", children: t("footer.scanExpired") }),
      scanVocabularyChanged && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-warn", children: t("footer.vocabularyChanged") }),
      scan?.summary.truncated === true && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { title: scan.summary.truncatedReason ?? "", children: [
        "\u26A0 ",
        t("footer.truncated")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-spacer" }),
      state !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "sd-meta", children: [
        "v",
        state.version
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "sd-button sd-button-ghost", onClick: () => void refresh(), disabled: busy !== null, children: t("action.rescan") })
    ] }),
    settingsOpen && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-backdrop", onClick: () => setSettingsOpen(false), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-dialog sd-settings", onClick: (event) => event.stopPropagation(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-title", children: t("settings.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-settings-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-settings-title", children: t("settings.local") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-name", children: t("settings.auto") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-hint", children: t("settings.autoHint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              className: "sd-switch",
              role: "switch",
              "aria-checked": auto,
              "aria-label": t("settings.auto"),
              onClick: toggleAuto,
              children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-switch-track", "data-on": auto, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-switch-knob" }) })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-row", "data-disabled": !auto, children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-name", children: t("settings.autoScan") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-hint", children: auto ? t("settings.autoScanHint") : t("settings.autoScanNeedsAuto") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              className: "sd-switch",
              role: "switch",
              "aria-checked": auto && autoScan,
              "aria-label": t("settings.autoScan"),
              disabled: !auto,
              onClick: () => setAutoScan((value) => !value),
              children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-switch-track", "data-on": auto && autoScan, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-switch-knob" }) })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-name", children: t("settings.scanRetention") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-hint", children: t("settings.scanRetentionHint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "sd-number",
              type: "number",
              min: 0,
              max: 1440,
              step: 1,
              value: scanRetentionMinutes,
              "aria-label": t("settings.scanRetention"),
              onChange: (event) => {
                const next = Number(event.target.value);
                setScanRetentionMinutes(Number.isFinite(next) ? Math.max(0, Math.min(1440, Math.round(next))) : 10);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-hint", children: t("settings.minutes") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-name", children: t("settings.notification") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-hint", children: t("settings.notificationHint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "sd-number",
              type: "number",
              min: 0,
              max: 600,
              step: 1,
              value: notificationSeconds,
              "aria-label": t("settings.notification"),
              onChange: (event) => {
                const next = Number(event.target.value);
                setNotificationSeconds(Number.isFinite(next) ? Math.max(0, Math.min(600, Math.round(next))) : 3);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-hint", children: t("settings.seconds") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-name", children: t("settings.showLow") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-hint", children: t("settings.showLowHint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              className: "sd-switch",
              role: "switch",
              "aria-checked": showLow,
              "aria-label": t("settings.showLow"),
              onClick: () => setShowLow((value) => !value),
              children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-switch-track", "data-on": showLow, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-switch-knob" }) })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-settings-section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-settings-title", children: t("settings.project") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-hint", children: t("settings.projectHint") }),
        (() => {
          const effective = state?.effective;
          const rows = effective === void 0 ? [] : [
            [t("settings.vocabularyPath"), effective.vocabularyPath],
            [t("settings.announceToAgent"), effective.announceToAgent ? t("settings.on") : t("settings.off")],
            [t("settings.citationStyle"), effective.citationStyle],
            [t("settings.minConfidence"), effective.minConfidence],
            [t("settings.budgets"), `${effective.timeoutMs} ms \xB7 ${effective.maxFindings} \xB7 ${Math.round(effective.maxFileBytes / 1024)} KB \xB7 ${effective.maxFiles}`],
            [t("settings.detectors"), effective.detectors.join(", ")]
          ];
          return rows.map(([name, value]) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-setting-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-main", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-setting-name", children: name }) }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-setting-value", title: value, children: value })
          ] }, name));
        })()
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "sd-button sd-button-primary", onClick: () => setSettingsOpen(false), children: t("settings.done") }) })
    ] }) }),
    deleteTarget !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-backdrop", onClick: () => setDeleteTarget(null), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-dialog", onClick: (event) => event.stopPropagation(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-title", children: t("delete.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-dialog-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-code", children: deleteTarget.id }),
        " \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-code", children: deleteTarget.canonical.symbol })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-body", children: t("delete.body") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-form-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
          "button",
          {
            type: "button",
            className: "sd-button sd-button-danger",
            onClick: () => void confirmDelete(),
            disabled: busy === "save",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(TrashIcon, {}),
              t("delete.confirm")
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "sd-button", onClick: () => setDeleteTarget(null), disabled: busy === "save", children: t("action.cancel") })
      ] })
    ] }) }),
    exceptionEdit !== null && (() => {
      const exception = exceptionEdit.concept.accepted?.[exceptionEdit.index];
      if (exception === void 0) return null;
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-backdrop", onClick: () => setExceptionEdit(null), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-dialog", onClick: (event) => event.stopPropagation(), children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-title", children: t("exception.editTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-hint", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-code", children: exception.symbol }),
          " \xB7 ",
          t("exception.symbolFixed")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          ScopeSelect,
          {
            anchor: exception.path ?? "",
            symbol: exception.symbol,
            findings: allFindings,
            value: editScope,
            onChange: setEditScope,
            originalPath: exception.path,
            originalCount: muteCountOf(exceptionEdit.concept, exceptionEdit.index)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { className: "sd-label", htmlFor: "sd-exception-reason", children: t("editor.acceptedReason") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            id: "sd-exception-reason",
            className: "sd-input",
            value: editReason,
            placeholder: t("editor.acceptedReasonHint"),
            onChange: (event) => setEditReason(event.target.value),
            onKeyDown: (event) => {
              if (event.key === "Enter") void submitExceptionEdit();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-form-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-primary",
              onClick: () => void submitExceptionEdit(),
              disabled: busy !== null || editReason.trim() === "",
              children: t("action.save")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "sd-button", onClick: () => setExceptionEdit(null), children: t("action.cancel") })
        ] })
      ] }) });
    })(),
    exceptionRemove !== null && (() => {
      const exception = exceptionRemove.concept.accepted?.[exceptionRemove.index];
      if (exception === void 0) return null;
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-backdrop", onClick: () => setExceptionRemove(null), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-dialog", onClick: (event) => event.stopPropagation(), children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-title", children: t("exception.removeTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-dialog-body", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-code", children: exception.symbol }),
          " \xB7 ",
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-mono", children: exception.path ?? "**" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-body", children: tf("exception.removeBody", { count: coveredBy(findings, exception.symbol, exception.path).length }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-form-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
            "button",
            {
              type: "button",
              className: "sd-button sd-button-danger",
              onClick: () => void confirmExceptionRemove(),
              disabled: busy !== null,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(TrashIcon, {}),
                t("action.remove")
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "sd-button", onClick: () => setExceptionRemove(null), children: t("action.cancel") })
        ] })
      ] }) });
    })(),
    exceptionClear !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-backdrop", onClick: () => setExceptionClear(null), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-dialog", onClick: (event) => event.stopPropagation(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-title", children: t("exception.clearTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-body", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-code", children: exceptionClear.concept.id }) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-body", children: tf("exception.clearBody", { count: exceptionClear.count }) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-form-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
          "button",
          {
            type: "button",
            className: "sd-button sd-button-danger",
            onClick: () => void confirmExceptionClear(),
            disabled: busy !== null,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(TrashIcon, {}),
              t("action.clearAll")
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "sd-button", onClick: () => setExceptionClear(null), children: t("action.cancel") })
      ] })
    ] }) }),
    acceptTarget !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-backdrop", onClick: () => setAcceptTarget(null), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-dialog", onClick: (event) => event.stopPropagation(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-dialog-title", children: t("detail.accepted") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-hint", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-code", children: acceptTarget.symbol }),
        " \xB7 ",
        acceptTarget.path,
        ":",
        acceptTarget.line
      ] }),
      acceptTarget.conceptId === void 0 && (concepts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "sd-hint", children: t("unclassified.noConcept") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-field", style: { gap: 5 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sd-hint", children: t("unclassified.pickConcept") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "select",
          {
            className: "sd-select",
            style: { maxWidth: "none", width: "100%" },
            value: acceptConceptId ?? "",
            onChange: (event) => setAcceptConceptId(event.target.value),
            children: concepts.map((concept) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("option", { value: concept.id, children: [
              concept.id,
              " \xB7 ",
              concept.canonical.symbol
            ] }, concept.id))
          }
        )
      ] })),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        ScopeSelect,
        {
          anchor: acceptTarget.path,
          symbol: acceptTarget.symbol,
          findings,
          value: acceptScope,
          onChange: setAcceptScope
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { className: "sd-label", htmlFor: "sd-accept-reason", children: t("editor.acceptedReason") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        "input",
        {
          id: "sd-accept-reason",
          className: "sd-input",
          value: acceptReason,
          placeholder: t("editor.acceptedReasonHint"),
          onChange: (event) => setAcceptReason(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter") void confirmAccept();
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sd-form-actions", children: [
        concepts.length === 0 && acceptTarget.conceptId === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
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
        ) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "button",
          {
            type: "button",
            className: "sd-button sd-button-primary",
            onClick: () => void confirmAccept(),
            disabled: busy === "accept" || acceptReason.trim() === "" || (acceptTarget.conceptId ?? acceptConceptId) === void 0,
            children: tf("accept.confirm", {
              count: coveredBy(findings, acceptTarget.symbol, scopePathFor(acceptTarget.path, acceptScope)).length
            })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "sd-button", onClick: () => setAcceptTarget(null), children: t("action.cancel") })
      ] })
    ] }) })
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

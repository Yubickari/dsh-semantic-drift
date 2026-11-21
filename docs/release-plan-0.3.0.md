# 0.3.0 发布方案（schema v1 收口版）

> **状态**：本地实现与测试完成（2026-11-21）；未提交 release PR、未打 tag、未发布 npm。
>
> **目标版本**：0.3.0（minor）。**0.3.1 不在计划内**；只有发布后出现阻断性 bug 才发 patch。
>
> **定位**：schema v1 的最后一个正式版本。v1 在本版冻结；v2 只做合同和 spike，不实现。
>
> **范围**：[#24](https://github.com/Yubickari/dsh-semantic-drift/issues/24)、[#22](https://github.com/Yubickari/dsh-semantic-drift/issues/22)、[#31](https://github.com/Yubickari/dsh-semantic-drift/issues/31)、[#26](https://github.com/Yubickari/dsh-semantic-drift/issues/26)、[#25](https://github.com/Yubickari/dsh-semantic-drift/issues/25)。
>
> **不在本版**：[#32](https://github.com/Yubickari/dsh-semantic-drift/issues/32)（0.4.0）、[#27](https://github.com/Yubickari/dsh-semantic-drift/issues/27)（backlog/0.4.x）、[#12](https://github.com/Yubickari/dsh-semantic-drift/issues/12)（0.4.0/0.5.0）。
>
> **兼容性**：词表仍是 `version: 1`，不迁移；5 个工具、9 个路由不变；CLI 是 `bin`，不是 DSH 路由。

## 0. 摘要

1. **#31**：`announceDetail` 默认改为 `compact`，显式 `full` 保留。
2. **#22**：概念增加可选 `lifecycle`（`planned | active | deprecated`，缺省 `active`），字段名按最终决定使用 `lifecycle` 而不是 `status`；`term-unmapped` 跳过非 active。
3. **#26**：`semantic_upsert` 支持 `concepts` 数组；逐条校验、逐条结果、一次原子写；`id-format` 附带建议 id；不自动改写。
4. **#25**：只读 CLI + `--changed`/`--all`/`--json`；`--changed` 是全量扫描后按变更路径过滤，不是只扫变更文件；附带 GitHub Actions 文档示例。
5. **#24**：冻结 v1，写出 v2 合同（bump 时机、reader 策略、迁移工具、备份、测试矩阵）；v2 仍是草案，不实现。
6. **0.2.2**：未发布的本地热修包含在 0.3.0；CHANGELOG 注明。

## 1. 范围与规模

| Issue | 变更 | 规模 | 风险 | 验收重点 |
|---|---|---|---|---|
| #24 | `docs/schema-evolution.md` + 版本 seam | S | 低 | v1 冻结；v2 合同；v2 文件被拒绝 |
| #22 | `lifecycle` 字段、工具、prompt、detector、面板 | M | 中 | 默认 active；planned/deprecated 跳过 term-unmapped；旧文件不变 |
| #31 | 默认 `compact` | S | 低 | 默认 compact；显式 full 不变；token 回归 |
| #26 | 批量 upsert + 原子写 + 建议 id | M | 中 | 12 条一次；坏条不影响好条；不自动写 |
| #25 | 只读 CLI / CI 示例 | M–L | 中 | 干净 0、发现 1、错误 2；`--changed` 正确性 |

预计 8–11.5 人日 + 发布缓冲。若 #25/#26 在冻结日前不能全绿，0.3.0 只发 #24/#22/#31，未完成项顺延 0.4.0；不推迟 v1 收口。

## 2. #22 `lifecycle` 最终口径

| 项 | 口径 |
|---|---|
| 字段 / 类型 | `lifecycle` / `ConceptLifecycle` |
| 值 | `planned \| active \| deprecated`；缺省 `active` |
| YAML | `lifecycle: planned`；`kind: status` 仍是概念种类，二者独立 |
| 序列化 | `active` 省略；非 active 写出；`parse(serialize(doc))` 幂等 |
| 工具入参 | `semantic_upsert.lifecycle`；batch item 同名字段 |
| merge / replace | merge 省略保留；replace 省略回 `active` |
| `semantic_list` | 只对非 active 输出 `lifecycle`；增加 `counts: { active, planned, deprecated }` 与 `returned` |
| `semantic_get` | 总是输出有效 lifecycle（含 `active`） |
| `semantic_upsert` / `semantic_accept` | 响应中的概念总是带有效 lifecycle |
| Prompt | 非 active 后缀 `[planned]` / `[deprecated]`；compact 同样 |
| `term-unmapped` | 跳过 `planned` + `deprecated` |
| 面板 | 编辑器 select、详情 badge、树行标记、树头生命周期摘要 |
| 非法值 | `lifecycle-invalid`，写前拒绝 |
| 旧版本 | 0.2.x 读到会忽略并在保存时丢掉；发布说明警告 |

**命名说明**：现场评估和 #22 原文用 `status`；最终字段名改为 `lifecycle`，避免与 `kind: status` 以及 v2 行为条目的计算状态混淆。历史文档保留当时的 `status` 表述，并在 [schema-evolution.md](schema-evolution.md) 注明。

## 3. #31 默认 compact

- `announceDetail` 默认 `compact`；显式 `full` 保留。
- 配置描述、两个 README、CHANGELOG 同步。
- 测试：默认 compact、显式 full、compact ≤ full 的 50%、200 行上限不变。
- 0.2.2 的 `/health`、`/state` 暴露生效 `announceDetail` 包含在 0.3.0。

## 4. #26 批量 upsert

- `semantic_upsert` 新增 `concepts` 数组；单条模式保留。
- 每项：`conceptId`、`terms`、`kind`、`symbol`、`symbolType`、`unit`、`lifecycle`、`note`；顶层 `mode` 应用于全部条目。
- 返回 `{ ok, created, updated, failed, results[], vocabularyFile }`；每项 `index`、`ok`、`code`、`message`、`issues`、`concept`。
- 一项失败不阻塞其他项；至少一项成功才写文件，一次原子写。
- 建议 id：`id-format` 的 `issues[].suggestion`；用现有 id 的常见 group 前缀 + snake_case；没有 group 时用 `domain.`；不自动写入。
- `defaultGroup` 不在 0.3.0；0.4.x 视数据再定。
- 服务层抽出 `upsertMany`，作为 v2 review 原子写的原语。

## 5. #25 CLI / CI

- 新入口 `src/cli.ts` → `lib/cli.js`；`package.json` 的 `bin`。
- flags：`--all`、`--changed`（默认）、`--base <ref>`、`--json`、`--root <dir>`、`--vocabulary <path>`、`--min-confidence`、`--detectors`、`--paths`、`--help`、`--version`。
- `--changed`：全量扫描 + 只报告 `path` 或 `detail.primaryPath` 在变更集中的发现；不是只扫变更文件。
- 变更集：`base...HEAD`、工作区 diff、index diff、未跟踪文件；默认 base `origin/main`，否则 `HEAD^`；没有 git 时退出 2 并提示 `--all`。
- 退出码：0 干净、1 发现、2 用法/运行错误；`--json` 同样。
- GitHub Actions 示例放在 [github-action.yml](github-action.yml)，不做 composite action。
- 无 watcher/daemon；不改 9 个 DSH 路由。

## 6. #24 schema 合同 / v2 准备

- 新建 [schema-evolution.md](schema-evolution.md)：v1/v2 决策表、bump 时机、reader 策略、`semantic_upgrade` 契约、备份、校验矩阵。
- 版本 seam：`normalizeDocument` / `serializeVocabulary` / `saveVocabulary` 以 `document.version` 为准；`SUPPORTED_VOCABULARY_VERSIONS = [1]`；v2 文件被 `version-unsupported` 拒绝。
- roadmap：行为基础 → 0.4.0，审核闭环 → 0.5.0。
- 两个 README 增加 schema 版本表并链接新文档；CONTRIBUTING 写清 v1 冻结、v2 bump、降级警告。
- `semantic_upgrade`、`behaviors`、函数指纹、迁移注册表均不实现；spike 单独开 issue，不进 0.3.0。

## 7. 验收清单

### 版本与发布

- [ ] `package.json`、`VERSION`、CHANGELOG 三处 0.3.0。
- [ ] `lib/` 重建并提交；`lib/cli.js` 在 npm pack 中。
- [ ] 词表仍写 `version: 1`；旧文件直接可用；无迁移。
- [ ] 5 tools / 9 routes 不变；CLI 是 bin。
- [ ] 0.2.2 未发布，包含在 0.3.0 说明中。
- [ ] 全库无 stale 0.3.1 计划引用（历史记录注明除外）。

### #22

- [ ] 省略/planned/active/deprecated/非法值矩阵。
- [ ] 序列化省略 active；planned/deprecated 写出；幂等。
- [ ] `semantic_list` 非 active + counts；`semantic_get` 总是。
- [ ] prompt 非 active 标记；compact 同样。
- [ ] `term-unmapped` 跳过 planned + deprecated。
- [ ] 面板编辑器/详情/树标记/摘要；中英文 key 同步。
- [ ] 旧版本降级警告写入 README/CHANGELOG。

### #31 / #26 / #25

- [ ] 默认 compact；显式 full；token 回归。
- [ ] 12 条一次创建；1 条坏、11 条成功；suggestion 有测试；无自动写入。
- [ ] CLI 干净 0 / 发现 1 / 错误 2；`--changed` 变更路径过滤；JSON 结构；<5 s 目标。
- [ ] Action 示例 YAML 可解析，不需要 secret。

## 8. 时间表（建议）

| 日期 | 任务 | 退出条件 |
|---|---|---|
| 11-22/23 | 计划文档、issue/roadmap 同步 | 范围冻结 |
| 11-24–12-04 | #31 → #22 → #26 → #25 实现与测试 | 每项测试绿、文档同步 |
| 12-05 | 冻结、`pnpm test` / `build` / `release:check` | 全绿；`lib/` diff 已提交 |
| 12-08 | tag、npm、GitHub release、干净 profile 验收 | npm/GitHub/health/CLI 四项通过 |

## 9. Issue / 文档更新映射

| 对象 | 动作 |
|---|---|
| #22 | 标题/正文/验收 `status` → `lifecycle`；补 tool/panel/counts/降级 |
| #24 | 验收改为 v1 freeze + v2 合同；链接 schema-evolution |
| #25 | `--changed` 语义改为“全量扫描 + 变更路径过滤”；补退出码/JSON |
| #26 | 批量形状、suggestion、defaultGroup 延后 |
| #32 | target 0.4.0；补 `announceSource` 需求 |
| #27 | target backlog/0.4.x；0.4.x 可先做最小 JSON 导出 |
| #28 | 评论更新映射 |
| #12 | target 0.4.0 / 0.5.0 |
| release-plan-0.2.1 §9 | 加 2026-11-21 修订：删 0.3.1；#32/#27 重新安置 |

## 10. 风险

- **#25 正确性**：只扫变更文件会漏跨文件发现；本方案用全量扫描 + 过滤，性能不达标时优化索引，不牺牲正确性。
- **#22 降级丢字段**：0.2.x 保存会丢 `lifecycle`；发布说明警告，不做版本 bump。
- **#26 部分成功**：结果必须按 index 报告；测试覆盖坏条不影响好条。
- **工具 schema token**：`lifecycle`/batch 参数增加固定成本；默认 compact 的节省应大于增量，发布前测一次净变化。
- **档期**：若 #25/#26 未在冻结日前完成，按切版规则只发核心三项。


## 11. 本地验证记录（2026-11-21）

- `pnpm test`：203 个测试通过（含 lifecycle、batch、CLI、docs、UI）。
- `pnpm build`：`lib/index.js`、`lib/client.js`、`lib/cli.js` 均为 0.3.0。
- `pnpm release:check`：preflight 通过；npm pack 19 个文件包含 `lib/cli.js`。
- `node lib/cli.js scan --root . --all --json --detectors symbol-variant,term-unmapped`：69 个文件 / 107 ms / 0 发现；CLI 可在本仓库自扫描。
- 项目词表已登记 `concept.lifecycle` / `ConceptLifecycle`（`.dsh/semantics.yaml`）。
- 未打 tag、未发布 npm、未修改 GitHub issue；这些在评审后执行。
- 新增文档：[cli.md](cli.md)、[upgrading-to-0.3.0.md](upgrading-to-0.3.0.md)，README/CHANGELOG 已链接。

## 12. 本地提交拆分（建议）

| 提交 | 内容 |
|---|---|
| `docs(schema): freeze v1 and record the v2 draft` | schema-evolution、roadmap 改号、0.2.1 plan 修订、field evaluation 注记 |
| `feat(schema): add the version seam and concept lifecycle` | protocol/store/service + lifecycle/store/service 测试 |
| `feat(tools): expose lifecycle and batch upsert` | tools/define-tool + fiber 测试 |
| `feat(prompt): mark lifecycle and skip non-active terms` | prompt/term-unmapped + 测试 |
| `feat(client): edit and display concept lifecycle` | 面板组件、locales、styles + UI 测试 |
| `feat(config): default announceDetail to compact` | config + service/config-page 测试 |
| `feat(cli): add the read-only scan gate` | cli、build/preflight、CLI 测试、cli.md、Actions 示例 |
| `docs(0.3.0): release plan, upgrade notes and README sync` | release plan、upgrading、READMEs、CONTRIBUTING、CHANGELOG |
| `chore(release): 0.3.0 manifest and rebuilt artifacts` | package.json、VERSION、lib/* |
| `chore(vocabulary): record concept.lifecycle` | `.dsh/semantics.yaml` |

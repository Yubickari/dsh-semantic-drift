# 0.2.1 发布方案

> **状态**：已发布（2026-11-12）。原计划 11-13，实际提前一天完成。
>
> **发布结果**：npm `dsh-semantic-drift@0.2.1` 为 `latest`；GitHub release `v0.2.1`；Release workflow 绿。
>
> **目标版本**：0.2.1（patch）。
>
> **目标日期**：2026-11-13（周五）；2026-11-14（周六）作为缓冲。
>
> **范围**：两个 P0、S 规模、无词表格式变更、无工具 schema 变更。
>
> **关联**：[现场评估](field-evaluation-2026-11.md) · [#28 跟踪 issue](https://github.com/Yubickari/dsh-semantic-drift/issues/28)

---

## 0. 摘要

1. 0.2.1 只收 **#21（默认排除项）** 和 **#23（紧凑提示）**，不夹带 #22、#24、#25、#26、#27、#12。
2. 默认行为不变：`announceDetail` 默认 `full`，词表仍是 `version: 1`，5 个工具 schema 不变；现有词表文件不受影响。
3. 发布路径：计划 PR（已完成）→ release PR（#21 + #23 + 依赖 + 版本号 + CHANGELOG + `lib/`）→ tag `v0.2.1` → npm / GitHub release → 干净 profile 验收。为了本周发布，实现与版本收口合并为一个 release PR；#21 / #23 的验收项不变。
4. 两个 dependabot PR 纳入 0.2.1：**#19 已合并**；#18 在 #19 之后出现 lockfile 冲突，改为把 `jsdom` 31.0.0 并入 release PR，原 PR 关闭为 superseded。
5. 后续版本建议见 §9：0.3.0 收口命名层，0.4.0 / 0.5.0 做行为漂移。

---

## 1. 为什么是 patch

- **#21** 是默认值/夹具修正：新词表少读包缓存、少误报；不改变已有词表的 `exclude`。
- **#23** 是可选配置：默认 `full`，只有显式切换才走 `compact`；不改词表格式、不改工具 schema。
- 两项都不要求用户迁移，也不改变现有 API 的返回形状，符合 0.2.x patch 的边界。

---

## 2. 范围

| Issue | 变更 | 规模 | 风险 | 发布价值 |
|---|---|---|---|---|
| [#21](https://github.com/Yubickari/dsh-semantic-drift/issues/21) | 默认排除项补 `.nuget/**`、`artifacts/**`、`.tmp/**`、`TestResults/**`、`BenchmarkDotNet.Artifacts/**` | S | 低 | 全量扫描 17.4 MB / 647 ms → 150 KB / 49 ms；包缓存误报消失 |
| [#23](https://github.com/Yubickari/dsh-semantic-drift/issues/23) | `announceDetail: full \| compact`，默认 `full` | S | 低–中 | 48 概念注入段 9,362 → 约 3,000 字符（约 −68%） |
| [#18](https://github.com/Yubickari/dsh-semantic-drift/pull/18) / [#19](https://github.com/Yubickari/dsh-semantic-drift/pull/19) | `@deepseek-ai/schemastery` 3.19.0 + `jsdom` 31.0.0 | S | 低 | 依赖与 lockfile 一次更新；#18 原 PR 关闭为 superseded |

两项 P0 加依赖更新，都不触碰词表 schema。

---

## 3. 非目标

| Issue | 为什么不在 0.2.1 | 目标 |
|---|---|---|
| #22 概念状态 | 新增词表字段，需要 #24 的 schema 计划与更多测试 | 0.3.0 |
| #24 schema 计划 | 决策文档，不是 patch；先定 v1 / v2 边界 | 0.3.0 |
| #25 CLI / CI | M 规模，涉及新入口与 Action 示例 | 0.3.0 |
| #26 批量 upsert | M 规模，工具 API 变更 | 0.3.0 |
| #27 指标导出 | P2，可等命名层收口后做 | 0.3.1 |
| #12 行为漂移 | L 规模，且需要 v2 schema | 0.4.0 / 0.5.0 |

---

## 4. 实施细节

### 4.1 #21 默认排除项

**代码**

- `src/store.ts` 的 `DEFAULT_EXCLUDES` 增加五项；`.git/**` 已有根路径与 `**/.git/**` 两种写法，新的目录按同样风格选择根路径或 `**/` 前缀。
- `emptyVocabulary()` 继续把 `DEFAULT_EXCLUDES` 写进新词表；现有词表的 `exclude` 不自动改写。

**测试**

- `test/store.test.ts`：空词表的 `exclude` 包含新项；显式 `exclude` 仍原样保留。
- `test/scan.test.ts`：带包缓存 / 构建产物目录的 fixture 不产生发现；扫描文件数不包含这些目录。
- 如果现有 fixture 依赖旧列表，更新期望值，不放宽断言。

**文档**

- README.md / README.zh.md 的“词表文件”小节：在示例后用一句话列出默认排除项，并说明“只影响新建词表；已有词表需要手动补”。
- 不在示例 YAML 里堆五条，保持示例可读。

**验收**

- [ ] 新词表默认包含五项；已有词表文件不被改写。
- [ ] 包缓存 fixture 扫描 < 1 s，且没有来自缓存的发现。
- [ ] `exclude` 的用户覆盖仍然有效。
- [ ] 两个 README 的说法一致。

### 4.2 #23 紧凑提示

**代码**

- `src/config.ts`：新增 `announceDetail: z.union(['full', 'compact']).default('full').volatile().description(...)`。
- `src/service.ts`：`SemanticConfig` 增加 `announceDetail: 'full' | 'compact'`。
- `src/prompt.ts`：`conceptLines(file, detail)`；`full` 保持现有 `id (kind) -> symbol: note`，`compact` 只输出 `id -> symbol`。200 行上限、120 概念折叠不变。
- `src/client/locales.ts`：中英文各加一条 `config.field.announceDetail`。
- 不新增工具 schema；不改变 `StateResponse` 的 wire 形状（字段表通过 `GET /config` 暴露，值由 DSH 的 config form 写入）。

**测试**

- `test/service.test.ts`：`Config.dict` 字段数从 10 → 11；`config()` helper 加默认值；`liveConfig` 默认 `full`。
- `test/config-page.test.mjs`：表单字段从 9 → 10（隐藏 `announceToAgent` 后 8 → 9）；enum select 从 2 → 3；`CONFIG` fixture 与 locale key 断言更新。
- 新增 `test/prompt.test.ts`（或扩 `test/fiber.test.ts`）：同一词表下 `full` 输出与 0.2.0 一致；`compact` 字符数 ≤ full 的 50%；两者都不超过 200 行。
- `test/locales.test.ts` 会检查中英文键同步；两边都加。

**文档**

- README.md / README.zh.md 配置表加一行 `announceDetail`；Token 成本小节加一句 compact 的估算；说明默认 `full`。
- CHANGELOG 0.2.1 写“新增可选配置，默认行为不变”。

**验收**

- [ ] 默认 `full`，相同词表输出与 0.2.0 逐字一致。
- [ ] compact ≤ full 的 50%，且不改变 200 行上限 / 折叠规则。
- [ ] 配置页出现新字段，中英文标签齐全。
- [ ] 词表格式、工具 schema、扫描结果形状不变。

### 4.3 依赖更新（#18 / #19）

- **#19** 已合并：`@deepseek-ai/schemastery` 3.18.5 → 3.19.0。
- **#18** 在 #19 合并后出现 `pnpm-lock.yaml` 冲突；0.2.1 直接把 `jsdom` 30.1.3 → 31.0.0 纳入 release 分支，`pnpm install` 重新生成 lockfile；原 dependabot PR 关闭为 superseded。
- 不新增运行时代码；只改 `package.json` 与 `pnpm-lock.yaml`。

**验收**

- [ ] `package.json` 为 `~3.19.0` / `^31.0.0`。
- [ ] `pnpm test` 在 Node 22.18 与 24 通过。
- [ ] `pnpm install --frozen-lockfile` 在 CI 通过。

---

## 5. 兼容性与回滚

- 词表仍为 `version: 1`；不新增必填字段，不迁移。
- 5 个工具 schema 不变；`/state`、`/scan` 的返回形状不变。
- `announceDetail` 默认 `full`；旧配置读取时落到默认值。
- 已有词表的 `exclude` 不被改写；#21 只影响新建词表。
- `lib/` 必须重建并提交；release workflow 会跑 `git diff --exit-code -- lib`。
- 回滚：不 unpublish；发 0.2.2 修复，或在 GitHub release 标注问题；代码 revert 走正常 PR。

---

## 6. 发布检查清单

- [ ] 计划 PR 合并，范围冻结。
- [ ] #21 的验收项在 release PR 中通过（默认排除 fixture）。
- [ ] #23 的验收项在 release PR 中通过（full / compact 与配置页）。
- [ ] `package.json` 为 `@deepseek-ai/schemastery ~3.19.0` 与 `jsdom ^31.0.0`，lockfile 已更新。
- [ ] release PR CI 绿。
- [ ] `pnpm test` 通过（Node 22.18 与 24）。
- [ ] `pnpm build`，`lib/` diff 已提交。
- [ ] `package.json`、`src/index.ts` 的 VERSION、CHANGELOG 三处都是 0.2.1。
- [ ] release PR 合并，tag 目标就是 release commit。
- [ ] `git tag -a v0.2.1 -m "0.2.1"`，push tag。
- [ ] Release workflow 绿；npm 上出现 0.2.1；GitHub release 生成。
- [ ] 干净 profile 安装：`dsh plugin --profile <name> add dsh-semantic-drift@0.2.1`。
- [ ] `GET /semantic-drift/health` 报 5 tools、9 routes；面板能扫描。
- [ ] 关闭 #21、#23；在 #28 记录发布链接。

### 6.1 CHANGELOG 草稿

```markdown
## 0.2.1

A small patch for scan hygiene and prompt cost.

- **Default excludes now skip package caches and common build artifacts.**
  `.nuget`, `artifacts`, `.tmp`, `TestResults` and `BenchmarkDotNet.Artifacts`
  are pruned by default for newly created vocabularies. Existing vocabulary
  files keep their own `exclude` list.
- **New `announceDetail: full | compact` setting.** `compact` drops the note
  text from the injected vocabulary section; the default stays `full`, so the
  prompt is unchanged unless the setting is switched.
- Dependencies: `@deepseek-ai/schemastery` 3.19.0 and `jsdom` 31.0.0.
- No vocabulary format change: `version: 1` files stay valid, and the five tool
  schemas are unchanged.
```

---

## 7. 本周时间表

| 日期 | 任务 | 退出条件 |
|---|---|---|
| 11-11（周三） | 计划 PR；release 分支起步（#21） | 计划合并；#21 代码 + 测试完成 |
| 11-12（周四） | #23 代码 + 测试 + 文档；依赖更新；release PR 打开 | CI 绿；或决定只发 #21 |
| 11-13（周五） | 合并 release PR；tag；发布；验收 | npm / GitHub / health 三项通过 |
| 11-14（周六） | 缓冲、公告、issue 收尾 | 无未处理的 release 阻塞 |

**切版规则**：如果 #23 在周四结束前还不能全绿，0.2.1 只发 #21；#23 顺延到 0.2.2。不要为了赶周五把 #22 或 schema 变更塞进来。

---

## 8. 依赖 PR（#18 / #19）

| PR | 变更 | 处理 |
|---|---|---|
| [#19](https://github.com/Yubickari/dsh-semantic-drift/pull/19) | `@deepseek-ai/schemastery` 3.18.5 → 3.19.0 | 已合并到 main；0.2.1 使用 3.19.0 |
| [#18](https://github.com/Yubickari/dsh-semantic-drift/pull/18) | `jsdom` 30.1.3 → 31.0.0（dev） | 因 #19 后 lockfile 冲突，改动并入 0.2.1 release 分支；原 PR 关闭为 superseded |

两项都纳入 0.2.1；`pnpm install` 统一生成 lockfile，CI 在 Node 22.18 / 24 上验证。这样既拿到依赖更新，又不把两个 dependabot PR 的 rebase 拖到发布前。

---

## 9. 后续版本建议

### 9.1 建议排期

| 版本 | 建议窗口 | 范围 | 退出条件 |
|---|---|---|---|
| 0.2.1 | 已发布 11-12 | #21 + #23 + #18 / #19 依赖 | 本文件的验收清单 |
| 0.2.2 | 本地 hotfix（未发布） | health / state 暴露生效中的 `announceDetail` | 本地验证通过；不打 tag、不发 npm |
| 0.3.0 | 12 月上旬（2–3 周） | #24 计划、#22 status、#25 CLI / CI、#26 批量 upsert、#31 `announceDetail` 默认 `compact` | v1 可选字段生效；CI 门禁能拦变体；批量创建可用；默认提示块走 compact |
| 0.3.1 | 12 月中下旬 | #27 指标导出、#32 首次创建词表时的注入选择 | 可选导出可用；新工作区首次建词表时有一次明确的注入选择 |
| 0.4.0 | 1 月（3–4 周） | 行为漂移基础 + v2 schema + `semantic_upgrade` | 迁移 dry-run / apply 成功；20 个 watch 函数 < 2 s |
| 0.5.0 | 2 月（2–3 周） | 行为审核闭环 + dogfooding | roadmap 7.7 指标达标 |
| 1.0.0 | 3 月后 | 稳定化 | 至少 4–6 周真实 dogfooding；v2 不再 breaking |

### 9.2 与现有 roadmap 的编号冲突

`docs/behavior-drift-roadmap.md` 把行为基础放在 0.3.0、审核闭环放在 0.4.0。**已采纳（2026-11-11，暂定）**：行为基础顺延到 0.4.0，审核闭环到 0.5.0；0.3.0 留给命名层（#22、#25、#26）。roadmap 的版本号在 0.3.0 开工前同步。

如果之后想回到原编号，替代方案仍是：0.3.0 做行为基础，#22 / #25 / #26 顺延到 0.3.x——代价是命名层晚一个版本。当前按前一种执行。

### 9.3 版本节奏原则

- **patch**：只做修复和**默认不变**的小配置；不碰 schema。
- **minor**：可以加可选字段 / 工具，但必须有迁移说明和默认关闭 / 默认不变的路径。
- 行为漂移只在 v2 上线，且 opt-in；1.0 前至少一个版本的真实 dogfooding。

### 9.4 体验与 token 优化（2026-11-12 新增）

- **0.3.0 / #31：`announceDetail` 默认改为 `compact`。** 显式 `full` 保留；只影响从未设置过该字段的配置。依据：同一个 63 概念词表，compact 3,110 字符，full 6,883 字符（45%）。验收：默认 compact；full 仍可用；配置页、两个 README 与 CHANGELOG 同步；测试覆盖默认与显式 full。
- **0.3.1 / #32：首次创建词表时询问是否启用注入。** 工作区没有词表、也没有 `announceByWorkspace` 覆盖时，在创建流程里给出一次选择：启用（当前默认）/ 关闭；说明 token 成本，并指向 compact。选择复用现有 `announceByWorkspace`；取消时保留默认并照常创建。验收：首次出现；两种选择都写入 override；取消不阻塞；中英文、可访问、UI 测试。
- 两项都不改词表格式；#31 是 minor 的默认值变化，#32 是面板引导，都不进 patch。

---

## 10. 已确认

- [x] 0.2.1 已发布（npm / GitHub `v0.2.1`）。
- [x] #31 `announceDetail` 默认 `compact`，排入 0.3.0。
- [x] #32 首次创建词表时的注入选择，排入 0.3.1。
- [x] 0.2.1 范围 = #21 + #23 + #18 / #19 依赖。
- [x] #22 / #24 / #25 / #26 统一放到 0.3.0。
- [x] 行为漂移按 0.4.0 / 0.5.0 顺延（暂定）。
- [x] #19 已合并；#18 随 0.2.1 纳入，原 PR 关闭。

---

## 11. 参考

- [现场评估](field-evaluation-2026-11.md)
- [行为漂移 roadmap](behavior-drift-roadmap.md)
- [CONTRIBUTING](../CONTRIBUTING.md)（版本、发布、隐私规则）
- #21、#23、#24、#28

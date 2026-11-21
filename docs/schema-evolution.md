# 词表 schema 演进（v1 冻结 / v2 草案）

> **状态（2026-11-21）**
> - **v1 已冻结**：0.3.0 是 schema v1 的最后一个正式版本，之后只修 bug，不再加字段。
> - **v2 仍是草案**：本文的 v2 部分用于提前准备，不是定稿；0.3.0 不实现任何 v2 代码。
>
> 关联：[#24](https://github.com/Yubickari/dsh-semantic-drift/issues/24)、[#22](https://github.com/Yubickari/dsh-semantic-drift/issues/22)、[#12](https://github.com/Yubickari/dsh-semantic-drift/issues/12)；发布范围见 [release-plan-0.3.0.md](release-plan-0.3.0.md)。

## 1. 为什么现在冻结 v1

0.2.x 的词表已经够用：一个文件、一个 `version: 1`、`concepts` 列表。0.3.0 补齐最后一个可选字段 `lifecycle` 后，继续往 v1 加字段的收益越来越小，而每次加字段都要考虑旧插件读到新文件时“忽略并在保存时丢掉”的兼容成本。把 v1 停在 0.3.0：

- 用户知道这一版之后格式稳定，不会再有小的格式迁移；
- 0.4.0 的行为漂移可以在一个明确的 v1 → v2 边界上设计，而不是边实现边改格式；
- 旧插件读 v1 的行为可以固定下来，作为 v2 迁移说明的基线。

## 2. v1 / v2 决策表

| 项 | v1（0.3.0 冻结） | v2（0.4.0 起，草案） |
|---|---|---|
| `version` | `1` | `2` |
| `concepts[]` | 现有字段 + 可选 `lifecycle` | 保留，不重命名、不改变语义 |
| `lifecycle` | `planned \| active \| deprecated`，缺省 `active` | 保留；行为条目可以引用概念的生命周期 |
| `behaviors` | 不出现 | 顶层可选列表；字段草案见 §4 |
| bump 时机 | — | 第一次持久化 behavior 时（推荐），不是打开开关时 |
| v2 reader 读 v1 | — | 直接读，内存补 `behaviors: []`；不强制迁移 |
| v2 reader 读 v2 | — | 读；旧插件读到 v2 报 `version-unsupported` |
| 迁移工具 | 不实现 | `semantic_upgrade` dry-run / apply；契约见 §5 |
| 回滚 | — | 恢复 `.dsh/.backup/` 的备份；反向改版本会丢 v2 数据，不作为默认 |
| 旧插件兼容 | 0.2.x 读含 `lifecycle` 的 v1：忽略该键，保存时丢掉 | 旧插件读 v2：拒绝，不丢数据 |

**降级警告**：0.3.0 的 `lifecycle` 是 v1 的可选字段。0.2.x 旧插件读到它会当未知键忽略，并在下一次保存时从文件中删掉。升级到 0.3.0 后不要降级再保存；需要回退时先备份词表。

## 3. v2 的 bump 时机（草案，倾向已定）

| 方案 | 行为 | 判断 |
|---|---|---|
| 打开 behaviors 开关就 bump | 文件立刻变成 v2 + 空 `behaviors` | 会让还没写任何 behavior 的用户被旧插件锁在外面；迁移早、回滚难 |
| **第一次持久化 behavior 时 bump（推荐）** | v1 文件保持到第一条 watch/propose/confirm 落盘；该次写入原子地加 `behaviors` + `version: 2` | 命名-only 用户永不升级；没有 v2 数据时旧插件仍可读；回滚成本最低 |
| 永不 bump，v1 + 可选 `behaviors` | 不升版本 | 旧插件保存时会静默丢掉 `behaviors`，数据丢失；不可接受 |

推荐语义：

- 配置里的 `behaviors.enabled` 可以与文件版本解耦：开关打开但还没有 behavior 时，文件仍是 v1。
- 第一次写入 behavior（watch / propose / confirm 任意一条持久化条目）时，在一个原子操作里完成迁移和写入；迁移后旧插件会明确拒绝，而不是丢字段。
- `semantic_upgrade` 允许用户提前手动升级，但不是使用 v2 的前置条件。

## 4. v2 数据模型草案（未定稿）

以下字段名和形状来自 [behavior-drift-roadmap.md](behavior-drift-roadmap.md) §4，仅用于提前发现命名冲突；落地前必须按项目词表规则登记。

```yaml
version: 2

concepts:
  - id: device.target_temperature
    # 现有字段不变；lifecycle 保留

behaviors:
  - id: device.target_temperature.apply
    conceptId: device.target_temperature        # 可选；有则校验存在
    path: src/Device/TemperatureController.cs   # 工作区相对 posix
    symbol: ApplyTargetTemperature
    signature: "void ApplyTargetTemperature(double value)"
    summary: >-
      Clamps the requested temperature to the device's supported range;
      rejects NaN; writes the setpoint.
    fingerprint: sha256:9f2c...
    confirmedAt: 2026-11-07
    confirmedReason: "spec: reject NaN"
    review:                                     # 仅待确认时存在
      kind: changed                             # changed | unchanged
      summary: "..."
      fingerprint: sha256:7a1d...
      changes: ["boundary > became >="]
      rationale: "..."
      citations: ["src/Device/TemperatureController.cs:42"]
      intent: "..."
```

**明确不落盘**：`confirmed / stale / review / missing / ambiguous` 这些行为状态由“指纹是否变化 + 是否有 review + 定位结果”现算，不存 `status`。这也是概念字段最终命名为 `lifecycle` 而不是 `status` 的原因之一：`kind: status` 是概念种类，行为状态是计算值，三者不要混。

**命名待登记**：`behaviors`、`watch`、`summary`、`proposal`、`review`、`verdict`、`intent`、`fingerprint`。0.3.0 只登记 v1 的 `concept.lifecycle`；v2 词在 0.4.0 动工前再登记。

## 5. `semantic_upgrade` 契约（草案）

- 工具名 `semantic_upgrade`；路由 `POST /semantic-drift/upgrade`；面板读到旧版本时显示升级横幅。
- `dryRun` 默认 `true`；返回 `from`、`to`、`changes`、`requiresHuman`、原文与 unified diff。
- v1 → v2 是加法迁移：补 `behaviors: []`（或按首个 behavior 写入）、改 `version`；`requiresHuman` 为空。
- apply 前用 YAML `Document` AST 保留注释；写前校验、写后重新解析；原子写。
- 备份：默认写 `.dsh/.backup/semantics-<timestamp>.yaml`；允许 `backup: false`；文档说明可 gitignore。
- 回滚：恢复备份；反向迁移（删 behaviors、改回 `version: 1`）会丢 v2 数据，不作为默认。
- 模型只处理 `requiresHuman` 的迁移，不生成迁移代码。
- 0.3.0 只写契约，不实现；0.4.0 有真实迁移对象后再落地，不建空迁移框架。

## 6. 校验与测试矩阵

| 文件 | 期望 |
|---|---|
| v1，无 `lifecycle` | 合法；全部视为 `active` |
| v1，有 `lifecycle: planned` | 合法；`term-unmapped` 跳过；prompt/list 标记 |
| v1，有非法 `lifecycle` | 写入前拒绝，`lifecycle-invalid` |
| v2，无 `behaviors` | 合法（空列表语义）；旧插件拒绝 |
| v2，有 `behaviors` | 合法；行为工具可用 |
| 混合：v1 概念 + v2 behaviors | 非法版本/结构；拒绝并给版本提示 |
| 旧插件读 v2 | `version-unsupported`，提示先升级插件 |
| v2 读 v1 | 直接读，内存补空 behaviors；版本保持 1 直到首写/显式升级 |

0.3.0 只实现第一、二、三行（v1 部分）和版本拒绝；v2 行在 0.4.0 实现。

## 7. 还待拍板的 v2 问题

1. `behaviors` 是否允许为空列表、是否在 v2 文件中省略空列表。
2. `.dsh/.backup/` 是否默认启用，还是只返回原文让调用方保存。
3. `semantic_upgrade` 的 `requiresHuman` 在 v1→v2 为空是否足够；未来哪些迁移需要模型判断。
4. 行为条目的 `id` 是否强制与 concept id 同前缀，还是只要求唯一。
5. 是否需要在 0.4.0 提供“只升级版本、不写 behavior”的显式命令（当前设计允许 `semantic_upgrade` 这样做）。

这些问题不影响 0.3.0；在 0.4.0 设计评审时定稿。

# 行为漂移（#12）实现计划

> **状态**：计划中，尚未实现。0.2.0 只交付 #14（概念 id 可改名）与 #15（多级概念树），本文件规划 #12 及后续版本。
>
> **关联**：GitHub issue #12「函数与执行逻辑的漂移处理」；本文件同时记录 2026-11-07 的版本讨论结论。
>
> **性质**：规格、排期与验证方案，不是实现。落地前先读第 2 节的代码基线，再按第 8 节的里程碑推进。

---

## 0. 结论摘要

1. **#12 不是给现有扫描器加一个检测器，而是新增一个“行为词表”子系统。** 它需要函数定位、指纹、提案存储、人工审核和 schema v2；现有扫描器只提取类型声明，且刻意保持确定性、只读、无 LLM。
2. **v1 采用 Agent 工具驱动，不让插件自己直连 `ctx.llm`。** 当前会话的模型负责总结与比对；插件只做确定性索引、存储和展示。这样不重复 DSH 的模型配置，也不承担“model-visible ⟺ logged”的精确请求日志成本。
3. **先确定性、后概率性。** “函数是否变了”由代码指纹判断；“行为是否变了”由 Agent 提出 proposal；“是否符合需求变化”由人在面板里确认。三者不能混成一个自动判定。
4. **先 C#、先 watch 的函数。** 不做全仓库函数索引，不做跨函数调用图，不做自动改代码，不做需求管理系统。
5. **行为功能 opt-in，默认关闭。** 词表升到 v2（只加空的 `behaviors:`），工具、路由、prompt、面板 section 在关闭时不出现；命名-only 用户零负担。
6. **验证仓库是前置条件。** 需要三类仓库：提交进仓库的合成 fixture、公开 OSS 参考仓库、维护者提供的真实迭代仓库。没有真实迭代仓库，可以验证提取与摘要，但无法可靠校准“需求变化”的判断。
7. **建议排期**：2–3 天 spike → 0.3.0 行为基础（10–14 人日）→ 0.4.0 审核闭环（8–12 人日）→ 1.0.0 前至少一个版本的真实 dogfooding。完整 v1 约 5–7 周（单人，含 spike、测试、文档、发布与校准缓冲；不含长期调参）。

---

## 1. 背景、目标与非目标

### 1.1 背景

0.1.x / 0.2.0 解决的是**词汇对齐**：同一业务概念在数据库、后端、客户端、协议、文档里被写成不同名字。词表记录“它应该叫什么”，扫描器找出“哪里写得不一样”。

issue #12 把目标推进一层：**行为对齐**。同名函数在迭代中可能改变了边界条件、副作用、错误行为或顺序；字段比对看不出来。kurapica（SchemaNode 作者）的建议是：

> 用 AI 把同名函数的实际执行逻辑（副作用、边界条件等）总结为一段“语义描述”存进词表；版本迭代时不仅比对字段，还能比对函数行为的偏差；偏差较大的由人工确认是否符合新的需求变化。

这就是本计划要落地的方向：**从“词汇对齐”走向“行为对齐”**。

### 1.2 目标

- 把一个被观察函数的**契约级语义**总结成一段可版本化的描述，存入词表。
- 代码变化后，确定性地发现“指纹变了 / 符号找不到 / 重载歧义”。
- 让 Agent 对比“已确认描述 + 新代码 + 变更上下文”，提出行为差异的 proposal。
- 让人在面板里确认：接受行为变化、确认无行为变化、或拒绝；每个决定带理由。
- 保持现有承诺：扫描只读、词表是唯一状态、写入前校验、面板与工具同一套规则。

### 1.3 非目标（v1 明确不做）

| 不做 | 原因 |
|---|---|
| 全仓库函数索引 / 全量摘要 | token 成本不可控，且大部分函数与业务概念无关；先显式 watch |
| 跨函数调用图、执行路径、工作流级语义 | 需要调用图和更大上下文，属于下一阶段；v1 按函数单元 |
| 自动修改代码 / 自动重命名 / 自动修复 | 与“只读扫描、人工裁决”的信任前提冲突 |
| 需求管理系统 / PR 集成 | 需求意图由 git diff、PR、issue 或人工备注提供；不在插件里重建一套 |
| 插件内直连模型 API（v1） | 见第 3 节；Agent 工具驱动已能满足“调用大模型能力” |
| 让 Agent 直接改已确认的 summary | Agent 只能写 proposal；确认是人 |
| 自动确认“符合需求” | 这是人的判断，不是模型的 |

### 1.4 成功判据（v1）

- 7 个合成用例中至少 6 个判断正确；3 个真实行为变化（边界、副作用、异常）**一个都不能漏**。
- 公开参考仓库上，被 watch 的函数 ≥90% 能被定位；歧义/跳过 ≤5%；20 个 watch 函数的扫描 < 2 秒。
- 同一函数两次独立摘要，人工判断核心契约等价 ≥8/10。
- 10 条 proposal 中 ≥7 条被人工认为“有用”；单条审核中位时间 < 60 秒。
- 除词表副本外零写入；参考仓库不被修改、不被提交；跟踪文件不出现私有项目名或绝对路径。

---

## 2. 0.2.0 后的代码基线

| 模块 | 现状 | 对 #12 的含义 |
|---|---|---|
| 词表 | `.dsh/semantics.yaml`，`version: 1`，只允许 `concepts` | 需要 v2 的 `behaviors` 与迁移 |
| 存储 | 单一写入口、写前校验、原子写、按文件串行队列 | 需要“队列内 load → mutate → validate → write”的原子变更，供审核使用 |
| 扫描 | 只读、确定性、预算/超时/截断；只提取类型声明 | 需要新的函数定位与指纹，不能混进现有 detector 语义 |
| 工具 | 5 个：`semantic_list/get/upsert`、`drift_scan`、`semantic_accept` | 需要少量行为工具，控制工具描述 token |
| 面板 | 左树 + 右详情 + 漂移列表 + 原始 YAML | 需要行为 section 与待确认队列 |
| 提示 | 注入概念列表与命名规则，200 行预算 | 需要一段简短行为规则，但**不要**注入全部摘要 |
| LLM | 插件不调用模型 | v1 由 Agent 调用工具；插件侧零模型依赖 |

关键代码位置：

- id 格式与词表版本：[`src/store.ts`](../src/store.ts#L47)、[`src/protocol.ts`](../src/protocol.ts#L25)
- 类型扫描入口：[`src/scan/symbol-table.ts`](../src/scan/symbol-table.ts#L472)
- 写入队列：[`src/store.ts`](../src/store.ts#L518)、[`src/store.ts`](../src/store.ts#L602)
- 工具注册：[`src/tools.ts`](../src/tools.ts#L24)
- 面板概念树：[`src/client/ConceptTree.tsx`](../src/client/ConceptTree.tsx)

**重要**：0.2.0 没有改数据模型，也没有动 `.dsh/semantics.yaml`。本计划里的 v2 字段尚未实现。

---

## 3. 架构决策

### 3.1 三层分工

```
确定性层（插件）             概率性层（Agent）             裁决层（人）
─────────────────           ─────────────────            ─────────────
watch 登记                  读代码/摘要/对比              接受行为变化
函数定位 + 指纹             写 proposal                   确认无行为变化
changed/missing 扫描        引用代码行                    拒绝并写理由
                            读 git diff / 需求上下文
```

- **确定性层**保证“哪段代码变了”可复现、可测试、零模型成本。
- **概率性层**只处理“这段变化意味着什么”，输出永远是 proposal，不是事实。
- **裁决层**决定 proposal 是否成为新的已确认描述；理由进入词表。

### 3.2 Agent 工具驱动 vs 插件内 `ctx.llm`

| | Agent 工具驱动（推荐） | 插件内 `ctx.llm` |
|---|---|---|
| 模型来源 | 当前会话的模型 | 插件自己配置 provider/model |
| 调用日志 | 读文件、工具调用天然在会话日志里 | 需自行满足 `model-visible ⟺ logged`，补 purpose、请求记录 |
| 配置 | 无新增模型配置 | 需要 provider/model、凭据、超时、重试、限额 |
| 成本控制 | 由 Agent 上下文与工具输出限额控制 | 需插件自己计量与限流 |
| 自动化 | Agent 触发（或未来子代理） | 可按钮/后台触发 |
| 实现量 | 中 | 大（约多 1–2 周） |
| 失败模式 | Agent 不遵守流程 | 与 DSH 模型层重复、日志不完整、配置漂移 |

**v1 结论**：走 Agent 工具驱动。插件仍然是“给人和 Agent 一个裁决的地方”，而不是第二个模型客户端。
如果以后确实需要“面板一键分析、不依赖会话”，再把 `ctx.llm` 作为可选自动化模式，单独评估。

### 3.3 opt-in 与降级

- 新增配置 `behaviors.enabled`（默认 `false`）。关闭时：不注册行为工具、不挂行为路由、prompt 不提行为、面板不显示行为 section。
- 词表仍是 v2（只多一个空 `behaviors:`）；这不会影响命名-only 用户，但老版本插件读到 v2 会拒绝编辑，所以迁移与发版说明必须一起做。
- 行为功能不依赖任何可选服务；Agent 不可用时，确定性扫描与人工编辑仍可用。

---

## 4. 数据模型（schema v2）

### 4.1 草案

```yaml
version: 2

concepts:
  - id: device.target_temperature
    # ... 现有字段不变 ...

behaviors:
  - id: device.target_temperature.apply
    conceptId: device.target_temperature        # 可选；有则校验存在
    path: src/Device/TemperatureController.cs   # 工作区相对路径，posix
    symbol: ApplyTargetTemperature
    signature: "void ApplyTargetTemperature(double value)"  # 重载消歧
    summary: >-
      Clamps the requested temperature to the device's supported range;
      rejects NaN; writes the setpoint and raises TemperatureChanged only
      when the value actually changes.
    fingerprint: sha256:9f2c...                 # 规范化后的签名 + 函数体
    confirmedAt: 2026-11-07
    confirmedReason: "spec: reject NaN, keep equal-value no-op"
    review:                                     # 仅待确认时存在
      kind: changed                             # changed | unchanged
      summary: >-
        Same clamp, but the boundary is now >=, so an equal value also
        raises TemperatureChanged.
      fingerprint: sha256:7a1d...
      changes:
        - "boundary > became >="
        - "event now raised on equal value"
      rationale: "The diff changes the comparison and moves the emit call."
      citations:
        - "src/Device/TemperatureController.cs:42"
      intent: "Spec update: equal setpoints must refresh the UI"
      proposedAt: 2026-11-08
```

### 4.2 字段与规则

| 字段 | 必填 | 规则 |
|---|---|---|
| `id` | ✅ | 词表内唯一；建议与概念 id 同前缀；不能与 concept id 冲突 |
| `conceptId` | ❌ | 若存在，必须指向一个 concept |
| `path` | ✅ | 工作区相对 posix 路径；拒绝 `..`、绝对路径、workspace 外路径 |
| `symbol` | ✅ | 普通标识符；函数/方法名 |
| `signature` | 建议 | 重载必须填；定位时用于消歧 |
| `summary` | ✅（已确认时） | 契约级描述，3–6 句；不是实现步骤 |
| `fingerprint` | ✅（已确认时） | `sha256:<hex>`；由插件计算，Agent 不可伪造 |
| `confirmedAt` / `confirmedReason` | ✅（已确认时） | 接受时必须带理由 |
| `review` | ❌ | Agent 写入的 proposal；人确认后删除 |
| `review.kind` | ✅（有 review 时） | `changed` 或 `unchanged` |
| `review.changes` | ❌ | 人类可读的变更点列表，面板优先展示 |
| `review.rationale` / `citations` | ✅（有 review 时） | 为什么这样判断；至少一条代码引用 |
| `review.intent` | ❌ | 需求/变更上下文；来自 PR、commit 或人工备注 |

**不落盘的状态**：`confirmed / stale / review / missing / ambiguous` 全部由“指纹是否变化 + 是否有 review + 定位结果”现算。不要存 `status` 字段，否则会与事实不一致。

### 4.3 review 生命周期

| 当前 | 事件 | 结果 |
|---|---|---|
| 无条目 | Agent watch | 创建条目，无 summary/fingerprint，状态 `unsummarized` |
| `unsummarized` | Agent propose（带 `expectedFingerprint`） | 写入 `review`，状态 `review` |
| `review` | 人接受变化 | `summary = review.summary`，更新指纹，写 `confirmedAt/Reason`，删 `review` |
| `review`（`kind: unchanged`） | 人确认无变化 | 保留旧 summary，只更新指纹，写 `confirmedAt/Reason`，删 `review` |
| `review` | 人拒绝 | 删 `review`，保留旧 summary/指纹；状态回到 `stale`，可再次发起 |
| `confirmed` | 代码变化 | 指纹不匹配 → `stale`；Agent 扫描后生成新 proposal |
| 任意 | 符号找不到 / 重载歧义 | `missing` / `ambiguous`；不猜，交给人/Agent 修复 |

**关键**：`unchanged` 不是“没做事”。重构、抽方法、改名会改变指纹但行为不变；没有这条快速路径，每次重构都会产生一条待审，功能很快会被关掉。

### 4.4 校验（写前）

- `id` 唯一；`conceptId` 若存在必须存在；`path` 必须在 workspace 内且为相对 posix。
- `path + symbol + signature` 组合不得重复。
- `summary` 非空且有长度上限（建议 4 KB）；`review.changes` 每条有上限。
- `review` 必须带 `rationale` 和至少一条 `citations`；`kind: changed` 必须带 `summary`。
- `fingerprint` 格式校验；Agent 提交的 `expectedFingerprint` 必须与当前计算值一致，否则返回 `stale-read`。
- 迁移/保存仍走同一个 store；不新增第二套写路径。

### 4.5 为什么仍然放一个文件

项目原则是“单一真相”：词表是唯一状态。行为条目放同一个 YAML：

- 优点：版本化、diff 可审、面板/工具/提示共享同一份数据、迁移只有一个入口。
- 代价：文件会变大；`review` 会让 diff 变吵。用“确认后删除 review”和“不要注入全部摘要”控制。
- 备选（不推荐 v1）：独立 `behaviors.yaml`。它会引入第二个 store、第二套迁移和第二套权限，违背 P1；只有在文件真的过大时再评估。

---

## 5. 工作流

1. **watch**：人/Agent 指定 `path + symbol`（重载加 signature）。插件定位函数，计算指纹，创建条目（无 summary）。
2. **summarize**：Agent 读当前代码，按固定 rubric 写 summary；提交时带 `expectedFingerprint`。
3. **confirm**：人在面板接受（可编辑摘要）或拒绝；接受必须写理由。
4. **change**：代码迭代。插件不主动后台扫描；`behavior_scan` 由 Agent 或面板触发。
5. **detect**：确定性扫描返回 `changed / missing / ambiguous`；changed 携带新指纹、行号、可选摘要片段。
6. **compare**：Agent 读新代码、已确认 summary、`git diff`/PR/需求备注；生成 `changed` 或 `unchanged` 的 proposal。
7. **review**：面板显示旧摘要 vs 新摘要、变更点、理由、引用、需求上下文；人接受/拒绝。
8. **accept**：更新 summary/fingerprint/confirmedAt/Reason；删除 review。下一次扫描以新指纹为基线。

### 5.1 需求上下文从哪来

模型只能判断“行为变了”；“是否符合需求变化”需要意图。来源按优先级：

1. `review.intent`：人工在审核时填写，或 Agent 从 PR/issue 粘贴；
2. `git log`/`git diff` 的 commit message；
3. PR 描述；
4. 没有上下文时，proposal 明确写“intent unknown”，人只做行为确认，不假装判断需求。

**不要**为这件事建需求库或 PR 集成；v1 只存一段可选文本。

### 5.2 重命名、移动、缺失

- v1 不做自动跨文件匹配。符号找不到 → `missing`，人/Agent 手动更新 `path/symbol`。
- 同一文件内重载：`path + symbol + signature` 定位；仍歧义 → `ambiguous`，不猜。
- 文件移动且符号仍在：Agent 更新 path；指纹不变则不用改 summary。
- 局部函数、生成代码、属性访问器、构造函数：v1 默认跳过，明确报 `skipped`，不静默忽略。

---

## 6. 技术设计

### 6.1 函数定位与指纹

**首批语言：C#。** 理由：插件现有类型解析对 C# 最强，维护者的验证样例也是 .NET 生态；TS/Python 在 0.4.x 后续补。

复用现有 `maskSource`（注释/字符串屏蔽）与 `findMatchingBrace`，新增 `extractFunctions`：

- 识别方法/函数声明：修饰符、返回类型、名称、参数、泛型约束、表达式体、属性/事件（v1 跳过）。
- 用花括号配对取函数体；表达式体取到分号。
- 用参数列表生成 `signature`，用于重载消歧。
- 跳过：生成文件、局部函数、嵌套函数、抽象/接口声明、无法配对的声明；计入 `skipped`。
- Python 后续版用缩进取块；TS 后续版处理函数声明、类方法、箭头函数。

**指纹**：

```
fingerprint = sha256(
  normalize(signature) + "\n" +
  normalize(maskedCode.slice(open, close))
)
```

- `normalize`：统一换行、压空白、去空行；注释已在 mask 阶段去掉。
- 字符串字面量是否计入：v1 **不计入**（`maskSource` 会把字符串置空）。这意味着日志/错误文案变化不触发“行为变化”；如果团队认为错误文案是行为，后续加 `literalHash` 并单独展示。
- 格式化、纯注释、空白变化 → 指纹不变。
- 局部变量改名 → 指纹变；由 Agent 判断 `unchanged` 并人工确认。v1 不做语义等价归一化（成本高、易误判）。

**边界**：

- 重载：同文件多个同名声明，选有函数体的实现；签名匹配失败报 `ambiguous`。
- 分部方法：取实现部分；只有声明则 `skipped`。
- 表达式体：取 `=>` 到 `;`；跨行时按括号/分号配对。
- 文件大小/函数大小：超过配置上限不读/截断，报 `too-large`，不猜。
- 并发：读取文件前记录 mtime/size；返回指纹；propose 时重算，不一致拒绝。

### 6.2 工具面

控制在 **2–3 个新工具**，避免工具描述 token 膨胀：

| 工具 | 作用 |
|---|---|
| `behavior_scan` | 确定性扫描：changed/missing/ambiguous；可带 `paths`、`maxItems`；不调模型 |
| `semantic_behavior` | `op: list/get/watch/propose`；get 返回条目 + 当前指纹 + 是否变化；propose 写 review，要求 `expectedFingerprint` |
| （可选）`behavior_candidates` | 后续：按概念符号/公开方法推荐 watch 候选，形成“未 watch 债务”指标 |

工具约束：

- `propose` 永远只写 `review`，不写 `summary/fingerprint/confirmedAt`；工具描述必须写明“人确认后才生效”。
- 返回结构化 JSON；失败用 `ok:false + code`，不抛异常。
- `behavior_scan` 默认最多 5–10 条，超出 `truncated`；单函数代码片段默认不回传，Agent 用现有读文件工具读；`get` 可带 `includeSource` 返回有界片段。
- 不新增 detector id；行为扫描与现有 `drift_scan` 分开，保持命名漂移的确定性语义。

### 6.3 服务、路由与并发

- Service 增加 `behaviorScan`、`behaviorGet/List`、`behaviorPropose`、`behaviorConfirm`。
- 路由建议：
  - `GET /semantic-drift/behaviors?workspace=`：条目 + 现算状态（只读 watched 函数所在文件）。
  - `POST /semantic-drift/behaviors/confirm`：接受/拒绝/确认无变化；带 `reason`。
  - （可选）`POST /semantic-drift/behaviors/scan`：面板刷新状态。
- 所有写操作走 store；新增 `mutateVocabulary(root, path, mutator)`：**在写队列内** load → mutate → validate → write，避免现有“先算文本再入队”的 last-write-wins（见 [`src/store.ts`](../src/store.ts#L602)）。
- 确认前重算指纹：proposal 的 `fingerprint` 与当前函数不一致 → `stale`，拒绝应用，提示重新扫描。
- 权限：沿用 workspace 授权；`path` 必须在 workspace 内；不读 workspace 外文件。

### 6.4 面板

- **概念详情**增加“行为”section：watch 的函数、确认状态、最近确认时间、理由；未关联 concept 的行为放在“未关联行为”分组。
- **全局待确认入口**：header 上“待确认 (N)”按钮，打开队列；每条显示：
  - 函数 `symbol` + `path:line`；
  - 旧 summary vs 新 summary（或 `unchanged` 的“行为未变”标记）；
  - `changes[]`、`rationale`、`citations`、`intent`；
  - 状态徽标：`stale / review / missing / ambiguous`；
  - 操作：**接受变化**、**确认无变化**、**拒绝**；接受/拒绝都必须填理由。
- **代码不内嵌完整查看器**：给引用与复制按钮；与现有面板“复制引用”一致。需要看代码时，人/Agent 用编辑器或文件工具。
- **批量**：v1 不做批量接受；避免一次点错改掉多条。
- **空态**：未开启行为功能时不显示；开启但无 watch 时给“如何 watch”的说明（Agent 工具/未来表单）。

### 6.5 Prompt

- 只加一段 5–8 行规则，不注入所有摘要：
  - 改一个被 watch 的函数前，先 `semantic_behavior get` 读已确认摘要；
  - 改完代码后 `behavior_scan`，按 rubric 总结并 `propose`；
  - 永远不要把 proposal 说成“已确认”；
  - 判断“行为是否变化”时引用具体代码行；需求意图未知就写 unknown。
- 摘要 rubric（写进工具描述/提示）：
  1. 意图：这个函数保证什么；
  2. 输入与边界；
  3. 输出/返回语义；
  4. 副作用（写库、事件、I/O、外部调用）；
  5. 失败行为（异常/错误码）；
  6. 顺序/并发/幂等不变量。
- 不写实现步骤（“先赋值再 if”），只写契约。

### 6.6 迁移 v1 → v2

- `VOCABULARY_VERSION = 2`；v1→v2 迁移是**加法**：补 `behaviors: []`，改 `version`。
- 迁移注册表：`Map<fromVersion, Migration>`，每个迁移是纯函数；当前版本只跑一次；高于当前版本 → 拒绝并提示升级插件。
- `semantic_upgrade` 工具 + `POST /semantic-drift/upgrade` 路由：
  - 默认 `dryRun: true`，返回 `from/to/changes/requiresHuman`；
  - apply 前用 YAML `Document` AST 保留注释（加法迁移可保留），写前校验，写后重新解析；
  - 写 `.bak` 备份（或返回原文让调用方保存；二选一，需拍板）；
  - 人工确认后 apply；模型只处理 `requiresHuman`，不生成迁移代码。
- 面板：读到旧版本时显示“需要升级”横幅与 diff；升级后刷新。
- 老版本插件读 v2 会报 `version-unsupported`；发版说明写清楚“先升级插件，再升级词表”。

### 6.7 安全、性能、成本

- **只读参考**：行为扫描只读；唯一写入是当前 workspace 的词表。
- **路径**：`path` 必须是 workspace 内相对路径；拒绝绝对路径、`..`、符号链接逃逸。
- **限额**：`maxFunctionBytes`（默认 8 KB）、`maxBehaviors`（默认 200）、`maxScanItems`（默认 10）、`maxSummaryBytes`（4 KB）。
- **不缓存源码**：只缓存定位结果（path+mtime+span），有界；指纹现算。
- **token**：不注入全部摘要；扫描默认不回传完整函数体；提案最多 10 条/次。
- **失败**：定位失败、超限、歧义都返回结构化状态，不静默跳过。

---

## 7. 验证仓库选型（前置条件）

### 7.1 为什么需要

“行为是否变化”没有编译器级别的真值，必须用**已知变更**校准。单靠插件自己的单元测试只能证明代码路径，不足以证明摘要高度合适、误报可接受。验证仓库是**裁判**，不是设计依据：规则不能从某一个仓库反推，只能用它检验通用规则。

### 7.2 三类仓库，各司其职

| 角色 | 放哪 | 用途 | 是否提交 |
|---|---|---|---|
| **合成 fixture** | `test/fixtures/behavior/`（插件仓库内） | 7 个已知用例，确定性回归；无私有名 | ✅ 提交（小、可审） |
| **公开 OSS 参考仓库** | 临时副本（`.tmp/` 或仓库外） | 真实 C# 代码的函数定位覆盖率、指纹稳定性、性能 | ❌ 不提交；记录 URL + commit |
| **维护者真实迭代仓库** | 只读副本（临时目录） | “需求变化”校准：真实重构 vs 真实行为变化 | ❌ 不提交；只回传聚合结果 |

**私有仓库的硬规则**：只读；不提交、不 push、不建分支；不把项目名、路径、代码片段写进插件仓库、issue、PR 或提交信息；结果只写在本机 `.local/` 或 `/tmp`，并注明不得外传。需要维护者明确授权。

### 7.3 选型标准

| 维度 | 要求 | 理由 |
|---|---|---|
| 语言 | **C# / .NET 优先**；后续 TS/Python | 插件现有解析最强，首批实现成本最低 |
| 规模 | 2+ 项目/模块；50–500 个函数；20+ public 方法 | 足够覆盖跨 module、重载、可见性；又不至于扫描过慢 |
| 历史 | ≥10 次提交，含重构与真实行为变化 | 需要“变了但行为没变”和“行为真的变了”两类样本 |
| 可读性 | 有测试/README/PR 描述（可选） | 帮助判断意图 |
| 许可/授权 | 公开仓库需 OSI 许可；私有仓库需书面/明确许可 | 合规 |
| 生成代码 | 不占主导；有则用于验证跳过逻辑 | 避免噪声 |
| 机密 | 无密钥、无客户数据；私有仓库需脱敏 | 安全 |
| 构建 | 不要求可构建；可构建更好 | 提取只需源码，意图判断可参考测试 |

**不选**：超大 monorepo（>2000 文件，首批成本高）、以代码生成/IL weaving 为主的仓库、语法高度非典型的仓库（首批先覆盖常见 C#）。

### 7.4 需要维护者提供什么

1. **仓库路径或克隆 URL**，以及分支/commit（固定版本，避免校准过程漂移）。公开参考仓库可以由你直接指定，也可以由我按 7.3 的标准给出 1–2 个候选（固定 commit），你确认后再用。
2. **使用许可**：公开仓库给 license；私有仓库给“可只读用于本地校准、结果可聚合”的确认。
3. **3–5 个已知变更**（最重要）：
   - 变更前 commit、变更后 commit；
   - 函数（path + symbol）；
   - 预期判断：`behavior changed` / `unchanged`；
   - 需求意图（如果知道）：为什么改、对应哪个需求/PR。
4. **构建/测试命令**（可选）：帮助 Agent 获取意图上下文。
5. **结果落地位置**：本机 `.local/` 或 `/tmp`；是否允许私有名出现在该本机文件里。
6. **不能提供的部分**：明确说“没有真实迭代仓库”；则用公开仓库 + 合成用例先跑，但“需求变化”校准标为风险，不假装完成。

### 7.5 怎么用（不改参考仓库）

1. 复制/克隆到临时目录（不直接在原仓库跑写操作）。
2. 在副本里创建 `.dsh/semantics.yaml`（v2），watch 10–20 个函数。
3. 跑定位覆盖率：found / ambiguous / skipped / too-large；抽样 20 个人工核对。
4. 对 7 个合成用例跑指纹与提案；记录 verdict。
5. 对 3–5 个真实变更跑 Agent 摘要/对比；记录 proposal 与人工判断。
6. 汇总报告：指标、匿名化例子、go/no-go；不提交参考仓库代码。
7. 结束后删除副本（或保留在 `.tmp/`，gitignored）。

### 7.6 校准用例（合成 fixture）

| # | 变更 | 期望 |
|---|---|---|
| F1 | 只改注释/格式 | 指纹不变，不产生 proposal |
| F2 | 局部变量改名 | 指纹变；proposal 应为 `unchanged`（或可接受的低噪声） |
| F3 | 抽方法，行为等价 | 指纹变；proposal `unchanged` |
| F4 | 边界 `>` → `>=` | proposal `changed`，引用该行 |
| F5 | 新增副作用（写库/发事件） | proposal `changed`，列出副作用 |
| F6 | 异常类型/错误码变化 | proposal `changed` |
| F7 | 日志/错误文案变化 | 默认 `unchanged`（字符串不计入指纹）；记录为产品决策 |

F2/F7 是“产品口味”用例：如果团队认为局部变量改名或错误文案也算行为，调整归一化或 rubric，而不是让模型猜。

### 7.7 验收指标

| 指标 | 目标 |
|---|---|
| 合成用例判断 | ≥6/7；F4–F6 不得漏 |
| 定位覆盖率（公开仓库） | ≥90%；ambiguous+skipped ≤5% |
| 指纹稳定性 | 格式/注释变更 0 误报 |
| 摘要稳定性 | 两次独立摘要，核心契约等价 ≥8/10 |
| 审核有用率 | ≥7/10 proposal 被认为有用 |
| 审核时间 | 中位 <60 秒/条 |
| 性能 | 20 个 watch 函数扫描 <2 秒 |
| 写入 | 参考仓库 0 修改；只有词表副本变化 |

---

## 8. 里程碑与排期

### 8.1 先做 spike（2–3 人日，go/no-go）

- 建 7 用例 fixture（C#，3 个版本或 3 组文件）。
- 原型：C# 函数定位 + 归一化指纹，覆盖 F1–F7。
- 让两个独立 Agent 各摘要一遍，人工判断摘要等价性；再让 Agent 对 F1–F7 出 verdict。
- 产出 1 页结论：定位覆盖率、指纹误报、摘要稳定性、是否继续。

**不通过就停**：退回到“概念级行为备注”（在 concept 上加一段行为说明，不做函数级），或只保留确定性“函数变更提醒”，不做 LLM 判断。

### 8.2 0.3.0：行为基础（10–14 人日）

范围：

- v2 schema + 校验 + v1→v2 迁移 + `semantic_upgrade`（终于给 #15 的迁移工具一个真实迁移）。
- C# 函数定位/指纹；watch/list/scan 工具。
- 面板：行为列表/详情；**人工填写/编辑摘要**（不依赖 LLM）。
- opt-in 配置；`mutateVocabulary` 原子写。
- 测试/fixture/文档。

退出条件：确定性 changed/missing/ambiguous 正确；迁移 dry-run/apply 成功；命名-only 用户除一次词表升级外无感；20 个 watch 函数扫描 <2 秒。

### 8.3 0.4.0：Agent 提案与审核闭环（8–12 人日）

范围：

- `semantic_behavior propose` + 指纹并发校验 + `review` 生命周期。
- 面板待确认队列：接受变化/确认无变化/拒绝 + 理由。
- prompt 规则与摘要 rubric；`behavior_scan` 返回有界上下文。
- 真实参考仓库校准；修误报/噪声。

退出条件：第 7.7 节指标达标；审核理由必填；proposal 不进入 confirmed。

### 8.4 1.0.0：稳定

- 至少一个版本周期的真实项目 dogfooding；
- 误报率、审核疲劳、token 成本可接受；
- 再决定是否扩展 TS/Python、跨函数流程、host-side 自动分析。

### 8.5 总工作量

| 阶段 | 人日 |
|---|---|
| spike | 2–3 |
| 0.3.0 | 10–14 |
| 0.4.0 | 8–12 |
| 校准/文档/发布缓冲 | 3–5 |
| **合计** | **23–34 人日（约 5–7 周）** |

如果只做 MVP（C#、最小审核 UI、合成 fixture，不做真实仓库校准）：约 11–14 人日（2–3 周），但“需求变化”判断的置信度低，需在发布说明里写清楚。

---

## 9. 风险与对策

| 风险 | 后果 | 对策 |
|---|---|---|
| 摘要高度不对 | 太细→每次重构都报；太粗→漏真实变化 | 固定 rubric（契约/副作用/边界/失败）；spike 校准；F2/F3 允许 `unchanged` |
| 函数定位覆盖不足 | 关键函数 watch 不上 | 先 C#；明确 `ambiguous/skipped`；不猜；逐步补语法 |
| 审核疲劳 | 用户关掉功能 | opt-in；只 watch 关键函数；`unchanged` 快速路径；changes[] 优先；不内嵌大段代码 |
| token 成本 | Agent 上下文被代码淹没 | 不回传完整函数体；maxItems/maxBytes；只扫变化 |
| 误报/漏报 | 信任崩塌 | 确定性指纹 + 人确认；proposal 必须引用代码行；用参考仓库校准 |
| Agent 不按流程 | 直接改 summary 或说“已确认” | 工具只写 review；store 拒绝 Agent 写 confirmed；prompt 明确 |
| schema v2 兼容 | 老插件不能编辑 | 迁移工具 + 发版说明 + dry-run；备份 |
| 并发丢写 | 面板/工具互相覆盖 | `mutateVocabulary` 队列内读改写；确认前重算指纹 |
| 需求意图缺失 | 只能判断“变了”，不能判断“该不该变” | `intent` 可选；未知就写 unknown；人做最终判断 |
| 私有仓库泄露 | 合规风险 | 不提交、不写 issue；结果只在本机；聚合/匿名化 |

---

## 10. 待拍板

1. **LLM 路径**：Agent 工具驱动（推荐）还是插件内 `ctx.llm`？
2. **首批语言**：C#（推荐）还是 C# + TS/Python 一起？
3. **watch 范围**：显式 watch（推荐）还是按目录/公开方法批量？
4. **审核入口**：概念详情 + 全局待确认（推荐）还是独立页面？
5. **需求上下文**：只存 `intent` 文本（推荐），还是接 git/PR？
6. **schema 字段名**：`behaviors` / `summary` / `review` 是否就是最终命名？落地前应按项目词表规则登记。
7. **备份策略**：迁移写 `.bak` 还是只返回原文？
8. **字符串字面量**：错误/日志文案算不算行为（影响指纹与 F7）？
9. **opt-in 默认值**：0.3.0/0.4.0 默认关闭，1.0 再考虑默认开启？

---

## 11. 本次讨论记录（2026-11-07）

- 用户确认三条 issue 的难度排序：#14 < #15 < #12；0.2.0 先做 #14 + #15，**不改 schema**。
- #15 的第三条“YAML 升级工具”被拆出：多级 id 不需要迁移；迁移工具挂到 #12 的 v2 schema，才有真实迁移对象。0.2.0 不做空框架。
- #12 本轮只做计划文档，不实现。计划内容包括实现路径、架构选择、数据模型、工具/面板/prompt、迁移、验证仓库选型、排期与风险。
- 验证仓库被明确为前置条件：需要维护者提供**测试用仓库或可用于参考的真实仓库**；合成 fixture、公开 OSS、私有迭代仓库三类分工；私有仓库只读、不提交、结果聚合。
- 推荐路线：2–3 天 spike → 0.3.0 行为基础（确定性 + 人工摘要）→ 0.4.0 Agent 提案与审核 → 1.0.0 dogfooding。
- 明确不做：把 #12 塞进 0.2.0；先建空迁移框架；v1 插件直连 `ctx.llm`；Agent 自动确认“符合需求”。

---

## 12. 参考

- issue #12: <https://github.com/Yubickari/dsh-semantic-drift/issues/12>
- issue #14: <https://github.com/Yubickari/dsh-semantic-drift/issues/14>
- issue #15: <https://github.com/Yubickari/dsh-semantic-drift/issues/15>
- SchemaNode（思想来源）: <https://github.com/kurapica/schema-node-csharp>
- 当前词表格式与校验：[`src/protocol.ts`](../src/protocol.ts)、[`src/store.ts`](../src/store.ts)
- 类型扫描：[`src/scan/symbol-table.ts`](../src/scan/symbol-table.ts)、[`src/scan/index.ts`](../src/scan/index.ts)
- 工具与路由：[`src/tools.ts`](../src/tools.ts)、[`src/routes.ts`](../src/routes.ts)
- 面板：[`src/client/Panel.tsx`](../src/client/Panel.tsx)、[`src/client/ConceptTree.tsx`](../src/client/ConceptTree.tsx)
- 贡献规则（不得出现真实项目名/绝对路径）：[`CONTRIBUTING.md`](../CONTRIBUTING.md)

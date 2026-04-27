# Agent K8s Goal

## 一句话叙事

Agent K8s 是面向开发者的 Agent 集群编排控制面：用几行代码启动、调度、观察、取消、重试一批 Agent，让它们并行完成任务，并通过结构化产物继续流转。

它的长期目标不是再做一个聊天界面，也不是只提供一个 sandbox，而是把 Agent 当成可编程、可调度、可观测的工作负载来管理。

典型目标场景：

```ts
const results = await Agent.map(tasks, {
  concurrency: 100,
  agent: new Agent()
    .mcp(github)
    .skills(["code-review", "test-runner"])
    .system("Review one issue and produce a patch."),
});
```

也可以像提交一个批处理任务：

```ts
const job = await AgentJob.create({
  name: "review-100-prs",
  parallelism: 100,
  template: new Agent()
    .mcp(github)
    .skills(["review", "patch"])
    .system("Review the assigned PR."),
  input: pullRequests,
  output: Artifact.json(),
});

await job.wait();
```

以上是长期叙事。第一期不做完整集群编排，第一期只做单个 Agent 的 cloud run。

## K8s 类比

这里的 "K8s for Agents" 是产品叙事和架构方向，不是第一天就实现 Kubernetes 的所有能力。

| K8s        | Agent K8s                   |
| ---------- | --------------------------- |
| Pod        | `AgentRun`                  |
| Job        | `AgentJob`                  |
| Deployment | `AgentPool` / `AgentGroup`  |
| ConfigMap  | skill / MCP / system prompt |
| Volume     | workspace / artifact        |
| Service    | tool / MCP endpoint         |
| Scheduler  | agent scheduler             |
| Controller | workflow controller         |
| Event log  | agent event stream          |

这套类比的核心价值是：开发者用代码声明 Agent 工作负载，控制面负责运行、隔离、调度、状态和产物。

## 长期目标

构建一套 Agent 运行控制层，最终提供以下能力：

- 以 SDK/API 的方式创建、配置、启动、停止和重试 Agent。
- 用几行代码批量启动几十到几百个 Agent 并发工作。
- 跟踪每个 Agent 的状态、日志、事件、成本、工具调用和结果。
- 支持 Agent 之间传递产物，包括文件、结构化数据、日志片段、计划、补丁和最终报告。
- 把每个 Agent 的运行环境隔离在 cloud sandbox/container 中，避免本地环境、凭证和文件系统直接暴露给 Agent。
- 通过 Worker/control plane 作为唯一入口，负责鉴权、路由、生命周期、事件流和受控 egress。
- 保持底层运行时可替换：Cloudflare Sandbox 是第一选择，但抽象上可以扩展到 E2B、Daytona、Modal、Blaxel 或自托管容器。

## 第一期边界

第一期目标是 **Single Agent on Cloud Run**。

第一期要证明的是：开发者可以通过 SDK 创建一个 Agent，把它提交到云端 sandbox 中运行，并拿到事件流、最终结果和产物列表。

第一期必须完成：

- SDK 可以创建单个 `AgentSpec`。
- Worker/control plane 可以接收 `AgentSpec` 并启动一个 sandbox。
- Sandbox 可以加载 Agent runtime/SDK 并执行本次任务。
- 支持 `mcp(...)`、`skills(...)`、`system(...)`、`prompt(...)` 的最小配置入口。
- 支持事件流：开始、模型输出、工具调用、工具结果、产物生成、完成、错误。
- 支持取消单次运行。
- 支持读取最终结果和产物列表。
- Worker/control plane 是唯一持有长期凭证的边界；sandbox 只拿短期运行 token。

第一期明确不做：

- `Agent.map(...)` 并发批处理。
- `AgentJob` / `AgentCluster` API。
- 多 Agent DAG 调度。
- 自动扩缩容。
- 完整 scheduler/controller。
- 跨 Agent artifact routing。
- 跨租户资源配额。
- 复杂权限 UI。
- 长期记忆系统。
- Artifact 版本合并和冲突解决。

换句话说，第一期只把一个 Agent 可靠地放到 cloud sandbox 里跑起来。批量、调度、依赖图和集群能力是后续阶段。

## 第一期 API

MVP 暴露一个链式 SDK，用来描述并执行单个 Agent：

```ts
const result = await new Agent()
  .mcp(mcpConfig)
  .skills(skillConfig)
  .system(systemPrompt)
  .prompt(userPrompt)
  .execute();
```

这个 API 的语义是：

- `mcp(...)`：声明 Agent 可以访问的 MCP Server、工具能力和权限边界。
- `skills(...)`：声明 Agent 运行时可加载的技能、上下文和工作流约束。
- `system(...)`：声明系统提示词和全局行为约束。
- `prompt(...)`：声明本次任务输入。
- `execute()`：创建云端运行环境，启动 Agent，消费事件流，并返回结构化结果。

第一期的 `execute()` 不承诺批量调度。它只启动一个云端 `AgentRun`。

## 长期编排 API 草图

单 Agent API 是 building block，不是最终形态。后续可以在它之上引入批量和依赖关系。

批量 map：

```ts
const results = await Agent.map(repos, {
  concurrency: 50,
  agent: new Agent()
    .mcp(github)
    .skills(["migration"])
    .system("Migrate the assigned repository."),
});
```

Job：

```ts
const job = await AgentJob.create({
  name: "migrate-repos",
  parallelism: 50,
  retries: 2,
  timeout: "30m",
  template: new Agent()
    .mcp(github)
    .skills(["migration", "test-runner"])
    .system("Migrate one repository and produce a PR."),
  input: repos,
});

await job.wait();
```

DAG / cluster：

```ts
const cluster = await AgentCluster.define()
  .agent("planner", plannerAgent)
  .agent("builder", builderAgent)
  .agent("reviewer", reviewerAgent)
  .artifact("plan", { from: "planner", to: "builder" })
  .artifact("patch", { from: "builder", to: "reviewer" })
  .execute();
```

这些 API 先作为方向保留，不进入第一期交付范围。

## 运行模型

核心组件分为四层：

```text
SDK
  -> Worker / Control Plane
    -> Sandbox Runtime
      -> Agent Runtime / SDK
      -> Workspace / Artifacts
```

### SDK

SDK 是开发者面对的编程接口。它不直接在本地运行 Agent，而是把 `AgentSpec` 提交给云端控制面。

SDK 负责：

- 组装 Agent 的声明式配置。
- 提交执行请求。
- 订阅事件流。
- 暴露取消、重试、读取产物等控制接口。
- 把运行结果整理成结构化返回值。

第一期 SDK 只需要支持单个 `AgentRun`。后续再扩展 `AgentJob`、`Agent.map` 和 `AgentCluster`。

### Worker / Control Plane

Worker/control plane 是入口和可信网络边界。

Worker/control plane 负责：

- 鉴权和租户隔离。
- 创建、路由和回收 sandbox。
- 代理事件流。
- 管理短期运行 token。
- 代理模型调用、web fetch、web search、git、对象存储等受控 egress。
- 保存 `AgentRun`、`Artifact`、日志索引和状态元数据。

第一期只需要管理单个 `AgentRun` 生命周期，不需要实现全局 scheduler。

### Sandbox Runtime

Sandbox 是 Agent 的实际运行环境。

Sandbox 负责：

- 加载 Agent runtime/SDK。
- 执行 `AgentSpec`。
- 管理 `/workspace`。
- 运行文件、shell、MCP、skill 等受限工具。
- 把 token delta、工具调用、产物变更和最终结果持续推送给 Worker/control plane。

Sandbox 不持有长期凭证。所有需要凭证的访问都通过 Worker/control plane 代理。

### Artifacts

Artifact 是后续 Agent 之间传递产物的统一抽象。

第一期 Artifact 只需要支持单个 `AgentRun` 的输出索引：

- 文件或目录快照。
- git diff/patch。
- JSON 结构化输出。
- 文本报告。
- 运行日志和事件流片段。

长期来看，Artifact 需要有稳定 ID、来源 `AgentRun`、内容类型、存储位置和可传递策略。多 Agent 编排时只传 Artifact 引用，不直接复制大文件。

## 核心数据模型

第一期核心模型：

```ts
type AgentSpec = {
  id?: string;
  model?: string;
  mcp?: McpConfig[];
  skills?: SkillConfig[];
  system?: string;
  prompt: string;
  workspace?: WorkspaceInit;
  permissions?: PermissionPolicy;
};

type AgentRun = {
  id: string;
  spec: AgentSpec;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  sandboxId?: string;
  artifacts: ArtifactRef[];
  startedAt?: string;
  finishedAt?: string;
};

type ArtifactRef = {
  id: string;
  runId: string;
  kind: "file" | "directory" | "patch" | "json" | "text" | "log";
  uri: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
};
```

长期扩展模型：

```ts
type AgentJob = {
  id: string;
  template: AgentSpec;
  input: unknown[];
  parallelism: number;
  retries?: number;
  timeout?: string;
  runs: AgentRun[];
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
};

type ArtifactRoute = {
  from: string;
  to: string;
  artifact: string;
};
```

`AgentJob` 和 `ArtifactRoute` 不进入第一期实现，只用于保证第一期的数据模型不会把后续路线堵死。

## 演进路线

1. **Single Agent Cloud Run**：跑通单个 Agent 的云端启动、事件流、取消、结果和产物。
2. **Run Persistence**：持久化 `AgentRun` 状态、日志、artifact index、workspace snapshot。
3. **Batch API**：引入 `Agent.map(...)`，支持并发数、超时、重试和结果聚合。
4. **Artifact Store**：把产物统一落到 R2、KV/D1 元数据或 git 分支，并支持引用传递。
5. **AgentJob**：支持排队、重试、并发限制和批处理生命周期。
6. **AgentCluster / DAG**：支持多 Agent 定义、依赖关系和产物传递。
7. **Scheduler / Controller**：根据资源、优先级和依赖图启动 sandbox。
8. **Observability / Policy**：提供成本、耗时、token、工具调用、失败原因、权限和审计。

## 设计原则

- Developer-first：核心体验必须是几行代码启动 Agent 工作负载。
- Single Agent first：第一期先把单个 Agent cloud run 做可靠，再扩展集群能力。
- SDK 描述意图，控制面执行控制，sandbox 只负责受限运行。
- Agent 之间不共享进程，只通过 Artifact 和事件传递状态。
- 产物传引用，必要时再拉取内容。
- 长期凭证只存在于 Worker/control plane。
- 第一版 API 不能阻碍后续 `Agent.map`、`AgentJob` 和 `AgentCluster`。

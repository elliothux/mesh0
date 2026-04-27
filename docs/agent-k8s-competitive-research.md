# Agent K8s Competitive Research

Last updated: 2026-04-27

## Research Question

目标叙事：

> 面向开发者的 Agent K8s：用几行代码启动、调度、观察、取消、重试一批 cloud-isolated agents，让它们并行完成任务，并通过结构化 artifact 汇总或流转。

第一期边界：

> 不做完整集群编排。第一期只做 single Agent on cloud run：SDK 创建一个 Agent，把它提交到 cloud sandbox 中运行，拿到事件流、最终结果和 artifact index。

调研重点不是泛泛的 agent framework，而是以下能力组合：

- Developer SDK/API，而不是只靠 UI。
- 批量并发运行 agent workload。
- 每个 Agent 有隔离运行环境。
- 支持 observe、cancel、retry、resume、logs、cost。
- 支持 artifact 收集、diff、handoff 或后续路由。
- 长期可以演进到 `Agent.map`、`AgentJob`、`AgentCluster`。

## Summary

这个叙事不是空白市场。`Kubernetes for agents`、`agent fleet orchestration`、`cloud sandbox for agents` 这几个方向已经有玩家在做。

但目前还没有看到一个产品完整覆盖以下组合：

```text
few-lines developer SDK
  + launch 100 cloud-isolated agents
  + per-agent lifecycle control
  + structured artifact collection/handoff
  + long-term AgentJob/AgentCluster abstraction
```

主要竞争压力来自三类：

- **叙事直接竞争**：Klaw、kagent、Kubernetes Agent Sandbox。
- **云厂商/平台基础设施**：OpenAI Agents SDK、Cloudflare Agent Cloud、Vercel Sandbox/Open Agents、AWS AgentCore、Microsoft Foundry、Google Vertex/Gemini Agent Engine。
- **相邻执行与工作流层**：Runloop、Blaxel、Modal、Trigger.dev、LangGraph、CrewAI、Strands、AutoGen。

## Direct Narrative Competitors

### Klaw

Links:

- <https://klaw.sh/>
- <https://klaw.sh/docs/concepts/agents>

Positioning:

Klaw 直接使用 `kubectl for AI Agents` 和 `Kubernetes for AI Agents` 叙事。它借用了 Kubernetes 的 namespace、declarative config、kubectl-style CLI，并提供 Slack、CLI、TUI、REST API 多入口。

Overlap:

- `klaw get agents`、`klaw logs agent`、`klaw describe` 这类 kubectl-style 操作。
- Namespaces 用于 team/project/env 隔离。
- Distributed controller-node 模式。
- Podman container isolation。
- Cron/scheduled agents。
- 多模型支持。
- Agent 像 K8s pod 一样作为最小可部署单元。

Gaps:

- 更像 ops/control CLI，不是优先面向 SDK 的 `Agent.map(...)` / `AgentJob.create(...)` 开发体验。
- 重点是管理和调度现有 agents，不是 cloud sandbox runtime + artifact handoff 的统一产品。
- artifact routing、patch/diff/workspace snapshot 没有成为核心抽象。
- 对第一期 `single Agent on cloud run` 的 API 形态借鉴价值有限，但对长期叙事有直接竞争关系。

Takeaway:

不能只说 `Kubernetes for Agents`，这个词已经被 Klaw 直接占用。需要强调 developer SDK、cloud-isolated run、artifact-first job abstraction。

### Kubernetes Agent Sandbox

Links:

- <https://kubernetes.io/blog/2026/03/20/running-agents-on-kubernetes-with-agent-sandbox/>
- <https://github.com/kubernetes-sigs/agent-sandbox>

Positioning:

Kubernetes SIG Apps 正在做 Agent Sandbox，用 Kubernetes CRD 表达 isolated, stateful singleton agent runtimes。

Overlap:

- Sandbox CRD。
- SandboxClaim / SandboxTemplate。
- WarmPool 降低 agent sandbox 冷启动。
- gVisor / Kata Containers 等隔离运行时。
- stable identity / hostname，用于 multi-agent 发现和通信。
- Python SDK。
- 明确讨论 agent 不是普通 stateless pod，而是 mostly-idle、stateful、long-running 的 singleton workload。

Gaps:

- 它是 Kubernetes-native 底层抽象，不是普通应用开发者几行代码启动 100 个 Agent 的高层 SDK。
- 用户需要 Kubernetes 集群和 CRD 认知。
- 不提供 agent harness、MCP/skills 配置、artifact routing 或开发者友好的 `AgentJob` 语义。

Takeaway:

这是长期底层标准化风险。如果 Agent K8s 最终跑在 Kubernetes 上，Agent Sandbox 可能是可用底座；如果做 Cloudflare-first developer product，则要避开 K8s operator/CRD 复杂度。

### kagent

Links:

- <https://kagent.dev/>
- <https://www.cncf.io/blog/2025/04/15/kagent-bringing-agentic-ai-to-cloud-native/>

Positioning:

kagent 是 CNCF Sandbox 项目，定位是 cloud-native / Kubernetes 上运行 AI agents，主要面向 DevOps 和 platform engineers。

Overlap:

- Kubernetes-native agent framework。
- A2A、ADK、MCP。
- Observability、metrics、audit trails。
- Declarative agentic AI framework。
- 强调 deploy、scale、manage AI applications and workloads with cloud-native practices。

Gaps:

- 目标场景主要是 Kubernetes 运维和 troubleshooting，不是通用 developer workload。
- 更偏 cloud-native/platform engineer，不是应用开发者几行代码启动 agent fleet。
- artifact handoff、workspace diff、批量 coding/review/migration 不是主叙事。

Takeaway:

kagent 证明 cloud-native 社区正在吃这个方向。我们的差异化应是 developer-first 和 Cloudflare/serverless sandbox-first，而不是 Kubernetes operations-first。

## Cloud Agent Platforms

### OpenAI Agents SDK

Links:

- <https://openai.com/index/the-next-evolution-of-the-agents-sdk/>
- <https://openai.github.io/openai-agents-js/guides/agents/>
- <https://openai.github.io/openai-agents-python/sandbox/guide/>

Positioning:

OpenAI Agents SDK 正在从 agent harness 向 sandbox execution、MCP、skills、subagents、parallel containers 方向上移。

Overlap:

- MCP。
- Skills。
- AGENTS.md。
- shell / apply patch / file tools。
- Native sandbox execution。
- 一个 run 可使用一个或多个 sandbox。
- subagents 可路由到 isolated environments。
- 可以 across containers parallelize work。

Gaps:

- 它是模型/SDK harness，不是独立的 fleet scheduler/control plane。
- 不是多运行时/多 provider 的 Agent K8s 产品。
- artifact store、AgentJob、batch map、per-run cost/lifecycle dashboard 不是核心产品抽象。

Takeaway:

OpenAI 会吃掉一部分 single-agent SDK 和 sandbox-harness 能力。Agent K8s 需要站在更上层：把 OpenAI/Claude/Codex/free-code 这类 agent runtime 当成可调度 workload。

### Cloudflare Agent Cloud

Links:

- <https://www.cloudflare.com/press/press-releases/2026/cloudflare-expands-its-agent-cloud-to-power-the-next-generation-of-agents/>
- <https://workers.cloudflare.com/product/sandboxes>
- <https://developers.cloudflare.com/artifacts/>
- <https://developers.cloudflare.com/agents/api-reference/agents-api/>

Positioning:

Cloudflare 正在提供 agent platform primitives：Workers、Dynamic Workers、Sandboxes、Artifacts、Agents SDK/Think。

Overlap:

- Sandboxes：persistent isolated Linux environment with shell, filesystem, background processes。
- Workers/control plane 适合做 auth、routing、egress。
- Artifacts：Git-compatible versioned file trees。
- Artifacts 支持 one repo per agent/user/branch/task、parallel isolation、fork、diff、merge、handoff。
- Think 关注 long-running multi-step agents。

Gaps:

- Cloudflare 是底层 primitives，不是完整 `Agent.map` / `AgentJob` 产品。
- 没有直接提供 agent fleet scheduler、batch map、artifact route DSL。
- 需要我们把 primitives 拼成 developer-facing SDK。

Takeaway:

Cloudflare 是非常适合第一期 `single Agent on cloud run` 的底座。长期的机会是把 Sandboxes + Artifacts + Worker control plane 包装成 AgentJob 语义。

### Vercel Sandbox / Open Agents / AgentPlane

Links:

- <https://vercel.com/blog/vercel-sandbox-is-now-generally-available>
- <https://github.com/vercel-labs/open-agents>
- <https://open-agents.dev/>
- <https://agentplane.vercel.app/>

Positioning:

Vercel Sandbox 是 agent execution layer；Open Agents 是 Vercel 官方参考应用；AgentPlane 是基于 Vercel Sandbox 的 Claude Agent SDK API 产品形态。

Overlap:

- 每个 session 有 isolated Vercel Sandbox。
- Durable workflow-backed runs。
- Streaming 和 cancellation。
- Snapshot resume。
- Git branch / commit / PR integration。
- file/search/shell/task/skill/web tools。
- AgentPlane 支持 Claude Agent SDK、MCP servers、skills/plugins、tenant、budget、observability。

Gaps:

- Open Agents 更像 coding agent reference app，不是通用 AgentJob SDK。
- AgentPlane 很接近第一期 single-agent API，但长期 fleet/job/artifact routing 不是核心叙事。
- Vercel 生态绑定强。

Takeaway:

这是第一期最值得对标的产品形态之一。我们的差异化要在 Cloudflare runtime、multi-agent/fleet roadmap、artifact-first abstraction 上体现。

### AWS Bedrock AgentCore / Strands Agents

Links:

- <https://aws.amazon.com/bedrock/agentcore/faqs/>
- <https://aws.amazon.com/blogs/machine-learning/strands-agents-sdk-a-technical-deep-dive-into-agent-architectures-and-observability/>
- <https://strandsagents.com/docs/user-guide/deploy/operating-agents-in-production/>

Positioning:

AWS 在做 AgentCore 运行平台，Strands 是 agent SDK。AgentCore 包括 Runtime、Memory、Gateway、Browser、Code Interpreter、Identity、Policy、Observability、Evaluations。

Overlap:

- Secure serverless runtime。
- Memory、Identity、Policy、Observability。
- Gateway 做 tool integration。
- Strands 支持 MCP、A2A、多模型、多 agent patterns。
- 可以部署到 AgentCore、Lambda、Fargate、EC2。

Gaps:

- AWS 生态绑定重。
- 更像 managed agent runtime + enterprise controls，不是轻量 developer SDK for agent fleets。
- artifact handoff 和 developer-facing batch map 不是主叙事。

Takeaway:

AWS 是企业生产化方向的强竞争者，但对开发者早期体验和 Cloudflare-first 轻量控制面仍有空间。

### Microsoft Foundry Agent Service

Links:

- <https://learn.microsoft.com/en-us/azure/foundry/agents/overview>
- <https://devblogs.microsoft.com/foundry/introducing-the-new-hosted-agents-in-foundry-agent-service-secure-scalable-compute-built-for-agents/>

Positioning:

Foundry Agent Service 是 managed platform for building, deploying, and scaling AI agents，支持 SDK/REST/API 和 hosted agents。

Overlap:

- Hosting、scaling、identity、observability、enterprise security。
- 可部署 Agent Framework、LangGraph 或自定义 code-based hosted agents。
- 新 hosted agents 强调 per-session sandbox、filesystem persistence、toolbox、memory。

Gaps:

- Azure enterprise platform，不是 lightweight developer-first SDK。
- 不主打几行代码并发 100 个 isolated agents。
- artifact route/job/cluster 抽象不是核心。

Takeaway:

这是企业平台竞争，不是早期开发者 wedge 的直接替代。

### Google Vertex AI Agent Engine / Gemini Enterprise Agent Platform

Links:

- <https://docs.cloud.google.com/agent-builder/agent-engine/overview>
- <https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/manage/overview>

Positioning:

Google 的 Agent Engine 是 managed runtime for deploying and scaling agents，支持 ADK、LangChain、LangGraph 等。

Overlap:

- Deploy, manage, scale agents in production。
- SDK、managed runtime、observability。
- 支持 ADK、LangGraph、LangChain。
- 与 Google Cloud production tooling 集成。

Gaps:

- 平台复杂度高，生态绑定强。
- 不是一个简单的 `Agent.map` / `AgentJob` 开发者体验。
- cloud sandbox isolation、artifact handoff 不是主叙事。

Takeaway:

Google 会覆盖 enterprise agent deployment，但不太像 developer-first Agent K8s SDK。

## Adjacent Runtime And Workflow Platforms

### Runloop

Links:

- <https://runloop.ai/product-v2>

Overlap:

- Devboxes。
- Blueprints、Snapshots。
- Credential Gateway。
- MCP Hub。
- Network Policies。
- Dashboard、logs、resource usage。
- Python/TypeScript SDK。

Gaps:

- 强在 execution backend 和 security gateway，不是 agent fleet orchestration SDK。
- AgentJob、artifact routing、multi-agent DAG 需要上层实现。

### Blaxel

Links:

- <https://blaxel.ai/>
- <https://docs.blaxel.ai/Sandboxes/Overview>

Overlap:

- Agents Hosting。
- Batch Jobs。
- Sandboxes。
- MCP Servers。
- Log streaming、process management、filesystem operations、network proxy、volumes。
- 可把 Claude Agent SDK 接到 Blaxel sandbox。

Gaps:

- 更像 agent hosting + sandbox platform。
- 不主打 developer SDK 批量启动 100 个 agent jobs。
- artifact-first handoff 需要上层补齐。

### Modal

Links:

- <https://modal.com/docs/guide/batch-processing>
- <https://modal.com/docs/guide/sandboxes>

Overlap:

- `.map` / `.spawn_map` 非常接近 “几行代码启动大量并行任务”。
- 可 scale 到 thousands of parallel containers。
- Sandboxes、custom images、GPU、queues、volumes、observability。
- 适合实现 agent fleet 的 compute layer。

Gaps:

- General-purpose compute，不是 agent-specific。
- 没有 MCP/skills/system/prompt 的 AgentSpec。
- 没有 artifact route、per-agent transcript、agent lifecycle 语义。

Takeaway:

Modal 的 batch API 是长期 `Agent.map` API 的重要参考。

### Trigger.dev

Links:

- <https://trigger.dev/>
- <https://trigger.dev/docs/guides/ai-agents/claude-code-trigger>

Overlap:

- Long-running AI workflows。
- Retries、queues、observability、elastic scaling、streaming。
- Developer-first TypeScript SDK。
- 可运行 Claude Agent SDK 等 agent workloads。

Gaps:

- Workflow/background jobs platform，不是 isolated agent runtime。
- 不提供 cloud sandbox 或 artifact handoff 一等抽象。

Takeaway:

Trigger.dev 是 durable execution 方向的强参考。Agent K8s 可以把它的 workflow ergonomics 与 sandbox/artifact 语义结合。

### LangGraph / LangSmith Deployment

Links:

- <https://www.langchain.com/langgraph>
- <https://www.langchain.com/blog/langgraph-platform-ga>

Overlap:

- Long-running stateful agents。
- Graph-based orchestration。
- Checkpointing、persistence、human-in-the-loop。
- Remote Graphs，可做分布式 multi-agent architectures。
- Observability/debugging via LangSmith。

Gaps:

- Orchestration/harness 层，不是 cloud-isolated agent fleet runtime。
- 运行和 sandbox 需要接 E2B/Modal/Cloudflare/Vercel/自建。
- artifact store 和 batch job abstraction 不直接覆盖。

### CrewAI

Links:

- <https://docs.crewai.com/core-concepts/Agents/>
- <https://www.crewai.com/blog/how-crewai-is-evolving-beyond-orchestration-to-create-the-most-powerful-agentic-ai-platform>

Overlap:

- Multi-agent framework。
- Crews、tasks、flows。
- Enterprise platform、observability、guardrails。
- MCP support。
- Private tool repositories。

Gaps:

- 偏 workflow/crew collaboration，不是 isolated cloud agent jobs。
- 不强调几行代码启动 100 个 independent cloud agents。
- artifact handoff 和 sandbox runtime 需要外部系统。

### AutoGen Distributed Agent Runtime

Links:

- <https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/framework/distributed-agent-runtime.html>

Overlap:

- Host service + worker runtimes。
- Agent lifecycle across process boundaries。
- Message delivery、sessions、distributed agents。

Gaps:

- Experimental。
- 更像 framework runtime，不是 hosted developer platform。
- 没有 cloud sandbox、artifact store、AgentJob SDK。

## Competitive Positioning

Avoid positioning as:

- Just `Kubernetes for Agents`：Klaw、kagent、Kubernetes Agent Sandbox 已经在直接使用这个叙事。
- Just `cloud sandbox for agents`：Cloudflare、Vercel、Runloop、Blaxel、Modal 已经覆盖。
- Just `agent orchestration framework`：LangGraph、CrewAI、AutoGen、Strands 已经拥挤。
- Just `agent observability`：AgentOps、LangSmith、Cloud platforms 都在覆盖。

Better positioning:

```text
Developer SDK for running agent fleets as jobs.
```

Or:

```text
AgentJob control plane:
launch 100 isolated agents,
stream progress,
cancel/retry failures,
and collect artifacts.
```

Chinese narrative:

```text
面向开发者的 Agent 工作负载控制面：
先把单个 Agent 可靠地放到 cloud sandbox 里跑起来，
再演进到几行代码批量启动、观察、重试和汇总 100 个 Agent。
```

## Suggested Wedge

### Phase 1 wedge

Single Agent Cloud Run:

- `new Agent().mcp(...).skills(...).system(...).prompt(...).execute()`
- Cloud sandbox isolation by default。
- Event stream。
- Cancel。
- Result。
- Artifact index。
- Worker/control plane owns credentials。

这阶段直接对标 AgentPlane、Vercel Open Agents、OpenAI sandbox agent、Cloudflare sandbox examples。

### Phase 2 wedge

Agent Map:

- `Agent.map(inputs, { concurrency, agent })`
- 每个 input 生成一个 isolated `AgentRun`。
- 支持 per-run logs、events、cancel、retry。
- 汇总 result/artifacts。

这阶段对标 Modal `.map` / `.spawn_map`，但语义是 agent-native。

### Phase 3 wedge

AgentJob / Artifact Handoff:

- `AgentJob.create({ template, input, parallelism, retries })`
- `ArtifactRef` 成为一等输出。
- 支持 patch、JSON、file tree、workspace snapshot。
- 支持把一批 artifacts 传给下一批 agents。

这阶段与 Cloudflare Artifacts、Klaw、LangGraph、Trigger.dev 拉开差异。

### Phase 4 wedge

AgentCluster:

- 多 Agent role。
- DAG。
- Artifact routes。
- scheduler/controller。
- cost and policy。

这是完整长期叙事，不进入第一期。

## Bottom Line

竞品很多，但空位仍然存在。

最危险的直接叙事竞品是 Klaw，因为它已经占了 `Kubernetes for AI Agents` 这个表达。

最危险的底层标准化竞品是 Kubernetes Agent Sandbox，因为它可能成为 Kubernetes 社区的 agent runtime 原语。

最危险的一期产品对标是 Vercel Open Agents / AgentPlane，因为它们已经把 sandbox + Agent SDK + stream + observability 做成了可体验产品。

最适合借力的底座是 Cloudflare Agent Cloud，尤其是 Sandboxes 和 Artifacts。机会在于把 Cloudflare primitives 包装成更清晰的 developer-facing AgentRun / AgentJob / ArtifactRef 语义。

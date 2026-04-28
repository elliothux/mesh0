# Developer SDK API

目标：用户只看到 Mesh0 的 Agent、Run、Event、Artifact。外部能力使用 MCP，工作流和上下文使用 Skills，不定义 Mesh0 私有工具标准。

## Agent

```ts
const run = await mesh0
  .agent()
  .workspace({ git: { url, ref: "main" } })
  .mcp({
    github: {
      url: "https://api.githubcopilot.com/mcp/",
      bearer_token_env_var: "GITHUB_TOKEN",
      required: true,
    },
  })
  .skills([
    {
      source: "git",
      url: "https://github.com/acme/agent-skills.git",
      ref: "8f4d8c2",
      path: "skills/security-review",
    },
    {
      source: "well-known",
      url: "https://docs.acme.com",
      skill: "api-migration",
    },
  ])
  .systemPrompt({
    append: "Review code like a strict security engineer.",
  })
  .prompt("Use $code-review to review PR #123.")
  .start();
```

- `mcp(...)`：声明本次运行可用的 MCP servers，key 是 server name。
- `skills(...)`：声明本次运行可用的 skill refs。
- `systemPrompt(...)`：声明稳定的 Agent 行为指令。
- `baseUrl(...)`：声明本次运行使用的 OpenAI-compatible endpoint。
- `model(...)`：声明本次运行使用的模型，可省略。
- `modelProvider(...)`：声明本次运行使用的 provider key，可省略；传了 `baseUrl(...)` 且省略 provider 时，API 会生成本次运行的内部 provider 配置。
- `wireApi(...)`：声明本次运行的 provider wire API，可省略，默认使用 `responses`。OpenAI-compatible chat 代理可以传 `"chat"`。
- `prompt(...)`：声明任务输入。

`OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_MODEL_PROVIDER` 属于 run 级配置。API worker env 只接收服务端资源配置，例如 D1/R2 binding 和后续 auth 配置。

## MCP 配置

MCP 配置贴近底层 SDK 的 `mcp_servers` shape。SDK 不定义 Mesh0 私有 tool schema，也不把字段转成 camelCase。

```ts
type McpServers = Record<string, McpServerConfig>;

type McpServerConfig =
  | (McpStdioServer & McpServerSharedConfig)
  | (McpStreamableHttpServer & McpServerSharedConfig);

type McpServerSharedConfig = {
  experimental_environment?: string;
  enabled?: boolean;
  required?: boolean;
  supports_parallel_tool_calls?: boolean;
  startup_timeout_sec?: number;
  tool_timeout_sec?: number;
  default_tools_approval_mode?: "auto" | "prompt" | "approve";
  enabled_tools?: string[];
  disabled_tools?: string[];
  scopes?: string[];
  tools?: Record<string, McpServerToolConfig>;
};

type McpStdioServer = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  env_vars?: McpServerEnvVar[];
  cwd?: string;
};

type McpStreamableHttpServer = {
  url: string;
  bearer_token_env_var?: string;
  http_headers?: Record<string, string>;
  env_http_headers?: Record<string, string>;
  oauth_resource?: string;
};

type McpServerEnvVar = string | { name: string; source?: "local" | "remote" };

type McpServerToolConfig = {
  approval_mode?: "auto" | "prompt" | "approve";
};
```

调用方式：

```ts
.mcp({
  github: {
    url: "https://api.githubcopilot.com/mcp/",
    bearer_token_env_var: "GITHUB_TOKEN",
    required: true,
  },
  localDocs: {
    command: "docs-server",
    args: ["--stdio"],
    env_vars: [{ name: "DOCS_TOKEN", source: "remote" }],
  },
})
```

runner 把这个对象原样作为 `mcp_servers` 写入运行配置。校验只做两类：

- transport 只能二选一：`command` 表示 stdio，`url` 表示 streamable HTTP。
- skill 的 `dependencies.tools[].value` 必须能匹配到 `mcp(...)` 的 server name。

MCP tools 的名称、参数 schema、结果内容都来自 MCP server 的 `tools/list` 和 `tools/call`，不在 Mesh0 SDK 里重新声明。

## Prompt API

`prompt(...)` 是本次任务输入，必填。`systemPrompt(...)` 是稳定行为指令，可选。Mesh0 默认使用自己的通用 Agent system prompt，不使用 coding-oriented 默认 system prompt。

```ts
type AgentSystemPrompt = string | { append: string } | { replace: string };
```

不传 `systemPrompt(...)` 时，使用 Mesh0 默认通用 Agent system prompt。

`append` 追加到 Mesh0 默认通用 Agent system prompt：

```ts
.systemPrompt({
  append: "Always return a concise security review.",
})
```

`replace` 替换整个 Mesh0 默认 Agent system prompt：

```ts
.systemPrompt({
  replace: "You are a migration planning agent. Return only JSON.",
})
```

传入字符串时，等价于 `{ append: string }`：

```ts
.systemPrompt("Always return a concise security review.")
```

cwd、git status、runId、workspace metadata、skill lock、当前日期等 run 级动态上下文始终放到第一条 user context message，不进入 system prompt。`append` 应只放跨 run 稳定的规则；PR 号、issue id、文件列表等动态输入应放 `prompt(...)`。

内部映射：

- 默认：把 Mesh0 默认 system prompt 作为 base instructions override。
- `{ append }`：把 Mesh0 默认 system prompt 和 `append` 拼成稳定 base instructions override。
- `{ replace }`：把 `replace` 作为完整 base instructions override。
- `string`：等价于 `{ append: string }`。
- prompt：作为 user prompt 提交。
- dynamic context：作为 user context message 提交。

这样保持 public API 简单，同时贴近 runner 的 base instructions、user prompt 分层。Mesh0 默认 system prompt 是通用 Agent prompt，负责说明任务执行、MCP、Skills、workspace、artifacts、events 等稳定行为。

## Skill 包格式

Skill 使用现有目录标准。

```text
code-review/
  SKILL.md
  agents/openai.yaml
  references/
  scripts/
  assets/
```

`SKILL.md` 必需，声明 `name`、`description` 和正文指令。

```md
---
name: code-review
description: Use when reviewing code changes and producing concise findings.
---

# Code Review

Review changed code, prioritize bugs, and produce a small patch when needed.
```

`agents/openai.yaml` 可选，用于 UI、依赖和策略。

```yaml
interface:
  display_name: "Code Review"
  short_description: "Review code changes"

dependencies:
  tools:
    - type: "mcp"
      value: "github"
      description: "GitHub MCP server"

policy:
  allow_implicit_invocation: true
```

## Skill 配置

`skills(...)` 只支持显式 source，不做 catalog，也不按 name 隐式解析。

```ts
type SkillRef =
  | { source: "git"; url: string; ref: string; path?: string; skill?: string }
  | { source: "well-known"; url: string; skill?: string };
```

- `{ source: "git", url, ref, path }`：从 Git source 解析指定目录。
- `{ source: "well-known", url, skill }`：从 `/.well-known/agent-skills/index.json` 解析 skill。

Git `ref` 在创建 run 前必须解析为不可变 commit。缺失 skill、无效 metadata、可变 ref、缺少 MCP 依赖都会让 run 创建失败。

Git source 的 URL 解析参考 `vercel-labs/skills`：

- `owner/repo`
- `owner/repo/path/to/skill`
- `https://github.com/owner/repo/tree/main/skills/foo`
- `https://gitlab.com/group/repo/-/tree/main/skills/foo`
- `git@github.com:owner/repo.git`

MVP 只支持 `{ source: "git", url, ref, path }` 和 `{ source: "well-known", url, skill }`。`owner/repo` 等 shorthand 可后续再加。

## Run 输入解析

run 创建后先分配 `runId`。workspace git、skills 等输入都在 Agent 启动前解析成文件包，并上传到 R2 的本次 run 目录。

```text
r2://mesh0-runs/runs/<runId>/
  input/
    workspace.tar.gz
    skills.tar.gz
    config.toml
    run.json
    manifest.json
  output/
```

1. workspace git source 解析到不可变 commit，打包为 `workspace.tar.gz`。
2. 把每个 `SkillRef` 解析为具体 skill 目录。
3. Git skill source checkout 到临时目录；well-known source 下载 index 和文件列表。
4. 校验 `SKILL.md` 的 `name` 和 `description`。
5. 读取可选 `agents/openai.yaml`。
6. 用 `dependencies.tools` 校验本次 `mcp(...)` 是否提供必需 MCP server。
7. 生成 `skills.tar.gz`、`config.toml`、`run.json`、`manifest.json` 并上传到 R2。

所有 R2 key 都带 `runId`，不同 run 不共享输入对象。后续要做缓存或去重也只作为内部优化，不能改变 runner 只按 `runId` 拉取输入的行为。

skill lock 示例：

```json
{
  "skills": [
    {
      "name": "code-review",
      "sourceType": "git",
      "sourceUrl": "https://github.com/acme/agent-skills.git",
      "resolvedRef": "8f4d8c2...",
      "sourcePath": "skills/code-review",
      "digest": "sha256:...",
      "entry": "SKILL.md"
    }
  ]
}
```

digest 按 skill 目录所有文件计算，路径和内容都进入 hash。文件列表排序后计算，避免同内容不同遍历顺序产生不同 digest。

## Agent 启动前注入

容器里只接收已经解析好的 R2 文件包。Agent 运行时不再访问 git URL、skill URL 或 well-known URL。

启动流程：

```text
create sandbox
  -> download runs/<runId>/input/manifest.json
  -> download workspace.tar.gz and skills.tar.gz
  -> verify digest
  -> extract workspace to /workspace
  -> extract skills to /mesh0-runtime/skills
  -> write /mesh0-runtime/config.toml
  -> write /mesh0-runtime/run.json
  -> start Agent process
```

```text
/mesh0-runtime/
  config.toml
  run.json
  skills/
    code-review/
      SKILL.md
      agents/openai.yaml
      references/
      scripts/
      assets/
/workspace/
```

- `/mesh0-runtime/skills`：只读注入，存放本次 run 的 skills。
- `/mesh0-runtime/config.toml`：存放 `mcp_servers`，shape 来自 `.mcp(...)`。
- `/mesh0-runtime/run.json`：存放 prompt、policy 和 skill lock。
- `/workspace`：用户工作区，和 skills 分离，避免 skill 文件出现在用户变更里。

runner 把 `/mesh0-runtime` 设置为 Agent home。注入到 `${MESH0_AGENT_HOME}/skills/<safe-name>` 后，Agent 启动时直接扫描本次 run 的 skills。

`manifest.json` 示例：

```json
{
  "runId": "run_123",
  "objects": {
    "workspace": {
      "key": "runs/run_123/input/workspace.tar.gz",
      "digest": "sha256:...",
      "unpackTo": "/workspace"
    },
    "skills": {
      "key": "runs/run_123/input/skills.tar.gz",
      "digest": "sha256:...",
      "unpackTo": "/mesh0-runtime/skills"
    },
    "config": {
      "key": "runs/run_123/input/config.toml",
      "digest": "sha256:...",
      "path": "/mesh0-runtime/config.toml"
    },
    "run": {
      "key": "runs/run_123/input/run.json",
      "digest": "sha256:...",
      "path": "/mesh0-runtime/run.json"
    }
  }
}
```

`/mesh0-runtime/config.toml` 示例：

```toml
[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GITHUB_TOKEN"
required = true

[mcp_servers.localDocs]
command = "docs-server"
args = ["--stdio"]
env_vars = [{ name = "DOCS_TOKEN", source = "remote" }]
```

`/mesh0-runtime/run.json` 示例：

```json
{
  "skillsRoot": "/mesh0-runtime/skills",
  "skills": [
    {
      "name": "code-review",
      "path": "/mesh0-runtime/skills/code-review/SKILL.md",
      "digest": "sha256:..."
    }
  ]
}
```

注入方式由 runner prepare 阶段完成。对 Agent 进程来说，结果都是读取 `/workspace` 和 `${MESH0_AGENT_HOME}/skills/<name>/SKILL.md`。

写入规则：

- 目录名使用 sanitized skill name，禁止路径穿越。
- 只复制 skill 目录内文件，禁止复制 `.git`、`node_modules`、隐藏目录和越界 symlink。
- well-known source 的文件路径必须来自 index，且不能以 `/` 开头或包含 `..`。
- Git source 的 `path` 必须解析在 checkout 根目录内。

## Run 输出同步

Agent 不直接写 R2。runner 负责把底层 raw 产物同步到本次 run 的 R2 output 目录。原则：R2 里保存 raw，产品层需要的视图在读取时派生。这里的 raw 对象是内部存储格式，不作为 Developer SDK 的公共 schema。

```text
runs/<runId>/output/
  codex/
    exec.jsonl
    stderr.log
    last-message.txt
    sessions/
      2026/04/27/rollout-2026-04-27T12-00-00-<threadId>.jsonl
    rollout-trace/
      <traceId>/
        manifest.json
        trace.jsonl
        payloads/
        state.json
  workspace/
    snapshot.tar.gz
    git-diff.patch
  mesh0/
    runner.log
    output-manifest.json
```

同步流程：

Codex exec 的约定：`--json` 模式 stdout 只输出 JSONL；其他输出写 stderr。runner 依赖这个约定做 tee。

```text
codex exec --json
  -> stdout tee: output/codex/exec.jsonl + live ThreadEvent stream
  -> stderr tee: output/codex/stderr.log
  -> CODEX_HOME/sessions/.../rollout-*.jsonl
  -> optional CODEX_ROLLOUT_TRACE_ROOT bundle
  -> runner

process completed or failed
  -> runner finalize
  -> upload raw codex stdout/stderr/session/trace files
  -> upload final /workspace snapshot
  -> write mesh0/output-manifest.json
  -> mark run completed or failed
```

Codex raw 产物：

- `codex/exec.jsonl`：`codex exec --json` 的 stdout。runner 逐字节追加到本地文件，同时按行解析并把原始 `ThreadEvent` 转发给 live subscribers。
- `codex/stderr.log`：`codex exec` stderr。runner 逐字节追加到本地文件。底层 tracing fmt layer 默认写 stderr。
- `codex/last-message.txt`：`--output-last-message` 写出的最终 assistant message。
- `codex/sessions/**/rollout-*.jsonl`：Codex session rollout。路径来自 `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDThh-mm-ss-<threadId>.jsonl`。每行是 `RolloutLine`，包含 `timestamp` 和原始 `RolloutItem`。
- `codex/rollout-trace/**`：可选诊断 bundle。仅设置 `CODEX_ROLLOUT_TRACE_ROOT` 时产生，目录内是 `manifest.json`、`trace.jsonl`、`payloads/*.json`，以及可选 `state.json`。

stdout/stderr 必须在进程运行期间同步落本地文件，不能只保存在内存里。最终上传 R2 时以这些本地文件为准，保证成功、失败、取消的 run 都能保留已经产生的输出。

Codex metadata 不重新组装成 Mesh0 schema。直接使用 rollout 里的原始 metadata：

- 第一行 `session_meta`：thread id、cwd、originator、cli version、source、model provider、base instructions、dynamic tools、git info。
- 后续 `turn_context`：turn id、trace id、cwd、current date、timezone、approval policy、sandbox policy、model、user/developer instructions、output schema 等。
- `turn.completed`：usage。
- `turn.failed` / `error`：错误信息。

Workspace 没有对应的 Codex raw artifact。runner 只保存最终文件系统状态：

- `workspace/snapshot.tar.gz`：完成或失败时的 `/workspace` 快照。
- `workspace/git-diff.patch`：可选，方便 UI 展示；不是权威数据。

Mesh0 自己只写最小运行清单：

- `mesh0/runner.log`：runner 自己的 stdout/stderr 或结构化日志。
- `mesh0/output-manifest.json`：R2 对象清单，记录 key、size、digest、content type、上传状态。

失败或取消的 run 也要 best-effort 上传已有 raw 产物和 `mesh0/output-manifest.json`。无法生成 workspace snapshot 时，manifest 只记录已成功上传的对象。

runner 只拿本次 `runs/<runId>/output/*` 的上传能力。Agent 进程不接收 R2 token、signed URL 或 bucket credentials。

raw Codex 产物可能包含 prompt、模型输出、工具参数、终端输出和路径信息。R2 run 目录按敏感数据处理；不要对 raw 文件做字段级转换或脱敏。需要脱敏展示时，另行生成 derived view，不覆盖 raw。

`mesh0/output-manifest.json` 示例：

```json
{
  "runId": "run_123",
  "status": "completed",
  "objects": [
    {
      "key": "runs/run_123/output/codex/exec.jsonl",
      "digest": "sha256:..."
    },
    {
      "key": "runs/run_123/output/codex/stderr.log",
      "digest": "sha256:..."
    },
    {
      "key": "runs/run_123/output/codex/sessions/2026/04/27/rollout-2026-04-27T12-00-00-<threadId>.jsonl",
      "digest": "sha256:..."
    },
    {
      "key": "runs/run_123/output/workspace/snapshot.tar.gz",
      "digest": "sha256:..."
    }
  ]
}
```

## 运行时加载

启动时只把 skill 的 `name`、`description`、`path` 放进上下文，让 Agent 知道有哪些 skills 可用。

完整 `SKILL.md` 正文只在两种情况下加载：

- prompt 显式提到 `$skill-name`。
- 任务语义匹配 skill 的 `description`。

`references/`、`scripts/`、`assets/` 不提前塞进上下文。Skill 正文需要它们时，再按相对路径从 skill 目录读取。

## Events

Event stream 直接使用 `codex exec --json` 的 `ThreadEvent` JSONL。Mesh0 不定义私有 event schema。

```ts
interface Agent {
  events(runId: string): AsyncIterable<ThreadEvent>;
}

type ThreadEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "item.started"; item: ThreadItem }
  | { type: "item.updated"; item: ThreadItem }
  | { type: "item.completed"; item: ThreadItem }
  | { type: "turn.completed"; usage: Usage }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "error"; message: string };
```

`ThreadItem` 也保持 Codex 原始 wire shape。`item.type` 包括：

- `agent_message`
- `reasoning`
- `command_execution`
- `file_change`
- `mcp_tool_call`
- `collab_tool_call`
- `web_search`
- `todo_list`
- `error`

`mcp_tool_call` item 不转换成 `mcp.started` / `mcp.completed`：

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type McpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: JsonValue;
  result?: {
    content: JsonValue[];
    structured_content?: JsonValue;
  } | null;
  error?: { message: string } | null;
  status: "in_progress" | "completed" | "failed";
};
```

runner 只做两件事：

1. 把 stdout JSONL 原样写入 `output/codex/exec.jsonl`。
2. 将每行 JSON 原样转发给 SDK 订阅者。

Mesh0 control plane 可以按需派生 run 状态、最终文本、文件变更列表和 usage，但 R2 里的权威事件源始终是 `codex/exec.jsonl`。

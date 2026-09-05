# GOALS

实现目标：可编排的 Agent SDK + backend

需要实现以下部分：

## SDK 大致定

整体的核心抽象分为：

- agent：定义 agent 的配置，prompt 等
- run：agent 运行的实例

```ts
// directly single run
const run = new Mesh0.agent()
  .workspace()
  .env()
  .systemPrompt()
  .prompt()
  .skills()
  .mcp()
  .run();

// pre defined agent
const myAgent = new Mesh0.agent()
  .workspace()
  .env()
  .systemPrompt()
  .prompt()
  .skills()
  .mcp();

// multi agents run
const agents = prompts.map((taskPrompt) => {
  // optional prompt: append | replace | plain string
  // default string equals append
  const prompt = { append: taskPrompt };
  return myAgent.prompt();
});
const allRun = new Mesh0.all(agents);
const pipeRun = new Mesh0.pipe(agents); // if use pipe, the last run's result will be passed to the next run's workspace
allRun.then(anotherAgent).catch(errorHanderAgent);

// persist agent to reuse, name is required for persist/update
myAgent.name("my-agent").persist();
const reusedAgent = new Mesh0.agent("my-agent");
reusedAgent.mcp(); // override
reusedAgent.persist(); // if not call persist, the overrided config only works in the current time

// manage list agents
new Mesh0().listAgents();
new Mesh0().deleteAgent();
new Mesh0().getRun({ agent: "my-agent" });

// cron job
new Mesh0()
  .cron({ expression: "xxx", invalidateAt: "xxx" })
  .agent(myAgent)
  .all(agents)
  .pipe(agents)
  .then()
  .catch();
new Mesh0().listCrons();
new Mesh0().deleteCrons();

// webhooks, triggered by https://api.mesh0.run/webhook/$uid/$name
new Mesh0()
  .webhook({ name: "my-webhook" })
  .agent(myAgent)
  .all(agents)
  .pipe(agents)
  .then()
  .catch();
new Mesh0().listWebhooks();
new Mesh0().deleteWebhooks();
```

run 还需要额外支持以下 API：

```ts
myRun.on('xxx'); // runing sandbox target，暂时只支持 'auto' | 'cloudflare'
myRun.run(); // 直接在 SDK 调用等待执行结束，实时返回 events
myRun.execute(); // Fire and forget
myRun.notify({ email: "xxx"; telegramBotToken: "xxx" }).execute(); // agent 执行结束后，把执行结果发送给指定 Email 或者 tg bot，需要附上 artifact 下载链接和 dashbaord 链接等
```

## 约束

- 执行的 sandbox、存储都需要 adapter 机制，目标是兼容任意的后端
- sandbox 暂时支持 'docker' | 'cloudflare'
- 存储需要支持 'fs' | 'R2' | 'S3' 三种类，
- api 项目初始化需要传入动态配置，如 sandbox、storage 的 options，默认部署到线上的 worker 版本支持 R2 + cf sandbox
- 所有的逻辑都在 API 侧实现，SDK 只做调用

## 目标产物

### SDK

- 支持 ts/js、python、rust

### Web

1. Dashboard

- 所有的功能都需要有相应的管理 UI
- 一级入口有：Agents、Runs、Crons、Webhooks、API Keys

2. Playground

- 登录后有 UI，可以直接在 web 上调用 agent 对话

3. Docs

- 无需登录，使用文档工具生成
- 具有 SDK 和 http api 的文档
- SDk 具有示例 code，支持切换 language (ts/py/rs)

### API

- 所有的 orpc 接口都要暴露出 http api，可以直接调用
- 支持 worker/node/bun 等运行时，db 等依赖初始化时传入
- 默认部署的是 worker 版本

## 可利用的资源

- .env 里有 XAI_API_KEY，可调用 GROK 搜索 twitter 做 research
- .env 里有 OPENAI_BASE_URL、OPENAI_BASE_URL、OPENAI_MODEL 可调用 openAI API
- .env 里有 E2E_USER_EMAIL、E2E_USER_PASSWORD 可用 workos 登录
- 本地已经安装了 wrangler CLI 并登录了，授予你调用 CLI 部署的权限（只允许操作 mesh0 相关的资源，别的不准动）
- 已经申请了 mesh0.run 作为项目域名
- cf worker 已经配置了好了 api.mesh0.run 作为 api 的域名
- cf R2 已经创建了两个 bucket，mesh0-runs 用来保存 runs artifacts 和 workspace 等，mesh0 用来保存 run 无关的项目资源（如果需要的话）

## 测试基准

- 所有的代码，包括 SDK、API、web 都需要对应的测试用例
- web 用真实浏览器跑完整的 e2e 测试
- 本地测试完全跑通后，最后要用线上的的 web 和 api 运行完全的测试，跑通为止

## 交付

- SDK 各个语言都需要有可一键发布的 package
- web app 部署到 CloudFlare（一个项目里要包含 landing、docs、dashbaord、playground）
- api 部署到 cf worker

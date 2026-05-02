# Dashboard 管理功能 MVP PRD

## 目标

把当前 dashboard 的占位子路由实现成基础管理后台。登录用户可以管理 agent runs、artifacts、observability events、API keys 和 account 状态。

所有 dashboard 数据默认按当前用户隔离。API 命名避免 `xxForUser` 这类后缀，因为用户隔离是默认接口契约。

## 用户

已登录的 Mesh0 用户，核心需求包括：

- 查看和排查 agent run。
- 浏览 run 生成的 artifacts。
- 通过事件排查 run 行为。
- 管理 API keys。
- 查看基础账号信息。

## 全局要求

- 复用当前 dashboard shell、top navigation 和共享 UI 组件。
- 每个页面保持一致结构：title section、toolbar、主列表或表格、detail view。
- 每个页面都包含 loading、empty 和 error 状态。
- mutation 成功后刷新当前页数据。
- 所有应用 API 行为放在 `apps/api`。
- `apps/web` 在不需要 server request context 时优先直接调用 client-side oRPC。

## 页面范围

### Runs

用途：管理 agent run 生命周期，并查看 run 详情。

MVP 需求：

- 展示 runs 表格，字段包括 run id、status、prompt 摘要、created time、started time、finished time。
- 支持 status 筛选：all、queued、running、completed、failed、canceled。
- 默认按 created time 倒序加载。
- 支持分页或 load more。
- 点击表格行打开 run detail。
- run detail 展示 input、last message、artifacts 和 events 入口。
- 支持复制 run id。
- 支持跳转到 Observability，并自动带上选中 run id 过滤。
- Dashboard 不提供创建 run 的入口；run 只能通过 SDK 使用 API key 创建。

### Artifacts

用途：浏览和下载 run 生成的文件。

MVP 需求：

- 展示从当前用户 runs 聚合出来的 artifacts 列表。
- 字段包括 artifact path、run id、run status、run created/finished time。
- 支持按 run id 搜索。
- 点击 artifact 打开 detail view。
- detail view 展示 artifact path、所属 run 和下载操作。
- 下载复用现有 run storage URL 行为。
- 没有 artifacts 时展示 empty state。

### Observability

用途：查看 run event records，辅助调试。

MVP 需求：

- 展示最近 run events 的表格或列表。
- 字段包括 event id、run id、event type、created order 和摘要。
- 支持按 run id 过滤。
- 支持按 event type 过滤。
- 点击 event 打开 detail view，展示原始 JSON payload。
- 从 Runs 页面跳转过来时自动带上 run id filter。
- 支持手动刷新。

### API Keys

用途：创建、查看和撤销用户 API keys。

MVP 需求：

- 展示 API key 列表，字段包括 name、可展示的 prefix 或 suffix、created time、last used time（若已有）、status。
- 保留现有 create key dialog。
- 创建成功后完整 API key 只展示一次。
- 支持复制新生成的 key。
- 支持 revoke key，并有确认步骤。
- revoked keys 保留在列表中作为历史记录。

### Account

用途：展示基础登录用户状态。

MVP 需求：

- 展示当前用户 name、email、email verification state、profile picture（若已有）。
- 展示基础 session/login state。
- 提供 sign out 操作。
- MVP 范围内不做 profile editing。

## API 和数据要求

优先复用现有 API：

- `apiKeys.list`
- `apiKeys.create`
- `apiKeys.revoke`
- `runs.list`
- `runs.get`
- `runs.events`
- `runs.eventRecords`

MVP 阶段，Artifacts 页面可以从 `runs.list` 返回的 run records 和每个 run 的 `artifacts` 数组在 web UI 中聚合生成。

如果现有 schema 缺少字段，优先展示已有 source fields。只有页面无法满足 MVP 必要行为时，再补 schema 字段。

后续可能需要补充的字段：

- API key `lastUsedAt`。
- artifact path 之外的 metadata。
- event record timestamp，当前 event id 排序无法满足展示时再添加。

## 非目标

- Organization/team management。
- retry、cancel、scheduling 等高级 run control。
- Artifact preview rendering。
- 完整 profile editing。
- UI 内 realtime event streaming。
- 跨用户或 admin view。

## 验收标准

- `/runs` 可以列出 runs、打开 run detail，并跳转到带过滤的 observability。
- `/artifacts` 可以列出已有 runs 的 artifacts，并支持下载。
- `/observability` 可以按 run id 和 event type 过滤 event records，并展示原始 event payload。
- `/keys` 可以创建、复制、列出、撤销 API keys。
- `/account` 可以展示当前用户信息，并支持 sign out。
- E2E 覆盖登录后访问所有 dashboard 页面、创建 API key，以及基础 run/event/artifact 查看路径。

## 推荐实现顺序

1. API Keys：现有 API surface 最接近完整。
2. Runs：为 Artifacts 和 Observability 提供数据来源。
3. Observability：消费 run event records。
4. Artifacts：从 run records 和 storage URLs 派生。
5. Account：只读信息页加 sign out。

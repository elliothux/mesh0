# Runtime Choice

## 结论

MVP runtime 层直接调用 **Codex bin**，不要把 `@openai/codex-sdk` 作为核心 runtime 依赖。

推荐调用方式：

```bash
codex exec --experimental-json
```

## 架构位置

```text
Agent K8s SDK
  -> Worker / Control Plane
    -> Sandbox Runner
      -> CodexRuntimeAdapter
        -> codex exec --experimental-json
```

`@openai/codex-sdk` 可以用于原型和类型参考，但不作为产品 runtime 边界。

## 原因摘要

- Codex SDK 本身只是对 `codex exec` 的薄封装：spawn bin、写 stdin、读 stdout JSONL。
- runtime 层需要直接控制 sandbox 生命周期、临时 `CODEX_HOME`、workspace、env/token、MCP config、skills mount、取消、stderr、exit code、artifact 扫描。
- 多包一层 SDK 会减少控制力，但不会带来关键能力。
- 公共 API 不应暴露 Codex 原始事件 schema，应通过 `CodexRuntimeAdapter` 归一化成自己的 `AgentRunEvent`。

## 后续演进

当需要更细粒度的 thread、approval、diff、control protocol 时，再把 `CodexRuntimeAdapter` 从 `codex exec` 切到 Codex app-server JSON-RPC。

因此第一期先固定：

- sandbox image 内置并 pin 住 Codex bin 版本。
- runner 启动时校验 `codex --version`。
- stdout JSONL 转换为内部事件。
- workspace diff / files / final output 转换为 `ArtifactRef`。

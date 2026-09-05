# mesh0 Rust SDK

```bash
cargo publish --manifest-path apps/sdk-rust/Cargo.toml
```

```rust
use mesh0::{CronOptions, Mesh0};
use serde_json::json;

let mesh0 = Mesh0::new("https://api.mesh0.run")
    .with_api_key("mesh0.key_xxx.secret");

let run = mesh0.agent()
    .env(json!({
        "OPENAI_API_KEY": "sk_...",
        "OPENAI_BASE_URL": "https://api.openai.com/v1",
        "OPENAI_MODEL": "gpt-5.4"
    }))
    .prompt("Audit this repository.")
    .execute()?;

let agent = mesh0.named_agent("audit-agent");
mesh0
    .cron(CronOptions::new("0 9 * * *").name("daily-audit"))
    .workflow(
        &mesh0
            .all(vec![
                agent.clone().prompt(json!({ "append": "Check API changes." })),
                agent.clone().prompt(json!({ "append": "Check web changes." })),
            ])
            .then(agent.prompt(json!({ "append": "Summarize risks." }))),
    )?;
```

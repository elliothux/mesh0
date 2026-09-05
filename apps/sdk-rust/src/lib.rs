use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::fmt::{Display, Formatter};
use std::thread::sleep;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct Mesh0Error {
    message: String,
}

impl Mesh0Error {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for Mesh0Error {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for Mesh0Error {}

impl From<ureq::Error> for Mesh0Error {
    fn from(error: ureq::Error) -> Self {
        Self::new(error.to_string())
    }
}

impl From<serde_json::Error> for Mesh0Error {
    fn from(error: serde_json::Error) -> Self {
        Self::new(error.to_string())
    }
}

#[derive(Clone, Debug)]
pub struct Mesh0 {
    api_key: Option<String>,
    api_url: String,
}

impl Mesh0 {
    pub fn new(api_url: impl Into<String>) -> Self {
        Self {
            api_key: None,
            api_url: api_url.into().trim_end_matches('/').to_string(),
        }
    }

    pub fn local() -> Self {
        Self::new("http://localhost:5592")
    }

    pub fn with_api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    pub fn agent(&self) -> AgentBuilder {
        AgentBuilder::new(self.clone(), None)
    }

    pub fn named_agent(&self, name: impl Into<String>) -> AgentBuilder {
        AgentBuilder::new(self.clone(), Some(name.into()))
    }

    pub fn all(&self, agents: Vec<AgentBuilder>) -> AgentGroupRun {
        AgentGroupRun::new("all", agents)
    }

    pub fn pipe(&self, agents: Vec<AgentBuilder>) -> AgentGroupRun {
        AgentGroupRun::new("pipe", agents)
    }

    pub fn cron(&self, options: CronOptions) -> CronBuilder {
        CronBuilder {
            client: self.clone(),
            options,
        }
    }

    pub fn webhook(&self, options: WebhookOptions) -> WebhookBuilder {
        WebhookBuilder {
            client: self.clone(),
            options,
        }
    }

    pub fn create_run(&self, input: Value) -> Result<AgentRunHandle, Mesh0Error> {
        Ok(AgentRunHandle::new(
            self.clone(),
            self.rpc("runs/create", input)?,
        ))
    }

    pub fn run(&self, input: Value) -> Result<AgentRunHandle, Mesh0Error> {
        self.create_run(input)
    }

    pub fn get_run(&self, run_id: &str) -> Result<Value, Mesh0Error> {
        self.rpc("runs/get", json!({ "runId": run_id }))
    }

    pub fn list_runs(&self, limit: u16) -> Result<Value, Mesh0Error> {
        self.rpc("runs/list", json!({ "limit": limit }))
    }

    pub fn list_agents(&self, limit: u16) -> Result<Value, Mesh0Error> {
        self.rpc("agents/list", json!({ "limit": limit }))
    }

    pub fn get_agent(&self, name: &str) -> Result<Value, Mesh0Error> {
        self.rpc("agents/get", json!({ "name": name }))
    }

    pub fn persist_agent(&self, name: &str, config: Value) -> Result<Value, Mesh0Error> {
        self.rpc("agents/persist", json!({ "name": name, "config": config }))
    }

    pub fn delete_agent(&self, name: &str) -> Result<Value, Mesh0Error> {
        self.rpc("agents/delete", json!({ "name": name }))
    }

    pub fn run_agent(
        &self,
        name: &str,
        config: Option<Value>,
        prompt: Option<Value>,
        target: Option<String>,
        notifications: Option<Value>,
    ) -> Result<AgentRunHandle, Mesh0Error> {
        let mut input = Map::new();
        input.insert("name".to_string(), Value::String(name.to_string()));
        insert_optional(&mut input, "config", config);
        insert_optional(&mut input, "prompt", prompt);
        insert_optional(&mut input, "target", target.map(Value::String));
        insert_optional(&mut input, "notifications", notifications);
        Ok(AgentRunHandle::new(
            self.clone(),
            self.rpc("agents/run", Value::Object(input))?,
        ))
    }

    pub fn create_cron(&self, input: Value) -> Result<Value, Mesh0Error> {
        self.rpc("crons/create", input)
    }

    pub fn list_crons(&self, limit: u16) -> Result<Value, Mesh0Error> {
        self.rpc("crons/list", json!({ "limit": limit }))
    }

    pub fn delete_cron(&self, cron_id: &str) -> Result<Value, Mesh0Error> {
        self.rpc("crons/delete", json!({ "cronId": cron_id }))
    }

    pub fn delete_crons(&self, cron_id: &str) -> Result<Value, Mesh0Error> {
        self.delete_cron(cron_id)
    }

    pub fn create_webhook(&self, input: Value) -> Result<Value, Mesh0Error> {
        self.rpc("webhooks/create", input)
    }

    pub fn list_webhooks(&self, limit: u16) -> Result<Value, Mesh0Error> {
        self.rpc("webhooks/list", json!({ "limit": limit }))
    }

    pub fn delete_webhook(&self, webhook_id: &str) -> Result<Value, Mesh0Error> {
        self.rpc("webhooks/delete", json!({ "webhookId": webhook_id }))
    }

    pub fn delete_webhooks(&self, webhook_id: &str) -> Result<Value, Mesh0Error> {
        self.delete_webhook(webhook_id)
    }

    fn rpc(&self, path: &str, input: Value) -> Result<Value, Mesh0Error> {
        let url = format!("{}/rpc/{}", self.api_url, path);
        let mut request = ureq::post(&url);
        if let Some(api_key) = &self.api_key {
            request = request.header("Authorization", format!("Bearer {api_key}"));
        }

        let mut response = request.send_json(&input)?;
        let envelope: RpcEnvelope = response.body_mut().read_json()?;
        if let Some(value) = envelope.json {
            return Ok(value);
        }

        if let Some(error) = envelope.error {
            return Err(Mesh0Error::new(error.to_string()));
        }

        Err(Mesh0Error::new("Unexpected Mesh0 response"))
    }
}

#[derive(Clone, Debug)]
pub struct AgentBuilder {
    client: Mesh0,
    config: Map<String, Value>,
    name: Option<String>,
    notifications: Option<Value>,
    target: Option<String>,
}

impl AgentBuilder {
    fn new(client: Mesh0, name: Option<String>) -> Self {
        Self {
            client,
            config: Map::new(),
            name,
            notifications: None,
            target: None,
        }
    }

    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    pub fn workspace(mut self, workspace: Value) -> Self {
        self.config.insert("workspace".to_string(), workspace);
        self
    }

    pub fn env(mut self, env: Value) -> Self {
        self.config.insert("env".to_string(), env);
        self
    }

    pub fn system_prompt(mut self, system_prompt: impl Into<Value>) -> Self {
        self.config
            .insert("systemPrompt".to_string(), system_prompt.into());
        self
    }

    pub fn prompt(mut self, prompt: impl Into<Value>) -> Self {
        self.config.insert("prompt".to_string(), prompt.into());
        self
    }

    pub fn skills(mut self, skills: Value) -> Self {
        self.config.insert("skills".to_string(), skills);
        self
    }

    pub fn mcp(mut self, mcp_servers: Value) -> Self {
        self.config.insert("mcpServers".to_string(), mcp_servers);
        self
    }

    pub fn on(mut self, target: impl Into<String>) -> Self {
        self.target = Some(target.into());
        self
    }

    pub fn notify(mut self, notifications: Value) -> Self {
        self.notifications = Some(notifications);
        self
    }

    pub fn persist(&self) -> Result<Value, Mesh0Error> {
        let name = self
            .name
            .as_deref()
            .ok_or_else(|| Mesh0Error::new("agent name is required before persist"))?;
        self.client
            .persist_agent(name, Value::Object(self.config.clone()))
    }

    pub fn execute(&self) -> Result<AgentRunHandle, Mesh0Error> {
        if let Some(name) = &self.name {
            let mut config = self.config.clone();
            let prompt = config.remove("prompt");
            let config = if config.is_empty() {
                None
            } else {
                Some(Value::Object(config))
            };
            return self.client.run_agent(
                name,
                config,
                prompt,
                self.target.clone(),
                self.notifications.clone(),
            );
        }

        self.client.create_run(self.direct_run_input()?)
    }

    pub fn run(&self) -> Result<AgentRunHandle, Mesh0Error> {
        self.execute()
    }

    pub fn definition(&self) -> Result<Value, Mesh0Error> {
        if let Some(name) = &self.name {
            let mut definition = Map::new();
            definition.insert("agentName".to_string(), Value::String(name.clone()));
            insert_optional(
                &mut definition,
                "config",
                config_without_prompt(&self.config),
            );
            insert_optional(
                &mut definition,
                "prompt",
                self.config.get("prompt").cloned(),
            );
            insert_optional(
                &mut definition,
                "target",
                self.target.clone().map(Value::String),
            );
            insert_optional(&mut definition, "notifications", self.notifications.clone());
            return Ok(Value::Object(definition));
        }

        if self.config.is_empty() {
            return Err(Mesh0Error::new("agent config is required"));
        }

        let mut definition = Map::new();
        definition.insert("config".to_string(), Value::Object(self.config.clone()));
        insert_optional(
            &mut definition,
            "target",
            self.target.clone().map(Value::String),
        );
        insert_optional(&mut definition, "notifications", self.notifications.clone());
        Ok(Value::Object(definition))
    }

    pub fn with_workspace_source(mut self, workspace: Value) -> Self {
        self.config.insert("workspace".to_string(), workspace);
        self
    }

    fn direct_run_input(&self) -> Result<Value, Mesh0Error> {
        if !self.config.contains_key("env") {
            return Err(Mesh0Error::new("env is required"));
        }

        let prompt = resolve_prompt(self.config.get("prompt"))
            .ok_or_else(|| Mesh0Error::new("prompt is required"))?;
        let mut input = self.config.clone();
        input.insert("prompt".to_string(), Value::String(prompt));
        insert_optional(&mut input, "target", self.target.clone().map(Value::String));
        insert_optional(&mut input, "notifications", self.notifications.clone());
        Ok(Value::Object(input))
    }
}

#[derive(Clone, Debug)]
pub struct CronOptions {
    expression: String,
    invalidate_at: Option<String>,
    name: Option<String>,
}

impl CronOptions {
    pub fn new(expression: impl Into<String>) -> Self {
        Self {
            expression: expression.into(),
            invalidate_at: None,
            name: None,
        }
    }

    pub fn invalidate_at(mut self, invalidate_at: impl Into<String>) -> Self {
        self.invalidate_at = Some(invalidate_at.into());
        self
    }

    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }
}

#[derive(Clone, Debug)]
pub struct WebhookOptions {
    name: String,
}

impl WebhookOptions {
    pub fn new(name: impl Into<String>) -> Self {
        Self { name: name.into() }
    }
}

#[derive(Clone, Debug)]
pub struct CronBuilder {
    client: Mesh0,
    options: CronOptions,
}

impl CronBuilder {
    pub fn agent(&self, agent: &AgentBuilder) -> Result<Value, Mesh0Error> {
        self.create(agent.definition()?)
    }

    pub fn all(&self, agents: Vec<AgentBuilder>) -> Result<Value, Mesh0Error> {
        self.workflow(&self.client.all(agents))
    }

    pub fn pipe(&self, agents: Vec<AgentBuilder>) -> Result<Value, Mesh0Error> {
        self.workflow(&self.client.pipe(agents))
    }

    pub fn workflow(&self, workflow: &AgentGroupRun) -> Result<Value, Mesh0Error> {
        self.create(workflow.definition()?)
    }

    fn create(&self, definition: Value) -> Result<Value, Mesh0Error> {
        let mut input = Map::new();
        input.insert("definition".to_string(), definition);
        input.insert(
            "expression".to_string(),
            Value::String(self.options.expression.clone()),
        );
        insert_optional(
            &mut input,
            "invalidateAt",
            self.options.invalidate_at.clone().map(Value::String),
        );
        input.insert(
            "name".to_string(),
            Value::String(
                self.options
                    .name
                    .clone()
                    .unwrap_or_else(|| self.options.expression.clone()),
            ),
        );
        self.client.create_cron(Value::Object(input))
    }
}

#[derive(Clone, Debug)]
pub struct WebhookBuilder {
    client: Mesh0,
    options: WebhookOptions,
}

impl WebhookBuilder {
    pub fn agent(&self, agent: &AgentBuilder) -> Result<Value, Mesh0Error> {
        self.create(agent.definition()?)
    }

    pub fn all(&self, agents: Vec<AgentBuilder>) -> Result<Value, Mesh0Error> {
        self.workflow(&self.client.all(agents))
    }

    pub fn pipe(&self, agents: Vec<AgentBuilder>) -> Result<Value, Mesh0Error> {
        self.workflow(&self.client.pipe(agents))
    }

    pub fn workflow(&self, workflow: &AgentGroupRun) -> Result<Value, Mesh0Error> {
        self.create(workflow.definition()?)
    }

    fn create(&self, definition: Value) -> Result<Value, Mesh0Error> {
        self.client.create_webhook(json!({
            "definition": definition,
            "name": self.options.name,
        }))
    }
}

#[derive(Clone, Debug)]
pub struct AgentGroupRun {
    agents: Vec<AgentBuilder>,
    catch_agent: Option<AgentBuilder>,
    mode: String,
    then_agent: Option<AgentBuilder>,
}

impl AgentGroupRun {
    fn new(mode: impl Into<String>, agents: Vec<AgentBuilder>) -> Self {
        Self {
            agents,
            catch_agent: None,
            mode: mode.into(),
            then_agent: None,
        }
    }

    pub fn then(mut self, agent: AgentBuilder) -> Self {
        self.then_agent = Some(agent);
        self
    }

    pub fn catch(mut self, agent: AgentBuilder) -> Self {
        self.catch_agent = Some(agent);
        self
    }

    pub fn definition(&self) -> Result<Value, Mesh0Error> {
        let agents = self
            .agents
            .iter()
            .map(AgentBuilder::definition)
            .collect::<Result<Vec<_>, _>>()?;
        let mut definition = Map::new();
        definition.insert("mode".to_string(), Value::String(self.mode.clone()));
        definition.insert("agents".to_string(), Value::Array(agents));
        insert_optional(
            &mut definition,
            "then",
            self.then_agent
                .as_ref()
                .map(AgentBuilder::definition)
                .transpose()?,
        );
        insert_optional(
            &mut definition,
            "catch",
            self.catch_agent
                .as_ref()
                .map(AgentBuilder::definition)
                .transpose()?,
        );
        Ok(Value::Object(definition))
    }

    pub fn run(&self) -> Result<Vec<AgentRunHandle>, Mesh0Error> {
        self.execute()
    }

    pub fn execute(&self) -> Result<Vec<AgentRunHandle>, Mesh0Error> {
        match self.execute_base() {
            Ok(mut handles) => {
                if let Some(agent) = &self.then_agent {
                    handles.push(agent.execute()?);
                }
                Ok(handles)
            }
            Err(error) => {
                let Some(agent) = &self.catch_agent else {
                    return Err(error);
                };
                Ok(vec![agent
                    .clone()
                    .prompt(json!({ "append": error.to_string() }))
                    .execute()?])
            }
        }
    }

    fn execute_base(&self) -> Result<Vec<AgentRunHandle>, Mesh0Error> {
        if self.mode == "all" {
            return self.agents.iter().map(AgentBuilder::execute).collect();
        }

        let mut handles = Vec::new();
        let mut previous: Option<Value> = None;
        for agent in &self.agents {
            let mut next_agent = agent.clone();
            if let Some(record) = &previous {
                let run_id = record
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| Mesh0Error::new("pipe run id is missing"))?;
                next_agent = next_agent.with_workspace_source(json!({
                    "source": { "runId": run_id, "type": "run" }
                }));
            }
            let handle = next_agent.execute()?;
            previous = Some(handle.wait(Duration::from_secs(1), Duration::from_secs(600))?);
            if previous
                .as_ref()
                .and_then(|record| record.get("status"))
                .and_then(Value::as_str)
                != Some("completed")
            {
                return Err(Mesh0Error::new("pipe run did not complete"));
            }
            handles.push(handle);
        }
        Ok(handles)
    }
}

#[derive(Clone, Debug)]
pub struct AgentRunHandle {
    client: Mesh0,
    pub id: String,
    pub record: Value,
}

impl AgentRunHandle {
    fn new(client: Mesh0, record: Value) -> Self {
        let id = record
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        Self { client, id, record }
    }

    pub fn result(&self) -> Result<Value, Mesh0Error> {
        self.client.get_run(&self.id)
    }

    pub fn wait(&self, interval: Duration, timeout: Duration) -> Result<Value, Mesh0Error> {
        let deadline = Instant::now() + timeout;
        loop {
            let record = self.result()?;
            if let Some(status) = record.get("status").and_then(Value::as_str) {
                if matches!(status, "completed" | "failed" | "canceled") {
                    return Ok(record);
                }
            }

            if Instant::now() >= deadline {
                return Err(Mesh0Error::new(format!("Run {} did not finish", self.id)));
            }

            sleep(interval);
        }
    }
}

#[derive(Deserialize)]
struct RpcEnvelope {
    json: Option<Value>,
    error: Option<Value>,
}

fn resolve_prompt(prompt: Option<&Value>) -> Option<String> {
    match prompt {
        Some(Value::String(value)) => Some(value.clone()),
        Some(Value::Object(value)) => value
            .get("replace")
            .or_else(|| value.get("append"))
            .and_then(Value::as_str)
            .map(str::to_string),
        _ => None,
    }
}

fn insert_optional(map: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        map.insert(key.to_string(), value);
    }
}

fn config_without_prompt(config: &Map<String, Value>) -> Option<Value> {
    let value = config
        .iter()
        .filter_map(|(key, item)| {
            if key == "prompt" {
                return None;
            }
            Some((key.clone(), item.clone()))
        })
        .collect::<Map<_, _>>();
    if value.is_empty() {
        return None;
    }
    Some(Value::Object(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc::{channel, Receiver};
    use std::thread;

    #[test]
    fn direct_agent_posts_run_create() {
        let (api_url, request) = start_server(json!({
            "id": "run_rust",
            "status": "queued"
        }));
        let run = Mesh0::new(api_url)
            .with_api_key("mesh0.key_test.secret")
            .agent()
            .env(json!({
                "OPENAI_API_KEY": "sk_test",
                "OPENAI_BASE_URL": "https://api.openai.com/v1",
                "OPENAI_MODEL": "gpt-5.4"
            }))
            .prompt(json!({ "replace": "Say hello" }))
            .execute()
            .unwrap();
        let request = request.recv().unwrap();
        let body = request_body_value(&request);

        assert_eq!(run.id, "run_rust");
        assert!(request.starts_with("POST /rpc/runs/create HTTP/1.1"));
        assert!(request.contains("authorization: Bearer mesh0.key_test.secret"));
        assert_eq!(body["prompt"], "Say hello");
    }

    #[test]
    fn named_agent_posts_ephemeral_prompt_override() {
        let (api_url, request) = start_server(json!({
            "id": "run_named_rust",
            "status": "queued"
        }));
        let run = Mesh0::new(api_url)
            .named_agent("saved-agent")
            .prompt(json!({ "append": "Extra task" }))
            .execute()
            .unwrap();
        let request = request.recv().unwrap();
        let body = request_body_value(&request);

        assert_eq!(run.id, "run_named_rust");
        assert!(request.starts_with("POST /rpc/agents/run HTTP/1.1"));
        assert_eq!(body["name"], "saved-agent");
        assert_eq!(body["prompt"]["append"], "Extra task");
    }

    #[test]
    fn cron_workflow_posts_agent_group_definition() {
        let (api_url, request) = start_server(json!({
            "id": "cron_rust",
            "definition": { "mode": "all", "agents": [] }
        }));
        let mesh0 = Mesh0::new(api_url);
        let workflow = mesh0
            .all(vec![
                mesh0
                    .named_agent("saved-agent")
                    .prompt(json!({ "append": "First" })),
                mesh0
                    .named_agent("saved-agent")
                    .prompt(json!({ "append": "Second" })),
            ])
            .then(
                mesh0
                    .named_agent("saved-agent")
                    .prompt(json!({ "append": "Done" })),
            );
        let cron = mesh0
            .cron(CronOptions::new("* * * * *").name("rust workflow cron"))
            .workflow(&workflow)
            .unwrap();
        let request = request.recv().unwrap();
        let body = request_body_value(&request);

        assert_eq!(cron["id"], "cron_rust");
        assert!(request.starts_with("POST /rpc/crons/create HTTP/1.1"));
        assert_eq!(body["definition"]["mode"], "all");
        assert_eq!(body["definition"]["agents"].as_array().unwrap().len(), 2);
        assert_eq!(body["definition"]["then"]["prompt"]["append"], "Done");
    }

    #[test]
    fn webhook_pipe_posts_agent_group_definition() {
        let (api_url, request) = start_server(json!({
            "id": "webhook_rust",
            "definition": { "mode": "pipe", "agents": [] }
        }));
        let mesh0 = Mesh0::new(api_url);
        let webhook = mesh0
            .webhook(WebhookOptions::new("rust-webhook"))
            .pipe(vec![
                mesh0
                    .named_agent("saved-agent")
                    .prompt(json!({ "append": "First" })),
                mesh0
                    .named_agent("saved-agent")
                    .prompt(json!({ "append": "Second" })),
            ])
            .unwrap();
        let request = request.recv().unwrap();
        let body = request_body_value(&request);

        assert_eq!(webhook["id"], "webhook_rust");
        assert!(request.starts_with("POST /rpc/webhooks/create HTTP/1.1"));
        assert_eq!(body["definition"]["mode"], "pipe");
        assert_eq!(body["definition"]["agents"].as_array().unwrap().len(), 2);
    }

    fn start_server(response: Value) -> (String, Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_request(&mut stream);
            sender.send(request).unwrap();
            let body = json!({ "json": response }).to_string();
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });

        (format!("http://{address}"), receiver)
    }

    fn read_request(stream: &mut impl Read) -> String {
        let mut bytes = Vec::new();
        let mut buffer = [0_u8; 1024];
        loop {
            let length = stream.read(&mut buffer).unwrap();
            bytes.extend_from_slice(&buffer[..length]);
            let request = String::from_utf8_lossy(&bytes);
            let Some(header_end) = request.find("\r\n\r\n") else {
                continue;
            };
            let chunked = request.lines().any(|line| {
                let Some((name, value)) = line.split_once(':') else {
                    return false;
                };
                name.eq_ignore_ascii_case("transfer-encoding")
                    && value.to_ascii_lowercase().contains("chunked")
            });
            if chunked {
                if request[header_end + 4..].contains("\r\n0\r\n\r\n") {
                    return request.to_string();
                }
                continue;
            }
            let content_length = request
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    if name.eq_ignore_ascii_case("content-length") {
                        return value.trim().parse::<usize>().ok();
                    }
                    None
                })
                .unwrap_or(0);
            if bytes.len() >= header_end + 4 + content_length {
                return request.to_string();
            }
        }
    }

    fn request_body_value(request: &str) -> Value {
        let (_, body) = request.split_once("\r\n\r\n").unwrap();
        serde_json::from_str(body).unwrap()
    }
}

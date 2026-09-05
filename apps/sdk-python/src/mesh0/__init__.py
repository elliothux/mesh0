from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class Mesh0Error(RuntimeError):
    pass


class Mesh0:
    def __init__(
        self,
        api_url: str = "http://localhost:5592",
        api_key: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key.strip() if api_key is not None else None
        if self.api_key == "":
            raise ValueError("api_key is required when provided")
        self.timeout = timeout

    def agent(self, name: str | None = None) -> AgentBuilder:
        return AgentBuilder(self, name_value=name)

    def all(self, agents: list[AgentBuilder]) -> AgentGroupRun:
        return AgentGroupRun(self, "all", agents)

    def pipe(self, agents: list[AgentBuilder]) -> AgentGroupRun:
        return AgentGroupRun(self, "pipe", agents)

    def cron(self, options: dict[str, str]) -> CronBuilder:
        return CronBuilder(self, options)

    def webhook(self, options: dict[str, str]) -> WebhookBuilder:
        return WebhookBuilder(self, options)

    def create_run(self, input: dict[str, Any]) -> AgentRunHandle:
        return AgentRunHandle(self, self._rpc("runs/create", input))

    def run(self, input: dict[str, Any]) -> AgentRunHandle:
        return self.create_run(input)

    def get_run(self, run_id: str) -> dict[str, Any]:
        return self._rpc("runs/get", {"runId": run_id})

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        return self._rpc("runs/list", {"limit": limit})

    def list_agents(self, limit: int = 50) -> list[dict[str, Any]]:
        return self._rpc("agents/list", {"limit": limit})

    def get_agent(self, name: str) -> dict[str, Any]:
        return self._rpc("agents/get", {"name": name})

    def persist_agent(self, name: str, config: dict[str, Any]) -> dict[str, Any]:
        return self._rpc("agents/persist", {"name": name, "config": config})

    def delete_agent(self, name: str) -> dict[str, Any]:
        return self._rpc("agents/delete", {"name": name})

    def run_agent(
        self,
        name: str,
        config: dict[str, Any] | None = None,
        prompt: str | dict[str, str] | None = None,
        target: str | None = None,
        notifications: dict[str, str] | None = None,
    ) -> AgentRunHandle:
        return AgentRunHandle(
            self,
            self._rpc(
                "agents/run",
                clean_dict(
                    {
                        "name": name,
                        "config": config,
                        "prompt": prompt,
                        "target": target,
                        "notifications": notifications,
                    }
                ),
            ),
        )

    def create_cron(self, input: dict[str, Any]) -> dict[str, Any]:
        return self._rpc("crons/create", input)

    def list_crons(self, limit: int = 50) -> list[dict[str, Any]]:
        return self._rpc("crons/list", {"limit": limit})

    def delete_cron(self, cron_id: str) -> dict[str, Any]:
        return self._rpc("crons/delete", {"cronId": cron_id})

    def delete_crons(self, cron_id: str) -> dict[str, Any]:
        return self.delete_cron(cron_id)

    def create_webhook(self, input: dict[str, Any]) -> dict[str, Any]:
        return self._rpc("webhooks/create", input)

    def list_webhooks(self, limit: int = 50) -> list[dict[str, Any]]:
        return self._rpc("webhooks/list", {"limit": limit})

    def delete_webhook(self, webhook_id: str) -> dict[str, Any]:
        return self._rpc("webhooks/delete", {"webhookId": webhook_id})

    def delete_webhooks(self, webhook_id: str) -> dict[str, Any]:
        return self.delete_webhook(webhook_id)

    def _rpc(self, path: str, input: dict[str, Any]) -> Any:
        body = json.dumps(input).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.api_key is not None:
            headers["Authorization"] = f"Bearer {self.api_key}"

        request = Request(
            f"{self.api_url}/rpc/{path}",
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            message = error.read().decode("utf-8")
            raise Mesh0Error(message) from error

        if "json" in payload:
            return payload["json"]

        if "error" in payload:
            raise Mesh0Error(str(payload["error"]))

        raise Mesh0Error(f"Unexpected Mesh0 response: {payload!r}")


@dataclass(frozen=True)
class AgentBuilder:
    client: Mesh0
    name_value: str | None = None
    config: dict[str, Any] | None = None
    target: str | None = None
    notifications: dict[str, str] | None = None

    def name(self, name: str) -> AgentBuilder:
        return self._next(name_value=name)

    def workspace(self, workspace: dict[str, Any]) -> AgentBuilder:
        return self._config("workspace", workspace)

    def env(self, env: dict[str, str]) -> AgentBuilder:
        return self._config("env", env)

    def system_prompt(self, system_prompt: str | dict[str, str]) -> AgentBuilder:
        return self._config("systemPrompt", system_prompt)

    def prompt(self, prompt: str | dict[str, str]) -> AgentBuilder:
        return self._config("prompt", prompt)

    def skills(self, skills: list[dict[str, Any]]) -> AgentBuilder:
        return self._config("skills", skills)

    def mcp(self, mcp_servers: dict[str, Any]) -> AgentBuilder:
        return self._config("mcpServers", mcp_servers)

    def on(self, target: str) -> AgentBuilder:
        return self._next(target=target)

    def notify(self, notifications: dict[str, str]) -> AgentBuilder:
        return self._next(notifications=notifications)

    def persist(self) -> dict[str, Any]:
        if self.name_value is None:
            raise ValueError("agent name is required before persist")
        return self.client.persist_agent(self.name_value, self.config or {})

    def execute(self) -> AgentRunHandle:
        if self.name_value is not None:
            return self.client.run_agent(
                self.name_value,
                config=config_without_prompt(self.config or {}),
                prompt=(self.config or {}).get("prompt"),
                target=self.target,
                notifications=self.notifications,
            )

        return self.client.create_run(build_direct_run_input(self.config or {}, self))

    def run(self) -> AgentRunHandle:
        return self.execute()

    def definition(self) -> dict[str, Any]:
        if self.name_value is not None:
            return clean_dict(
                {
                    "agentName": self.name_value,
                    "config": config_without_prompt(self.config or {}),
                    "prompt": (self.config or {}).get("prompt"),
                    "target": self.target,
                    "notifications": self.notifications,
                }
            )

        if not self.config:
            raise ValueError("agent config is required")

        return clean_dict(
            {
                "config": self.config,
                "target": self.target,
                "notifications": self.notifications,
            }
        )

    def with_workspace_source(self, workspace: dict[str, Any]) -> AgentBuilder:
        return self.workspace(workspace)

    def _config(self, key: str, value: Any) -> AgentBuilder:
        return self._next(config={**(self.config or {}), key: value})

    def _next(
        self,
        *,
        name_value: str | None = None,
        config: dict[str, Any] | None = None,
        target: str | None = None,
        notifications: dict[str, str] | None = None,
    ) -> AgentBuilder:
        return AgentBuilder(
            client=self.client,
            name_value=self.name_value if name_value is None else name_value,
            config=self.config if config is None else config,
            target=self.target if target is None else target,
            notifications=self.notifications if notifications is None else notifications,
        )


@dataclass(frozen=True)
class CronBuilder:
    client: Mesh0
    options: dict[str, str]

    def agent(self, agent: AgentBuilder) -> dict[str, Any]:
        return self._create(agent.definition())

    def all(self, agents: list[AgentBuilder]) -> dict[str, Any]:
        return self.workflow(self.client.all(agents))

    def pipe(self, agents: list[AgentBuilder]) -> dict[str, Any]:
        return self.workflow(self.client.pipe(agents))

    def workflow(self, workflow: AgentGroupRun) -> dict[str, Any]:
        return self._create(workflow.definition())

    def _create(self, definition: dict[str, Any]) -> dict[str, Any]:
        expression = self.options["expression"]
        return self.client.create_cron(
            clean_dict(
                {
                    "definition": definition,
                    "expression": expression,
                    "invalidateAt": self.options.get("invalidateAt"),
                    "name": self.options.get("name", expression),
                }
            )
        )


@dataclass(frozen=True)
class WebhookBuilder:
    client: Mesh0
    options: dict[str, str]

    def agent(self, agent: AgentBuilder) -> dict[str, Any]:
        return self._create(agent.definition())

    def all(self, agents: list[AgentBuilder]) -> dict[str, Any]:
        return self.workflow(self.client.all(agents))

    def pipe(self, agents: list[AgentBuilder]) -> dict[str, Any]:
        return self.workflow(self.client.pipe(agents))

    def workflow(self, workflow: AgentGroupRun) -> dict[str, Any]:
        return self._create(workflow.definition())

    def _create(self, definition: dict[str, Any]) -> dict[str, Any]:
        return self.client.create_webhook(
            {"definition": definition, "name": self.options["name"]}
        )


@dataclass(frozen=True)
class AgentGroupRun:
    client: Mesh0
    mode: str
    agents: list[AgentBuilder]
    then_agent: AgentBuilder | None = None
    catch_agent: AgentBuilder | None = None

    def then(self, agent: AgentBuilder) -> AgentGroupRun:
        return AgentGroupRun(
            self.client,
            self.mode,
            self.agents,
            then_agent=agent,
            catch_agent=self.catch_agent,
        )

    def catch(self, agent: AgentBuilder) -> AgentGroupRun:
        return AgentGroupRun(
            self.client,
            self.mode,
            self.agents,
            then_agent=self.then_agent,
            catch_agent=agent,
        )

    def definition(self) -> dict[str, Any]:
        then_definition = (
            None if self.then_agent is None else self.then_agent.definition()
        )
        catch_definition = (
            None if self.catch_agent is None else self.catch_agent.definition()
        )
        return clean_dict(
            {
                "mode": self.mode,
                "agents": [agent.definition() for agent in self.agents],
                "then": then_definition,
                "catch": catch_definition,
            }
        )

    def run(self) -> list[AgentRunHandle]:
        return self.execute()

    def execute(self) -> list[AgentRunHandle]:
        try:
            runs = self._run_all() if self.mode == "all" else self._run_pipe()
            if self.then_agent is not None:
                runs.append(self.then_agent.execute())
            return runs
        except Exception as error:
            if self.catch_agent is None:
                raise
            return [self.catch_agent.prompt({"append": str(error)}).execute()]

    def _run_all(self) -> list[AgentRunHandle]:
        return [agent.execute() for agent in self.agents]

    def _run_pipe(self) -> list[AgentRunHandle]:
        handles: list[AgentRunHandle] = []
        previous: dict[str, Any] | None = None
        for agent in self.agents:
            next_agent = agent
            if previous is not None:
                next_agent = agent.with_workspace_source(
                    {"source": {"runId": previous["id"], "type": "run"}}
                )
            handle = next_agent.execute()
            handles.append(handle)
            previous = handle.wait()
            if previous["status"] != "completed":
                raise Mesh0Error(
                    f"Pipe run {previous['id']} finished with status {previous['status']}"
                )
        return handles


class AgentRunHandle:
    def __init__(self, client: Mesh0, record: dict[str, Any]) -> None:
        self.client = client
        self.record = record
        self.id = str(record["id"])

    def result(self) -> dict[str, Any]:
        return self.client.get_run(self.id)

    def wait(
        self,
        interval_seconds: float = 1.0,
        timeout_seconds: float = 600.0,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds
        while True:
            record = self.result()
            if record["status"] in {"completed", "failed", "canceled"}:
                return record
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Run {self.id} did not finish")
            time.sleep(interval_seconds)


def build_direct_run_input(config: dict[str, Any], builder: AgentBuilder) -> dict[str, Any]:
    if "env" not in config:
        raise ValueError("env is required")
    prompt = resolve_prompt(config.get("prompt"))
    if prompt is None:
        raise ValueError("prompt is required")
    return clean_dict(
        {
            **config,
            "prompt": prompt,
            "target": builder.target,
            "notifications": builder.notifications,
        }
    )


def resolve_prompt(prompt: str | dict[str, str] | None) -> str | None:
    if prompt is None or isinstance(prompt, str):
        return prompt
    if "replace" in prompt:
        return prompt["replace"]
    return prompt.get("append")


def config_without_prompt(config: dict[str, Any]) -> dict[str, Any] | None:
    value = {key: item for key, item in config.items() if key != "prompt"}
    return value or None


def clean_dict(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in value.items() if item is not None}


__all__ = [
    "AgentBuilder",
    "AgentGroupRun",
    "AgentRunHandle",
    "CronBuilder",
    "Mesh0",
    "Mesh0Error",
    "WebhookBuilder",
]

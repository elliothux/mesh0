# Website Content

## Hero

```text
Launch 1,000 agents in 100ms.
One line of code.
```

```text
Open-source agent infrastructure for developers.
Dispatch, observe, and manage agent fleets across any sandbox backend.
```

CTA:

- Get started
- Star on GitHub

```ts
const job = await mesh0.agents.map(tasks, { concurrency: 1000, agent });
```

```text
One call. One fleet. Every run tracked.
```

## API

```text
Fleet orchestration as an API.
```

```text
Define an agent once. Map it over thousands of tasks. Stream every event. Collect every artifact.
```

```ts
const agent = mesh0
  .agent()
  .tools({ github, linear })
  .skills(["code-review", "test-fixer"])
  .sandbox({ provider: "cloudflare" })
  .prompt(({ repo }) => `Review ${repo.name} and produce a patch.`);

const job = await mesh0.agents.map(repos, {
  concurrency: 1000,
  retries: 2,
  agent,
});

for await (const event of job.events()) {
  console.log(event.runId, event.type);
}

const artifacts = await job.artifacts();
```

CTA:

- Read the docs
- Star on GitHub

## Fleet Control

```text
Agents are workloads.
Mesh0 gives them a control plane.
```

```text
Queue runs. Dispatch fleets. Set concurrency. Retry failures. Cancel jobs. Stream logs. Collect outputs.
```

CTA:

- Run your first fleet

## Observability

```text
Every agent run is visible.
```

```text
Track status, events, logs, tool calls, errors, and artifacts from every run in the fleet.
```

CTA:

- Explore events

## Artifacts

```text
Outputs that keep moving.
```

```text
Collect patches, files, directories, JSON, reports, and logs from every agent run.
```

CTA:

- View artifact API

## Sandbox Backends

```text
Bring your sandbox.
Keep the API.
```

```text
Run the same fleet API across Cloudflare, E2B, Daytona, Modal, Kubernetes, Docker, or your own backend adapter.
```

```ts
const job = await mesh0.jobs.create({
  name: "migrate-repos",
  parallelism: 500,
  sandbox: {
    provider: "kubernetes",
    pool: "large",
  },
  agent,
  input: repos,
});
```

CTA:

- Build an adapter

## Open Source

```text
Open-source agent infrastructure.
Fork it. Self-host it. Extend it.
```

```text
Mesh0 is built for teams that want control over their agent stack: SDK, control plane, adapters, events, and artifacts.
```

CTA:

- Star on GitHub
- Read the architecture

## Final CTA

```text
Start with one line.
Scale to one thousand agents.
```

CTA:

- Get started
- Star on GitHub

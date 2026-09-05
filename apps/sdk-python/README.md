# mesh0 Python SDK

```bash
python3 -m pip install build twine
python3 -m build apps/sdk-python
python3 -m twine upload apps/sdk-python/dist/*
```

```python
from mesh0 import Mesh0

mesh0 = Mesh0(api_url="https://api.mesh0.run", api_key="mesh0.key_xxx.secret")
run = mesh0.agent().env({
    "OPENAI_API_KEY": "sk_...",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "OPENAI_MODEL": "gpt-5.4",
}).prompt("Audit this repository.").execute()

agent = mesh0.agent("audit-agent")
mesh0.cron({"expression": "0 9 * * *", "name": "daily-audit"}).workflow(
    mesh0.all([
        agent.prompt({"append": "Check API changes."}),
        agent.prompt({"append": "Check web changes."}),
    ]).then(agent.prompt({"append": "Summarize risks."}))
)
```

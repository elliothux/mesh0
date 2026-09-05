import json
import unittest
from unittest.mock import patch

from mesh0 import Mesh0


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps({"json": self.payload}).encode()


class Mesh0Test(unittest.TestCase):
    def test_direct_agent_run_posts_run_create(self):
        run_record = {
            "id": "run_python",
            "status": "queued",
        }
        with patch("mesh0.urlopen", return_value=FakeResponse(run_record)) as urlopen:
            run = (
                Mesh0(api_url="http://mesh0.local", api_key="mesh0.key_test.secret")
                .agent()
                .env(
                    {
                        "OPENAI_API_KEY": "sk_test",
                        "OPENAI_BASE_URL": "https://api.openai.com/v1",
                        "OPENAI_MODEL": "gpt-5.4",
                    }
                )
                .prompt({"replace": "Say hello"})
                .execute()
            )

        request = urlopen.call_args.args[0]
        self.assertEqual(run.id, "run_python")
        self.assertEqual(request.full_url, "http://mesh0.local/rpc/runs/create")
        self.assertEqual(
            request.headers["Authorization"],
            "Bearer mesh0.key_test.secret",
        )
        self.assertEqual(json.loads(request.data.decode())["prompt"], "Say hello")

    def test_named_agent_run_keeps_override_ephemeral(self):
        run_record = {
            "id": "run_named_python",
            "status": "queued",
        }
        with patch("mesh0.urlopen", return_value=FakeResponse(run_record)) as urlopen:
            run = (
                Mesh0(api_url="http://mesh0.local")
                .agent("saved-agent")
                .prompt({"append": "Extra task"})
                .execute()
            )

        request = urlopen.call_args.args[0]
        body = json.loads(request.data.decode())
        self.assertEqual(run.id, "run_named_python")
        self.assertEqual(request.full_url, "http://mesh0.local/rpc/agents/run")
        self.assertEqual(body, {"name": "saved-agent", "prompt": {"append": "Extra task"}})

    def test_cron_workflow_posts_agent_group_definition(self):
        cron_record = {
            "id": "cron_python",
            "definition": {"mode": "all", "agents": []},
        }
        mesh0 = Mesh0(api_url="http://mesh0.local")
        workflow = mesh0.all(
            [
                mesh0.agent("saved-agent").prompt({"append": "First"}),
                mesh0.agent("saved-agent").prompt({"append": "Second"}),
            ]
        ).then(mesh0.agent("saved-agent").prompt({"append": "Done"}))

        with patch("mesh0.urlopen", return_value=FakeResponse(cron_record)) as urlopen:
            cron = mesh0.cron(
                {"expression": "* * * * *", "name": "python workflow cron"}
            ).workflow(workflow)

        request = urlopen.call_args.args[0]
        body = json.loads(request.data.decode())
        self.assertEqual(cron["id"], "cron_python")
        self.assertEqual(request.full_url, "http://mesh0.local/rpc/crons/create")
        self.assertEqual(body["definition"]["mode"], "all")
        self.assertEqual(len(body["definition"]["agents"]), 2)
        self.assertEqual(body["definition"]["then"]["prompt"]["append"], "Done")

    def test_webhook_pipe_posts_agent_group_definition(self):
        webhook_record = {
            "id": "webhook_python",
            "definition": {"mode": "pipe", "agents": []},
        }
        mesh0 = Mesh0(api_url="http://mesh0.local")

        with patch("mesh0.urlopen", return_value=FakeResponse(webhook_record)) as urlopen:
            webhook = mesh0.webhook({"name": "python-webhook"}).pipe(
                [
                    mesh0.agent("saved-agent").prompt({"append": "First"}),
                    mesh0.agent("saved-agent").prompt({"append": "Second"}),
                ]
            )

        request = urlopen.call_args.args[0]
        body = json.loads(request.data.decode())
        self.assertEqual(webhook["id"], "webhook_python")
        self.assertEqual(request.full_url, "http://mesh0.local/rpc/webhooks/create")
        self.assertEqual(body["definition"]["mode"], "pipe")
        self.assertEqual(len(body["definition"]["agents"]), 2)


if __name__ == "__main__":
    unittest.main()

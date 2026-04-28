#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
IMAGE="${RUNNER_IMAGE:-mesh0/runner:local}"
SMOKE_MODEL="${RUNNER_SMOKE_MODEL:-}"
SMOKE_MODEL_PROVIDER="${RUNNER_SMOKE_MODEL_PROVIDER:-}"
SMOKE_WIRE_API="${RUNNER_SMOKE_WIRE_API:-}"

load_env_value() {
  local key="$1"
  local line

  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  if [ -z "${line}" ]; then
    return 0
  fi

  local value="${line#*=}"
  value="${value%$'\r'}"

  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf "%s" "${value}"
}

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

OPENAI_API_KEY="$(load_env_value OPENAI_API_KEY)"
OPENAI_BASE_URL="$(load_env_value OPENAI_BASE_URL)"
OPENAI_MODEL="$(load_env_value OPENAI_MODEL)"
OPENAI_MODEL_PROVIDER="$(load_env_value OPENAI_MODEL_PROVIDER)"
OPENAI_WIRE_API="$(load_env_value OPENAI_WIRE_API)"

if [ -z "${SMOKE_MODEL}" ]; then
  SMOKE_MODEL="${OPENAI_MODEL}"
fi

if [ -z "${SMOKE_MODEL_PROVIDER}" ]; then
  SMOKE_MODEL_PROVIDER="${OPENAI_MODEL_PROVIDER}"
fi

if [ -z "${SMOKE_MODEL_PROVIDER}" ]; then
  SMOKE_MODEL_PROVIDER="mesh0-openai"
fi

if [ -z "${SMOKE_WIRE_API}" ]; then
  SMOKE_WIRE_API="${OPENAI_WIRE_API}"
fi

if [ -z "${SMOKE_WIRE_API}" ]; then
  SMOKE_WIRE_API="chat"
fi

if [ -z "${OPENAI_API_KEY}" ]; then
  echo "OPENAI_API_KEY is required in ${ENV_FILE}" >&2
  exit 1
fi

if [ -z "${OPENAI_BASE_URL}" ]; then
  echo "OPENAI_BASE_URL is required in ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! "${SMOKE_MODEL_PROVIDER}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "OPENAI_MODEL_PROVIDER must contain only letters, digits, underscores, or hyphens" >&2
  exit 1
fi

if [[ "${SMOKE_WIRE_API}" != "chat" && "${SMOKE_WIRE_API}" != "responses" ]]; then
  echo "OPENAI_WIRE_API must be chat or responses" >&2
  exit 1
fi

docker run --rm \
  --platform linux/amd64 \
  --entrypoint bash \
  -e CODEX_API_KEY="${OPENAI_API_KEY}" \
  -e OPENAI_BASE_URL="${OPENAI_BASE_URL}" \
  -e RUNNER_SMOKE_MODEL="${SMOKE_MODEL}" \
  -e RUNNER_SMOKE_MODEL_PROVIDER="${SMOKE_MODEL_PROVIDER}" \
  -e RUNNER_SMOKE_WIRE_API="${SMOKE_WIRE_API}" \
  "${IMAGE}" \
  -lc '
    set -euo pipefail

    export CODEX_HOME=/mesh0-codex

    mkdir -p /workspace/smoke /mesh0-runtime

    cd /workspace/smoke

    git init -q
    git config user.email smoke@mesh0.local
    git config user.name "Mesh0 Smoke"
    printf "mesh0 runner smoke test\n" > README.md
    git add README.md
    git commit -qm "init"

    python - <<'"'"'PY'"'"'
import json
import os

model = os.environ.get("RUNNER_SMOKE_MODEL")
model_provider = os.environ["RUNNER_SMOKE_MODEL_PROVIDER"]
run = {
    "runId": "run_smoke",
    "prompt": "Respond with exactly: mesh0-runner-smoke-ok",
    "systemPrompt": {
        "append": "Keep this smoke-test response to the requested exact text."
    },
    "modelProvider": model_provider,
    "modelProviders": {
        model_provider: {
            "name": model_provider,
            "env_key": "CODEX_API_KEY",
            "base_url": os.environ["OPENAI_BASE_URL"],
            "wire_api": os.environ["RUNNER_SMOKE_WIRE_API"],
        }
    },
    "sandbox": "read-only",
}

if model:
    run["model"] = model

with open("/mesh0-runtime/run.json", "w", encoding="utf-8") as file:
    json.dump(run, file)
PY

    mesh0-runner run \
      --runtime-dir /mesh0-runtime \
      --workspace /workspace/smoke \
      --output-dir /mesh0-runtime/output \
      2>&1 \
      | python -c "import os, re, sys
api_key = os.environ.get(\"CODEX_API_KEY\", \"\")
base_url = os.environ.get(\"OPENAI_BASE_URL\", \"\")
redacted = [value for value in (api_key, base_url) if value]
if base_url.startswith(\"https://\"):
    redacted.append(\"wss://\" + base_url[len(\"https://\"):])
elif base_url.startswith(\"http://\"):
    redacted.append(\"ws://\" + base_url[len(\"http://\"):])
for line in sys.stdin:
    line = re.sub(r\"(Incorrect API key provided: )[A-Za-z0-9_*\\-]+\", r\"\\1[redacted]\", line)
    for value in redacted:
        line = line.replace(value, \"[redacted]\")
    sys.stdout.write(line)" \
      | tee /tmp/mesh0-runner-smoke.log

    grep -q "mesh0-runner-smoke-ok" /mesh0-runtime/output/codex/last-message.txt
    test -s /mesh0-runtime/output/codex/exec.jsonl
    test -s /mesh0-runtime/output/mesh0/output-manifest.json
    jq -e ".status == \"completed\"" /mesh0-runtime/output/mesh0/output-manifest.json >/dev/null
  '

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
IMAGE="${RUNNER_IMAGE:-mesh0/runner:local}"
SMOKE_MODEL="${RUNNER_SMOKE_MODEL:-}"
SMOKE_MODEL_PROVIDER="${RUNNER_SMOKE_MODEL_PROVIDER:-}"

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

if [ -z "${SMOKE_MODEL}" ]; then
  SMOKE_MODEL="${OPENAI_MODEL}"
fi

if [ -z "${SMOKE_MODEL_PROVIDER}" ]; then
  SMOKE_MODEL_PROVIDER="${OPENAI_MODEL_PROVIDER}"
fi

if [ -z "${OPENAI_API_KEY}" ]; then
  echo "OPENAI_API_KEY is required in ${ENV_FILE}" >&2
  exit 1
fi

if [ -z "${OPENAI_BASE_URL}" ]; then
  echo "OPENAI_BASE_URL is required in ${ENV_FILE}" >&2
  exit 1
fi

if [ -z "${SMOKE_MODEL}" ]; then
  echo "OPENAI_MODEL is required in ${ENV_FILE}" >&2
  exit 1
fi

if [ -z "${SMOKE_MODEL_PROVIDER}" ]; then
  echo "OPENAI_MODEL_PROVIDER is required in ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! "${SMOKE_MODEL_PROVIDER}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "OPENAI_MODEL_PROVIDER must contain only letters, digits, underscores, or hyphens" >&2
  exit 1
fi

docker run --rm \
  --platform linux/amd64 \
  --entrypoint bash \
  -e CODEX_API_KEY="${OPENAI_API_KEY}" \
  -e OPENAI_BASE_URL="${OPENAI_BASE_URL}" \
  -e RUNNER_SMOKE_MODEL="${SMOKE_MODEL}" \
  -e RUNNER_SMOKE_MODEL_PROVIDER="${SMOKE_MODEL_PROVIDER}" \
  "${IMAGE}" \
  -lc '
    set -euo pipefail

    export CODEX_HOME=/mesh0-codex

    mkdir -p /workspace/smoke "${CODEX_HOME}"
    cat > "${CODEX_HOME}/config.toml" <<EOF
model = "${RUNNER_SMOKE_MODEL}"
model_provider = "${RUNNER_SMOKE_MODEL_PROVIDER}"

[model_providers.${RUNNER_SMOKE_MODEL_PROVIDER}]
name = "${RUNNER_SMOKE_MODEL_PROVIDER}"
env_key = "CODEX_API_KEY"
base_url = "${OPENAI_BASE_URL}"
wire_api = "chat"
EOF

    cd /workspace/smoke

    git init -q
    git config user.email smoke@mesh0.local
    git config user.name "Mesh0 Smoke"
    printf "mesh0 runner smoke test\n" > README.md
    git add README.md
    git commit -qm "init"

    args=(exec --json --sandbox read-only --skip-git-repo-check --config "approval_policy=\"never\"")

    if [ -n "${RUNNER_SMOKE_MODEL}" ]; then
      args+=(--model "${RUNNER_SMOKE_MODEL}")
    fi

    args+=("Respond with exactly: mesh0-runner-smoke-ok")

    codex "${args[@]}" 2>&1 \
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
      | tee /tmp/mesh0-runner-smoke.jsonl
    grep -q "mesh0-runner-smoke-ok" /tmp/mesh0-runner-smoke.jsonl
  '

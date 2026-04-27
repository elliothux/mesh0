# syntax=docker/dockerfile:1.7

ARG PYTHON_IMAGE=docker.io/library/python:3.14.4-slim
ARG NODE_IMAGE=docker.io/library/node:25.9.0-slim
ARG BUN_IMAGE=docker.io/oven/bun:1.3.13
ARG CLOUDFLARE_SANDBOX_VERSION=0.7.0
ARG CODEX_VERSION=0.94.0
ARG GIT_VERSION=1:2.47.3-0+deb13u1
ARG NPM_VERSION=11.13.0
ARG UV_VERSION=0.11.7

FROM docker.io/cloudflare/sandbox:${CLOUDFLARE_SANDBOX_VERSION} AS cloudflare-sandbox

FROM ${NODE_IMAGE} AS node-runtime

FROM ${BUN_IMAGE} AS bun-runtime

FROM ${PYTHON_IMAGE}

ARG CODEX_VERSION
ARG GIT_VERSION
ARG NPM_VERSION
ARG UV_VERSION

LABEL org.opencontainers.image.title="mesh0 runner" \
      org.opencontainers.image.description="Sandbox runner image with OpenAI Codex runtime" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="mesh0" \
      io.mesh0.openai-codex.version="${CODEX_VERSION}" \
      io.mesh0.openai-codex.license="Apache-2.0" \
      io.mesh0.openai-codex.license-file="/usr/share/doc/mesh0/licenses/APACHE-2.0.txt" \
      io.mesh0.third-party-notices="/usr/share/doc/mesh0/THIRD_PARTY_NOTICES.md"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    PATH=/root/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    ca-certificates \
    curl \
    "git=${GIT_VERSION}" \
    gnupg \
    jq \
    openssh-client \
    pkg-config \
    procps \
    unzip \
    xz-utils \
    zip \
  && rm -rf /var/lib/apt/lists/*

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
COPY --from=bun-runtime /usr/local/bin/bunx /usr/local/bin/bunx

RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && npm install -g "npm@${NPM_VERSION}" "@openai/codex@${CODEX_VERSION}" \
  && npm cache clean --force \
  && node --version \
  && npm --version \
  && codex --version

RUN python -m pip install --no-cache-dir "uv==${UV_VERSION}"

ENV CODEX_HOME=/mesh0-codex

COPY THIRD_PARTY_NOTICES.md /usr/share/doc/mesh0/THIRD_PARTY_NOTICES.md
COPY licenses/APACHE-2.0.txt /usr/share/doc/mesh0/licenses/APACHE-2.0.txt

RUN mkdir -p /workspace "${CODEX_HOME}" \
  && chmod 777 /workspace "${CODEX_HOME}"

COPY --from=cloudflare-sandbox /container-server/sandbox /sandbox
COPY bin/mesh0-runner /usr/local/bin/mesh0-runner

RUN chmod +x /sandbox /usr/local/bin/mesh0-runner \
  && git --version \
  && codex --version \
  && node --version \
  && npm --version \
  && python --version \
  && uv --version \
  && bun --version

WORKDIR /workspace

ENTRYPOINT ["/sandbox"]
CMD ["mesh0-runner"]

# Agentic dev container for fit-gen-v2 (Vite SPA + Vercel edge functions in api/)
FROM node:22-bookworm-slim

# Pin the agent version so rebuilds don't silently change it
ARG OPENCODE_VERSION=1.19.6

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Tooling for the agent + repo work (ripgrep powers grep-style tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        jq \
        less \
        nano \
        openssh-client \
        procps \
        ripgrep \
        unzip \
    && rm -rf /var/lib/apt/lists/*

# OpenCode CLI
RUN npm install -g "opencode-ai@${OPENCODE_VERSION}" \
    && npm cache clean --force

# Bind-mounted Windows checkout: no "dubious ownership", no CRLF phantom diffs
RUN git config --system --add safe.directory /workspace \
    && git config --system core.autocrlf input \
    && git config --system init.defaultBranch main

# Seed dirs so the named volumes inherit sane ownership
RUN mkdir -p /root/.config/opencode \
             /root/.local/share/opencode \
             /root/.local/state/opencode \
             /root/.cache/opencode

WORKDIR /workspace

# Cached dep layer; also seeds the /workspace/node_modules named volume
COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5173 3000

CMD ["bash"]

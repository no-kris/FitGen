# Agentic dev container for fit-gen-v2 (Vite SPA + Vercel edge functions in api/)
FROM node:22-bookworm-slim

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

# Install official Antigravity CLI binary
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash -s -- --dir /usr/local/bin

# Bind-mounted Windows checkout: no "dubious ownership", no CRLF phantom diffs
RUN git config --system --add safe.directory /workspace \
    && git config --system core.autocrlf input \
    && git config --system init.defaultBranch main

WORKDIR /workspace

# Cached dep layer; also seeds the /workspace/node_modules named volume
COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5173 3000

CMD ["bash"]

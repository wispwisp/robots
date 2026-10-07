FROM golang:1.27-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget ca-certificates make gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs

# MCP + Chromium as root: global npm prefix and --with-deps (apt) need it.
# Fixed browser path so claudeuser finds what root installed.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm install -g @playwright/mcp@0.0.80 \
    && node "$(npm root -g)/@playwright/mcp/node_modules/playwright/cli.js" install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

ARG USER_ID
ARG GROUP_ID

RUN groupadd -g $GROUP_ID claudegroup && \
    useradd --uid $USER_ID --gid $GROUP_ID -m claudeuser

USER claudeuser
RUN date -u +"%Y-%m-%dT%H:%M:%SZ" > "/home/claudeuser/build-$(date -u +%Y-%m).txt"
RUN curl -fsSL https://claude.ai/install.sh | bash
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

COPY --chmod=755 ./check_grammar.sh /usr/local/bin/check-grammar

# Pre-approve .mcp.json servers, allow Playwright tools without prompts
RUN mkdir -p ~/.claude && \
    echo '{"enableAllProjectMcpServers":true,"permissions":{"allow":["mcp__playwright"]}}' > ~/.claude/settings.json

WORKDIR /home/claudeuser/workspace
ENTRYPOINT ["bash"]

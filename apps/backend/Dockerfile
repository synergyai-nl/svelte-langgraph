FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Install dependencies only first, so this layer is cached independently
# of source changes. The project itself is installed in the next step.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY README.md aegra.json ./
COPY src/ src/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 2026

# Aegra runs its database migrations automatically at startup.
CMD ["uvicorn", "aegra_api.main:app", "--host", "0.0.0.0", "--port", "2026"]

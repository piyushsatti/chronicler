FROM python:3.12-slim@sha256:2fe5997d249a808b8eeea52c58a1dbffbba28754dc11699ef5c029f2d818ce79

RUN pip install --no-cache-dir uv==0.11.3
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src/pi/chronicler/agent/ ./src/pi/chronicler/agent/
COPY context.md ./context.md
RUN uv sync --frozen --no-dev

ARG CHRONICLER_BUILD_SHA=unknown
LABEL org.opencontainers.image.revision="${CHRONICLER_BUILD_SHA}"
ENV AGENT_CONTEXT_FILE=/app/context.md \
    CHRONICLER_BUILD_SHA=${CHRONICLER_BUILD_SHA} \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    PATH=/app/.venv/bin:${PATH} \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN groupadd --gid 65532 chronicler \
    && useradd --no-create-home --uid 65532 --gid 65532 --shell /usr/sbin/nologin chronicler

USER 65532:65532
CMD ["chronicler-agent"]

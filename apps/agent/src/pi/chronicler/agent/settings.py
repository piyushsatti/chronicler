from __future__ import annotations

import math
import os
from dataclasses import dataclass
from pathlib import Path

from pi.chronicler.agent.budget import ChatTokenizer, ContextBudget


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required")
    return value


def _boolean(name: str, default: bool) -> bool:
    raw = os.getenv(name, str(default)).strip().lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    raise ValueError(f"{name} must be true or false")


@dataclass(frozen=True, slots=True)
class AgentSettings:
    api_url: str
    ingest_secret: str
    claim_interval_seconds: float
    litellm_base_url: str
    litellm_api_key: str
    model: str
    archive_mcp_url: str
    archive_mcp_token: str
    context: str
    tokenizer_path: Path
    tokenizer_sha256: str
    tokenizer_config_sha256: str
    chat_template_sha256: str
    context_tokens: int = 16_384
    max_completion_tokens: int = 512
    model_timeout_seconds: float = 60.0
    archive_timeout_seconds: float = 5.0
    archive_passage_reads: bool = True
    model_temperature: float = 0.7
    model_top_p: float = 0.8
    model_presence_penalty: float = 1.5
    model_seed: int = 0
    model_enable_thinking: bool = False
    build_sha: str = "unknown"

    def __post_init__(self) -> None:
        for timeout in (
            self.model_timeout_seconds,
            self.archive_timeout_seconds,
            self.claim_interval_seconds,
        ):
            if not math.isfinite(timeout) or timeout <= 0:
                raise ValueError("Per-call timeout must be positive and finite")
        if not 0 < self.max_completion_tokens < self.context_tokens:
            raise ValueError("Output reserve must be positive and below total context")
        if not math.isfinite(self.model_temperature) or self.model_temperature < 0:
            raise ValueError("Model temperature must be non-negative and finite")
        if not math.isfinite(self.model_top_p) or not 0 < self.model_top_p <= 1:
            raise ValueError("Model top_p must be in (0, 1]")
        if (
            not math.isfinite(self.model_presence_penalty)
            or not -2 <= self.model_presence_penalty <= 2
        ):
            raise ValueError("Model presence penalty must be in [-2, 2]")
        if self.model_seed < 0:
            raise ValueError("Model seed must be non-negative")

    def budget(self) -> ContextBudget:
        return ContextBudget(
            ChatTokenizer(
                self.tokenizer_path,
                self.tokenizer_sha256,
                self.tokenizer_config_sha256,
                self.chat_template_sha256,
            ),
            self.context_tokens,
            self.max_completion_tokens,
        )

    @classmethod
    def from_env(cls) -> AgentSettings:
        context_path = Path(_required("AGENT_CONTEXT_FILE"))
        context = context_path.read_text(encoding="utf-8")
        if not context.strip():
            raise ValueError("AGENT_CONTEXT_FILE must not be empty")
        return cls(
            api_url=_required("API_URL").rstrip("/"),
            ingest_secret=_required("INGEST_SECRET"),
            claim_interval_seconds=float(
                os.getenv("AGENT_CLAIM_INTERVAL_SECONDS", "2")
            ),
            litellm_base_url=_required("LITELLM_BASE_URL").rstrip("/"),
            litellm_api_key=_required("LITELLM_API_KEY"),
            model=_required("AGENT_MODEL"),
            archive_mcp_url=_required("ARCHIVE_MCP_URL"),
            archive_mcp_token=_required("ARCHIVE_MCP_TOKEN"),
            context=context,
            tokenizer_path=Path(_required("AGENT_TOKENIZER_PATH")),
            tokenizer_sha256=_required("AGENT_TOKENIZER_SHA256"),
            tokenizer_config_sha256=_required("AGENT_TOKENIZER_CONFIG_SHA256"),
            chat_template_sha256=_required("AGENT_CHAT_TEMPLATE_SHA256"),
            context_tokens=int(os.getenv("AGENT_CONTEXT_TOKENS", "16384")),
            max_completion_tokens=int(os.getenv("AGENT_MAX_COMPLETION_TOKENS", "512")),
            model_timeout_seconds=float(os.getenv("AGENT_MODEL_TIMEOUT_SECONDS", "60")),
            archive_passage_reads=os.getenv("ARCHIVE_PASSAGE_READS", "true").lower()
            == "true",
            archive_timeout_seconds=float(
                os.getenv("AGENT_ARCHIVE_TIMEOUT_SECONDS", "5")
            ),
            model_temperature=float(os.getenv("AGENT_MODEL_TEMPERATURE", "0.7")),
            model_top_p=float(os.getenv("AGENT_MODEL_TOP_P", "0.8")),
            model_presence_penalty=float(
                os.getenv("AGENT_MODEL_PRESENCE_PENALTY", "1.5")
            ),
            model_seed=int(os.getenv("AGENT_MODEL_SEED", "0")),
            model_enable_thinking=_boolean("AGENT_MODEL_ENABLE_THINKING", False),
            build_sha=(
                os.getenv("CHRONICLER_BUILD_SHA")
                or os.getenv("BUILD_SHA")
                or os.getenv("BUILD_VERSION")
                or "unknown"
            ),
        )

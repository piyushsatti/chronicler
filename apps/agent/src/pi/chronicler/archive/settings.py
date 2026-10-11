from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass

from pi.chronicler.archive.chunking import (
    DEFAULT_CHUNK_TOKENS,
    DEFAULT_MAX_INPUT_TOKENS,
    DEFAULT_OVERLAP_TOKENS,
    LEGACY_BGE_TOKENIZER_SHA256,
)

LEGACY_BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required")
    return value


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    value = int(raw)
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _optional_positive_int(name: str) -> int | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    value = int(raw)
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _required_csv(name: str) -> tuple[str, ...]:
    values = tuple(value.strip() for value in _required(name).split(","))
    if any(not value for value in values):
        raise ValueError(f"{name} must contain non-empty comma-separated values")
    return values


@dataclass(frozen=True, slots=True)
class ArchiveSettings:
    database_url: str
    database_ca_file: str
    public_graphql_url: str
    litellm_base_url: str
    litellm_api_key: str
    embedding_model: str
    embedding_revision: str
    embedding_dimensions: int
    mcp_token: str
    lancedb_path: str
    public_site_url: str
    index_interval_seconds: int
    host: str
    port: int
    allowed_hosts: tuple[str, ...]
    embedding_tokenizer_path: str = "/app/tokenizers/bge-small-en-v1.5/tokenizer.json"
    embedding_tokenizer_sha256: str = LEGACY_BGE_TOKENIZER_SHA256
    embedding_max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS
    chunk_tokens: int = DEFAULT_CHUNK_TOKENS
    chunk_overlap_tokens: int = DEFAULT_OVERLAP_TOKENS
    embedding_query_prefix: str = LEGACY_BGE_QUERY_PREFIX
    rerank_model: str | None = None
    rerank_base_url: str | None = None
    rerank_api_key: str | None = None
    rerank_instruction: str = ""
    rerank_candidate_limit: int = 24
    search_result_limit: int = 12
    bootstrap_snapshot_path: str | None = None
    bootstrap_snapshot_sha256: str | None = None
    bootstrap_expected_document_count: int | None = None
    bootstrap_min_live_document_count: int | None = None
    bootstrap_promotion_marker_path: str | None = None

    def __post_init__(self) -> None:
        if not 32 <= self.chunk_tokens <= self.embedding_max_input_tokens:
            raise ValueError("chunk_tokens must be in [32, embedding_max_input_tokens]")
        if not 0 <= self.chunk_overlap_tokens < self.chunk_tokens:
            raise ValueError("chunk_overlap_tokens must be in [0, chunk_tokens)")
        if self.rerank_model and not self.rerank_base_url:
            raise ValueError("rerank_base_url is required when rerank_model is set")
        if self.rerank_model and not self.rerank_api_key:
            raise ValueError("rerank_api_key is required when rerank_model is set")
        if self.rerank_candidate_limit < self.search_result_limit:
            raise ValueError("rerank_candidate_limit must cover search_result_limit")
        bootstrap_values = (
            self.bootstrap_snapshot_path,
            self.bootstrap_snapshot_sha256,
            self.bootstrap_expected_document_count,
            self.bootstrap_min_live_document_count,
            self.bootstrap_promotion_marker_path,
        )
        if any(value is not None for value in bootstrap_values) and not all(
            value is not None for value in bootstrap_values
        ):
            raise ValueError(
                "bootstrap snapshot path, SHA-256, expected count, minimum live "
                "count, and promotion marker must be configured together"
            )
        if self.bootstrap_expected_document_count is not None and (
            self.bootstrap_expected_document_count <= 0
        ):
            raise ValueError("bootstrap expected document count must be positive")
        if self.bootstrap_min_live_document_count is not None and (
            self.bootstrap_min_live_document_count <= 0
        ):
            raise ValueError("bootstrap minimum live document count must be positive")

    @classmethod
    def from_env(cls) -> ArchiveSettings:
        litellm_base_url = _required("LITELLM_BASE_URL").rstrip("/")
        litellm_api_key = _required("LITELLM_API_KEY")
        rerank_model = os.getenv("RERANK_MODEL", "").strip() or None
        bootstrap_snapshot_path = (
            os.getenv("ARCHIVE_BOOTSTRAP_SNAPSHOT_PATH", "").strip() or None
        )
        bootstrap_snapshot_sha256 = (
            os.getenv("ARCHIVE_BOOTSTRAP_SNAPSHOT_SHA256", "").strip() or None
        )
        bootstrap_promotion_marker_path = (
            os.getenv("ARCHIVE_BOOTSTRAP_PROMOTION_MARKER_PATH", "").strip() or None
        )
        return cls(
            database_url=_required("ARCHIVE_DATABASE_URL"),
            database_ca_file=_required("ARCHIVE_DATABASE_CA_FILE"),
            public_graphql_url=_required("PUBLIC_GRAPHQL_URL"),
            litellm_base_url=litellm_base_url,
            litellm_api_key=litellm_api_key,
            embedding_model=_required("EMBEDDING_MODEL"),
            embedding_revision=_required("EMBEDDING_REVISION"),
            embedding_dimensions=_positive_int("EMBEDDING_DIMENSIONS", 384),
            mcp_token=_required("ARCHIVE_MCP_TOKEN"),
            lancedb_path=_required("LANCEDB_PATH"),
            public_site_url=_required("PUBLIC_SITE_URL").rstrip("/"),
            index_interval_seconds=_positive_int("INDEX_INTERVAL_SECONDS", 3600),
            host=os.getenv("ARCHIVE_HOST", "0.0.0.0"),
            port=_positive_int("ARCHIVE_PORT", 8000),
            allowed_hosts=_required_csv("ARCHIVE_ALLOWED_HOSTS"),
            embedding_tokenizer_path=os.getenv(
                "EMBEDDING_TOKENIZER_PATH",
                "/app/tokenizers/bge-small-en-v1.5/tokenizer.json",
            ),
            embedding_tokenizer_sha256=os.getenv(
                "EMBEDDING_TOKENIZER_SHA256", LEGACY_BGE_TOKENIZER_SHA256
            ).strip(),
            embedding_max_input_tokens=_positive_int(
                "EMBEDDING_MAX_INPUT_TOKENS", DEFAULT_MAX_INPUT_TOKENS
            ),
            chunk_tokens=_positive_int("ARCHIVE_CHUNK_TOKENS", DEFAULT_CHUNK_TOKENS),
            chunk_overlap_tokens=int(
                os.getenv("ARCHIVE_CHUNK_OVERLAP_TOKENS", str(DEFAULT_OVERLAP_TOKENS))
            ),
            embedding_query_prefix=os.getenv(
                "EMBEDDING_QUERY_PREFIX", LEGACY_BGE_QUERY_PREFIX
            ),
            rerank_model=rerank_model,
            rerank_base_url=(
                os.getenv("RERANK_BASE_URL", litellm_base_url).rstrip("/")
                if rerank_model
                else None
            ),
            rerank_api_key=(
                os.getenv("RERANK_API_KEY", litellm_api_key) if rerank_model else None
            ),
            rerank_instruction=os.getenv("RERANK_INSTRUCTION", "").strip(),
            rerank_candidate_limit=_positive_int("RERANK_CANDIDATE_LIMIT", 24),
            search_result_limit=_positive_int("ARCHIVE_SEARCH_RESULT_LIMIT", 12),
            bootstrap_snapshot_path=bootstrap_snapshot_path,
            bootstrap_snapshot_sha256=bootstrap_snapshot_sha256,
            bootstrap_expected_document_count=_optional_positive_int(
                "ARCHIVE_BOOTSTRAP_EXPECTED_DOCUMENT_COUNT"
            ),
            bootstrap_min_live_document_count=_optional_positive_int(
                "ARCHIVE_BOOTSTRAP_MIN_LIVE_DOCUMENT_COUNT"
            ),
            bootstrap_promotion_marker_path=bootstrap_promotion_marker_path,
        )

    @property
    def embedding_contract(self) -> str:
        return embedding_contract(
            self.embedding_model,
            self.embedding_revision,
            self.embedding_dimensions,
            tokenizer_sha256=self.embedding_tokenizer_sha256,
            max_input_tokens=self.embedding_max_input_tokens,
            chunk_tokens=self.chunk_tokens,
            overlap_tokens=self.chunk_overlap_tokens,
            query_prefix=self.embedding_query_prefix,
        )


def embedding_contract(
    model: str,
    revision: str,
    dimensions: int,
    *,
    tokenizer_sha256: str = LEGACY_BGE_TOKENIZER_SHA256,
    max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS,
    chunk_tokens: int = DEFAULT_CHUNK_TOKENS,
    overlap_tokens: int = DEFAULT_OVERLAP_TOKENS,
    query_prefix: str = LEGACY_BGE_QUERY_PREFIX,
) -> str:
    prefix_hash = hashlib.sha256(query_prefix.encode()).hexdigest()[:16]
    return (
        "archive-v3:"
        f"token-{max_input_tokens}:chunk-{chunk_tokens}:overlap-{overlap_tokens}:"
        f"headers-v2:query-prefix-{prefix_hash}:"
        f"tokenizer-{tokenizer_sha256}:"
        f"{model}@{revision}:{dimensions}"
    )

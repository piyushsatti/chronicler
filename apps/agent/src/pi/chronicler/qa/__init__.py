"""Pure mention-to-answer retrieval building blocks.

Database access, anonymous effective-body resolution, and HTTP/API adapters that
call this package belong outside this module. The public surface is intentionally
small enough for DB-free unit tests and a disposable derived index.
"""

from pi.chronicler.qa.chunking import (
    ChunkingConfig,
    ChunkingError,
    chunk_document,
    chunk_documents,
    public_body_hash,
)
from pi.chronicler.qa.contracts import (
    CanonicalRoute,
    ChatMessage,
    DocumentChunk,
    FusedChunk,
    GroundedAnswer,
    PublicDocument,
    RankedChunk,
    SourceCitation,
)
from pi.chronicler.qa.inference import (
    InferenceContextTooLarge,
    InferenceDependencyError,
    InferenceError,
    InferenceOutputTooLarge,
    InferenceProtocolError,
    InferenceResponseTooLarge,
    LocalInferenceClient,
    LocalInferenceConfig,
    build_grounded_messages,
)
from pi.chronicler.qa.retrieval import (
    CitationValidationError,
    RetrievalInputError,
    build_canonical_routes,
    build_source_only_citations,
    canonical_route_for,
    citation_ids_from_text,
    is_eligible_public_document,
    lexical_search,
    rank_by_scores,
    reciprocal_rank_fusion,
    source_only_fallback,
    validate_citations,
)

__all__ = [
    "CanonicalRoute",
    "ChatMessage",
    "ChunkingConfig",
    "ChunkingError",
    "CitationValidationError",
    "DocumentChunk",
    "FusedChunk",
    "GroundedAnswer",
    "InferenceContextTooLarge",
    "InferenceDependencyError",
    "InferenceError",
    "InferenceOutputTooLarge",
    "InferenceProtocolError",
    "InferenceResponseTooLarge",
    "LocalInferenceClient",
    "LocalInferenceConfig",
    "PublicDocument",
    "RankedChunk",
    "RetrievalInputError",
    "SourceCitation",
    "build_canonical_routes",
    "build_grounded_messages",
    "build_source_only_citations",
    "canonical_route_for",
    "chunk_document",
    "chunk_documents",
    "citation_ids_from_text",
    "is_eligible_public_document",
    "lexical_search",
    "public_body_hash",
    "rank_by_scores",
    "reciprocal_rank_fusion",
    "source_only_fallback",
    "validate_citations",
]

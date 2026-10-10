from __future__ import annotations

from dataclasses import replace

import pytest

from pi.chronicler.qa.chunking import ChunkingConfig, chunk_document
from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import (
    MIN_SEMANTIC_SCORE,
    CitationValidationError,
    build_canonical_routes,
    citation_ids_from_text,
    lexical_search,
    rank_by_scores,
    reciprocal_rank_fusion,
    semantic_score_is_relevant,
    source_only_fallback,
    validate_citations,
)


def _document(document_id: str, title: str, body: str, category: str | None = None):
    return PublicDocument(
        document_id=document_id,
        kind="rule",
        category=category,
        slug=document_id,
        title=title,
        public_body=body,
    )


def test_lexical_search_handles_exact_and_related_inflected_terms() -> None:
    chunks = tuple(
        chunk
        for document in (
            _document(
                "checks",
                "Concentration checks",
                "A character makes a concentration check.",
            ),
            _document(
                "travel", "Travel", "The party travels overland between settlements."
            ),
        )
        for chunk in chunk_document(
            document, ChunkingConfig(max_chars=160, overlap_chars=10)
        )
    )

    exact = lexical_search("concentration check", chunks)
    paraphraseish = lexical_search("maintaining concentration", chunks)
    assert exact[0].chunk.document_id == "checks"
    assert paraphraseish[0].chunk.document_id == "checks"
    assert exact[0].score > exact[1].score if len(exact) > 1 else True


def test_hybrid_fusion_is_deterministic_and_rewards_both_channels() -> None:
    documents = (
        _document("lexical", "Exact rule", "The exact keyword appears here."),
        _document("semantic", "Related rule", "A related concept appears here."),
        _document(
            "both", "Exact rule", "The exact keyword and related concept appear here."
        ),
    )
    chunks = tuple(
        chunk
        for document in documents
        for chunk in chunk_document(
            document, ChunkingConfig(max_chars=200, overlap_chars=10)
        )
    )
    lexical = lexical_search("exact keyword", chunks)
    semantic = rank_by_scores(
        chunks,
        {
            chunk.chunk_id: (
                3.0
                if chunk.document_id == "both"
                else 2.0
                if chunk.document_id == "semantic"
                else 0.1
            )
            for chunk in chunks
        },
    )
    fused = reciprocal_rank_fusion(lexical, semantic, limit=3)
    assert fused
    assert fused == reciprocal_rank_fusion(lexical, semantic, limit=3)
    assert fused[0].chunk.document_id == "both"


def test_semantic_ranking_rejects_scores_below_calibrated_relevance() -> None:
    chunks = chunk_document(_document("source", "Rule", "Relevant evidence."))

    assert not semantic_score_is_relevant(MIN_SEMANTIC_SCORE - 0.0001)
    assert semantic_score_is_relevant(MIN_SEMANTIC_SCORE)
    assert (
        rank_by_scores(chunks, {chunks[0].chunk_id: MIN_SEMANTIC_SCORE - 0.0001}) == ()
    )
    assert rank_by_scores(chunks, {chunks[0].chunk_id: MIN_SEMANTIC_SCORE})


def test_fabricated_citation_is_rejected_and_source_fallback_is_bounded() -> None:
    document = _document("source", "A guide", "A public rule passage.")
    chunks = chunk_document(document)
    routes = build_canonical_routes([document], public_origin="https://example.test")

    with pytest.raises(CitationValidationError, match="unknown"):
        validate_citations("Answer [cite:forged]", ["forged"], chunks, routes)
    with pytest.raises(CitationValidationError, match="too many"):
        validate_citations("Answer", [chunks[0].chunk_id] * 4, chunks, routes)

    answer = validate_citations(
        "Answer",
        [f"source:{document.document_id}"],
        chunks,
        routes,
        allow_source_only=True,
    )
    assert answer.used_source_only_fallback
    assert answer.citations[0].url == "https://example.test/rules/guides/source"

    fallback = source_only_fallback(chunks * 4, routes, max_citations=1)
    assert fallback.used_source_only_fallback
    assert len(fallback.citations) == 1


def test_trusted_citation_preserves_source_provenance() -> None:
    document = PublicDocument(
        document_id="source",
        kind="rule",
        category=None,
        slug="source",
        title="A guide",
        public_body="A public rule passage.",
        authority="SRD",
        edition="5.1",
        source_version="2024",
        locator="p. 12",
    )
    chunks = chunk_document(document)
    routes = build_canonical_routes([document], public_origin="https://example.test")
    citation = validate_citations(
        "Answer", [chunks[0].chunk_id], chunks, routes
    ).citations[0]
    assert (
        citation.authority,
        citation.edition,
        citation.source_version,
        citation.locator,
    ) == (
        "SRD",
        "5.1",
        "2024",
        "p. 12",
    )


def test_same_source_chunk_citations_collapse_to_first_outward_link() -> None:
    document = _document("source", "A guide", "First supporting fact.")
    first = chunk_document(document)[0]
    second = replace(
        first,
        chunk_id="source:second-exact-chunk",
        text="Second supporting fact.",
        ordinal=1,
    )
    routes = build_canonical_routes([document], public_origin="https://example.test")

    grounded = validate_citations(
        "Answer", [first.chunk_id, second.chunk_id], (first, second), routes
    )

    assert len(grounded.citations) == 1
    assert grounded.citations[0].source_id == "source"
    assert grounded.citations[0].chunk_id == first.chunk_id


def test_citation_parser_is_explicit_and_does_not_treat_arbitrary_urls_as_citations() -> (
    None
):
    assert citation_ids_from_text(
        "See [cite:chunk-1] and [citation:chunk-2]. https://evil.test"
    ) == (
        "chunk-1",
        "chunk-2",
    )

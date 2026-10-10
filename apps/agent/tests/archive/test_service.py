from collections.abc import Sequence

import pytest

from pi.chronicler.archive.index import Passage, RetrievedPassage
from pi.chronicler.archive.rerank import RerankScore
from pi.chronicler.archive.service import ArchiveService
from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import canonical_route_for
from pi.chronicler.qa.source import projection_digest


class Source:
    def __init__(self, document: PublicDocument) -> None:
        self.document = document

    async def documents(
        self, document_ids: Sequence[str]
    ) -> tuple[PublicDocument, ...]:
        return (self.document,) if self.document.document_id in document_ids else ()


class Embedder:
    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return [[1.0, 0.0, 0.0] for _ in texts]

    async def embed_query(self, text: str) -> list[float]:
        return [1.0, 0.0, 0.0]


class Store:
    def __init__(self, passages: tuple[Passage, ...]) -> None:
        self.value = passages

    async def passages(self) -> tuple[Passage, ...]:
        return self.value

    async def document_passages(self, document_id: str) -> tuple[Passage, ...]:
        return tuple(p for p in self.value if p.document_id == document_id)

    async def slug_passages(self, slug: str) -> tuple[Passage, ...]:
        return tuple(p for p in self.value if p.slug == slug)

    async def replace_all(self, passages: Sequence[Passage]) -> None:
        self.value = tuple(passages)

    async def search(
        self, query: str, vector: Sequence[float], limit: int
    ) -> tuple[RetrievedPassage, ...]:
        return tuple(
            RetrievedPassage(passage, rank, 1.0 / rank)
            for rank, passage in enumerate(self.value[:limit], start=1)
        )


class Reranker:
    async def rerank(
        self, query: str, documents: Sequence[str], limit: int
    ) -> tuple[RerankScore, ...]:
        assert query == "shove"
        assert all("Document title: Shove" in document for document in documents)
        return tuple(
            RerankScore(index, float(index + 1))
            for index in reversed(range(len(documents)))
        )


@pytest.mark.asyncio
async def test_search_filters_stale_passage_and_read_returns_current_projection() -> (
    None
):
    document = PublicDocument(
        "d1", "rule", None, "shove", "Shove", "Current public text"
    )
    route = canonical_route_for(document, public_origin="https://example.test")
    assert route is not None
    current = Passage(
        "p1",
        "d1",
        "Shove",
        "Current",
        route.url,
        projection_digest(document, route),
        "contract",
        [1, 0, 0],
    )
    stale = Passage(
        "p2", "d1", "Shove", "Stale", route.url, "old", "contract", [1, 0, 0]
    )
    service = ArchiveService(
        Source(document),
        Embedder(),
        Store((stale, current)),
        "https://example.test",
        "contract",
    )

    result = await service.search_documents("shove")
    assert [hit["passage_id"] for hit in result["hits"]] == ["p1"]
    hit = result["hits"][0]
    assert hit["document"]["title"] == "Shove"
    assert hit["excerpt"] == "Current"
    assert hit["passage"]["passage_id"] == "p1"
    assert "text" not in hit["passage"]
    assert hit["retrieval"]["strategy"] == "hybrid_rrf"
    assert (await service.read_document("d1"))["public_text"] == "Current public text"
    assert await service.read_document("missing") == {"unavailable": True}


@pytest.mark.asyncio
async def test_cross_encoder_reranks_hybrid_candidates() -> None:
    document = PublicDocument("d1", "rule", None, "shove", "Shove", "Current")
    route = canonical_route_for(document, public_origin="https://example.test")
    assert route is not None
    version = projection_digest(document, route)
    passages = (
        Passage(
            "p1", "d1", "Shove", "First", route.url, version, "contract", [1, 0, 0]
        ),
        Passage(
            "p2", "d1", "Shove", "Second", route.url, version, "contract", [1, 0, 0]
        ),
    )
    service = ArchiveService(
        Source(document),
        Embedder(),
        Store(passages),
        "https://example.test",
        "contract",
        Reranker(),
    )

    hits = (await service.search_documents("shove"))["hits"]

    assert [hit["passage_id"] for hit in hits] == ["p2", "p1"]
    assert hits[0]["retrieval"]["strategy"] == "hybrid_rrf_cross_encoder"
    assert hits[0]["retrieval"]["rerank_score"] == 2.0


@pytest.mark.asyncio
async def test_exact_indexed_url_resolves_without_semantic_search() -> None:
    document = PublicDocument(
        "d1", "rule", None, "hehe-rule", "Hehe Rule", "Current public text"
    )
    route = canonical_route_for(document, public_origin="https://example.test")
    assert route is not None
    passage = Passage(
        "p1",
        "d1",
        document.title,
        document.public_body,
        route.url,
        projection_digest(document, route),
        "contract",
        [1, 0, 0],
    )

    class NoQueryEmbedder(Embedder):
        async def embed_query(self, text: str) -> list[float]:
            raise AssertionError("exact URL resolution must not embed or search")

    service = ArchiveService(
        Source(document),
        NoQueryEmbedder(),
        Store((passage,)),
        "https://example.test",
        "contract",
    )

    result = await service.read_document_by_url(route.url)
    assert result["document_id"] == "d1"
    assert result["url"] == route.url
    assert result["public_text"] == "Current public text"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mutation",
    [
        lambda url: f"{url}/",
        lambda url: f"{url}?view=all",
        lambda url: f"{url}#section",
        lambda url: url.replace("https://example.test", "https://evil.test"),
    ],
)
async def test_url_aliases_and_external_urls_fail_closed(mutation) -> None:
    _, service = current_service()
    current = await service.read_document("d1")

    assert await service.read_document_by_url(mutation(current["url"])) == {
        "unavailable": True
    }


@pytest.mark.asyncio
async def test_url_resolution_rejects_stale_contract_and_version() -> None:
    document = PublicDocument("d1", "rule", None, "jump", "Jump", "Current")
    route = canonical_route_for(document, public_origin="https://example.test")
    assert route is not None
    passages = (
        Passage("p1", "d1", "Jump", "Old", route.url, "old", "contract", [1, 0, 0]),
        Passage(
            "p2",
            "d1",
            "Jump",
            "Other contract",
            route.url,
            projection_digest(document, route),
            "other-contract",
            [1, 0, 0],
        ),
    )
    service = ArchiveService(
        Source(document),
        Embedder(),
        Store(passages),
        "https://example.test",
        "contract",
    )

    assert await service.read_document_by_url(route.url) == {"unavailable": True}


def current_service():
    document = PublicDocument("d1", "rule", None, "jump", "Jump", "Current public text")
    route = canonical_route_for(document, public_origin="https://example.test")
    assert route is not None
    passages = tuple(
        Passage(
            f"p{i}",
            "d1",
            "Jump",
            f"Passage {i}",
            route.url,
            projection_digest(document, route),
            "contract",
            [1, 0, 0],
            i,
        )
        for i in range(12)
    )
    source = Source(document)
    service = ArchiveService(
        source, Embedder(), Store(passages), "https://example.test", "contract"
    )
    return source, service


@pytest.mark.asyncio
async def test_exposes_candidates_without_five_hit_or_lexical_veto() -> None:
    _, service = current_service()
    for query in ("how far can I leap?", "how far can I Leap?"):
        result = await service.search_documents(query)
        assert len(result["hits"]) == 12
        assert result["hits"][-1]["passage_id"] == "p11"


@pytest.mark.asyncio
async def test_neighbor_read_is_current_version_checked() -> None:
    from dataclasses import replace

    source, service = current_service()
    focused = await service.read_document("d1", "p6")
    assert focused["included_passage_ids"] == ["p4", "p5", "p6", "p7", "p8"]
    assert focused["public_text"] == (
        "Passage 4\n\nPassage 5\n\nPassage 6\n\nPassage 7\n\nPassage 8"
    )
    assert focused["scope"] == "passage"
    assert (await service.read_document("d1", "p0"))["included_passage_ids"] == [
        "p0",
        "p1",
        "p2",
    ]
    assert await service.read_document("d1", "missing") == {"unavailable": True}
    source.document = replace(source.document, public_body="Changed public body")
    assert await service.read_document("d1", "p6") == {"unavailable": True}
    assert (await service.read_document("d1"))["public_text"] == "Changed public body"


@pytest.mark.asyncio
async def test_last_pdf_passage_includes_revalidated_next_page_continuation() -> None:
    first = PublicDocument(
        "d171",
        "rule",
        None,
        "rules-pdf-page-171",
        "Spells - source page 171",
        "Vicious Mockery starts here",
        "Publisher",
        "2024",
        "5.2.1",
        "PDF p. 171 / printed p. 171",
    )
    second = PublicDocument(
        "d172",
        "rule",
        None,
        "rules-pdf-page-172",
        "Spells - source page 172",
        "Wisdom save, 1d6 Psychic damage, then Disadvantage",
        "Publisher",
        "2024",
        "5.2.1",
        "PDF p. 172 / printed p. 172",
    )
    documents = {item.document_id: item for item in (first, second)}

    class MultiSource:
        async def documents(
            self, document_ids: Sequence[str]
        ) -> tuple[PublicDocument, ...]:
            return tuple(
                documents[document_id]
                for document_id in document_ids
                if document_id in documents
            )

    passages = []
    for document, texts in (
        (first, ("Earlier", "Vicious Mockery starts here")),
        (second, ("Wisdom save, 1d6 Psychic damage, then Disadvantage",)),
    ):
        route = canonical_route_for(document, public_origin="https://example.test")
        assert route is not None
        version = projection_digest(document, route)
        passages.extend(
            Passage(
                f"{document.document_id}-p{ordinal}",
                document.document_id,
                document.title,
                text,
                route.url,
                version,
                "contract",
                [1, 0, 0],
                ordinal,
                document.kind,
                document.category,
                document.slug,
                (),
                document.authority,
                document.edition,
                document.source_version,
                document.locator,
                document.language,
            )
            for ordinal, text in enumerate(texts)
        )
    service = ArchiveService(
        MultiSource(),
        Embedder(),
        Store(tuple(passages)),
        "https://example.test",
        "contract",
    )

    result = await service.read_document("d171", "d171-p1")
    continuation = result["continuations"][0]
    assert continuation["relation"] == "next_source_page"
    assert continuation["document_id"] == "d172"
    assert continuation["passage_id"] == "d172-p0"
    assert continuation["public_text"] == second.public_body

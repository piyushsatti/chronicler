from collections.abc import Sequence
from dataclasses import replace

import pytest

from pi.chronicler.archive.index import Indexer, LanceStore, Passage, RetrievedPassage
from pi.chronicler.qa.contracts import PublicDocument


def document(document_id: str, body: str = "A useful public rule.") -> PublicDocument:
    return PublicDocument(document_id, "rule", None, document_id, document_id, body)


class Source:
    def __init__(self, documents: tuple[PublicDocument, ...]) -> None:
        self.value = documents

    async def all_documents(self) -> tuple[PublicDocument, ...]:
        return self.value


class Embedder:
    def __init__(self) -> None:
        self.inputs: list[str] = []

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        self.inputs.extend(texts)
        return [[float(index + 1), 0.0, 0.0] for index, _ in enumerate(texts)]

    async def embed_query(self, text: str) -> list[float]:
        return [1.0, 0.0, 0.0]


class Store:
    def __init__(self, passages: tuple[Passage, ...] = ()) -> None:
        self.value = passages
        self.replacements = 0

    async def passages(self) -> tuple[Passage, ...]:
        return self.value

    async def document_passages(self, document_id: str) -> tuple[Passage, ...]:
        return tuple(p for p in self.value if p.document_id == document_id)

    async def slug_passages(self, slug: str) -> tuple[Passage, ...]:
        return tuple(p for p in self.value if p.slug == slug)

    async def url_passages(self, url: str) -> tuple[Passage, ...]:
        return tuple(p for p in self.value if p.url == url)

    async def replace_all(self, passages: Sequence[Passage]) -> None:
        self.replacements += 1
        self.value = tuple(passages)

    async def search(
        self, query: str, vector: Sequence[float], limit: int
    ) -> tuple[RetrievedPassage, ...]:
        return tuple(
            RetrievedPassage(passage, rank, 1.0 / rank)
            for rank, passage in enumerate(self.value[:limit], start=1)
        )


@pytest.mark.asyncio
async def test_reconcile_reuses_unchanged_and_replaces_changed_documents(
    chunker,
) -> None:
    source = Source((document("one"), document("two")))
    embedder = Embedder()
    store = Store()
    indexer = Indexer(
        source, embedder, store, "https://example.test", "contract", chunker
    )

    first = await indexer.sync()
    assert first.embedded_documents == 2

    first_one = [item for item in store.value if item.document_id == "one"]
    source.value = (
        document("one"),
        document("two", "Changed public rule."),
        document("three"),
    )
    second = await indexer.sync()

    assert second.reused_documents == 1
    assert second.embedded_documents == 2
    assert [item for item in store.value if item.document_id == "one"] == first_one

    source.value = (document("two", "Changed public rule."),)
    third = await indexer.sync()
    assert third.removed_documents == 2
    assert {item.document_id for item in store.value} == {"two"}


@pytest.mark.asyncio
async def test_lance_store_persists_and_searches(tmp_path) -> None:
    passage = Passage(
        "p1", "d1", "Title", "Excerpt", "/rules/guides/x", "v1", "c1", [1, 0, 0]
    )
    store = LanceStore(str(tmp_path), 3)
    await store.replace_all((passage,))

    reopened = LanceStore(str(tmp_path), 3)
    assert await reopened.passages() == (passage,)
    result = await reopened.search("excerpt", [1, 0, 0], 1)
    assert result[0].passage.document_id == "d1"


@pytest.mark.asyncio
async def test_lance_store_fuses_lexical_and_dense_candidates(tmp_path) -> None:
    fireball = Passage(
        "p-fireball",
        "d-fireball",
        "Fireball",
        "A third-level spell",
        "/rules/guides/fireball",
        "v1",
        "c1",
        [0.8, 0.2, 0.0],
        kind="rule",
        slug="fireball",
        heading_path=("Spells", "Fireball"),
    )
    dense_neighbor = Passage(
        "p-dragon",
        "d-dragon",
        "Bronze Dragon",
        "Regional lore",
        "/codex/lore/dragon",
        "v1",
        "c1",
        [1.0, 0.0, 0.0],
        kind="codex_entry",
        slug="dragon",
        heading_path=("Dragons",),
    )
    store = LanceStore(str(tmp_path), 3)
    await store.replace_all((dense_neighbor, fireball))

    result = await store.search("what level is fireball", [1, 0, 0], 2)

    assert [hit.passage.document_id for hit in result] == [
        "d-fireball",
        "d-dragon",
    ]
    assert result[0].lexical_score is not None
    assert result[0].relevance_score > result[1].relevance_score


@pytest.mark.asyncio
async def test_disposable_rebuild_metadata_and_contract_invalidation(
    tmp_path, chunker
) -> None:
    source = Source((document("one", "1 2 3 4 5 6 7 8 9 0 " * 90 + "ENDING"),))
    embedder = Embedder()
    store = LanceStore(str(tmp_path), 3)
    indexer = Indexer(
        source, embedder, store, "https://example.test", "token-v2", chunker
    )
    result = await indexer.sync()
    first = await store.document_passages("one")
    assert result.passages > 1
    assert all(chunker.count(p.excerpt) <= chunker.chunk_tokens for p in first)
    assert "ENDING" in max(first, key=lambda p: p.ordinal).excerpt
    assert (await indexer.sync()).reused_documents == 1
    source.value = (replace(source.value[0], title="Changed title"),)
    assert (await indexer.sync()).embedded_documents == 1
    assert {p.content_version for p in first} != {
        p.content_version for p in await store.passages()
    }
    source.value = (replace(source.value[0], public_body="Changed body"),)
    assert (await indexer.sync()).embedded_documents == 1
    new_contract = Indexer(
        source, embedder, store, "https://example.test", "token-v3", chunker
    )
    assert (await new_contract.sync()).embedded_documents == 1
    assert all(p.embedding_contract == "token-v3" for p in await store.passages())
    previous = await store.passages()
    source.value = ()
    with pytest.raises(ValueError, match="empty"):
        await new_contract.sync()
    assert await store.passages() == previous


@pytest.mark.asyncio
@pytest.mark.parametrize("reverse_order", (False, True))
async def test_unchanged_sync_does_not_replace_index(chunker, reverse_order) -> None:
    source = Source((document("one"), document("two")))
    store = Store()
    indexer = Indexer(
        source, Embedder(), store, "https://example.test", "contract", chunker
    )
    await indexer.sync()
    previous = store.value
    if reverse_order:
        source.value = tuple(reversed(source.value))

    result = await indexer.sync()

    assert result.reused_documents == 2
    assert result.embedded_documents == 0
    assert store.replacements == 1
    assert store.value == previous


@pytest.mark.asyncio
async def test_empty_sync_preserves_nonempty_index(chunker) -> None:
    source = Source((document("one"),))
    store = Store()
    indexer = Indexer(
        source, Embedder(), store, "https://example.test", "contract", chunker
    )
    await indexer.sync()
    previous = store.value
    source.value = ()

    with pytest.raises(ValueError, match="empty"):
        await indexer.sync()

    assert store.value == previous
    assert store.replacements == 1


@pytest.mark.asyncio
async def test_empty_initial_sync_is_allowed(chunker) -> None:
    store = Store()
    indexer = Indexer(
        Source(()), Embedder(), store, "https://example.test", "contract", chunker
    )

    result = await indexer.sync()

    assert result.documents == 0
    assert result.passages == 0
    assert store.value == ()


@pytest.mark.asyncio
@pytest.mark.parametrize("unsupported_route", (False, True))
async def test_removed_document_still_updates_nonempty_index(
    chunker, unsupported_route
) -> None:
    source = Source((document("one"), document("two")))
    store = Store()
    indexer = Indexer(
        source, Embedder(), store, "https://example.test", "contract", chunker
    )
    await indexer.sync()
    source.value = (
        (document("one"), replace(document("two"), kind="unsupported"))
        if unsupported_route
        else (document("one"),)
    )

    await indexer.sync()

    assert {passage.document_id for passage in store.value} == {"one"}
    assert store.replacements == 2


@pytest.mark.asyncio
async def test_url_passages_filters_exact_url_and_escapes_quotes(tmp_path) -> None:
    quoted_url = "https://example.test/rules/guides/it's-public"
    expected = Passage(
        "p1", "d1", "Title", "Excerpt", quoted_url, "v1", "c1", [1, 0, 0]
    )
    other = replace(expected, passage_id="p2", document_id="d2", url=quoted_url + "-2")
    store = LanceStore(str(tmp_path), 3)
    await store.replace_all((expected, other))

    assert await store.url_passages(quoted_url) == (expected,)
    assert await store.url_passages(quoted_url + "' OR 1=1 --") == ()


@pytest.mark.asyncio
async def test_old_schema_rebuild_adds_passage_order_without_reusing_old_vectors(
    tmp_path, chunker
) -> None:
    from dataclasses import asdict

    import lancedb

    legacy = Passage(
        "old-passage",
        "one",
        "Title",
        "Legacy",
        "/rules/guides/one",
        "old-version",
        "old-contract",
        [1, 0, 0],
    )
    row = asdict(legacy)
    del row["ordinal"]
    db = lancedb.connect(str(tmp_path))
    db.create_table(LanceStore.TABLE_NAME, data=[row])
    source = Source((document("one", "1 " * 900 + "END"),))
    store = LanceStore(str(tmp_path), 3)
    indexer = Indexer(
        source, Embedder(), store, "https://example.test", "new-contract", chunker
    )
    result = await indexer.sync()
    assert result.embedded_documents == 1
    passages = await store.document_passages("one")
    assert sorted(p.ordinal for p in passages) == list(range(len(passages)))
    assert all(p.passage_id != "old-passage" for p in passages)

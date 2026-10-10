from __future__ import annotations

import asyncio
import math
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from typing import Protocol, cast

import lancedb
import pyarrow as pa
from lancedb.index import FTS
from lancedb.rerankers import RRFReranker
from lancedb.table import Table

from pi.chronicler.archive.chunking import TokenChunker
from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import canonical_route_for
from pi.chronicler.qa.source import projection_digest


@dataclass(frozen=True, slots=True)
class Passage:
    passage_id: str
    document_id: str
    title: str
    excerpt: str
    url: str
    content_version: str
    embedding_contract: str
    vector: list[float]
    ordinal: int = 0
    kind: str = ""
    category: str | None = None
    slug: str = ""
    heading_path: tuple[str, ...] = ()
    authority: str | None = None
    edition: str | None = None
    source_version: str | None = None
    locator: str | None = None
    language: str = "en"

    @property
    def heading_text(self) -> str:
        return " > ".join(self.heading_path)

    @property
    def rerank_text(self) -> str:
        fields = [
            f"Document title: {self.title}",
            f"Document type: {self.kind}",
        ]
        if self.category:
            fields.append(f"Document category: {self.category}")
        if self.heading_path:
            fields.append(f"Section: {self.heading_text}")
        fields.append(f"Passage: {self.excerpt}")
        return "\n".join(fields)


@dataclass(frozen=True, slots=True)
class RetrievedPassage:
    passage: Passage
    rank: int
    relevance_score: float
    vector_distance: float | None = None
    lexical_score: float | None = None


class Source(Protocol):
    async def all_documents(self) -> tuple[PublicDocument, ...]: ...


class Embedder(Protocol):
    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class Store(Protocol):
    async def passages(self) -> tuple[Passage, ...]: ...
    async def document_passages(self, document_id: str) -> tuple[Passage, ...]: ...
    async def slug_passages(self, slug: str) -> tuple[Passage, ...]: ...
    async def replace_all(self, passages: Sequence[Passage]) -> None: ...
    async def search(
        self, query: str, vector: Sequence[float], limit: int
    ) -> tuple[RetrievedPassage, ...]: ...


class LanceStore:
    TABLE_NAME = "archive_passages_v1"

    def __init__(self, path: str, dimensions: int) -> None:
        self._database = lancedb.connect(path)
        self._dimensions = dimensions

    def _schema(self) -> pa.Schema:
        return pa.schema(
            [
                pa.field("passage_id", pa.string(), nullable=False),
                pa.field("document_id", pa.string(), nullable=False),
                pa.field("title", pa.string(), nullable=False),
                pa.field("excerpt", pa.string(), nullable=False),
                pa.field("url", pa.string(), nullable=False),
                pa.field("content_version", pa.string(), nullable=False),
                pa.field("embedding_contract", pa.string(), nullable=False),
                pa.field("ordinal", pa.int64(), nullable=False),
                pa.field("kind", pa.string(), nullable=False),
                pa.field("category", pa.string()),
                pa.field("slug", pa.string(), nullable=False),
                pa.field("heading_path", pa.list_(pa.string()), nullable=False),
                pa.field("heading_text", pa.string(), nullable=False),
                pa.field("authority", pa.string()),
                pa.field("edition", pa.string()),
                pa.field("source_version", pa.string()),
                pa.field("locator", pa.string()),
                pa.field("language", pa.string(), nullable=False),
                pa.field(
                    "vector", pa.list_(pa.float32(), self._dimensions), nullable=False
                ),
            ]
        )

    def _open_or_create(self) -> Table:
        if self.TABLE_NAME not in self._database.list_tables().tables:
            return self._database.create_table(self.TABLE_NAME, schema=self._schema())
        return self._database.open_table(self.TABLE_NAME)

    async def passages(self) -> tuple[Passage, ...]:
        def read() -> tuple[Passage, ...]:
            table = self._open_or_create()
            rows = cast("list[dict[str, object]]", table.to_arrow().to_pylist())
            return tuple(_passage(row) for row in rows)

        return await asyncio.to_thread(read)

    async def document_passages(self, document_id: str) -> tuple[Passage, ...]:
        def read() -> tuple[Passage, ...]:
            escaped = document_id.replace("'", "''")
            rows = (
                self._open_or_create()
                .search()
                .where(f"document_id = '{escaped}'")
                .limit(None)
                .to_list()
            )
            return tuple(_passage(row) for row in rows)

        return await asyncio.to_thread(read)

    async def slug_passages(self, slug: str) -> tuple[Passage, ...]:
        def read() -> tuple[Passage, ...]:
            escaped = slug.replace("'", "''")
            rows = (
                self._open_or_create()
                .search()
                .where(f"slug = '{escaped}'")
                .limit(None)
                .to_list()
            )
            return tuple(_passage(row) for row in rows)

        return await asyncio.to_thread(read)

    async def replace_all(self, passages: Sequence[Passage]) -> None:
        def replace() -> None:
            rows = [
                {**asdict(passage), "heading_text": passage.heading_text}
                for passage in passages
            ]
            if rows:
                table = self._database.create_table(
                    self.TABLE_NAME,
                    data=rows,
                    mode="overwrite",
                    schema=self._schema(),
                )
                for field in ("title", "heading_text", "excerpt"):
                    table.create_index(field, config=FTS(), replace=True)
            else:
                if self.TABLE_NAME in self._database.list_tables().tables:
                    self._database.drop_table(self.TABLE_NAME)
                self._database.create_table(self.TABLE_NAME, schema=self._schema())

        await asyncio.to_thread(replace)

    async def search(
        self, query: str, vector: Sequence[float], limit: int
    ) -> tuple[RetrievedPassage, ...]:
        if len(vector) != self._dimensions:
            raise ValueError("query embedding dimension mismatch")
        if limit <= 0:
            raise ValueError("search limit must be positive")

        def search() -> tuple[RetrievedPassage, ...]:
            table = self._open_or_create()
            required_fields = {"title", "heading_text", "excerpt", "vector"}
            indexed_fields = {index.columns[0] for index in table.list_indices()}
            if (
                table.count_rows() == 0
                or not required_fields.issubset(table.schema.names)
                or not {"title", "heading_text", "excerpt"}.issubset(indexed_fields)
            ):
                return ()
            rows = cast(
                "list[dict[str, object]]",
                table.search(
                    query_type="hybrid",
                    vector_column_name="vector",
                    fts_columns=["title", "heading_text", "excerpt"],
                )
                .vector(list(vector))
                .text(query)
                .rerank(RRFReranker(return_score="all"))
                .limit(limit)
                .to_list(),
            )
            return tuple(
                _retrieved(row, rank) for rank, row in enumerate(rows, start=1)
            )

        return await asyncio.to_thread(search)


def _passage(row: Mapping[str, object]) -> Passage:
    raw_vector = cast("Sequence[object]", row["vector"])
    numeric_vector = [value for value in raw_vector if isinstance(value, int | float)]
    if len(numeric_vector) != len(raw_vector):
        raise ValueError("stored passage vector was invalid")
    raw_heading_path = cast("Sequence[object]", row.get("heading_path", ()))
    if any(not isinstance(part, str) for part in raw_heading_path):
        raise ValueError("stored passage heading path was invalid")
    return Passage(
        passage_id=str(row["passage_id"]),
        document_id=str(row["document_id"]),
        title=str(row["title"]),
        excerpt=str(row["excerpt"]),
        url=str(row["url"]),
        content_version=str(row["content_version"]),
        embedding_contract=str(row["embedding_contract"]),
        vector=[float(value) for value in numeric_vector],
        ordinal=int(cast("int", row.get("ordinal", 0))),
        kind=str(row.get("kind", "")),
        category=(str(row["category"]) if row.get("category") is not None else None),
        slug=str(row.get("slug", "")),
        heading_path=tuple(cast("Sequence[str]", raw_heading_path)),
        authority=(str(row["authority"]) if row.get("authority") is not None else None),
        edition=str(row["edition"]) if row.get("edition") is not None else None,
        source_version=(
            str(row["source_version"])
            if row.get("source_version") is not None
            else None
        ),
        locator=str(row["locator"]) if row.get("locator") is not None else None,
        language=str(row.get("language", "en")),
    )


def _optional_score(row: Mapping[str, object], key: str) -> float | None:
    value = row.get(key)
    if value is None:
        return None
    if not isinstance(value, int | float) or isinstance(value, bool):
        raise ValueError(f"stored retrieval {key} was invalid")
    score = float(value)
    if not math.isfinite(score):
        raise ValueError(f"stored retrieval {key} was invalid")
    return score


def _retrieved(row: Mapping[str, object], rank: int) -> RetrievedPassage:
    relevance = _optional_score(row, "_relevance_score")
    if relevance is None:
        raise ValueError("hybrid search omitted relevance score")
    return RetrievedPassage(
        passage=_passage(row),
        rank=rank,
        relevance_score=relevance,
        vector_distance=_optional_score(row, "_distance"),
        lexical_score=_optional_score(row, "_score"),
    )


@dataclass(frozen=True, slots=True)
class SyncResult:
    documents: int
    embedded_documents: int
    reused_documents: int
    removed_documents: int
    passages: int


class Indexer:
    def __init__(
        self,
        source: Source,
        embedder: Embedder,
        store: Store,
        public_site_url: str,
        embedding_contract: str,
        chunker: TokenChunker,
    ) -> None:
        self._source = source
        self._embedder = embedder
        self._store = store
        self._public_site_url = public_site_url
        self._embedding_contract = embedding_contract
        self._chunker = chunker

    async def sync(self) -> SyncResult:
        documents = await self._source.all_documents()
        previous = await self._store.passages()
        previous_by_document: dict[str, list[Passage]] = {}
        for passage in previous:
            previous_by_document.setdefault(passage.document_id, []).append(passage)
        current_ids = {document.document_id for document in documents}
        output: list[Passage] = []
        embedded = 0
        reused = 0
        for document in documents:
            route = canonical_route_for(document, public_origin=self._public_site_url)
            if route is None:
                continue
            version = projection_digest(document, route)
            retained = previous_by_document.get(document.document_id, [])
            if retained and all(
                item.content_version == version
                and item.embedding_contract == self._embedding_contract
                for item in retained
            ):
                output.extend(retained)
                reused += 1
                continue
            chunks = self._chunker.chunks(document)
            vectors = await self._embedder.embed_documents(
                [chunk.text for chunk in chunks]
            )
            if len(vectors) != len(chunks):
                raise ValueError("embedding count did not match passage count")
            output.extend(
                Passage(
                    passage_id=chunk.chunk_id,
                    document_id=document.document_id,
                    title=document.title,
                    excerpt=chunk.text,
                    url=route.url,
                    content_version=version,
                    embedding_contract=self._embedding_contract,
                    vector=vector,
                    ordinal=chunk.ordinal,
                    kind=chunk.kind,
                    category=chunk.category,
                    slug=chunk.slug,
                    heading_path=chunk.heading_path,
                    authority=chunk.authority,
                    edition=chunk.edition,
                    source_version=chunk.source_version,
                    locator=chunk.locator,
                    language=chunk.language,
                )
                for chunk, vector in zip(chunks, vectors, strict=True)
            )
            embedded += 1
        await self._store.replace_all(output)
        removed = len(set(previous_by_document) - current_ids)
        return SyncResult(
            documents=len(documents),
            embedded_documents=embedded,
            reused_documents=reused,
            removed_documents=removed,
            passages=len(output),
        )

"""Run the frozen 56-question retrieval benchmark against the production alias.

The benchmark deliberately builds a disposable LanceDB index from the exact
public corpus.  It never opens an existing index, and it records enough ranked
candidate information to permit an independent offline rescore.  The HTTP
client only accepts the Archive-scoped key from ``LITELLM_ARCHIVE_API_KEY``;
the value is never included in a receipt or log message.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import statistics
import time
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import httpx
from tokenizers import Tokenizer

from pi.chronicler.archive.chunking import TokenChunker
from pi.chronicler.archive.index import LanceStore, Passage
from pi.chronicler.archive.settings import embedding_contract
from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import canonical_route_for
from pi.chronicler.qa.source import projection_digest

CORPUS_SHA256 = "0fdd42d437cdb2c1ffd083430b0c7e2549cba94a092d124b966fa3fa203e5449"
HELDOUT_GOLD_SHA256 = "724946fcb11addb8285f15e2502dd1ba33916a017e3ade0782eb9743e644c9ed"
DISCORD_GOLD_SHA256 = "9490fbe6ccf0cb8f782e3de8720dc3190f246d9f59026d371a987a9f72225a2e"
TOKENIZER_SHA256 = "def76fb086971c7867b829c23a26261e38d9d74e02139253b38aeb9df8b4b50a"
QWEN_QUERY_PREFIX = (
    "Instruct: Given a Chronicler user question, retrieve relevant public D&D "
    "rules or campaign lore passages that answer it\nQuery:"
)
QWEN_QUERY_PREFIX_SHA256 = (
    "9a969f3077ec69ddab658c332022438003873706f20cd38aa05670936ec21c45"
)
EMBEDDING_ALIAS = "chronicler-embed-v1"
EMBEDDING_MODEL = "Qwen3-Embedding-0.6B"
EMBEDDING_REVISION = "72bb2d1e482afe83dcebe9496edc693ad1967a0f"
EMBEDDING_DIMENSIONS = 1024
CHUNK_TOKENS = 256
CHUNK_OVERLAP_TOKENS = 32
MAX_INPUT_TOKENS = 32768
PUBLIC_SITE_URL = "https://chronicler.smokebombstudios.com"
LITELLM_BASE_URL = "http://127.0.0.1:4000"
RETRIEVAL_CANDIDATE_LIMIT = 24
EXPECTED_ORIGINS = {"held_out": 48, "discord_development": 8}


@dataclass(frozen=True, slots=True)
class Case:
    """One retrieval query and its complete set of acceptable documents."""

    case_id: str
    slice_name: str
    question: str
    accepted_document_ids: frozenset[str]
    origin: str


def _mapping(value: object, label: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object")
    return value


def _nonempty_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _optional_string(value: object, label: str) -> str | None:
    if value is not None and not isinstance(value, str):
        raise ValueError(f"{label} must be a string or null")
    return value


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _cases_payload(path: Path) -> list[object]:
    payload = _mapping(json.loads(path.read_text(encoding="utf-8")), "gold")
    if payload.get("version") != 1 or not isinstance(payload.get("cases"), list):
        raise ValueError(f"{path.name} gold schema mismatch")
    return cast("list[object]", payload["cases"])


def _accepted_ids(raw: Mapping[str, object], path_name: str) -> frozenset[str]:
    values = raw.get("accepted_document_ids")
    if values is None:
        source_values = raw.get("accepted_sources")
        if not isinstance(source_values, list):
            raise ValueError(f"{path_name} accepted sources schema mismatch")
        values = [
            _mapping(item, "accepted source").get("document_id")
            for item in source_values
        ]
    if not isinstance(values, list) or not values:
        raise ValueError(f"{path_name} accepted document IDs must be non-empty")
    identifiers = tuple(
        _nonempty_string(item, "accepted document ID") for item in values
    )
    if len(set(identifiers)) != len(identifiers):
        raise ValueError(f"{path_name} accepted document IDs must be unique")
    return frozenset(identifiers)


def _case(raw_value: object, origin: str, path_name: str) -> Case:
    raw = _mapping(raw_value, "gold case")
    case_id = _nonempty_string(raw.get("id", raw.get("case_id")), "case ID")
    slice_name = _nonempty_string(raw.get("slice"), "case slice")
    question = _nonempty_string(raw.get("question"), "case question")
    return Case(case_id, slice_name, question, _accepted_ids(raw, path_name), origin)


def _document(raw_value: object) -> PublicDocument:
    raw = _mapping(raw_value, "corpus row")
    return PublicDocument(
        document_id=_nonempty_string(raw.get("document_id"), "document ID"),
        kind=_nonempty_string(raw.get("kind"), "document kind"),
        category=_optional_string(raw.get("category"), "document category"),
        slug=_nonempty_string(raw.get("slug"), "document slug"),
        title=_nonempty_string(raw.get("title"), "document title"),
        public_body=_nonempty_string(raw.get("public_body"), "document body"),
        authority=_optional_string(raw.get("authority"), "document authority"),
        edition=_optional_string(raw.get("edition"), "document edition"),
        source_version=_optional_string(
            raw.get("source_version"), "document source version"
        ),
        locator=_optional_string(raw.get("locator"), "document locator"),
        language=_nonempty_string(raw.get("language", "en"), "document language"),
    )


def _normalise_question(value: str) -> str:
    return " ".join(value.casefold().split())


def load_cases(answer_quality: Path, discord_gold: Path) -> tuple[Case, ...]:
    """Load exactly 48 held-out and 8 Discord retrieval cases.

    The answer-quality file contains six unsupported cases in addition to the
    48 answerable held-out queries.  Discord cases are excluded by both ID and
    normalized question so a future fixture cannot silently double-count them.
    """

    if _sha256(answer_quality) != HELDOUT_GOLD_SHA256:
        raise ValueError("held-out gold checksum mismatch")
    if _sha256(discord_gold) != DISCORD_GOLD_SHA256:
        raise ValueError("Discord retrieval gold checksum mismatch")
    discord_raw = _cases_payload(discord_gold)
    discord_cases = tuple(
        _case(item, "discord_development", discord_gold.name) for item in discord_raw
    )
    if len(discord_cases) != EXPECTED_ORIGINS["discord_development"]:
        raise ValueError("Discord retrieval gold must contain exactly 8 cases")
    discord_ids = {case.case_id for case in discord_cases}
    discord_questions = {_normalise_question(case.question) for case in discord_cases}

    answer_quality_raw = _cases_payload(answer_quality)
    if len(answer_quality_raw) != 54:
        raise ValueError("held-out answer-quality gold must contain exactly 54 cases")
    heldout: list[Case] = []
    answerability_counts: defaultdict[str, int] = defaultdict(int)
    for raw_value in answer_quality_raw:
        raw = _mapping(raw_value, "answer-quality case")
        answerability = raw.get("answerability")
        if answerability not in {"answerable", "unsupported"}:
            raise ValueError("answer-quality answerability schema mismatch")
        answerability_key = cast(str, answerability)
        answerability_counts[answerability_key] += 1
        if answerability_key != "answerable":
            continue
        case = _case(raw, "held_out", answer_quality.name)
        if case.case_id in discord_ids or (
            _normalise_question(case.question) in discord_questions
        ):
            continue
        heldout.append(case)
    if dict(answerability_counts) != {"answerable": 48, "unsupported": 6}:
        raise ValueError(
            "answer-quality gold must contain 48 answerable and 6 unsupported cases"
        )
    if len(heldout) != EXPECTED_ORIGINS["held_out"]:
        raise ValueError("held-out gold must contain exactly 48 answerable cases")

    cases = tuple((*heldout, *discord_cases))
    identifiers = [case.case_id for case in cases]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("benchmark case IDs must be unique")
    return cases


def load_documents(path: Path) -> tuple[PublicDocument, ...]:
    """Load and validate the exact 451-document public corpus."""

    if _sha256(path) != CORPUS_SHA256:
        raise ValueError("public corpus checksum mismatch")
    documents: list[PublicDocument] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            documents.append(_document(json.loads(line)))
    identifiers = [document.document_id for document in documents]
    if len(documents) != 451:
        raise ValueError("public corpus must contain exactly 451 documents")
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("public corpus document IDs must be unique")
    if any(
        canonical_route_for(document, public_origin=PUBLIC_SITE_URL) is None
        for document in documents
    ):
        raise ValueError("public corpus contains a document without a canonical route")
    return tuple(documents)


class Embeddings:
    """Scoped LiteLLM embedding client with strict response validation."""

    def __init__(
        self,
        base_url: str,
        model: str,
        dimensions: int,
        chunker: TokenChunker,
        query_prefix: str,
    ) -> None:
        if base_url.rstrip("/") != LITELLM_BASE_URL:
            raise ValueError(
                "benchmark LiteLLM base URL must remain the Saturn gateway"
            )
        scoped_key = os.getenv("LITELLM_ARCHIVE_API_KEY", "").strip()
        if not scoped_key:
            raise ValueError("LITELLM_ARCHIVE_API_KEY is required")
        if model != EMBEDDING_ALIAS:
            raise ValueError(f"benchmark must use embedding alias {EMBEDDING_ALIAS}")
        if dimensions != EMBEDDING_DIMENSIONS:
            raise ValueError("benchmark must use 1,024-dimensional Qwen embeddings")
        self.client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {scoped_key}"},
            timeout=httpx.Timeout(180.0, connect=10.0),
        )
        self.model = model
        self.dimensions = dimensions
        self.chunker = chunker
        self.query_prefix = query_prefix

    async def close(self) -> None:
        await self.client.aclose()

    async def embed(
        self, texts: Sequence[str], *, batch_size: int = 32
    ) -> list[list[float]]:
        if not texts:
            return []
        if batch_size <= 0:
            raise ValueError("embedding batch size must be positive")
        output: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            batch = list(texts[start : start + batch_size])
            for text in batch:
                self.chunker.validate(text)
            response = await self.client.post(
                "/v1/embeddings", json={"model": self.model, "input": batch}
            )
            response.raise_for_status()
            payload = _mapping(response.json(), "embedding response")
            raw_data = payload.get("data")
            if not isinstance(raw_data, list) or len(raw_data) != len(batch):
                raise ValueError("embedding response count mismatch")
            indexed: dict[int, list[object]] = {}
            for raw_item in raw_data:
                item = _mapping(raw_item, "embedding row")
                index = item.get("index")
                if not isinstance(index, int) or isinstance(index, bool):
                    raise ValueError("embedding indices must be integers")
                if index in indexed:
                    raise ValueError("embedding indices must be unique")
                raw_vector = item.get("embedding")
                if not isinstance(raw_vector, list):
                    raise ValueError("embedding vector must be a list")
                indexed[index] = cast("list[object]", raw_vector)
            if set(indexed) != set(range(len(batch))):
                raise ValueError("embedding indices must be complete and ordered")
            for index in range(len(batch)):
                raw_vector = indexed[index]
                if len(raw_vector) != self.dimensions:
                    raise ValueError("embedding dimension mismatch")
                vector: list[float] = []
                for value in raw_vector:
                    if isinstance(value, bool) or not isinstance(value, int | float):
                        raise ValueError("embedding vector contained a non-number")
                    number = float(value)
                    if not math.isfinite(number):
                        raise ValueError(
                            "embedding vector contained a non-finite value"
                        )
                    vector.append(number)
                output.append(vector)
        return output

    async def query(self, question: str) -> list[float]:
        return (await self.embed((f"{self.query_prefix}{question}",), batch_size=1))[0]


def percentile(values: Sequence[float], percentile_value: int) -> float:
    if not values:
        raise ValueError("cannot calculate a percentile over no values")
    if not 0 < percentile_value <= 100:
        raise ValueError("percentile must be in (0, 100]")
    ordered = sorted(values)
    index = max(0, math.ceil(percentile_value / 100 * len(ordered)) - 1)
    return ordered[index]


def _score_row(
    case: Case,
    ranked_documents: list[str],
    latencies: Mapping[str, float],
    ranked_passages: Sequence[str] = (),
    candidate_metadata: Sequence[Mapping[str, object]] = (),
) -> dict[str, object]:
    relevant_ranks = [
        rank
        for rank, document_id in enumerate(ranked_documents, start=1)
        if document_id in case.accepted_document_ids
    ]
    first_rank = min(relevant_ranks) if relevant_ranks else None
    source_coverage = {
        limit: len(case.accepted_document_ids.intersection(ranked_documents[:limit]))
        / len(case.accepted_document_ids)
        for limit in (1, 3, 5, 10)
    }
    return {
        "case_id": case.case_id,
        "slice": case.slice_name,
        "origin": case.origin,
        "accepted_document_ids": sorted(case.accepted_document_ids),
        "first_relevant_document_rank": first_rank,
        "recall_at_1": first_rank is not None and first_rank <= 1,
        "recall_at_3": first_rank is not None and first_rank <= 3,
        "recall_at_5": first_rank is not None and first_rank <= 5,
        "recall_at_10": first_rank is not None and first_rank <= 10,
        "source_coverage_at_1": source_coverage[1],
        "source_coverage_at_3": source_coverage[3],
        "source_coverage_at_5": source_coverage[5],
        "source_coverage_at_10": source_coverage[10],
        "all_sources_at_10": source_coverage[10] == 1.0,
        "all_required_sources_at_10": source_coverage[10] == 1.0,
        "reciprocal_rank_at_10": (
            1 / first_rank if first_rank is not None and first_rank <= 10 else 0
        ),
        "query_embedding_ms": latencies["query_embedding_ms"],
        "search_ms": latencies["search_ms"],
        "total_retrieval_ms": latencies["total_retrieval_ms"],
        # Keep every one of the 24 ranked candidates for offline H@10 and
        # alternate metric recomputation.  The old top_document_ids field is
        # retained as a compact compatibility projection.
        "candidate_document_ids": ranked_documents,
        "candidate_passage_ids": list(ranked_passages),
        "candidate_passages": [dict(item) for item in candidate_metadata],
        "top_document_ids": ranked_documents[:10],
    }


def _summary(rows: Sequence[Mapping[str, object]]) -> dict[str, object]:
    if not rows:
        raise ValueError("cannot summarize no benchmark rows")

    def number(value: object, label: str) -> float:
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise ValueError(f"{label} must be numeric")
        result = float(value)
        if not math.isfinite(result):
            raise ValueError(f"{label} must be finite")
        return result

    def mean(name: str) -> float:
        def metric(value: object) -> float:
            if isinstance(value, bool):
                return float(value)
            return number(value, name)

        return statistics.fmean(metric(row[name]) for row in rows)

    latencies = [
        number(row["total_retrieval_ms"], "total_retrieval_ms") for row in rows
    ]
    return {
        "cases": len(rows),
        "recall_at_10": mean("recall_at_10"),
        "source_coverage_at_10": mean("source_coverage_at_10"),
        "all_sources_at_10": mean("all_sources_at_10"),
        "all_required_sources_at_10": mean("all_sources_at_10"),
        "mrr_at_10": mean("reciprocal_rank_at_10"),
        "latency_ms": {
            "p50": round(statistics.median(latencies), 3),
            "p95": round(percentile(latencies, 95), 3),
            "max": round(max(latencies), 3),
        },
    }


def _size_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


async def run(args: argparse.Namespace) -> dict[str, object]:
    if args.index.exists() or args.output.exists():
        raise ValueError("index and output destinations must not already exist")
    if args.limit != RETRIEVAL_CANDIDATE_LIMIT:
        raise ValueError("benchmark candidate limit must remain 24")
    if args.revision != EMBEDDING_REVISION:
        raise ValueError("benchmark embedding revision mismatch")
    if args.dimensions != EMBEDDING_DIMENSIONS:
        raise ValueError("benchmark embedding dimensions mismatch")
    if args.chunk_tokens != CHUNK_TOKENS or args.overlap_tokens != CHUNK_OVERLAP_TOKENS:
        raise ValueError("benchmark chunking contract mismatch")
    if args.max_input_tokens != MAX_INPUT_TOKENS:
        raise ValueError("benchmark embedding input contract mismatch")
    if (
        hashlib.sha256(args.query_prefix.encode()).hexdigest()
        != QWEN_QUERY_PREFIX_SHA256
    ):
        raise ValueError("benchmark query prefix checksum mismatch")
    if _sha256(args.tokenizer) != TOKENIZER_SHA256:
        raise ValueError("benchmark tokenizer checksum mismatch")

    documents = load_documents(args.corpus)
    cases = load_cases(args.answer_quality, args.discord_gold)
    corpus_ids = {document.document_id for document in documents}
    for case in cases:
        if not case.accepted_document_ids.issubset(corpus_ids):
            raise ValueError(f"{case.case_id} names a document outside the corpus")
    tokenizer = Tokenizer.from_str(args.tokenizer.read_text(encoding="utf-8"))
    chunker = TokenChunker(
        tokenizer,
        max_input_tokens=args.max_input_tokens,
        chunk_tokens=args.chunk_tokens,
        overlap_tokens=args.overlap_tokens,
    )
    chunks = tuple(
        chunk for document in documents for chunk in chunker.chunks(document)
    )
    embedder = Embeddings(
        args.base_url,
        args.model,
        args.dimensions,
        chunker,
        args.query_prefix,
    )
    contract = embedding_contract(
        EMBEDDING_ALIAS,
        args.revision,
        args.dimensions,
        tokenizer_sha256=TOKENIZER_SHA256,
        max_input_tokens=args.max_input_tokens,
        chunk_tokens=args.chunk_tokens,
        overlap_tokens=args.overlap_tokens,
        query_prefix=args.query_prefix,
    )
    try:
        await embedder.query("warm up Chronicler retrieval")
        started = time.perf_counter()
        vectors = await embedder.embed(tuple(chunk.text for chunk in chunks))
        embedding_ms = (time.perf_counter() - started) * 1_000
        if len(vectors) != len(chunks):
            raise ValueError("embedding count did not match passage count")
        document_by_id = {document.document_id: document for document in documents}
        passages: list[Passage] = []
        for chunk, vector in zip(chunks, vectors, strict=True):
            document = document_by_id[chunk.document_id]
            route = canonical_route_for(document, public_origin=PUBLIC_SITE_URL)
            if route is None:
                raise ValueError("corpus document did not have a canonical route")
            passages.append(
                Passage(
                    passage_id=chunk.chunk_id,
                    document_id=chunk.document_id,
                    title=chunk.title,
                    excerpt=chunk.text,
                    url=route.url,
                    content_version=projection_digest(document, route),
                    embedding_contract=contract,
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
            )
        if len({passage.passage_id for passage in passages}) != len(passages):
            raise ValueError("generated passage IDs must be unique")
        store = LanceStore(str(args.index), args.dimensions)
        await store.replace_all(passages)

        rows: list[dict[str, object]] = []
        for case in cases:
            query_started = time.perf_counter()
            vector = await embedder.query(case.question)
            query_ms = (time.perf_counter() - query_started) * 1_000
            search_started = time.perf_counter()
            found = await store.search(case.question, vector, RETRIEVAL_CANDIDATE_LIMIT)
            search_ms = (time.perf_counter() - search_started) * 1_000
            if len(found) != RETRIEVAL_CANDIDATE_LIMIT:
                raise ValueError("retrieval must return exactly 24 candidates")
            ranked_documents: list[str] = []
            ranked_passages: list[str] = []
            candidate_metadata: list[dict[str, object]] = []
            for item in found:
                passage = item.passage
                if passage.embedding_contract != contract:
                    raise ValueError(
                        "retrieval returned a row from another embedding contract"
                    )
                if passage.document_id not in corpus_ids:
                    raise ValueError("retrieval returned a document outside the corpus")
                ranked_passages.append(passage.passage_id)
                if not math.isfinite(float(item.relevance_score)):
                    raise ValueError("retrieval returned a non-finite relevance score")
                candidate_metadata.append(
                    {
                        "passage_id": passage.passage_id,
                        "document_id": passage.document_id,
                        "rank": item.rank,
                        "relevance_score": float(item.relevance_score),
                        "vector_distance": item.vector_distance,
                        "lexical_score": item.lexical_score,
                        "title": passage.title,
                        "url": passage.url,
                        "locator": passage.locator,
                    }
                )
                if passage.document_id not in ranked_documents:
                    ranked_documents.append(passage.document_id)
            rows.append(
                _score_row(
                    case,
                    ranked_documents,
                    {
                        "query_embedding_ms": round(query_ms, 3),
                        "search_ms": round(search_ms, 3),
                        "total_retrieval_ms": round(query_ms + search_ms, 3),
                    },
                    ranked_passages,
                    candidate_metadata,
                )
            )

        by_origin: dict[str, list[Mapping[str, object]]] = defaultdict(list)
        for row in rows:
            by_origin[str(row["origin"])].append(row)
        receipt: dict[str, object] = {
            "version": 1,
            "embedding_alias": EMBEDDING_ALIAS,
            "model": EMBEDDING_ALIAS,
            "embedding_model": EMBEDDING_MODEL,
            "revision": args.revision,
            "dimensions": args.dimensions,
            "chunk_tokens": args.chunk_tokens,
            "overlap_tokens": args.overlap_tokens,
            "max_input_tokens": args.max_input_tokens,
            "query_prefix": args.query_prefix,
            "query_prefix_sha256": QWEN_QUERY_PREFIX_SHA256,
            "tokenizer_sha256": TOKENIZER_SHA256,
            "embedding_contract": contract,
            "retrieval": "hybrid_rrf",
            "reranker_model": None,
            "candidate_limit": RETRIEVAL_CANDIDATE_LIMIT,
            "corpus_sha256": CORPUS_SHA256,
            "answer_quality_sha256": HELDOUT_GOLD_SHA256,
            "heldout_gold_sha256": HELDOUT_GOLD_SHA256,
            "discord_gold_sha256": DISCORD_GOLD_SHA256,
            "documents": len(documents),
            "passages": len(passages),
            "embedding_ms": round(embedding_ms, 3),
            "index_bytes": _size_bytes(args.index),
            "summary": _summary(rows),
            "by_origin": {
                name: _summary(items) for name, items in sorted(by_origin.items())
            },
            "cases": rows,
        }
        args.output.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(json.dumps(receipt["summary"], sort_keys=True))
        return receipt
    finally:
        await embedder.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--answer-quality", type=Path, required=True)
    parser.add_argument("--discord-gold", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", default=EMBEDDING_ALIAS)
    parser.add_argument("--revision", default=EMBEDDING_REVISION)
    parser.add_argument("--dimensions", type=int, default=EMBEDDING_DIMENSIONS)
    parser.add_argument("--max-input-tokens", type=int, default=MAX_INPUT_TOKENS)
    parser.add_argument("--chunk-tokens", type=int, default=CHUNK_TOKENS)
    parser.add_argument("--overlap-tokens", type=int, default=CHUNK_OVERLAP_TOKENS)
    parser.add_argument("--query-prefix", default=QWEN_QUERY_PREFIX)
    parser.add_argument("--public-site-url", default=PUBLIC_SITE_URL)
    parser.add_argument("--limit", type=int, default=RETRIEVAL_CANDIDATE_LIMIT)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.public_site_url != PUBLIC_SITE_URL:
        parser.error("benchmark public site URL must be the production URL")
    return args


def main() -> None:
    asyncio.run(run(parse_args()))


if __name__ == "__main__":
    main()

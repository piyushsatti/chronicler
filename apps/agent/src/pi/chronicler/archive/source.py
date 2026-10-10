from __future__ import annotations

import hashlib
import json
import os
import ssl
import uuid
from collections.abc import Sequence
from hmac import compare_digest
from pathlib import Path
from typing import Protocol

from sqlalchemy import Uuid, bindparam, text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.sql.base import Executable

from pi.chronicler.qa.contracts import PublicDocument
from pi.chronicler.qa.retrieval import is_eligible_public_document

PROJECTION_NAME = "public.archive_documents_v1"
# Keep Archive revalidation on the public adapter's bounded full-document page size.
# Larger alias batches can exceed the public GraphQL query-cost ceiling when several
# large documents happen to share a batch.
REVALIDATION_BATCH_SIZE = 4

_SNAPSHOT_REQUIRED_FIELDS = {
    "document_id",
    "kind",
    "category",
    "slug",
    "title",
    "public_body",
}
_SNAPSHOT_OPTIONAL_FIELDS = {
    "authority",
    "edition",
    "source_version",
    "locator",
    "language",
}
_SNAPSHOT_FIELDS = _SNAPSHOT_REQUIRED_FIELDS | _SNAPSHOT_OPTIONAL_FIELDS


class AnonymousPublicSource(Protocol):
    async def revalidate_projections(
        self, expected_document_ids: Sequence[str]
    ) -> dict[str, PublicDocument]: ...

    async def aclose(self) -> None: ...


class CandidateProjection(Protocol):
    async def all_document_ids(self) -> tuple[str, ...]: ...

    async def eligible_document_ids(
        self, document_ids: Sequence[str]
    ) -> tuple[str, ...]: ...

    async def close(self) -> None: ...


class FrozenSnapshotSource:
    """Read a pinned anonymous public snapshot without consulting live data.

    Production uses this source only while the canonical public projection is
    being rebuilt.  It is deliberately validated at startup so a missing,
    truncated, malformed, or swapped snapshot cannot silently become the
    retrieval corpus.
    """

    def __init__(
        self,
        path: str | Path,
        *,
        expected_sha256: str | None = None,
        expected_document_count: int | None = None,
    ) -> None:
        self.path = Path(path)
        raw = self.path.read_bytes()
        self.sha256 = hashlib.sha256(raw).hexdigest()
        if expected_sha256 is not None:
            expected = expected_sha256.strip().lower()
            if len(expected) != 64 or any(
                character not in "0123456789abcdef" for character in expected
            ):
                raise ValueError("snapshot SHA-256 must be 64 hexadecimal characters")
            if not compare_digest(self.sha256, expected):
                raise ValueError("snapshot SHA-256 did not match the pinned digest")
        self._documents = self._parse(raw)
        if (
            expected_document_count is not None
            and len(self._documents) != expected_document_count
        ):
            raise ValueError(
                "snapshot document count did not match the pinned expected count"
            )
        identifiers = [document.document_id for document in self._documents]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("snapshot contains duplicate document IDs")
        self._by_id = {document.document_id: document for document in self._documents}

    @property
    def document_ids(self) -> frozenset[str]:
        """Return the exact identities that a live corpus must replace."""

        return frozenset(self._by_id)

    def matches_documents(self, documents: Sequence[PublicDocument]) -> bool:
        """Return whether revalidated live documents exactly match the snapshot."""

        live_by_id = {document.document_id: document for document in documents}
        return len(live_by_id) == len(documents) and live_by_id == self._by_id

    @staticmethod
    def _parse(raw: bytes) -> tuple[PublicDocument, ...]:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError("snapshot must be UTF-8 JSONL") from error
        documents: list[PublicDocument] = []
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                raise ValueError(f"snapshot contains a blank line at {line_number}")
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"snapshot line {line_number} was not valid JSON"
                ) from error
            if not isinstance(value, dict):
                raise ValueError(f"snapshot line {line_number} was not an object")
            unknown = set(value) - _SNAPSHOT_FIELDS
            missing = _SNAPSHOT_REQUIRED_FIELDS - set(value)
            if unknown:
                raise ValueError(
                    f"snapshot line {line_number} had unknown fields: "
                    + ", ".join(sorted(unknown))
                )
            if missing:
                raise ValueError(
                    f"snapshot line {line_number} omitted fields: "
                    + ", ".join(sorted(missing))
                )
            for field in _SNAPSHOT_REQUIRED_FIELDS | _SNAPSHOT_OPTIONAL_FIELDS:
                if field not in value:
                    continue
                field_value = value[field]
                nullable_fields = {
                    "category",
                    "authority",
                    "edition",
                    "source_version",
                    "locator",
                }
                if field in nullable_fields:
                    if field_value is not None and not isinstance(field_value, str):
                        raise ValueError(
                            f"snapshot line {line_number} field {field} was invalid"
                        )
                elif not isinstance(field_value, str):
                    raise ValueError(
                        f"snapshot line {line_number} field {field} was invalid"
                    )
            try:
                document = PublicDocument(**value)
            except (TypeError, ValueError) as error:
                raise ValueError(f"snapshot line {line_number} was invalid") from error
            if not is_eligible_public_document(document):
                raise ValueError(
                    f"snapshot line {line_number} was not an eligible public document"
                )
            documents.append(document)
        return tuple(documents)

    async def all_documents(self) -> tuple[PublicDocument, ...]:
        return self._documents

    async def documents(
        self, document_ids: Sequence[str]
    ) -> tuple[PublicDocument, ...]:
        return tuple(
            self._by_id[document_id]
            for document_id in dict.fromkeys(document_ids)
            if document_id in self._by_id
        )


# The development reindex utility historically exported this name.  Keep the
# alias so old scripts continue to use the same validated loader.
SnapshotSource = FrozenSnapshotSource


class ProjectionReader:
    """Read only candidate IDs from the narrowly granted Archive projection."""

    def __init__(self, database_url: str, ca_file: str) -> None:
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        elif database_url.startswith("postgres://"):
            database_url = database_url.replace(
                "postgres://", "postgresql+asyncpg://", 1
            )
        if not database_url.startswith("postgresql+asyncpg://"):
            raise ValueError("ARCHIVE_DATABASE_URL must be PostgreSQL")
        tls = ssl.create_default_context(cafile=ca_file)
        tls.minimum_version = ssl.TLSVersion.TLSv1_2
        self._engine: AsyncEngine = create_async_engine(
            database_url,
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=0,
            connect_args={"ssl": tls},
        )

    async def close(self) -> None:
        await self._engine.dispose()

    async def all_document_ids(self) -> tuple[str, ...]:
        return await self._select(
            text(f"SELECT document_id FROM {PROJECTION_NAME} ORDER BY document_id")
        )

    async def eligible_document_ids(
        self, document_ids: Sequence[str]
    ) -> tuple[str, ...]:
        if not document_ids:
            return ()
        identifiers: list[uuid.UUID] = []
        for document_id in dict.fromkeys(document_ids):
            try:
                identifiers.append(uuid.UUID(document_id))
            except ValueError:
                continue
        if not identifiers:
            return ()
        statement = text(
            f"SELECT document_id FROM {PROJECTION_NAME} "
            "WHERE document_id IN :document_ids ORDER BY document_id"
        ).bindparams(
            bindparam("document_ids", expanding=True, type_=Uuid(as_uuid=True))
        )
        return await self._select(statement, {"document_ids": identifiers})

    async def _select(
        self, statement: Executable, parameters: dict[str, object] | None = None
    ) -> tuple[str, ...]:
        async with self._engine.connect() as connection:
            result = await connection.execute(statement, parameters or {})
            rows = result.scalars().all()
            await connection.rollback()
        return tuple(str(value) for value in rows)


class ArchiveSource:
    """Combine a narrow candidate view with canonical anonymous revalidation."""

    def __init__(
        self,
        projection: CandidateProjection,
        public_source: AnonymousPublicSource,
        bootstrap_source: FrozenSnapshotSource | None = None,
        bootstrap_min_live_documents: int | None = None,
        bootstrap_promotion_marker_path: str | Path | None = None,
    ) -> None:
        bootstrap_values = (
            bootstrap_source,
            bootstrap_min_live_documents,
            bootstrap_promotion_marker_path,
        )
        if any(value is not None for value in bootstrap_values) and not all(
            value is not None for value in bootstrap_values
        ):
            raise ValueError(
                "bootstrap source, minimum live document count, and promotion "
                "marker must be configured together"
            )
        if (
            bootstrap_min_live_documents is not None
            and bootstrap_min_live_documents <= 0
        ):
            raise ValueError("bootstrap minimum live document count must be positive")
        self._projection = projection
        self._public_source = public_source
        self._bootstrap_source = bootstrap_source
        self._bootstrap_min_live_documents = bootstrap_min_live_documents
        self._bootstrap_promotion_marker_path = (
            Path(bootstrap_promotion_marker_path)
            if bootstrap_promotion_marker_path is not None
            else None
        )
        # Once the canonical source reaches the promotion threshold, remain on
        # it for the lifetime of this process.  A transient later dip must not
        # silently roll a production index back to an older frozen snapshot.
        self._live_promoted = bootstrap_source is None or self._promotion_is_recorded()

    @property
    def using_bootstrap(self) -> bool:
        return not self._live_promoted

    async def close(self) -> None:
        await self._public_source.aclose()
        await self._projection.close()

    async def all_documents(self) -> tuple[PublicDocument, ...]:
        identifiers = await self._projection.all_document_ids()
        if self._bootstrap_source is None:
            return await self._live_documents(identifiers)
        if self._live_promoted:
            documents = await self._live_documents(identifiers)
            if not self._bootstrap_source.matches_documents(documents):
                raise RuntimeError(
                    "promoted live corpus drifted from the evaluated bootstrap corpus"
                )
            return documents
        if not self._can_attempt_live_promotion(identifiers):
            return await self._bootstrap_source.all_documents()

        # Promotion is driven only by a full indexing sync.  Require the exact
        # frozen identities to survive anonymous public revalidation before
        # latching live mode for the lifetime of this process.
        documents = await self._live_documents(identifiers)
        if not self._bootstrap_source.matches_documents(documents):
            return await self._bootstrap_source.all_documents()
        self._record_promotion()
        self._live_promoted = True
        return documents

    async def _live_documents(
        self, identifiers: Sequence[str]
    ) -> tuple[PublicDocument, ...]:
        documents: list[PublicDocument] = []
        for start in range(0, len(identifiers), REVALIDATION_BATCH_SIZE):
            batch = identifiers[start : start + REVALIDATION_BATCH_SIZE]
            current = await self._public_source.revalidate_projections(batch)
            documents.extend(current[item] for item in batch if item in current)
        return tuple(documents)

    async def documents(
        self, document_ids: Sequence[str]
    ) -> tuple[PublicDocument, ...]:
        if not self._live_promoted:
            assert self._bootstrap_source is not None
            return await self._bootstrap_source.documents(document_ids)
        identifiers = await self._projection.eligible_document_ids(document_ids)
        current = await self._public_source.revalidate_projections(identifiers)
        return tuple(current[item] for item in identifiers if item in current)

    def _can_attempt_live_promotion(self, live_ids: Sequence[str]) -> bool:
        if (
            self._bootstrap_source is None
            or self._bootstrap_min_live_documents is None
        ):
            return False
        identifiers = set(live_ids)
        return (
            len(identifiers) >= self._bootstrap_min_live_documents
            and identifiers == self._bootstrap_source.document_ids
        )

    def _promotion_marker_bytes(self) -> bytes:
        assert self._bootstrap_source is not None
        payload = {
            "schema": 1,
            "snapshot_sha256": self._bootstrap_source.sha256,
        }
        serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return (serialized + "\n").encode()

    def _promotion_is_recorded(self) -> bool:
        path = self._bootstrap_promotion_marker_path
        if path is None:
            return False
        if path.is_symlink():
            raise ValueError("bootstrap promotion marker must not be a symlink")
        try:
            observed = path.read_bytes()
        except FileNotFoundError:
            return False
        if not compare_digest(observed, self._promotion_marker_bytes()):
            raise ValueError("bootstrap promotion marker did not match the snapshot")
        return True

    def _record_promotion(self) -> None:
        path = self._bootstrap_promotion_marker_path
        assert path is not None
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(path, flags, 0o400)
        except FileExistsError:
            if self._promotion_is_recorded():
                return
            raise
        try:
            with os.fdopen(descriptor, "wb") as marker:
                marker.write(self._promotion_marker_bytes())
                marker.flush()
                os.fsync(marker.fileno())
        except BaseException:
            path.unlink(missing_ok=True)
            raise

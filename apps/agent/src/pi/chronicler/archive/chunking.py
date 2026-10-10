"""Token-aware subdivision of the canonical public, heading-aware passages."""

from __future__ import annotations

import hashlib
from dataclasses import replace
from pathlib import Path

from tokenizers import Tokenizer

from pi.chronicler.qa.chunking import (
    DEFAULT_MAX_BODY_BYTES,
    ChunkingConfig,
    chunk_document,
)
from pi.chronicler.qa.contracts import DocumentChunk, PublicDocument

LEGACY_BGE_REVISION = "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"
LEGACY_BGE_TOKENIZER_SHA256 = (
    "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66"
)
# Compatibility aliases used by older deployment artifacts and tests. New model
# profiles pass their exact revision/checksum and token bounds explicitly.
BGE_REVISION = LEGACY_BGE_REVISION
BGE_TOKENIZER_SHA256 = LEGACY_BGE_TOKENIZER_SHA256

DEFAULT_MAX_INPUT_TOKENS = 512
DEFAULT_CHUNK_TOKENS = 256
DEFAULT_OVERLAP_TOKENS = 32


class TokenChunker:
    def __init__(
        self,
        tokenizer: Tokenizer,
        *,
        max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS,
        chunk_tokens: int = DEFAULT_CHUNK_TOKENS,
        overlap_tokens: int = DEFAULT_OVERLAP_TOKENS,
    ) -> None:
        if max_input_tokens < 64:
            raise ValueError("max_input_tokens must be at least 64")
        if not 32 <= chunk_tokens <= max_input_tokens:
            raise ValueError("chunk_tokens must be in [32, max_input_tokens]")
        if not 0 <= overlap_tokens < chunk_tokens:
            raise ValueError("overlap_tokens must be in [0, chunk_tokens)")
        self._tokenizer = tokenizer
        self.max_input_tokens = max_input_tokens
        self.chunk_tokens = chunk_tokens
        self.overlap_tokens = overlap_tokens
        self._tokenizer.no_truncation()
        self._tokenizer.no_padding()

    @classmethod
    def from_file(
        cls,
        path: str,
        revision: str,
        *,
        expected_revision: str | None = None,
        expected_sha256: str | None = None,
        max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS,
        chunk_tokens: int = DEFAULT_CHUNK_TOKENS,
        overlap_tokens: int = DEFAULT_OVERLAP_TOKENS,
    ) -> TokenChunker:
        pinned_revision = expected_revision or LEGACY_BGE_REVISION
        pinned_sha256 = expected_sha256 or LEGACY_BGE_TOKENIZER_SHA256
        if revision != pinned_revision:
            raise ValueError("Archive embedding revision does not match tokenizer pin")
        try:
            data = Path(path).read_bytes()
        except OSError as exc:
            raise ValueError(
                "Stage the pinned embedding tokenizer at EMBEDDING_TOKENIZER_PATH"
            ) from exc
        if hashlib.sha256(data).hexdigest() != pinned_sha256:
            raise ValueError("Archive embedding tokenizer checksum mismatch")
        return cls(
            Tokenizer.from_str(data.decode("utf-8")),
            max_input_tokens=max_input_tokens,
            chunk_tokens=chunk_tokens,
            overlap_tokens=overlap_tokens,
        )

    def count(self, text: str) -> int:
        return len(self._tokenizer.encode(text).ids)

    def validate(self, text: str) -> None:
        if self.count(text) > self.max_input_tokens:
            raise ValueError(
                "embedding input exceeds "
                f"{self.max_input_tokens} tokens; split or shorten it"
            )

    def _windows(self, text: str, prefix: str) -> list[str]:
        pieces: list[str] = []
        start = 0
        while start < len(text):
            remaining = text[start:]
            if self.count(prefix + remaining) <= self.chunk_tokens:
                pieces.append(prefix + remaining)
                break
            encoding = self._tokenizer.encode(remaining, add_special_tokens=False)
            offsets = encoding.offsets
            budget = self.chunk_tokens - self.count(prefix)
            end_token = min(budget, len(offsets))
            while end_token > 0:
                end = offsets[end_token - 1][1]
                piece = prefix + remaining[:end]
                if end > 0 and self.count(piece) <= self.chunk_tokens:
                    break
                end_token -= 1
            else:
                raise ValueError(
                    "cannot fit public passage into embedding token budget"
                )
            pieces.append(piece)
            overlap_token = max(0, end_token - self.overlap_tokens)
            advance = offsets[overlap_token][0]
            # Some tokenizers map multiple tokens to one character. Always progress.
            start += advance if 0 < advance < end else end
        return pieces

    def chunks(self, document: PublicDocument) -> tuple[DocumentChunk, ...]:
        output: list[DocumentChunk] = []
        # Use the canonical heading parser and body-size guard, but defer passage
        # subdivision to this model tokenizer. The former 1,800-character default
        # silently capped every supposedly larger token profile at roughly 400
        # tokens, making chunk-size comparisons invalid.
        sections = chunk_document(
            document,
            ChunkingConfig(max_chars=DEFAULT_MAX_BODY_BYTES, overlap_chars=0),
        )
        for original in sections:
            heading = "\n".join(f"# {part}" for part in original.heading_path)
            title = f"# {document.title}\n"
            # Oversized metadata remains in stored title/original body; it must not
            # consume the entire repeated header budget or prevent body indexing.
            prefix = title if self.count(title) <= 64 else ""
            body = original.text
            if heading and body.startswith(heading):
                candidate = prefix + heading + "\n"
                if self.count(candidate) <= 128:
                    prefix = candidate
                    body = body[len(heading) :].lstrip("\n")
            texts = self._windows(body, prefix) if body else [prefix.rstrip()]
            for text in texts:
                self.validate(text)
                digest = hashlib.sha256(
                    (original.chunk_id + "\0" + text).encode()
                ).hexdigest()
                output.append(
                    replace(
                        original,
                        chunk_id=f"passage:{digest}",
                        text=text,
                        ordinal=len(output),
                    )
                )
        return tuple(output)

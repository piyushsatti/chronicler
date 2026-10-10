from pathlib import Path

import pytest

from pi.chronicler.archive.chunking import BGE_REVISION, TokenChunker
from pi.chronicler.qa.contracts import PublicDocument


def document(body: str, title: str = "Dense rules") -> PublicDocument:
    return PublicDocument("fixture", "rule", None, "fixture", title, body)


def test_dense_text_is_subdivided_without_losing_ending(chunker) -> None:
    body = "# Movement\n" + "1 2 3 4 5 6 7 8 9 0 " * 90 + "ENDING"
    chunks = chunker.chunks(document(body))
    assert len(chunks) > 2
    assert all(chunker.count(c.text) <= 256 for c in chunks)
    assert all("# Movement" in c.text for c in chunks)
    assert "ENDING" in chunks[-1].text
    assert len({c.chunk_id for c in chunks}) == len(chunks)
    assert chunks == chunker.chunks(document(body))
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))


def test_headers_and_special_tokens_are_included(chunker) -> None:
    chunks = chunker.chunks(document("1 " * 700, "2 " * 40))
    assert all(c.text.startswith("# " + "2 " * 40) for c in chunks)
    assert max(chunker.count(c.text) for c in chunks) <= 256
    assert any(chunker.count(c.text) > 240 for c in chunks)


def test_large_heading_and_unicode_do_not_loop_or_drop_tail(chunker) -> None:
    body = "# " + "1 " * 950 + "\n" + "🌍 雪 " * 400 + "END"
    chunks = chunker.chunks(document(body, "2 " * 900))
    assert all(chunker.count(c.text) <= 256 for c in chunks)
    assert any("🌍" in c.text for c in chunks)
    assert "END" in chunks[-1].text


def test_title_affects_embedding_input_and_passage_identity(chunker) -> None:
    first = chunker.chunks(document("Public body", "First title"))
    second = chunker.chunks(document("Public body", "Second title"))
    assert first[0].text != second[0].text
    assert first[0].chunk_id != second[0].chunk_id


def test_token_profile_is_not_capped_by_legacy_character_window() -> None:
    from tokenizers import Tokenizer
    from tokenizers.models import WordLevel
    from tokenizers.pre_tokenizers import Whitespace

    raw = Tokenizer(WordLevel({"[UNK]": 0, "word": 1}, unk_token="[UNK]"))
    raw.pre_tokenizer = Whitespace()
    chunker = TokenChunker(
        raw,
        max_input_tokens=1_024,
        chunk_tokens=768,
        overlap_tokens=96,
    )

    passages = chunker.chunks(document("# Section\n" + "word " * 700))

    assert len(passages) == 1
    assert chunker.count(passages[0].text) > 512
    assert chunker.count(passages[0].text) <= 768


def test_pinned_loader_fails_explicitly(tmp_path: Path) -> None:
    missing = tmp_path / "missing.json"
    with pytest.raises(ValueError, match="Stage the pinned"):
        TokenChunker.from_file(str(missing), BGE_REVISION)
    missing.write_text("{}")
    with pytest.raises(ValueError, match="checksum mismatch"):
        TokenChunker.from_file(str(missing), BGE_REVISION)
    with pytest.raises(ValueError, match="revision does not match tokenizer pin"):
        TokenChunker.from_file(str(missing), "unknown")

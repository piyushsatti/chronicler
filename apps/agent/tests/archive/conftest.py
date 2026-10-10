import pytest
from tokenizers import Tokenizer
from tokenizers.models import WordPiece
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.processors import TemplateProcessing

from pi.chronicler.archive.chunking import TokenChunker


@pytest.fixture
def chunker() -> TokenChunker:
    """Deterministic offline tokenizer; pinned real BGE also checked separately."""
    tokens = ["[UNK]", "[CLS]", "[SEP]", *list("0123456789"), "#", "|", "+", "=", "ft"]
    tokenizer = Tokenizer(
        WordPiece({value: i for i, value in enumerate(tokens)}, unk_token="[UNK]")
    )
    tokenizer.pre_tokenizer = Whitespace()
    tokenizer.post_processor = TemplateProcessing(
        single="[CLS] $A [SEP]", special_tokens=[("[CLS]", 1), ("[SEP]", 2)]
    )
    return TokenChunker(tokenizer)

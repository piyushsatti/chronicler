from dataclasses import replace

import pytest

from pi.chronicler.archive.settings import ArchiveSettings


def _settings() -> ArchiveSettings:
    return ArchiveSettings(
        database_url="postgresql://test",
        database_ca_file="ca.pem",
        public_graphql_url="https://example.test/graphql",
        litellm_base_url="https://model.test/v1",
        litellm_api_key="placeholder",
        embedding_model="test-model",
        embedding_revision="test-revision",
        embedding_dimensions=3,
        mcp_token="placeholder",
        lancedb_path="index",
        public_site_url="https://example.test",
        index_interval_seconds=3600,
        host="127.0.0.1",
        port=8000,
        allowed_hosts=("example.test",),
    )


def test_bootstrap_settings_must_be_configured_as_one_contract() -> None:
    with pytest.raises(ValueError, match="must be configured together"):
        replace(_settings(), bootstrap_snapshot_path="snapshot.jsonl")


def test_complete_bootstrap_settings_are_accepted() -> None:
    configured = replace(
        _settings(),
        bootstrap_snapshot_path="snapshot.jsonl",
        bootstrap_snapshot_sha256="a" * 64,
        bootstrap_expected_document_count=451,
        bootstrap_min_live_document_count=451,
        bootstrap_promotion_marker_path="live-source-promoted.json",
    )

    assert configured.bootstrap_expected_document_count == 451

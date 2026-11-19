"""Tests for the backend's own `aegra.json`, read through Aegra's config loader."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from aegra_api.config import load_http_config
from aegra_api.services.webhook_policy import webhooks_enabled
from aegra_api.settings import settings

AEGRA_JSON = Path(__file__).resolve().parents[1] / "aegra.json"


@pytest.fixture
def repo_aegra_config(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point Aegra's loader at this repo's `aegra.json`, whatever the cwd.

    `settings` is built once at import, so the path is patched on it directly.
    `webhooks_enabled` is cached; clear it so other tests see a fresh value.
    """
    assert AEGRA_JSON.is_file()
    monkeypatch.setattr(settings.app, "AEGRA_CONFIG", str(AEGRA_JSON))
    webhooks_enabled.cache_clear()
    yield
    webhooks_enabled.cache_clear()


@pytest.mark.usefixtures("repo_aegra_config")
def test_loader_reads_repo_config() -> None:
    http_config = load_http_config()
    assert http_config is not None
    assert http_config.get("app") == "svelte_langgraph.http:app"


@pytest.mark.usefixtures("repo_aegra_config")
def test_run_webhooks_are_disabled() -> None:
    assert webhooks_enabled() is False

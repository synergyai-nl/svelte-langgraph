"""Tests for trace identity and for scoring a run's trace.

Aegra exports the trace; what matters here is that the trace carries the id we
chose (so no lookup is needed) and that a score reaches it.
"""

import asyncio
import contextvars
import json
import uuid

import httpx
import pytest
import respx
from aegra_api.observability.sampling import is_trace_id_from_run_id_enabled
from aegra_api.observability.span_enrichment import (
    RunIdAwareIdGenerator,
    make_run_trace_context,
    prepare_run_otel_trace,
)
from aegra_api.settings import settings
from langchain_core.runnables import RunnableConfig
from openinference.instrumentation.langchain import LangChainInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from svelte_langgraph.graph import make_graph
from svelte_langgraph.tracing import record_score, trace_id_for_run
from tests.conftest import make_completion_response

from .conftest import BASE_URL, RUN_ID

TRACE_ID = "2762a74500bb4933a51aeddd65679b75"

SCORE_URL = f"{BASE_URL}/api/public/scores"
SCORE_ID = "score-1"
ACCEPTED = httpx.Response(200, json={"id": SCORE_ID})


def test_the_trace_id_is_the_run_id_without_its_dashes():
    assert trace_id_for_run(RUN_ID) == TRACE_ID


@pytest.mark.parametrize("run_id", ["", "cli", "not-a-uuid", None])
def test_a_non_uuid_run_has_no_trace_id(run_id):
    assert trace_id_for_run(run_id) is None


def local_executor_context(run_id: str) -> contextvars.Context:
    """The context `LocalExecutor.submit` gives a run's task."""
    return make_run_trace_context(run_id, "t1", "chat", "user-1")


def worker_context(run_id: str) -> contextvars.Context:
    """The context a worker gives a run: `_restore_trace_context` calls
    `prepare_run_otel_trace` inside the job's own context."""
    ctx = contextvars.copy_context()
    ctx.run(prepare_run_otel_trace, run_id)
    return ctx


class TestAegraSetsTheTraceId:
    """`record_score` posts to `trace_id_for_run(run_id)` without a lookup. That
    only works because Aegra gives the run that trace id. These run the graph
    under Aegra's own seeding entry points and check the contract still holds."""

    @pytest.fixture(autouse=True)
    def seeding_on(self, monkeypatch):
        """Seeding is decided once and cached, so start from a known state."""
        monkeypatch.delenv("OTEL_TRACES_SAMPLER", raising=False)
        monkeypatch.setattr(settings.observability, "OTEL_TRACE_ID_FROM_RUN_ID", True)
        is_trace_id_from_run_id_enabled.cache_clear()
        yield
        is_trace_id_from_run_id_enabled.cache_clear()

    @pytest.fixture
    def provider(self):
        # The same id generator Aegra's OpenTelemetry setup installs.
        provider = TracerProvider(id_generator=RunIdAwareIdGenerator())
        LangChainInstrumentor().instrument(tracer_provider=provider)
        yield provider
        LangChainInstrumentor().uninstrument()

    @pytest.fixture
    def exporter(self, provider):
        exp = InMemorySpanExporter()
        provider.add_span_processor(SimpleSpanProcessor(exp))
        return exp

    @staticmethod
    async def run_graph(run_id: str, context: contextvars.Context) -> None:
        """Build and run the graph in the run's own context, as Aegra does.

        `await ctx.run(coro_fn)` would NOT do this: `ctx.run` only builds the
        coroutine, which then executes in the caller's context.
        """

        async def body() -> None:
            config = RunnableConfig(configurable={"thread_id": "t1", "run_id": run_id})
            await make_graph(config).ainvoke(
                {"messages": [{"role": "user", "content": "hello"}]}, config
            )

        await asyncio.create_task(body(), context=context)

    @staticmethod
    def run_trace_ids(exporter: InMemorySpanExporter) -> set[str]:
        spans = [s for s in exporter.get_finished_spans() if s.name != "http-request"]
        assert spans, "the run exported no spans"
        return {
            format(ctx.trace_id, "032x")
            for span in spans
            if (ctx := span.get_span_context()) is not None
        }

    @pytest.mark.parametrize(
        "make_context",
        [local_executor_context, worker_context],
        ids=["local-executor", "worker"],
    )
    async def test_every_span_of_a_run_has_the_runs_trace_id(
        self, provider, exporter, mock_completion, make_context
    ):
        mock_completion.mock(return_value=make_completion_response("hi there"))
        run_id = str(uuid.uuid4())

        # Aegra builds the run's context inside a request. That request's span
        # must not become the run's parent.
        with provider.get_tracer("test").start_as_current_span("http-request"):
            context = make_context(run_id)
        await self.run_graph(run_id, context)

        assert self.run_trace_ids(exporter) == {trace_id_for_run(run_id)}

    async def test_a_ratio_sampler_turns_the_run_trace_id_off(
        self, exporter, mock_completion, monkeypatch
    ):
        """The documented caveat: under a ratio sampler, scores attach to no
        trace."""
        monkeypatch.setenv("OTEL_TRACES_SAMPLER", "parentbased_traceidratio")
        is_trace_id_from_run_id_enabled.cache_clear()
        mock_completion.mock(return_value=make_completion_response("hi there"))
        run_id = str(uuid.uuid4())

        await self.run_graph(run_id, local_executor_context(run_id))

        assert trace_id_for_run(run_id) not in self.run_trace_ids(exporter)


class TestScoring:
    @respx.mock
    async def test_no_score_without_credentials(self, no_langfuse_env):
        """Langfuse is optional, so an unconfigured deployment must no-op rather
        than raise — and must not reach out to the default localhost host."""
        assert await record_score(RUN_ID, "up", SCORE_ID) is False
        assert not respx.calls

    @respx.mock
    async def test_posts_straight_to_the_runs_own_trace(self, langfuse_env):
        """The trace id is known up front: no lookup call, just the score."""
        score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

        assert await record_score(RUN_ID, "up", SCORE_ID) is True

        assert len(respx.calls) == 1
        assert json.loads(score.calls.last.request.content) == {
            "id": SCORE_ID,
            "traceId": TRACE_ID,
            "name": "user_feedback",
            "value": "up",
            "dataType": "CATEGORICAL",
            "comment": "",
        }

    @respx.mock
    async def test_a_non_uuid_run_is_not_scored(self, langfuse_env, caplog):
        assert await record_score("cli", "up", SCORE_ID) is False
        assert not respx.calls
        assert "not a UUID" in caplog.text

    @respx.mock
    async def test_a_rejected_score_is_not_retried(self, langfuse_env, caplog):
        """A 4xx says the request itself is wrong, so repeating it only delays
        the answer. The caller turns False into a 502; an exception would become
        a 500 and lose the distinction."""
        score = respx.post(SCORE_URL).mock(return_value=httpx.Response(401))

        assert await record_score(RUN_ID, "up", SCORE_ID) is False
        assert score.call_count == 1
        assert "Langfuse rejected" in caplog.text

    @respx.mock
    async def test_a_transient_failure_is_retried(self, langfuse_env):
        """A known trace id removed the ingestion race, not ordinary flakiness,
        and the caller has nowhere to put a rating we drop."""
        score = respx.post(SCORE_URL).mock(
            side_effect=[httpx.Response(503), httpx.ConnectError("blip"), ACCEPTED]
        )

        assert await record_score(RUN_ID, "up", SCORE_ID) is True
        assert score.call_count == 3

    @respx.mock
    @pytest.mark.parametrize("status", [408, 429])
    async def test_timeouts_and_rate_limits_are_retried(self, langfuse_env, status):
        """Langfuse rate-limits bursts; these say "later", not "wrong"."""
        score = respx.post(SCORE_URL).mock(
            side_effect=[httpx.Response(status), ACCEPTED]
        )

        assert await record_score(RUN_ID, "up", SCORE_ID) is True
        assert score.call_count == 2

    @respx.mock
    async def test_a_stalled_langfuse_hits_the_deadline(
        self, langfuse_env, monkeypatch, caplog
    ):
        """The per-attempt timeout alone would let retries stack up to minutes."""
        from svelte_langgraph import tracing

        monkeypatch.setattr(tracing, "_DEADLINE_SECONDS", 0.05)

        async def stall(request):
            await asyncio.sleep(5)
            return ACCEPTED

        respx.post(SCORE_URL).mock(side_effect=stall)

        assert await record_score(RUN_ID, "up", SCORE_ID) is False
        assert "Giving up" in caplog.text

    @respx.mock
    async def test_retries_are_bounded(self, langfuse_env, caplog):
        """/feedback awaits this, so it must fail rather than hang."""
        score = respx.post(SCORE_URL).mock(return_value=httpx.Response(503))

        assert await record_score(RUN_ID, "up", SCORE_ID) is False
        assert score.call_count == 3
        assert "Giving up" in caplog.text

    @respx.mock
    async def test_a_comment_rides_along_with_the_rating(self, langfuse_env):
        """One request, not a write followed by an edit — the frontend holds the
        rating until its comment box resolves."""
        score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

        assert await record_score(RUN_ID, "down", SCORE_ID, comment="too vague") is True

        assert len(respx.calls) == 1
        body = json.loads(score.calls.last.request.content)
        assert body["comment"] == "too vague"
        assert body["value"] == "down"

    @respx.mock
    async def test_a_changed_rating_clears_the_earlier_comment(self, langfuse_env):
        """The score id is stable, so the second write edits the first. Leaving
        the key out would strand the old comment on the new rating -- the box
        only opens on a *changed* rating, so there is never a comment worth
        keeping across one."""
        score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

        assert (
            await record_score(RUN_ID, "down", SCORE_ID, comment="wrong and confident")
            is True
        )
        assert await record_score(RUN_ID, "up", SCORE_ID) is True

        assert json.loads(score.calls.last.request.content)["comment"] == ""

    @respx.mock
    async def test_a_whitespace_comment_is_not_a_comment(self, langfuse_env):
        score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

        assert await record_score(RUN_ID, "up", SCORE_ID, comment="   \n  ") is True

        assert json.loads(score.calls.last.request.content)["comment"] == ""

    @respx.mock
    async def test_a_missing_run_id_is_not_an_error(self, langfuse_env):
        assert await record_score("", "up", SCORE_ID) is False
        assert not respx.calls

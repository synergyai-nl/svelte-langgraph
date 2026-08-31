"""Tests for trace identity and for scoring a run's trace.

Aegra exports the trace; what matters here is that the trace carries the id we
chose (so no lookup is needed) and that a score reaches it.
"""

import asyncio
import contextvars
import json
import uuid
from uuid import UUID

import httpx
import pytest
import respx
from langchain_core.runnables import RunnableConfig
from openinference.instrumentation.langchain import LangChainInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from svelte_langgraph.graph import make_graph
from svelte_langgraph.tracing import record_score, trace_id_for_run
from tests.conftest import make_completion_response

from .conftest import BASE_URL

RUN_ID = "2762a745-00bb-4933-a51a-eddd65679b75"
TRACE_ID = "2762a74500bb4933a51aeddd65679b75"

SCORE_URL = f"{BASE_URL}/api/public/scores"
ACCEPTED = httpx.Response(200, json={"id": "score-1"})


def test_the_trace_id_is_the_run_id_without_its_dashes():
    assert trace_id_for_run(RUN_ID) == TRACE_ID


@pytest.mark.parametrize("run_id", ["", "cli", "not-a-uuid", None])
def test_a_non_uuid_run_has_no_trace_id(run_id):
    assert trace_id_for_run(run_id) is None


class TestPinning:
    """`pin_trace_to_run` runs inside `make_graph`, so these drive the factory
    the way Aegra does rather than calling it directly."""

    @pytest.fixture
    def exporter(self):
        exp = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exp))
        LangChainInstrumentor().instrument(tracer_provider=provider)
        yield exp
        LangChainInstrumentor().uninstrument()

    @staticmethod
    async def run_graph(config: RunnableConfig) -> None:
        """Mirror `LocalExecutor.submit`: build the graph and run it inside a
        context of the run's own.

        `await ctx.run(coro_fn)` would NOT do this — `ctx.run` only builds the
        coroutine, which then executes in the caller's context, and the test
        would pass or fail for the wrong reason.
        """

        async def body() -> None:
            agent = make_graph(config)
            await agent.ainvoke(
                {"messages": [{"role": "user", "content": "hello"}]}, config
            )

        await asyncio.create_task(body(), context=contextvars.copy_context())

    @staticmethod
    def trace_ids(exporter: InMemorySpanExporter) -> set[str]:
        return {
            format(ctx.trace_id, "032x")
            for span in exporter.get_finished_spans()
            if (ctx := span.get_span_context()) is not None
        }

    async def test_every_span_of_a_run_shares_the_run_id_as_its_trace_id(
        self, exporter, mock_completion
    ):
        mock_completion.mock(return_value=make_completion_response("hi there"))
        run_id = str(uuid.uuid4())

        await self.run_graph(
            RunnableConfig(configurable={"thread_id": "t1", "run_id": run_id})
        )

        assert exporter.get_finished_spans(), "the run exported no spans"
        assert self.trace_ids(exporter) == {UUID(run_id).hex}

    async def test_a_run_without_a_run_id_still_traces(self, exporter, mock_completion):
        """The CLI loop and Aegra's startup schema extraction both call the
        factory with no run id; they must trace normally, not crash."""
        mock_completion.mock(return_value=make_completion_response("hi there"))

        await self.run_graph(RunnableConfig(configurable={"thread_id": "t1"}))

        assert exporter.get_finished_spans()

    async def test_a_pinned_id_does_not_escape_the_run_that_set_it(
        self, exporter, mock_completion
    ):
        """`pin_trace_to_run` attaches a context without ever detaching it, which
        is only safe because each run owns its context.

        This deliberately does NOT use `run_graph`: wrapping the pinning run in a
        fresh `contextvars.Context` would provide the isolation under test, and
        the assertion would hold even with `pin_trace_to_run` gutted. Here the
        pinning run gets its own context (as Aegra gives it) while the second
        runs in *this* context — so a leak past the task boundary fails the test.
        """
        mock_completion.mock(
            side_effect=lambda request: make_completion_response("hi there")
        )
        run_id = str(uuid.uuid4())

        async def pinned() -> None:
            config = RunnableConfig(configurable={"thread_id": "t1", "run_id": run_id})
            make_graph(config)
            await make_graph(config).ainvoke(
                {"messages": [{"role": "user", "content": "hello"}]}, config
            )

        await asyncio.create_task(pinned(), context=contextvars.copy_context())
        assert self.trace_ids(exporter) == {UUID(run_id).hex}, "pinning did not apply"

        exporter.clear()
        unpinned = RunnableConfig(configurable={"thread_id": "t2"})
        await make_graph(unpinned).ainvoke(
            {"messages": [{"role": "user", "content": "hello"}]}, unpinned
        )

        assert exporter.get_finished_spans(), "the second run exported no spans"
        assert UUID(run_id).hex not in self.trace_ids(exporter)


class TestScoring:
    @respx.mock
    async def test_no_score_without_credentials(self, no_langfuse_env):
        """Langfuse is optional, so an unconfigured deployment must no-op rather
        than raise — and must not reach out to the default localhost host."""
        assert await record_score(RUN_ID, 1.0) is False
        assert not respx.calls

    @respx.mock
    async def test_posts_straight_to_the_runs_own_trace(self, langfuse_env):
        """The point of pinning: no lookup call, just the score."""
        score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

        assert await record_score(RUN_ID, 1.0) is True

        assert len(respx.calls) == 1
        assert json.loads(score.calls.last.request.content) == {
            "traceId": TRACE_ID,
            "name": "user_feedback",
            "value": 1.0,
        }

    @respx.mock
    async def test_score_name_is_overridable(self, langfuse_env):
        score = respx.post(SCORE_URL).mock(return_value=ACCEPTED)

        assert await record_score(RUN_ID, 0.0, name="thumbs") is True
        assert json.loads(score.calls.last.request.content)["name"] == "thumbs"

    @respx.mock
    async def test_a_non_uuid_run_is_not_scored(self, langfuse_env, caplog):
        assert await record_score("cli", 1.0) is False
        assert not respx.calls
        assert "not a UUID" in caplog.text

    @respx.mock
    async def test_a_rejected_score_is_not_retried(self, langfuse_env, caplog):
        """A 4xx says the request itself is wrong, so repeating it only delays
        the answer. The caller turns False into a 502; an exception would become
        a 500 and lose the distinction."""
        score = respx.post(SCORE_URL).mock(return_value=httpx.Response(401))

        assert await record_score(RUN_ID, 1.0) is False
        assert score.call_count == 1
        assert "Langfuse rejected" in caplog.text

    @respx.mock
    async def test_a_transient_failure_is_retried(self, langfuse_env):
        """Pinning removed the ingestion race, not ordinary flakiness — and the
        caller has nowhere to put a rating we drop."""
        score = respx.post(SCORE_URL).mock(
            side_effect=[httpx.Response(503), httpx.ConnectError("blip"), ACCEPTED]
        )

        assert await record_score(RUN_ID, 1.0) is True
        assert score.call_count == 3

    @respx.mock
    async def test_retries_are_bounded(self, langfuse_env, caplog):
        """/feedback awaits this, so it must fail rather than hang."""
        score = respx.post(SCORE_URL).mock(return_value=httpx.Response(503))

        assert await record_score(RUN_ID, 1.0) is False
        assert score.call_count == 3
        assert "Giving up" in caplog.text

    @respx.mock
    async def test_a_missing_run_id_is_not_an_error(self, langfuse_env):
        assert await record_score("", 1.0) is False
        assert not respx.calls

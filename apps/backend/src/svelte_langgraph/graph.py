from collections.abc import Awaitable, Callable, Sequence
from typing import Annotated, Any, cast

from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware, AgentState, before_agent
from langchain.agents.middleware.types import (
    ModelCallResult,
    ModelRequest,
    ModelResponse,
)
from langchain_core.callbacks import BaseCallbackManager
from langchain_core.messages import AnyMessage, BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableConfig

from langgraph.config import get_config
from langgraph.graph.state import CompiledStateGraph
from langgraph.runtime import Runtime

# Absolute imports required: Aegra loads this file by path (outside the
# package), so relative imports would fail at server startup.
from svelte_langgraph.models import get_chat_model
from svelte_langgraph.phase import DEFAULT_PHASE, VALID_PHASES, Phase
from svelte_langgraph.reducers import last_value
from svelte_langgraph.tools import get_tools
from svelte_langgraph.tracing import get_run_callbacks


# AgentState is generic over the structured-response type since langchain 1.3;
# we don't use response_format, hence None.
class AgentExtendedState(AgentState[None]):
    # `last_value` resolves two `change_phase` tool calls in one assistant
    # message (parallel tool calls) deterministically to the most recent
    # write, instead of LangGraph raising InvalidUpdateError -- see
    # reducers.py for the mechanism.
    phase: Annotated[Phase, last_value]


SYSTEM_PROMPT = "You are a helpful assistant. Address the user as {user_name}."
INITIAL_MESSAGE = "Hi, how are you doing?"


def get_prompt_template() -> ChatPromptTemplate:
    return ChatPromptTemplate(
        [
            ("system", SYSTEM_PROMPT),
            ("system", "Current phase: {phase}"),
            ("ai", INITIAL_MESSAGE),
        ]
    )


def get_prompt(
    state: AgentExtendedState, config: RunnableConfig
) -> Sequence[BaseMessage]:
    assert "configurable" in config
    assert isinstance(state["messages"], list)

    template = get_prompt_template()
    phase = state.get("phase")
    if phase is None:
        phase = DEFAULT_PHASE

    return (
        template.format_messages(
            user_name=config["configurable"].get("user_name"),
            phase=phase,
        )
        + state["messages"]
    )


@before_agent(can_jump_to=["end"], state_schema=AgentExtendedState)
def phase_gate(state: AgentExtendedState, runtime: Runtime) -> dict | None:
    """Validate phase and decide whether this run should reach the model.

    A missing phase defaults to DEFAULT_PHASE (absence isn't invalid input),
    but an invalid value raises. This fails fast by design: the bad value is
    already checkpointed before this hook runs, so message-only submits keep
    failing until a valid phase write lands — surfacing the caller bug loudly
    instead of silently coercing it away.

    The run ends without a model call when:

    - The frontend marks a state-only submit (`stateSync`'s `field.set()`) via
      `configurable.state_only_submit`, passed through `RunnableConfig` rather
      than graph state so it's per-invocation and never persisted to the
      checkpoint.
    - The last message is not a HumanMessage. A field-only submit never adds a
      message, but accumulated *checkpoint* state can still end in a
      HumanMessage left over from a prior run that was cancelled or failed
      before the agent produced an AI reply. Looking only at
      `state["messages"]` can't tell that apart from a genuine new submission,
      hence the explicit marker above.
    """
    update: dict = {}

    phase = state.get("phase")
    if phase is None:
        update["phase"] = DEFAULT_PHASE
    elif phase not in VALID_PHASES:
        raise ValueError(
            f"Invalid phase {phase!r}. Must be one of: {sorted(VALID_PHASES)}"
        )

    if get_config().get("configurable", {}).get("state_only_submit"):
        update["jump_to"] = "end"
        return update

    messages = state.get("messages", [])
    if not messages or not isinstance(messages[-1], HumanMessage):
        update["jump_to"] = "end"
        return update

    return update or None


def _run_id_from_config(config: RunnableConfig) -> str | None:
    """Find the LangGraph run id, which lives in a different slot per caller.

    Aegra puts it in `metadata`; a direct `Pregel` invocation puts it at the
    top level. Checking all three keeps tracing working in the server, in
    main.py's CLI loop, and in tests.
    """
    for candidate in (
        config.get("metadata", {}).get("run_id"),
        config.get("configurable", {}).get("run_id"),
        config.get("run_id"),
    ):
        if candidate:
            return str(candidate)
    return None


class TracingMiddleware(AgentMiddleware[AgentExtendedState, None, Any]):
    """Attach a per-run Langfuse handler whose trace id is the LangGraph run id.

    Pinning trace_id = run_id is what lets `/feedback` score a trace by run id
    alone, with no lookup. The handler has to be built per run (Langfuse takes
    `trace_context` at construction), and `ModelRequest.override(model=...)`
    can't carry it — `create_agent` calls `bind_tools()` on that model, which a
    config-bound runnable doesn't expose. So the handler is added to the
    ambient callback manager instead, which the model call inherits.

    No-ops when Langfuse isn't configured or the run id is missing, so local
    runs without Langfuse credentials behave exactly as before.
    """

    def _attach(self) -> None:
        config = get_config()
        run_id = _run_id_from_config(config)
        if not run_id:
            return

        # Inside a graph node this is the live callback manager, even though
        # RunnableConfig types it as a plain handler list.
        manager = config.get("callbacks")
        if not isinstance(manager, BaseCallbackManager):
            return

        existing = {type(h) for h in manager.handlers}
        for handler in get_run_callbacks(run_id):
            # A retry or a tool loop re-enters this hook within the same run;
            # adding the handler twice would double every observation.
            if type(handler) not in existing:
                manager.add_handler(handler, inherit=True)

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        self._attach()
        return handler(request)

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        self._attach()
        return await handler(request)


class PromptMiddleware(AgentMiddleware[AgentExtendedState, None, Any]):
    """Build the model input with get_prompt (system prompts + injected phase
    message + AI greeting + state messages), replacing the agent's default
    system-prompt handling."""

    def _request_with_prompt(self, request: ModelRequest) -> ModelRequest:
        state = cast(AgentExtendedState, request.state)
        return request.override(
            system_message=None,
            messages=cast(list[AnyMessage], list(get_prompt(state, get_config()))),
        )

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        return handler(self._request_with_prompt(request))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        return await handler(self._request_with_prompt(request))


def make_graph(
    config: RunnableConfig,
) -> CompiledStateGraph:
    return create_agent(
        model=get_chat_model(),
        tools=get_tools(),
        middleware=[phase_gate, TracingMiddleware(), PromptMiddleware()],
        state_schema=AgentExtendedState,
    )

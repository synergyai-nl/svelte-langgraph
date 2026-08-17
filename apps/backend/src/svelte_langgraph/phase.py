"""Single source of truth for the phase enum.

Lives in its own module so both graph.py and tools.py can import it without
creating an import cycle.
"""

from typing import Literal, get_args

Phase = Literal["research", "draft", "review"]
VALID_PHASES: frozenset[str] = frozenset(get_args(Phase))
DEFAULT_PHASE: Phase = "research"

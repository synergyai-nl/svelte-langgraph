import os

import sentry_sdk

from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.langchain import LangchainIntegration

async def init_sentry():
    # Log 400 (bad request) and 401 (unauthorized) in addition to 5xx
    failed_request_status_codes = [400, 401, range(500, 599)]

    # Configure Sentry for logging and error tracing
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_SDK_DSN"),
        enable_tracing=False,
        integrations=[
            # Configure here to override logged request status codes.
            StarletteIntegration(
                transaction_style="endpoint",
                failed_request_status_codes=failed_request_status_codes,
            ),
            LangchainIntegration(
                # Whether LLM and tokenizer inputs and outputs should be sent to Sentry.
                # Sentry considers this data personal identifiable data (PII) by default.
                # If you want to include the data, set send_default_pii=True in the sentry_sdk.init() call.
                include_prompts=True,
                max_spans=1024,
            ),
        ],
    )

async def init():
    """Global/app-wide initialization."""
    
    await init_sentry()

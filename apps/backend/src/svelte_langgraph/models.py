import os

from langchain.chat_models import BaseChatModel, init_chat_model


def get_chat_model() -> BaseChatModel:
    model_name = os.getenv("CHAT_MODEL_NAME", "gpt-4o-mini")
    model = init_chat_model(model_name, model_provider="openai", temperature=0.9)
    return model

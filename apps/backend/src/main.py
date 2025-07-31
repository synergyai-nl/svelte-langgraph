from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.init import init

@asynccontextmanager
async def lifespan(app: FastAPI):
      # Initialize global setup
      await init()
      yield

app = FastAPI(lifespan=lifespan)


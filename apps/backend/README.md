# langgraph
Langgraph server project.

## Getting started
### Requirements
* Python 3.12
* [uv](https://docs.astral.sh/uv/)

### Install deps
```bash
uv sync
```

### Development
Start frontend and backend:
```sh
moon :dev
```

### CLI
For testing.

Run in command-line:
```sh
src/svelte_langgraph/main.py 
```

Example:
```
drbob@stingray backend % src/svelte_langgraph/main.py
Hi, how are you doing?
Very well, thank you!
I'm glad to hear you're doing well! How can I assist you today?
What's the weather in Paredes de Coura?
I'll check the weather in Paredes de Coura for you. It's always sunny in Paredes de Coura! According to the weather information, it's always sunny in Paredes de Coura! That sounds like lovely weather conditions there.
[Press Ctrl+D (on Unix/macOS) or Ctrl+Z then Enter (on Windows) to exit]

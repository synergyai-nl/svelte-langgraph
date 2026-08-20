# langgraph

> **Monorepo note:** For the full local stack (frontend, backend, and OIDC mock), run `moon :dev :oidc-mock` from the [repo root](../../README.md). To run only the OIDC mock provider: `moon backend:oidc-mock`.

Langgraph server project.

## Getting started
### Requirements
* Python 3.12
* [uv](https://docs.astral.sh/uv/)
* Proto + moon (see root README for setup)

### Install deps

Dependencies are installed automatically by moon tasks. From the repo root:

```bash
proto install
moon setup   # first time only, if needed
```

### Development

Start frontend and backend (without OIDC mock):

```sh
moon :dev
```

For local auth testing, start the full stack including the OIDC mock provider:

```sh
moon :dev :oidc-mock
```

Or run the OIDC mock in a separate terminal:

```sh
moon backend:oidc-mock
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
```

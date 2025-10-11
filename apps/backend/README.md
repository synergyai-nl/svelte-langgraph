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
I'll check the weather in Paredes de Coura for you.It's always sunny in Paredes de Coura!According to the weather information, it's always sunny in Paredes de Coura! That sounds like lovely weather conditions there.
Traceback (most recent call last):
  File "/Users/drbob/Development/svelte-langgraph/apps/backend/src/svelte_langgraph/main.py", line 35, in <module>
    asyncio.run(main())
  File "/Users/drbob/.proto/tools/python/3.12.11/lib/python3.12/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ^^^^^^^^^^^^^^^^
  File "/Users/drbob/.proto/tools/python/3.12.11/lib/python3.12/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/drbob/.proto/tools/python/3.12.11/lib/python3.12/asyncio/base_events.py", line 691, in run_until_complete
    return future.result()
           ^^^^^^^^^^^^^^^
  File "/Users/drbob/Development/svelte-langgraph/apps/backend/src/svelte_langgraph/main.py", line 31, in main
    user_input = input("\n")
                 ^^^^^^^^^^^
EOFError
```

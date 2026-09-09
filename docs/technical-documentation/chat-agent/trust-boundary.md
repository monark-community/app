# Trust boundary

Any tool the agent can call runs as the user through that procedure's own
permission gate : chat adds no bypass. A user can therefore only ever read or
change what they're already allowed to. The `chat.ai-agent` flag is an
org/user-level kill switch for the LLM-backed path.

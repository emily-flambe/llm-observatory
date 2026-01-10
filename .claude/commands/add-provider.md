---
description: Add a new LLM provider to the observatory
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
---

# Add LLM Provider

Add a new LLM provider: $ARGUMENTS

## Steps

1. Create a new provider file at `src/services/llm/<provider>.ts` implementing `LLMProvider` interface
2. Study existing providers (openai.ts, anthropic.ts) for patterns
3. Add the provider case to `src/services/llm/index.ts` factory function
4. Add environment variable for API key to `src/types/env.ts`
5. Update `.dev.vars.example` with the new API key placeholder
6. Add the model entry to `scripts/seed.sql`
7. Run `make lint && make test` to verify
8. Document the new provider in CLAUDE.md if needed

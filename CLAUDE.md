# LLM Observatory - Project Guidelines for Claude

## Git Workflow

**MANDATORY: All feature work MUST use git worktrees.**

```bash
git fetch origin
git worktree add ../llm-observatory-feature-name -b feature-name origin/main
cd ../llm-observatory-feature-name
make setup
```

## Development

```bash
make setup    # First-time setup (copies .dev.vars, installs deps, inits DB)
make dev      # Start dev server
make test     # Run unit tests
make test-e2e # Run e2e tests
make lint     # Run linter
make deploy   # Deploy to production
```

## Visual Verification

**MANDATORY: Use Playwright MCP to verify UI changes before committing.**

## Key Patterns

- Hono for API routes
- D1 for database (local and remote must stay in sync)
- Tailwind CSS v4 for styling
- Simple over clever - avoid over-engineering

## Database Changes

When modifying schema:
```bash
# Apply to BOTH local and remote
npx wrangler d1 execute llm-observatory-db --local --command "ALTER TABLE ..."
npx wrangler d1 execute llm-observatory-db --remote --command "ALTER TABLE ..."
```

## Testing

Run all tests before committing:
- `npm run lint`
- `npm run test`
- `npm run test:e2e`

## Project Structure

```
src/
├── index.ts           # Worker entry point
├── routes/
│   └── api.ts         # Hono API routes
├── services/
│   ├── llm/           # LLM provider adapters
│   ├── collector.ts   # Collection orchestration
│   └── storage.ts     # D1 operations
├── db/
│   └── schema.sql     # Database schema
└── types/
    └── env.ts         # Worker bindings

frontend/
├── src/
│   ├── App.tsx        # Main app component
│   └── components/    # React components
└── index.html
```

## LLM Providers

Currently supported:
- OpenAI (GPT-4o)
- Anthropic (Claude Sonnet)
- Google (Gemini 2.0 Flash)
- Cloudflare Workers AI (Llama 3.1 8B)

Provider adapters are in `src/services/llm/`. Each implements the `LLMProvider` interface.
The `collector.ts` also has inline implementations for the collection endpoint.

## Admin API

Protected endpoints require `Authorization: Bearer <ADMIN_API_KEY>` header.

- `POST /api/admin/collect` - Trigger collection for a topic/model

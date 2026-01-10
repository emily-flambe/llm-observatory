# LLM Observatory - Project Guidelines for Claude

## Git Workflow

**MANDATORY: All feature work MUST use git worktrees.**

```bash
git fetch origin
git worktree add ../llm-observatory-feature-name -b feature-name origin/main
cd ../llm-observatory-feature-name
cp ../llm-observatory/.dev.vars .dev.vars  # CRITICAL: Copy API keys immediately
make setup
```

**CRITICAL: Every new worktree must have `.dev.vars` copied immediately.** The file contains API keys for LLM providers and BigQuery. Without it, collection will fail silently or only work for some providers.

## Development

```bash
make setup    # First-time setup (copies .dev.vars, installs deps, inits DB)
make dev      # Start dev server on http://localhost:8787
make test     # Run unit tests
make test-e2e # Run e2e tests
make lint     # Run linter
make deploy   # Deploy to production
```

## Visual Verification

**MANDATORY: Use Playwright MCP to verify UI changes before committing.**

## Key Patterns

- Hono for API routes
- D1 for config data (topics, models, prompt_templates)
- BigQuery for response data storage
- Tailwind CSS v4 for styling
- Simple over clever - avoid over-engineering

## Schema Changes - MANDATORY MIGRATIONS

**Always run migrations when changing schemas. This applies to BOTH D1 and BigQuery.**

### D1 Schema Changes

When modifying D1 schema (topics, models, prompt_templates):
```bash
# Apply to BOTH local and remote
npx wrangler d1 execute llm-observatory-db --local --command "ALTER TABLE ..."
npx wrangler d1 execute llm-observatory-db --remote --command "ALTER TABLE ..."
```

### BigQuery Schema Changes

When modifying BigQuery schema (raw_responses table):
```bash
# Add new columns
bq query --use_legacy_sql=false \
  "ALTER TABLE \`emilys-personal-projects.llm_observatory.raw_responses\` ADD COLUMN IF NOT EXISTS column_name TYPE"
```

Current BigQuery schema:
- `id`, `collected_at`, `company`, `product`, `model`
- `topic_id`, `topic_name`
- `prompt_template_id`, `prompt_template_name`
- `prompt`, `response`, `latency_ms`
- `input_tokens`, `output_tokens`
- `error`, `success`

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
├── middleware/
│   └── access.ts      # Cloudflare Access JWT validation
├── services/
│   ├── llm/           # LLM provider adapters
│   ├── bigquery.ts    # BigQuery operations
│   ├── collector.ts   # Collection orchestration
│   └── storage.ts     # D1 operations
├── db/
│   └── schema.sql     # D1 database schema
└── types/
    └── env.ts         # Worker bindings

frontend/
├── src/
│   ├── App.tsx        # Main app component
│   ├── types.ts       # Shared TypeScript types
│   └── components/    # React components
└── index.html
```

## LLM Providers

Currently supported:
- OpenAI (GPT-4o)
- Anthropic (Claude Sonnet)
- Google (Gemini 2.0 Flash)
- Cloudflare Workers AI (Llama 3.1 8B)

Provider adapters are in `src/services/llm/`. The `collector.ts` also has inline implementations for the collection endpoint.

## Authentication

Admin endpoints are protected by Cloudflare Access. In development, auth is bypassed when `CF_ACCESS_TEAM_DOMAIN` is not set.

**Required secrets for production:**
```bash
wrangler secret put CF_ACCESS_TEAM_DOMAIN  # e.g., https://yourteam.cloudflareaccess.com
wrangler secret put CF_ACCESS_AUD          # Application AUD tag from Access dashboard
```

## Admin API

Protected endpoints (require Cloudflare Access authentication):
- `POST /api/admin/collect` - Trigger collection for a single topic/model/template
- `POST /api/admin/collect-batch` - Batch collection for multiple models

# LLM Observatory

Web application that collects and compares responses from different LLMs on various topics. Built on Cloudflare Workers with React frontend.

## Tech Stack

- **Backend**: Cloudflare Workers + Hono API framework
- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Database**: D1 (config) + BigQuery (response data)
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Auth**: Cloudflare Access (admin routes)

## Project Structure

```
src/
├── index.ts              # Worker entry point (Hono app)
├── routes/api.ts         # API routes (public + admin)
├── middleware/access.ts  # Cloudflare Access JWT validation
├── services/
│   ├── llm/              # LLM provider adapters (openai, anthropic, google, cloudflare)
│   ├── bigquery.ts       # BigQuery operations
│   ├── collector.ts      # Collection orchestration
│   └── storage.ts        # D1 CRUD operations
├── db/schema.sql         # D1 schema
└── types/env.ts          # Worker bindings

frontend/
├── src/
│   ├── App.tsx           # Main app with routing
│   ├── pages/            # Landing, PromptLab
│   ├── components/       # TopicList, ResponseView, etc.
│   └── types.ts          # Shared TypeScript types
└── index.html
```

## Commands

```bash
make setup      # First-time setup (copies .dev.vars, npm install, init DB)
make dev        # Start dev server at http://localhost:8787
make test       # Run unit tests (vitest)
make test-e2e   # Run e2e tests (playwright)
make lint       # Run ESLint
make type-check # Run TypeScript type checking
make deploy     # Build and deploy to Cloudflare
```

**Note**: Tests require frontend build first. `make dev` handles this automatically. For tests alone, run `npm run build:frontend` first if dist/ doesn't exist.

## Git Workflow

**MANDATORY: Use git worktrees for feature work.**

```bash
git fetch origin
git worktree add ../llm-observatory-feature-name -b feature-name origin/main
cd ../llm-observatory-feature-name
cp ../llm-observatory/.dev.vars .dev.vars  # CRITICAL: Copy API keys immediately
make setup
```

## Environment Setup

Copy `.dev.vars.example` to `.dev.vars` and fill in:
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` - LLM provider keys
- `BQ_SERVICE_ACCOUNT_EMAIL`, `BQ_PRIVATE_KEY` - BigQuery credentials (base64-encoded key)
- `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` - Cloudflare Access (leave empty for local dev)

## Database Schema

**D1** (config storage):
- `topics` - topic definitions (id, name, description)
- `models` - LLM model config (id, provider, model_name, display_name)
- `prompt_templates` - prompt templates with `{topic}` placeholder

**BigQuery** (response storage):
- `raw_responses` - all LLM responses with metadata (model, topic, prompt_template, latency, tokens, etc.)

### Schema Changes

When modifying schemas, apply to both local and remote:

```bash
# D1
npx wrangler d1 execute llm-observatory-db --local --command "ALTER TABLE ..."
npx wrangler d1 execute llm-observatory-db --remote --command "ALTER TABLE ..."

# BigQuery
bq query --use_legacy_sql=false \
  "ALTER TABLE \`emilys-personal-projects.llm_observatory.raw_responses\` ADD COLUMN IF NOT EXISTS column_name TYPE"
```

## API

**Public**:
- `GET /api/topics` - List all topics
- `GET /api/topics-with-responses` - List topics that have responses
- `GET /api/topics/:id/responses` - Get responses for a topic
- `GET /api/models` - List models
- `GET /api/prompt-templates` - List prompt templates

**Admin** (protected by Cloudflare Access):
- `POST /api/admin/collect` - Trigger collection for one topic/model/template
- `POST /api/admin/collect-batch` - Batch collection for multiple models
- `POST /api/admin/prompt` - Freeform prompt to selected models

## LLM Providers

Providers in `src/services/llm/`:
- `openai.ts` - OpenAI (GPT-4o)
- `anthropic.ts` - Anthropic (Claude Sonnet)
- `google.ts` - Google (Gemini 2.0 Flash)
- `cloudflare.ts` - Cloudflare Workers AI (Llama 3.1 8B)

To add a new provider:
1. Create adapter implementing `LLMProvider` interface
2. Add case in `src/services/llm/index.ts` factory
3. Add model entry to D1 `models` table

## Known Issues

- Vitest config picks up e2e folder causing failures; e2e tests must be run via `npm run test:e2e`
- Some TypeScript strict mode errors in frontend pages (unknown type assertions)

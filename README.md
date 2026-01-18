# LLM Observatory

Compare what different LLMs say about prompts.

## Quick Start

```bash
make setup  # Copy .dev.vars, install deps, init DB
make dev    # Start dev server
```

## Setup

1. Copy `.dev.vars.example` to `.dev.vars`
2. Add API keys (OpenAI, Anthropic, Google, xAI, etc.)
3. Add BigQuery credentials (see `.dev.vars.example` for details)

## Commands

```bash
make dev      # Start dev server
make test     # Run tests
make lint     # Run linter
make deploy   # Deploy to production
```

## API

**Public:**
- `GET /api/models` - List configured models
- `GET /api/prompts` - Get prompt history (filterable by model, company, source)
- `GET /api/tags` - List tags
- `GET /api/observations` - List observations
- `GET /api/observations/:id` - Get observation with details
- `GET /api/observations/:id/responses` - Get responses for an observation

**Observation creation** (requires `Authorization: Bearer <ADMIN_API_KEY>`):
- `POST /api/observations` - Create observation and run all models
- `POST /api/observations/stream` - Create observation with streaming results (SSE)
- `PUT /api/observations/:id` - Update an existing observation

**Admin** (protected by Cloudflare Access):
- `GET /api/admin/test-models` - Smoke test all model APIs
- `POST /api/admin/sync-models` - Sync models from provider APIs
- `DELETE /api/admin/prompts?search=<term>` - Delete prompt history by search term
- `POST /api/admin/collect` - Trigger collection for a topic/model
- `POST /api/admin/prompt` - Send freeform prompt to models

## License

MIT

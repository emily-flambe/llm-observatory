# LLM Observatory

Compare what different LLMs say about topics.

## Quick Start

```bash
make setup  # Copy .dev.vars, install deps, init DB
make dev    # Start dev server
```

## Setup

1. Copy `.dev.vars.example` to `.dev.vars`
2. Add API keys (OpenAI, Anthropic, Google)
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
- `GET /api/topics` - List topics with responses
- `GET /api/topics/:id/responses` - Get responses for a topic
- `GET /api/prompts` - Get prompt history
- `GET /api/models` - List configured models

**Admin** (requires `Authorization: Bearer <ADMIN_API_KEY>`):
- `POST /api/admin/collect` - Trigger collection for a topic/model
- `POST /api/admin/prompt` - Send freeform prompt to models
- `GET /api/admin/test-models` - Smoke test all model APIs

## License

MIT

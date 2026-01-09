# LLM Observatory

Collects and displays what different LLMs say about various topics for transparency.

## Architecture

```
D1 (config)     BigQuery (data)
    │               │
    ├── topics      └── raw_responses (all LLM responses)
    └── models              ↓
                      dbt staging/marts
```

- **D1**: Topics and model config only
- **BigQuery**: All response data (for analytics)
- **dbt**: Transformations in etl-for-dumdums repo

## Quick Start

```bash
make setup  # First-time: copy .dev.vars, install deps, init DB
make dev    # Start dev server (auto-kills port conflicts)
```

## Providers

| Provider | Model | API Key |
|----------|-------|---------|
| OpenAI | gpt-4o | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | claude-sonnet-4 | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| Google | gemini-2.0-flash | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Cloudflare | llama-3.1-8b | Built-in (no key needed) |

## Setup

1. Copy `.dev.vars.example` to `.dev.vars`
2. Add LLM API keys
3. Add BigQuery credentials (see below)

### BigQuery Setup

```bash
# Create service account key (or use existing)
gcloud iam service-accounts keys create .secrets/gcp-sa-key.json \
  --iam-account=YOUR_SA@PROJECT.iam.gserviceaccount.com

# Extract email and base64-encode key for .dev.vars
BQ_EMAIL=$(jq -r '.client_email' .secrets/gcp-sa-key.json)
BQ_KEY=$(jq -r '.private_key' .secrets/gcp-sa-key.json | base64)

# Add to .dev.vars
echo "BQ_SERVICE_ACCOUNT_EMAIL=$BQ_EMAIL" >> .dev.vars
echo "BQ_PRIVATE_KEY=$BQ_KEY" >> .dev.vars
```

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start dev server |
| `make test` | Run unit tests |
| `make test-e2e` | Run e2e tests |
| `make lint` | Run linter |
| `make deploy` | Deploy to production |

## Deployment

```bash
# Set secrets
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GOOGLE_API_KEY
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put BQ_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put BQ_PRIVATE_KEY

# Init remote DB and deploy
make db-init-remote && make db-seed-remote && make deploy
```

## API

**Public:**
- `GET /api/topics` - List topics
- `GET /api/topics/:id/responses` - Get responses (from BigQuery)

**Admin** (requires `Authorization: Bearer <ADMIN_API_KEY>`):
- `POST /api/admin/collect` - Trigger collection

## License

MIT

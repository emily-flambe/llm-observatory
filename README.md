# LLM Observatory

Collects and displays what different LLMs say about various topics for transparency.

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

Add keys to `.dev.vars` after running `make setup`.

## Tech Stack

Cloudflare Workers, D1, Hono, React 19, Tailwind v4, Vitest, Playwright

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

# Init remote DB and deploy
make db-init-remote && make db-seed-remote && make deploy
```

## API

**Public:**
- `GET /api/topics` - List topics
- `GET /api/topics/:id/responses` - Get responses

**Admin** (requires `Authorization: Bearer <ADMIN_API_KEY>`):
- `POST /api/admin/collect` - Trigger collection

## License

MIT

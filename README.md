# LLM Observatory

A web application that collects and displays what different LLMs say about various topics. The goal is transparency: visitors can see how different AI models characterize subjects and compare responses across providers.

## Quick Start

```bash
# First-time setup
make setup

# Start development server
make dev
```

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Framework**: Hono
- **Frontend**: React 19, Vite, Tailwind CSS v4
- **Testing**: Vitest, Playwright

## Setup Checklist

Before running the project, you need to obtain API credentials. Here's your todo list:

### Required for MVP
- [ ] **OpenAI API Key** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  - Create account → API Keys → Create new secret key
  - Pricing: Pay-as-you-go, ~$5/1M input tokens for GPT-4o

- [ ] **Anthropic API Key** — [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
  - Create account → API Keys → Create Key
  - Pricing: Pay-as-you-go, ~$3/1M input tokens for Claude Sonnet

- [ ] **Google AI (Gemini)** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
  - Sign in with Google → Get API key
  - Free tier available, then pay-as-you-go
  - Using `gemini-2.0-flash` model

### Built-in (No API Key Required)
- **Cloudflare Workers AI** — Included with Cloudflare Workers
  - No separate API key needed, uses the AI binding
  - Currently using `@cf/meta/llama-3.1-8b-instruct-fast` (Llama 3.1 8B)
  - Free tier: 10,000 neurons/day, then $0.011 per 1,000 neurons
  - [Workers AI Models Catalog](https://developers.cloudflare.com/workers-ai/models/)

### Future Providers
- [ ] **xAI (Grok)** — [console.x.ai](https://console.x.ai/)
  - Create account → API Keys
  - Requires X Premium+ subscription or API access

### Other Providers to Consider
- [ ] **Mistral AI** — [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys)
  - European AI lab, competitive pricing

- [ ] **Cohere** — [dashboard.cohere.com/api-keys](https://dashboard.cohere.com/api-keys)
  - Good for enterprise, has free tier

- [ ] **Meta Llama (via Together.ai)** — [api.together.xyz](https://api.together.xyz/)
  - Access to Llama models via API

- [ ] **Perplexity** — [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
  - Search-augmented responses

### Infrastructure
- [ ] **Cloudflare Account** — [dash.cloudflare.com](https://dash.cloudflare.com/)
  - Free tier includes Workers, D1, Workers AI, and R2
  - Needed for deployment

---

## Development

### Prerequisites

- Node.js 20+
- Cloudflare account (for deployment)
- API keys (see checklist above)

### Setup

1. Copy environment variables:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Add your API keys to `.dev.vars`

3. Install dependencies and initialize database:
   ```bash
   make setup
   ```

4. Start development server:
   ```bash
   make dev
   ```

### Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start development server |
| `make test` | Run unit tests |
| `make test-e2e` | Run e2e tests |
| `make lint` | Run linter |
| `make deploy` | Deploy to production |

## Deployment

1. Create D1 database:
   ```bash
   npx wrangler d1 create llm-observatory-db
   ```

2. Update `wrangler.toml` with the database ID

3. Initialize remote database:
   ```bash
   make db-init-remote
   make db-seed-remote
   ```

4. Set secrets:
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put GOOGLE_API_KEY
   npx wrangler secret put ADMIN_API_KEY
   ```

5. Deploy:
   ```bash
   make deploy
   ```

## API

### Public Endpoints

- `GET /api/topics` - List all active topics
- `GET /api/topics/:id/responses` - Get responses for a topic

### Admin Endpoints (require `Authorization: Bearer <ADMIN_API_KEY>`)

- `POST /api/admin/collect` - Trigger collection for a topic/model

## License

MIT

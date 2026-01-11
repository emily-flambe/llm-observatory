# LLM Observatory

Cloudflare Workers app comparing LLM responses across providers.

## Commands

```bash
make setup      # First-time setup
make dev        # Start dev server at localhost:8787
make test       # Run unit tests
make lint       # Run ESLint
make deploy     # Deploy to Cloudflare
```

## Git Workflow

Use git worktrees for feature work:

```bash
git fetch origin
git worktree add ../llm-observatory-feature-x -b feature-x origin/main
cd ../llm-observatory-feature-x
cp ../llm-observatory/.dev.vars .dev.vars  # Copy API keys
make setup
```

## Database

- **D1**: Config (topics, models, prompt_templates)
- **BigQuery**: Response data

Apply schema changes to both local and remote:
```bash
npx wrangler d1 execute llm-observatory-db --local --command "..."
npx wrangler d1 execute llm-observatory-db --remote --command "..."
```

## Adding LLM Providers

1. Create adapter in `src/services/llm/` implementing `LLMProvider`
2. Add case in `src/services/llm/index.ts`
3. Add model to D1 `models` table
4. Add API key to `.dev.vars` and Cloudflare secrets

## Visual Verification

Use Playwright MCP to verify UI changes before committing.

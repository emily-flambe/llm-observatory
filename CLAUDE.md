# LLM Observatory

Cloudflare Workers app comparing LLM responses across providers.

## CRITICAL: Cloudflare Worker Rules

**NEVER create new workers.** There is exactly ONE worker: `llm-observatory`. Do not create preview workers, staging workers, or any other workers.

**NEVER delete the worker.** Deleting the worker removes all secrets which cannot be recovered without manual re-entry.

**NEVER use `wrangler delete`.** If you think you need to delete something, ask the user first.

## Secrets Management

Secrets are stored in `.dev.vars` (gitignored) and synced to Cloudflare using:

```bash
npx wrangler secret bulk .dev.vars   # Upload ALL secrets from .dev.vars
```

This is the preferred method - it reads the `.dev.vars` file and uploads all secrets at once, similar to Terraform managing AWS secrets.

Required secrets (defined in `.dev.vars`):
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`
- `ADMIN_API_KEY` - for authenticated API operations
- `BQ_SERVICE_ACCOUNT_EMAIL`, `BQ_PRIVATE_KEY` - for BigQuery access

## Commands

```bash
make setup      # First-time setup
make dev        # Start dev server at localhost:8787
make test       # Run unit tests
make lint       # Run ESLint
make deploy     # Deploy to Cloudflare
```

## Git Workflow

**Main branch is protected.** All changes require a pull request - you cannot push directly to main. Create PRs immediately after your first commit, not as an afterthought.

**ALWAYS use git worktrees for ALL work.** Never work directly on the main repository directory.

```bash
# 1. Create worktree and branch
git fetch origin
git worktree add ../llm-observatory-feature-x -b feature-x origin/main
cd ../llm-observatory-feature-x
make setup
cp ../llm-observatory/.dev.vars .dev.vars  # CRITICAL: Copy AFTER make setup (it overwrites)

# 2. After first commit, immediately push and create PR
git push -u origin feature-x
gh pr create --fill  # Creates draft PR for review
```

**CRITICAL: Copy `.dev.vars` AFTER `make setup`.** The setup script copies `.dev.vars.example` which will overwrite your copy.

**After completing any task:** Commit changes and create/update PR. Don't wait for the user to ask.

## Database

- **D1**: Config (observations, models, tags, observation_runs)
- **BigQuery**: Response data (prompt history)

Apply D1 schema changes to both local and remote:
```bash
npx wrangler d1 execute llm-observatory-db --local --command "..."
npx wrangler d1 execute llm-observatory-db --remote --command "..."
```

**BigQuery:** The service account has full BigQuery permissions including delete. Use `DELETE /api/admin/prompts?search=<term>` to delete prompt history.

## Adding LLM Providers

1. Create adapter in `src/services/llm/` implementing `LLMProvider`
2. Add case in `src/services/llm/index.ts`
3. Add model to D1 `models` table
4. Add API key to `.dev.vars` and Cloudflare secrets

## Visual Verification

Use Playwright MCP to verify UI changes before committing.

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

- **D1**: Config (topics, models, prompt_templates)
- **BigQuery**: Response data

Apply D1 schema changes to both local and remote:
```bash
npx wrangler d1 execute llm-observatory-db --local --command "..."
npx wrangler d1 execute llm-observatory-db --remote --command "..."
```

For BigQuery queries/updates, use the `bq` CLI directly - don't ask the user to run them.

## Adding LLM Providers

1. Create adapter in `src/services/llm/` implementing `LLMProvider`
2. Add case in `src/services/llm/index.ts`
3. Add model to D1 `models` table
4. Add API key to `.dev.vars` and Cloudflare secrets

## Visual Verification

Use Playwright MCP to verify UI changes before committing.

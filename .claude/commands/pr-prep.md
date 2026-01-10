---
description: Run all checks and prepare for PR
allowed-tools:
  - Bash
  - Read
  - Glob
---

# PR Preparation

Run all checks and prepare changes for pull request.

## Steps

1. Build the frontend: `npm run build:frontend`
2. Run linting: `make lint`
3. Run type checking: `make type-check`
4. Run unit tests: `make test`
5. Show git status and diff: `git status && git diff --stat`
6. Generate a commit message summarizing all changes
7. Stage all changes: `git add -A`
8. Report results and suggest next steps (commit, push, create PR)

---
description: Pull and fix a GitHub issue by number
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - WebFetch
---

# Fix GitHub Issue

Fix the GitHub issue: $ARGUMENTS

## Steps

1. Fetch the issue details from GitHub using `gh issue view $ARGUMENTS`
2. Understand the problem described in the issue
3. Search the codebase to find relevant files
4. Implement the fix following project conventions
5. Run tests to verify the fix: `make test && make lint`
6. Create a commit with message referencing the issue: "Fix #$ARGUMENTS: <description>"

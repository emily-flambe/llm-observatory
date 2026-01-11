---
description: Run tests for a specific file
allowed-tools:
  - Bash
  - Read
---

# Test File

Run tests for: $ARGUMENTS

## Steps

1. Determine if this is a source file or test file
2. If source file, find corresponding test file in `tests/` or `__tests__/`
3. Run the specific test: `npx vitest run $TEST_FILE`
4. Report test results
5. If tests fail, analyze the failure and suggest fixes

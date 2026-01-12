# DeepSeek API Provider Design

## Summary

Add DeepSeek as a direct API provider to get proper reasoning content separation and token counts.

## Data Model Changes

### LLMResponse type (`src/services/llm/types.ts`)
Add optional field:
```typescript
reasoningContent?: string;
```

### BigQueryRow (`src/services/bigquery.ts`)
Add field:
```typescript
reasoning_content: string | null;
```

### BigQuery schema
```sql
ALTER TABLE responses ADD COLUMN reasoning_content STRING;
```

## DeepSeek Provider

**File:** `src/services/llm/deepseek.ts`

- Base URL: `https://api.deepseek.com/v1/chat/completions`
- Auth: Bearer token
- Models: `deepseek-reasoner` (thinking), `deepseek-chat` (non-thinking)
- Response: Extract `reasoning_content` separately from `content`

## Files to Modify

1. `src/services/llm/types.ts` - Add `reasoningContent` to LLMResponse
2. `src/services/llm/deepseek.ts` - New provider (create)
3. `src/services/llm/index.ts` - Add DeepSeek case
4. `src/types/env.ts` - Add DEEPSEEK_API_KEY
5. `.dev.vars.example` - Add DEEPSEEK_API_KEY placeholder
6. `src/services/bigquery.ts` - Add reasoning_content to BigQueryRow and insertRow
7. `src/services/collector.ts` - Add callDeepSeek function, pass reasoning through
8. `src/services/llm/__tests__/providers.test.ts` - Add DeepSeek tests

## D1 Models to Add

```sql
INSERT INTO models (id, model_name, provider, is_active) VALUES
  ('deepseek-reasoner', 'deepseek-reasoner', 'deepseek', 1),
  ('deepseek-chat', 'deepseek-chat', 'deepseek', 1);
```

## Test Coverage

- DeepSeek provider: request format, response parsing, reasoning extraction, error handling
- Existing providers: ensure reasoningContent undefined doesn't break anything

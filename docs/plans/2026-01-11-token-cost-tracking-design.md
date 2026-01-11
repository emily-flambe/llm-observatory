# Token Usage and Cost Tracking Design

## Summary

Track token usage and estimated costs for all LLM queries, storing cost at collection time for historical accuracy.

## Decisions Made

1. **Estimate tokens for Cloudflare** - Use character-based heuristic (~4 chars/token) since Cloudflare AI doesn't return token counts
2. **Store cost at collection time** - Add `input_cost` and `output_cost` to BigQuery rows, calculated using pricing current at collection
3. **Store pricing in D1 models table** - Add `input_price_per_m` and `output_price_per_m` columns

## Data Model Changes

### D1: models table

```sql
ALTER TABLE models ADD COLUMN input_price_per_m REAL;  -- $/million input tokens
ALTER TABLE models ADD COLUMN output_price_per_m REAL; -- $/million output tokens
```

### BigQuery: responses table

Add columns:
- `input_cost FLOAT64` - Cost in USD for input tokens
- `output_cost FLOAT64` - Cost in USD for output tokens

## Token Estimation (Cloudflare)

When provider returns 0/null tokens, estimate using:
- Input: `Math.ceil(prompt.length / 4)`
- Output: `Math.ceil(response.length / 4)`

Mark estimated tokens with a flag or negative value? No - keep it simple. The estimation is close enough for cost tracking purposes.

## Cost Calculation

```typescript
const inputCost = (inputTokens / 1_000_000) * inputPricePerM;
const outputCost = (outputTokens / 1_000_000) * outputPricePerM;
```

## Pricing Data (Initial Values)

| Model | Input $/M | Output $/M |
|-------|-----------|------------|
| GPT-4o | $2.50 | $10.00 |
| Claude Sonnet 4.5 | $3.00 | $15.00 |
| Gemini 2.0 Flash | $0.10 | $0.40 |
| Llama 3.1 8B (CF) | $0.03 | $0.20 |
| Gemma 3 12B (CF) | $0.10 | $0.50 |
| Llama 4 Scout 17B (CF) | $0.15 | $0.80 |
| Mistral Small 24B (CF) | $0.20 | $1.00 |
| QwQ 32B (CF) | $0.66 | $1.00 |
| DeepSeek R1 32B (CF) | $0.50 | $4.88 |
| Llama 3.3 70B (CF) | $0.29 | $2.25 |

## Implementation Steps

1. Add pricing columns to D1 models table (local + remote)
2. Populate pricing data for existing models
3. Add cost columns to BigQuery schema
4. Update LLMResponse type to include estimated flag
5. Add token estimation in Cloudflare provider
6. Update collector to calculate and store costs
7. Update UI to display costs (future - separate from this PR)

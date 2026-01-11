# Use Prompt Feature Design

## Summary

Add a "Use Prompt" link in the prompt history view that navigates to Prompt Lab with the prompt text and model selection pre-filled.

## URL Structure

Navigate to:
```
/prompt-lab?prompt=<urlEncoded>&models=<id1,id2,id3>
```

Example:
```
/prompt-lab?prompt=What%20is%20the%20capital%20of%20France%3F&models=gpt-4o,claude-sonnet-4-5,gemini-2-flash
```

## UI Changes

### PromptCard Layout

```
┌─────────────────────────────────────────────────────┐
│ "What is the capital of France?"          [Expand]  │
│ Jan 10, 2026 · 5 models                [Use Prompt] │
└─────────────────────────────────────────────────────┘
```

- Row 1: Prompt text left, [Expand] right
- Row 2: Metadata left, [Use Prompt] right
- Styled as a text link

## PromptLab Changes

Read URL parameters on mount and pre-fill:

```typescript
const [searchParams] = useSearchParams();

useEffect(() => {
  const promptParam = searchParams.get('prompt');
  const modelsParam = searchParams.get('models');

  if (promptParam) {
    setPrompt(decodeURIComponent(promptParam));
  }

  if (modelsParam) {
    const modelIds = modelsParam.split(',');
    setSelectedModels(modelIds);
  }
}, []);
```

## Edge Cases

- If a model ID from history no longer exists, it is silently ignored (won't appear selected)
- Long prompts may approach URL length limits but typical prompts are short enough

## Implementation Steps

1. Update PromptCard layout to two-row structure with right-aligned controls
2. Add "Use Prompt" link that builds URL from prompt text and response model IDs
3. Update PromptLab to read `prompt` and `models` query params on mount
4. Pre-fill prompt textarea and model selection from params

import { useState, useEffect } from 'react';
import type { Model } from '../types';
import { renderMarkdown } from '../utils/markdown';
import ModelSelector from '../components/ModelSelector';

type ModelStatus = 'idle' | 'pending' | 'loading' | 'success' | 'error';

interface ModelResult {
  modelId: string;
  displayName: string;
  status: ModelStatus;
  response?: string;
  error?: string;
  latencyMs?: number;
  startTime?: number;
}

export default function PromptLab() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [wordLimitEnabled, setWordLimitEnabled] = useState(true);
  const [wordLimit, setWordLimit] = useState(50);
  const [results, setResults] = useState<Map<string, ModelResult>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json() as Promise<{ models: Model[] }>)
      .then((data) => {
        const modelList = data.models || [];
        setModels(modelList);

        // Auto-select the most recent model per company
        const byCompany = new Map<string, Model>();
        for (const model of modelList) {
          const existing = byCompany.get(model.company);
          if (!existing) {
            byCompany.set(model.company, model);
          } else {
            // Compare release dates - pick the newest
            const existingDate = existing.released_at || '';
            const modelDate = model.released_at || '';
            if (modelDate > existingDate) {
              byCompany.set(model.company, model);
            }
          }
        }
        setSelectedModels(new Set(Array.from(byCompany.values()).map(m => m.id)));
      });
  }, []);

  const toggleModel = (id: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedModels(new Set(models.map((m) => m.id)));
  const clearAll = () => setSelectedModels(new Set());

  const handleSubmit = async () => {
    if (!prompt.trim() || selectedModels.size === 0 || !apiKey.trim()) return;

    setIsSubmitting(true);

    // Generate a single promptId for all requests - groups responses together
    const promptId = crypto.randomUUID();

    // Initialize all selected models with pending status
    const initialResults = new Map<string, ModelResult>();
    const selectedModelsList = models.filter((m) => selectedModels.has(m.id));

    for (const model of selectedModelsList) {
      initialResults.set(model.id, {
        modelId: model.id,
        displayName: model.display_name,
        status: 'pending',
      });
    }
    setResults(initialResults);

    // Fire off all requests in parallel
    const promises = selectedModelsList.map(async (model) => {
      // Update to loading status
      setResults((prev) => {
        const next = new Map(prev);
        next.set(model.id, {
          ...next.get(model.id)!,
          status: 'loading',
          startTime: Date.now(),
        });
        return next;
      });

      try {
        let finalPrompt = prompt.trim();
        if (wordLimitEnabled) {
          finalPrompt += `\n\nLimit your response to ${wordLimit} words.`;
        }

        const response = await fetch('/api/admin/prompt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            prompt: finalPrompt,
            modelIds: [model.id],
            promptId, // Share same ID across all requests for grouping
          }),
        });

        if (!response.ok) {
          const err = (await response.json()) as { error?: string };
          throw new Error(err.error || 'Request failed');
        }

        const data = (await response.json()) as {
          results?: Array<{ success: boolean; response?: string; latencyMs?: number; error?: string }>;
        };
        const result = data.results?.[0];

        setResults((prev) => {
          const next = new Map(prev);
          const existing = next.get(model.id)!;
          if (result?.success) {
            next.set(model.id, {
              ...existing,
              status: 'success',
              response: result.response,
              latencyMs: result.latencyMs,
            });
          } else {
            next.set(model.id, {
              ...existing,
              status: 'error',
              error: result?.error || 'Unknown error',
            });
          }
          return next;
        });
      } catch (err) {
        setResults((prev) => {
          const next = new Map(prev);
          next.set(model.id, {
            ...next.get(model.id)!,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
          return next;
        });
      }
    });

    await Promise.all(promises);
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Prompt Lab</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-light mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter admin API key"
              className="w-full px-3 py-2 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-light mb-2">Your Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="wordLimitEnabled"
              checked={wordLimitEnabled}
              onChange={(e) => setWordLimitEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="wordLimitEnabled" className="text-sm text-ink-light">
              Limit response to
            </label>
            <input
              type="number"
              value={wordLimit}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) setWordLimit(val);
              }}
              onKeyDown={(e) => {
                if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
                  e.preventDefault();
                }
              }}
              min={1}
              disabled={!wordLimitEnabled}
              className="w-20 px-2 py-1 rounded text-sm text-center disabled:opacity-50"
            />
            <span className="text-sm text-ink-light">words</span>
            <span className="relative group">
              <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-ink-muted text-ink-muted text-xs cursor-help">
                ?
              </span>
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white bg-ink rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Appends "Limit your response to N words." to your prompt
              </span>
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-light mb-2">Models</label>
            <ModelSelector
              models={models}
              selectedModels={selectedModels}
              onToggleModel={toggleModel}
              onSelectAll={selectAll}
              onClearAll={clearAll}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !prompt.trim() || selectedModels.size === 0 || !apiKey.trim()}
            className="btn-primary px-6 py-2 rounded-lg disabled:opacity-50"
          >
            {isSubmitting ? 'Sending...' : 'Send Prompt'}
          </button>
        </div>
      </div>

      {/* Response Cards - one per model */}
      {results.size > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-ink">Responses</h3>
          <div className="grid gap-4">
            {Array.from(results.values()).map((result) => (
              <ModelResponseCard key={result.modelId} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelResponseCard({ result }: { result: ModelResult }) {
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time while loading
  useEffect(() => {
    if (result.status !== 'loading' || !result.startTime) {
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - result.startTime!);
    }, 100);

    return () => clearInterval(interval);
  }, [result.status, result.startTime]);

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium text-ink">{result.displayName}</span>
        <StatusBadge status={result.status} latencyMs={result.latencyMs} elapsed={elapsed} />
      </div>

      {result.status === 'pending' && (
        <div className="text-ink-muted text-sm flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-ink-muted rounded-full"></span>
          Waiting...
        </div>
      )}

      {result.status === 'loading' && (
        <div className="text-ink-muted text-sm flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-amber rounded-full animate-pulse"></span>
          Querying model...
        </div>
      )}

      {result.status === 'error' && (
        <div className="text-error text-sm">{result.error}</div>
      )}

      {result.status === 'success' && result.response && (
        <div
          className="text-ink-light text-sm markdown-content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(result.response) }}
        />
      )}
    </div>
  );
}

function StatusBadge({
  status,
  latencyMs,
  elapsed,
}: {
  status: ModelStatus;
  latencyMs?: number;
  elapsed: number;
}) {
  switch (status) {
    case 'pending':
      return <span className="text-xs text-ink-muted">Pending</span>;
    case 'loading':
      return (
        <span className="text-xs text-amber">
          {(elapsed / 1000).toFixed(1)}s
        </span>
      );
    case 'success':
      return (
        <span className="text-xs text-success">
          {latencyMs ? `${(latencyMs / 1000).toFixed(1)}s` : 'Done'}
        </span>
      );
    case 'error':
      return <span className="text-xs text-error">Failed</span>;
    default:
      return null;
  }
}

import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Model, Tag } from '../types';
import ModelSelector from './ModelSelector';
import { renderMarkdown } from '../utils/markdown';

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

interface SwarmFormProps {
  editId?: string;
}

interface SwarmDetail {
  id: string;
  prompt_text: string;
  display_name: string | null;
  disabled: number;
  created_at: string;
  last_run_at: string | null;
  current_version: number;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  cron_expression: string | null;
  is_paused: number;
  model_count: number;
  models: Array<{ id: string }>;
  tags: Array<{ id: string; name: string; color: string | null }>;
}

export default function SwarmForm({ editId }: SwarmFormProps) {
  const [searchParams] = useSearchParams();
  const [models, setModels] = useState<Model[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSwarm, setLoadingSwarm] = useState(false);

  // Get initial values from query params (for duplication/pre-fill)
  const initialPrompt = searchParams.get('prompt') || '';
  const initialModels = searchParams.get('models')?.split(',').filter(Boolean) || [];
  const initialName = searchParams.get('name') || '';
  const initialSchedule = searchParams.get('schedule') as 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  const initialCron = searchParams.get('cron') || '';

  // Form state
  const [prompt, setPrompt] = useState(initialPrompt);
  const [displayName, setDisplayName] = useState(initialName);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set(initialModels));
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [scheduleType, setScheduleType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>(initialSchedule || 'none');
  const [cronExpression, setCronExpression] = useState(initialCron || '0 6 * * *');
  const [wordLimit, setWordLimit] = useState('50');
  const [useWordLimit, setUseWordLimit] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<Map<string, ModelResult>>(new Map());
  const [createdSwarmId, setCreatedSwarmId] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // New tag creation
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [creatingTag, setCreatingTag] = useState(false);

  const isEditing = !!editId;

  // Validate word limit: must be integer between 1 and 500
  const wordLimitValue = wordLimit ? parseInt(wordLimit, 10) : NaN;
  const wordLimitValid = !useWordLimit || (!isNaN(wordLimitValue) && wordLimitValue >= 1 && wordLimitValue <= 500);
  const wordLimitError = useWordLimit && !wordLimitValid ? 'Word limit must be between 1 and 500' : null;

  // Load models and tags
  useEffect(() => {
    Promise.all([
      fetch('/api/models').then((r) => r.json() as Promise<{ models: Model[] }>),
      fetch('/api/tags').then((r) => r.json() as Promise<{ tags: Tag[] }>),
    ])
      .then(([modelsData, tagsData]) => {
        const modelList = modelsData.models || [];
        setModels(modelList);
        setTags(tagsData.tags || []);

        // Auto-select a preferred model per company (only for new swarms)
        if (!editId) {
          const byCompany = new Map<string, Model>();
          for (const model of modelList) {
            const existing = byCompany.get(model.company);
            if (!existing) {
              byCompany.set(model.company, model);
            } else {
              // For Anthropic, prefer the most recent Haiku model
              if (model.company === 'Anthropic') {
                const isHaiku = model.model_name.toLowerCase().includes('haiku');
                const existingIsHaiku = existing.model_name.toLowerCase().includes('haiku');
                if (isHaiku && !existingIsHaiku) {
                  byCompany.set(model.company, model);
                } else if (isHaiku && existingIsHaiku) {
                  const existingDate = existing.released_at || '';
                  const modelDate = model.released_at || '';
                  if (modelDate > existingDate) {
                    byCompany.set(model.company, model);
                  }
                }
              } else if (model.company === 'Google') {
                // For Google, prefer the most recent Flash model
                const isValidFlash = (name: string) => {
                  const lower = name.toLowerCase();
                  if (!lower.includes('flash')) return false;
                  if (lower.includes('pro')) return false;
                  if (lower.includes('preview')) return false;
                  if (lower.includes('latest')) return false;
                  return true;
                };
                const modelIsValidFlash = isValidFlash(model.model_name);
                const existingIsValidFlash = isValidFlash(existing.model_name);
                if (modelIsValidFlash && !existingIsValidFlash) {
                  byCompany.set(model.company, model);
                } else if (modelIsValidFlash && existingIsValidFlash) {
                  const existingDate = existing.released_at || '';
                  const modelDate = model.released_at || '';
                  if (modelDate > existingDate) {
                    byCompany.set(model.company, model);
                  }
                }
              } else if (model.company === 'xAI') {
                // For xAI, prefer non-reasoning models
                const isReasoning = (name: string) => {
                  const lower = name.toLowerCase();
                  if (lower.includes('-mini')) return true;
                  if (lower.includes('non-reasoning')) return false;
                  if (lower.includes('reasoning')) return true;
                  return false;
                };
                const modelIsReasoning = isReasoning(model.model_name);
                const existingIsReasoning = isReasoning(existing.model_name);
                if (!modelIsReasoning && existingIsReasoning) {
                  byCompany.set(model.company, model);
                } else if (modelIsReasoning === existingIsReasoning) {
                  const existingDate = existing.released_at || '';
                  const modelDate = model.released_at || '';
                  if (modelDate > existingDate) {
                    byCompany.set(model.company, model);
                  }
                }
              } else {
                // For other companies, pick the newest release
                const existingDate = existing.released_at || '';
                const modelDate = model.released_at || '';
                if (modelDate > existingDate) {
                  byCompany.set(model.company, model);
                }
              }
            }
          }
          setSelectedModels(new Set(Array.from(byCompany.values()).map((m) => m.id)));
        }

        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      });
  }, [editId]);

  // Load swarm data when editing
  useEffect(() => {
    if (!editId || loading) return;

    setLoadingSwarm(true);
    fetch(`/api/swarms/${editId}`)
      .then((r) => r.json() as Promise<{ swarm?: SwarmDetail; error?: string }>)
      .then((data) => {
        if (data.error || !data.swarm) {
          setError(data.error || 'Swarm not found');
          setLoadingSwarm(false);
          return;
        }

        const swarm = data.swarm;
        setPrompt(swarm.prompt_text);
        setDisplayName(swarm.display_name || '');
        setSelectedModels(new Set(swarm.models.map((m) => m.id)));
        setSelectedTags(new Set(swarm.tags.map((t) => t.id)));

        if (swarm.schedule_type) {
          setScheduleType(swarm.schedule_type);
          if (swarm.cron_expression) {
            setCronExpression(swarm.cron_expression);
          }
        } else {
          setScheduleType('none');
        }

        setLoadingSwarm(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load swarm');
        setLoadingSwarm(false);
      });
  }, [editId, loading]);

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

  const selectAllModels = () => setSelectedModels(new Set(models.map((m) => m.id)));
  const clearAllModels = () => setSelectedModels(new Set());

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    setCreatingTag(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });

      const data = (await res.json()) as { tag?: Tag; error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create tag');
      }

      if (!data.tag) {
        throw new Error('Invalid response from server');
      }

      setTags((prev) => [...prev, data.tag!]);
      setSelectedTags((prev) => new Set([...prev, data.tag!.id]));
      setNewTagName('');
      setShowNewTagInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setCreatingTag(false);
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || selectedModels.size === 0) return;

    setIsSubmitting(true);
    setError(null);
    setApiKeyError(null);
    setEditSuccess(false);

    // Convert schedule type to cron expression
    let finalCron: string | null = null;
    if (scheduleType !== 'none') {
      if (scheduleType === 'daily') finalCron = '0 6 * * *';
      else if (scheduleType === 'weekly') finalCron = '0 6 * * 1';
      else if (scheduleType === 'monthly') finalCron = '0 6 1 * *';
      else if (scheduleType === 'custom') finalCron = cronExpression;
    }

    try {
      if (isEditing && editId) {
        // Update existing swarm - no results display needed
        const res = await fetch(`/api/swarms/${editId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            display_name: displayName || null,
            model_ids: Array.from(selectedModels),
            tag_ids: Array.from(selectedTags),
            schedule_type: scheduleType === 'none' ? null : scheduleType,
            cron_expression: finalCron,
          }),
        });

        // Handle auth errors specifically
        if (res.status === 401 || res.status === 500) {
          const data = (await res.json()) as { error?: string };
          const errorMsg = data.error || (res.status === 401 ? 'Invalid API key' : 'Server error');
          if (res.status === 401 || errorMsg.toLowerCase().includes('api key')) {
            setApiKeyError(errorMsg);
            setIsSubmitting(false);
            return;
          }
          throw new Error(errorMsg);
        }

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || 'Failed to update swarm');
        }

        setEditSuccess(true);
        setCreatedSwarmId(editId);
      } else {
        // Create mode - clear previous results and swarm ID
        setResults(new Map());
        setCreatedSwarmId(null);

        const selectedModelsList = models.filter((m) => selectedModels.has(m.id));

        // Initialize all models with loading state
        const initialResults = new Map<string, ModelResult>();
        for (const model of selectedModelsList) {
          initialResults.set(model.id, {
            modelId: model.id,
            displayName: model.display_name,
            status: 'loading',
            startTime: Date.now(),
          });
        }
        setResults(initialResults);

        // Use streaming endpoint for progressive results
        const res = await fetch('/api/swarms/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            prompt_text: prompt.trim(),
            display_name: displayName || null,
            model_ids: Array.from(selectedModels),
            tag_ids: Array.from(selectedTags),
            word_limit: useWordLimit ? wordLimitValue : undefined,
            schedule_type: scheduleType === 'none' ? null : scheduleType,
            cron_expression: finalCron,
          }),
        });

        // Handle auth errors specifically - show near API key field, don't show results
        if (res.status === 401 || res.status === 500) {
          const data = (await res.json()) as { error?: string };
          const errorMsg = data.error || (res.status === 401 ? 'Invalid API key' : 'Server error');
          if (res.status === 401 || errorMsg.toLowerCase().includes('api key')) {
            setApiKeyError(errorMsg);
            setResults(new Map()); // Clear results on auth failure
            setIsSubmitting(false);
            return;
          }
          throw new Error(errorMsg);
        }

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setResults(new Map()); // Clear results on error
          throw new Error(data.error || 'Failed to create swarm');
        }

        // Process SSE stream for progressive results
        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as {
                  type: 'swarm' | 'result' | 'done';
                  swarm?: { id: string };
                  result?: { modelId: string; success: boolean; latencyMs?: number; error?: string; response?: string };
                };

                if (event.type === 'swarm' && event.swarm) {
                  setCreatedSwarmId(event.swarm.id);
                } else if (event.type === 'result' && event.result) {
                  const result = event.result;
                  const model = selectedModelsList.find((m) => m.id === result.modelId);
                  setResults((prev) => {
                    const next = new Map(prev);
                    next.set(result.modelId, {
                      modelId: result.modelId,
                      displayName: model?.display_name || result.modelId,
                      status: result.success ? 'success' : 'error',
                      latencyMs: result.latencyMs,
                      error: result.error,
                      response: result.response,
                    });
                    return next;
                  });
                }
                // type === 'done' - stream is ending
              } catch {
                // Ignore JSON parse errors
              }
            }
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Request failed';
      setError(errorMsg);
      // Don't show results on error - keep them cleared
    }

    setIsSubmitting(false);
  };

  if (loading || loadingSwarm) {
    return <div className="text-ink-muted">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-lg font-medium text-ink">
            {isEditing ? 'Edit Swarm' : 'New Swarm'}
          </h2>
          <p className="text-sm text-ink-muted mt-0.5">
            {isEditing ? 'Update swarm settings' : 'Create a new swarm and query multiple LLMs'}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-error text-sm">
              {error}
            </div>
          )}

          {editSuccess && createdSwarmId && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-success text-sm flex items-center justify-between">
              <span>Swarm updated successfully.</span>
              <Link
                to={`/swarm/${createdSwarmId}`}
                className="text-amber hover:text-amber-light font-medium"
              >
                View Swarm &rarr;
              </Link>
            </div>
          )}

          {/* Prompt textarea */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isEditing}
              placeholder="Enter your prompt..."
              rows={4}
              className={`w-full px-3 py-2.5 rounded-lg border border-border focus:border-amber focus:ring-1 focus:ring-amber resize-none ${
                isEditing ? 'bg-paper-dark text-ink-muted cursor-not-allowed' : ''
              }`}
            />
            {isEditing && (
              <p className="text-xs text-ink-muted">Prompts cannot be edited after creation</p>
            )}
          </div>

          {/* Word limit toggle - only in create mode */}
          {!isEditing && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useWordLimit"
                checked={useWordLimit}
                onChange={(e) => setUseWordLimit(e.target.checked)}
                className="rounded border-border text-amber focus:ring-amber"
              />
              <label htmlFor="useWordLimit" className="text-sm text-ink-light">
                Limit response to
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={wordLimit}
                onChange={(e) => {
                  // Only allow digits, allow empty string
                  const val = e.target.value.replace(/\D/g, '');
                  setWordLimit(val);
                }}
                disabled={!useWordLimit}
                className="w-20 px-2 py-1 rounded text-sm text-center border border-border disabled:opacity-50"
              />
              <span className="text-sm text-ink-light">words</span>
              <span className="relative group">
                <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-ink-muted text-ink-muted text-xs cursor-help">
                  ?
                </span>
                <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white bg-ink rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Appends "Limit your response to N words." to your prompt
                </span>
              </span>
              {wordLimitError && (
                <span className="text-xs text-error ml-2">{wordLimitError}</span>
              )}
            </div>
          )}

          {/* Display name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">
              Display Name <span className="text-ink-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="A friendly name for this swarm"
              className="w-full px-3 py-2.5 rounded-lg border border-border focus:border-amber focus:ring-1 focus:ring-amber"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">Tags</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    selectedTags.has(tag.id)
                      ? 'border-amber bg-amber text-white'
                      : 'border-border text-ink-muted hover:border-ink-muted'
                  }`}
                  style={
                    selectedTags.has(tag.id) && tag.color
                      ? { backgroundColor: tag.color, borderColor: tag.color }
                      : undefined
                  }
                >
                  {tag.name}
                </button>
              ))}
              {!showNewTagInput ? (
                <button
                  type="button"
                  onClick={() => setShowNewTagInput(true)}
                  className="px-3 py-1.5 text-sm rounded-full border border-dashed border-border text-ink-muted hover:border-ink-muted hover:text-ink-light"
                >
                  + New Tag
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Tag name"
                    className="w-32 px-2 py-1 text-sm rounded border border-border focus:border-amber focus:ring-1 focus:ring-amber"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateTag();
                      } else if (e.key === 'Escape') {
                        setShowNewTagInput(false);
                        setNewTagName('');
                      }
                    }}
                  />
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-8 h-8 rounded border border-border cursor-pointer"
                    title="Tag color"
                  />
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim() || creatingTag}
                    className="px-2 py-1 text-sm bg-amber text-white rounded hover:bg-amber-light disabled:opacity-50"
                  >
                    {creatingTag ? '...' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewTagInput(false);
                      setNewTagName('');
                    }}
                    className="px-2 py-1 text-sm text-ink-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Model selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">Models</label>
            <ModelSelector
              models={models}
              selectedModels={selectedModels}
              onToggleModel={toggleModel}
              onSelectAll={selectAllModels}
              onClearAll={clearAllModels}
            />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink flex items-center">
              Schedule
              <span className="relative group ml-1">
                <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-ink-muted text-ink-muted text-xs cursor-help">
                  ?
                </span>
                <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white bg-ink rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Set up recurring collection runs. All times are in UTC.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {(['none', 'daily', 'weekly', 'monthly', 'custom'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setScheduleType(type)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    scheduleType === type
                      ? 'bg-amber text-white border-amber'
                      : 'border-border text-ink-muted hover:border-ink-muted'
                  }`}
                >
                  {type === 'none' ? 'One-time' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
            {scheduleType === 'custom' && (
              <div className="mt-2">
                <label className="block text-xs text-ink-muted mb-1">Cron Expression (UTC)</label>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 6 * * *"
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono border border-border focus:border-amber focus:ring-1 focus:ring-amber"
                />
                <p className="text-xs text-ink-muted mt-1">
                  Format: minute hour day month weekday (e.g., "0 6 * * *" = daily at 6 AM UTC)
                </p>
              </div>
            )}
            {scheduleType !== 'none' && scheduleType !== 'custom' && (
              <p className="text-xs text-ink-muted">
                Runs {scheduleType} at 6:00 AM UTC
              </p>
            )}
          </div>
        </div>

        {/* Footer with API key and submit button */}
        <div className="px-6 py-4 bg-paper-dark border-t border-border space-y-3">
          {/* API key input - required for all swarm operations */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <label htmlFor="apiKey" className="text-sm font-medium text-ink whitespace-nowrap">
                API Key
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setApiKeyError(null); // Clear error when user types
                }}
                placeholder={isEditing ? 'Required to save changes' : 'Required to release swarm'}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border focus:ring-1 ${
                  apiKeyError
                    ? 'border-error focus:border-error focus:ring-error'
                    : 'border-border focus:border-amber focus:ring-amber'
                }`}
              />
            </div>
            {apiKeyError && (
              <p className="text-sm text-error ml-[4.5rem]">{apiKeyError}</p>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !prompt.trim() || selectedModels.size === 0 || (!isEditing && !wordLimitValid) || !apiKey}
            className="w-full btn-primary py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {isSubmitting
              ? isEditing
                ? 'Saving...'
                : 'Running...'
              : isEditing
                ? 'Save Changes'
                : `Release the Swarm (${selectedModels.size} model${selectedModels.size !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>

      {/* Results section - only shown in create mode */}
      {!isEditing && results.size > 0 && (
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-medium text-ink">Results</h3>
            {createdSwarmId && (
              <Link
                to={`/swarm/${createdSwarmId}`}
                className="text-sm text-amber hover:text-amber-light"
              >
                View Full Details &rarr;
              </Link>
            )}
          </div>
          <div className="p-6 space-y-4">
            {Array.from(results.values()).map((result) => (
              <ResultCard key={result.modelId} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: ModelResult }) {
  const [elapsed, setElapsed] = useState(0);
  const hasAutoExpandedRef = useRef(false);
  // Auto-expand when result completes successfully with a response
  const [expanded, setExpanded] = useState(result.status === 'success' && !!result.response);

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

  // Auto-expand when result transitions to success with response
  // This is intentional and safe - we only expand once when the result arrives
  useEffect(() => {
    if (result.status === 'success' && result.response && !hasAutoExpandedRef.current) {
      hasAutoExpandedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time auto-expand when result arrives
      setExpanded(true);
    }
  }, [result.status, result.response]);

  // Note: renderMarkdown sanitizes HTML by escaping < and > before processing
  // This follows the same pattern used in PromptLab.tsx and CollectionForm.tsx
  const renderedResponse = result.response ? renderMarkdown(result.response) : '';

  return (
    <div className="bg-paper-dark border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-border/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-ink">{result.displayName}</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={result.status} latencyMs={result.latencyMs} elapsed={elapsed} />
          <span className="text-ink-muted">{expanded ? '-' : '+'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-border">
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
            <div className="text-error text-sm">{result.error || 'An error occurred'}</div>
          )}

          {result.status === 'success' && renderedResponse && (
            // renderMarkdown sanitizes HTML by escaping < and > before processing
            <div
              className="text-ink-light text-sm markdown-content"
              dangerouslySetInnerHTML={{ __html: renderedResponse }}
            />
          )}

          {result.status === 'success' && !result.response && (
            <div className="text-ink-muted text-sm italic">Response received (content available in full view)</div>
          )}
        </div>
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

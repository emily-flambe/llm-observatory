import { useState, useEffect, useMemo } from 'react';
import type {
  Topic,
  PromptTemplate,
  Model,
  CollectionResult,
  TopicsResponse,
  PromptTemplatesResponse,
  ModelsResponse,
  CollectionDetail,
} from '../types';
import ModelSelector from './ModelSelector';

interface CollectionFormProps {
  onCollectionComplete?: () => void;
  editId?: string;
}

function HelpIcon({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="inline-flex items-center justify-center w-4 h-4 ml-1 text-xs text-ink-muted bg-paper-dark border border-border rounded-full cursor-help"
    >
      ?
    </span>
  );
}

export default function CollectionForm({ onCollectionComplete, editId }: CollectionFormProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(1);
  const [scheduleType, setScheduleType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>('none');
  const [cronExpression, setCronExpression] = useState('0 6 * * *');

  const [showCustomTopic, setShowCustomTopic] = useState(false);
  const [customTopic, setCustomTopic] = useState({ name: '', description: '' });
  const [showCustomTemplate, setShowCustomTemplate] = useState(false);
  const [customTemplate, setCustomTemplate] = useState({ id: '', name: '', template: '', description: '' });

  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<CollectionResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/topics').then(r => r.json() as Promise<TopicsResponse>),
      fetch('/api/prompt-templates').then(r => r.json() as Promise<PromptTemplatesResponse>),
      fetch('/api/models').then(r => r.json() as Promise<ModelsResponse>),
    ])
      .then(([topicsData, templatesData, modelsData]) => {
        setTopics(topicsData.topics);
        setTemplates(templatesData.templates);
        setModels(modelsData.models);

        // Only auto-select models for new collections (not when editing)
        if (!editId) {
          const modelList = modelsData.models;
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
          setSelectedModelIds(new Set(Array.from(byCompany.values()).map(m => m.id)));
        }

        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      });
  }, [editId]);

  // Load collection data when editing
  useEffect(() => {
    if (!editId || loading) return;

    setLoadingCollection(true);
    fetch(`/api/collections/${editId}`)
      .then(r => r.json() as Promise<{ collection?: CollectionDetail; error?: string }>)
      .then(data => {
        if (data.error || !data.collection) {
          setError(data.error || 'Collection not found');
          setLoadingCollection(false);
          return;
        }

        const collection = data.collection;
        setIsEditing(true);
        setSelectedTopicId(collection.topic_id);
        setSelectedTemplateId(collection.template_id);
        setSelectedModelIds(new Set(collection.models.map(m => m.id)));

        if (collection.schedule_type) {
          setScheduleType(collection.schedule_type);
          if (collection.cron_expression) {
            setCronExpression(collection.cron_expression);
          }
        } else {
          setScheduleType('none');
        }

        setLoadingCollection(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load collection');
        setLoadingCollection(false);
      });
  }, [editId, loading]);

  const previewPrompt = useMemo(() => {
    const topic = topics.find(t => t.id === selectedTopicId);
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!topic || !template) return null;
    return template.template.replace(/\{topic\}/gi, topic.name);
  }, [selectedTopicId, selectedTemplateId, topics, templates]);

  const toggleModel = (modelId: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const selectAllModels = () => setSelectedModelIds(new Set(models.map(m => m.id)));
  const clearAllModels = () => setSelectedModelIds(new Set());

  const handleCreateTopic = () => {
    if (!customTopic.name) return;
    // Instead of creating in D1, just add to local list
    // The topic will be created in BigQuery when first response is collected
    const id = generateSlug(customTopic.name);
    const newTopic: Topic = {
      id,
      name: customTopic.name,
      description: customTopic.description || 'New topic',
    };
    setTopics([...topics, newTopic]);
    setSelectedTopicId(id);
    setShowCustomTopic(false);
    setCustomTopic({ name: '', description: '' });
  };

  const handleCreateTemplate = async () => {
    if (!customTemplate.id || !customTemplate.name || !customTemplate.template) return;
    try {
      const res = await fetch('/api/prompt-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customTemplate),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to create template');
      }
      const { template } = await res.json() as { template: PromptTemplate };
      setTemplates([...templates, template]);
      setSelectedTemplateId(template.id);
      setShowCustomTemplate(false);
      setCustomTemplate({ id: '', name: '', template: '', description: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleSubmit = async () => {
    if (!apiKey || !selectedTopicId || !selectedTemplateId || selectedModelIds.size === 0) return;
    setSubmitting(true);
    setError(null);
    setResults(null);
    setLogs([]);

    const topic = topics.find(t => t.id === selectedTopicId);
    const template = templates.find(t => t.id === selectedTemplateId);
    const modelIds = Array.from(selectedModelIds);

    addLog(`${isEditing ? 'Updating' : 'Creating'} collection for "${topic?.name}" with ${modelIds.length} models`);
    addLog(`Template: ${template?.name}`);

    // Convert schedule type to cron expression
    let finalCron: string | null = null;
    if (scheduleType !== 'none') {
      if (scheduleType === 'daily') finalCron = '0 6 * * *';
      else if (scheduleType === 'weekly') finalCron = '0 6 * * 1';
      else if (scheduleType === 'monthly') finalCron = '0 6 1 * *';
      else if (scheduleType === 'custom') finalCron = cronExpression;
    }

    try {
      let collectionId: string;

      if (isEditing && editId) {
        // Update existing collection
        const updateRes = await fetch(`/api/collections/${editId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model_ids: modelIds,
            schedule_type: scheduleType === 'none' ? null : scheduleType,
            cron_expression: finalCron,
          }),
        });

        if (!updateRes.ok) {
          const err = await updateRes.json() as { error?: string };
          throw new Error(err.error || 'Failed to update collection');
        }

        collectionId = editId;
        addLog(`Collection updated (ID: ${collectionId.slice(0, 8)}...)`);
      } else {
        // Create new collection
        const createRes = await fetch('/api/collections', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            topic_id: selectedTopicId,
            template_id: selectedTemplateId,
            model_ids: modelIds,
            schedule_type: scheduleType === 'none' ? null : scheduleType,
            cron_expression: finalCron,
          }),
        });

        if (!createRes.ok) {
          const err = await createRes.json() as { error?: string };
          throw new Error(err.error || 'Failed to create collection');
        }

        const { collection } = await createRes.json() as { collection: { id: string } };
        collectionId = collection.id;
        addLog(`Collection created (ID: ${collectionId.slice(0, 8)}...)`);
      }

      if (scheduleType !== 'none') {
        addLog(`Scheduled: ${scheduleType === 'custom' ? cronExpression : scheduleType} (UTC)`);
      }

      // Step 2: Run the collection for each iteration
      const allResults: CollectionResult[] = [];
      for (let iteration = 1; iteration <= count; iteration++) {
        const iterLabel = count > 1 ? ` (iteration ${iteration}/${count})` : '';
        addLog(`Running collection${iterLabel}...`);

        const runRes = await fetch(`/api/admin/collections/${collectionId}/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!runRes.ok) {
          const err = await runRes.json() as { error?: string };
          addLog(`✗ Run failed: ${err.error || 'Unknown error'}`);
          continue;
        }

        const runData = await runRes.json() as {
          results: Array<{ modelId: string; success: boolean; latencyMs?: number; error?: string }>;
          successful: number;
          failed: number;
        };

        for (const result of runData.results) {
          const model = models.find(m => m.id === result.modelId);
          if (result.success) {
            addLog(`✓ ${model?.display_name || result.modelId}${iterLabel}: OK (${((result.latencyMs || 0) / 1000).toFixed(1)}s)`);
          } else {
            addLog(`✗ ${model?.display_name || result.modelId}${iterLabel}: ${result.error || 'Failed'}`);
          }
          allResults.push({
            modelId: result.modelId,
            iteration,
            success: result.success,
            responseId: '',
            latencyMs: result.latencyMs,
            error: result.error,
          });
        }
      }

      const successful = allResults.filter(r => r.success).length;
      addLog(`Collection complete: ${successful}/${allResults.length} successful`);

      setResults(allResults);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Request failed';
      addLog(`✗ Error: ${errorMsg}`);
      setError(errorMsg);
    }

    setSubmitting(false);
    onCollectionComplete?.();
  };

  if (loading || loadingCollection) {
    return <div className="text-ink-muted">Loading...</div>;
  }

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <h2 className="text-lg font-medium text-ink">
          {isEditing ? 'Edit Collection' : 'Collect Responses'}
        </h2>
        <p className="text-sm text-ink-muted mt-0.5">
          {isEditing ? 'Update collection settings and run' : 'Query multiple LLMs on a topic'}
        </p>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-error text-sm">
            {error}
          </div>
        )}

        {/* API Key */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Enter admin API key"
            className="w-full rounded-lg px-3 py-2.5 border border-border focus:border-amber focus:ring-1 focus:ring-amber"
          />
        </div>

        {/* Topic */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">Topic</label>
          {!showCustomTopic ? (
            <div className="flex gap-2">
              <select
                value={selectedTopicId}
                onChange={e => setSelectedTopicId(e.target.value)}
                disabled={isEditing}
                className={`flex-1 rounded-lg px-3 py-2.5 ${isEditing ? 'bg-paper-dark text-ink-muted cursor-not-allowed' : ''}`}
              >
                <option value="">Select a topic...</option>
                {topics.map(topic => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
              </select>
              {!isEditing && (
                <button
                  onClick={() => setShowCustomTopic(true)}
                  className="px-3 py-2 bg-paper-dark hover:bg-border rounded-lg text-sm text-ink-light"
                >
                  + New
                </button>
              )}
            </div>
          ) : (
            <div className="bg-paper-dark border border-border rounded-lg p-4 space-y-3">
              <input
                type="text"
                placeholder="Topic name (e.g., Climate Change)"
                value={customTopic.name}
                onChange={e => setCustomTopic({ ...customTopic, name: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={customTopic.description}
                onChange={e => setCustomTopic({ ...customTopic, description: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateTopic}
                  disabled={!customTopic.name}
                  className="btn-primary px-3 py-1.5 rounded text-sm disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowCustomTopic(false); setCustomTopic({ name: '', description: '' }); }}
                  className="px-3 py-1.5 bg-paper-dark hover:bg-border rounded text-sm text-ink-light"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Template */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">Prompt Template</label>
          {!showCustomTemplate ? (
            <div className="flex gap-2">
              <select
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                disabled={isEditing}
                className={`flex-1 rounded-lg px-3 py-2.5 ${isEditing ? 'bg-paper-dark text-ink-muted cursor-not-allowed' : ''}`}
              >
                <option value="">Select a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {!isEditing && (
                <button
                  onClick={() => setShowCustomTemplate(true)}
                  className="px-3 py-2 bg-paper-dark hover:bg-border rounded-lg text-sm text-ink-light"
                >
                  + New
                </button>
              )}
            </div>
          ) : (
            <div className="bg-paper-dark border border-border rounded-lg p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-ink-light flex items-center mb-1">
                  ID
                  <HelpIcon text="Unique slug for this template (e.g., 'opinion-brief'). Used internally to reference the template." />
                </label>
                <input
                  type="text"
                  placeholder="e.g., opinion-brief"
                  value={customTemplate.id}
                  onChange={e => setCustomTemplate({ ...customTemplate, id: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-light flex items-center mb-1">
                  Name
                  <HelpIcon text="Display name shown in the dropdown (e.g., 'Brief Opinion'). Can be different from ID." />
                </label>
                <input
                  type="text"
                  placeholder="e.g., Brief Opinion"
                  value={customTemplate.name}
                  onChange={e => setCustomTemplate({ ...customTemplate, name: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-light flex items-center mb-1">
                  Template
                  <HelpIcon text="The prompt text sent to LLMs. Use {topic} as a placeholder - it will be replaced with the selected topic's name (e.g., 'Climate Change')." />
                </label>
                <textarea
                  placeholder="e.g., What is your opinion on {topic}?"
                  value={customTemplate.template}
                  onChange={e => setCustomTemplate({ ...customTemplate, template: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <input
                type="text"
                placeholder="Description (optional)"
                value={customTemplate.description}
                onChange={e => setCustomTemplate({ ...customTemplate, description: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateTemplate}
                  disabled={!customTemplate.id || !customTemplate.name || !customTemplate.template}
                  className="btn-primary px-3 py-1.5 rounded text-sm disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowCustomTemplate(false); setCustomTemplate({ id: '', name: '', template: '', description: '' }); }}
                  className="px-3 py-1.5 bg-paper-dark hover:bg-border rounded text-sm text-ink-light"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {selectedTemplateId && (
            <p className="text-xs text-ink-muted">
              {templates.find(t => t.id === selectedTemplateId)?.description}
            </p>
          )}
        </div>

        {/* Models */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink">Models</label>
          <ModelSelector
            models={models}
            selectedModels={selectedModelIds}
            onToggleModel={toggleModel}
            onSelectAll={selectAllModels}
            onClearAll={clearAllModels}
          />
        </div>

        {/* Count */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-ink">Iterations</label>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={e => setCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
            className="w-20 rounded-lg px-3 py-2 text-center"
          />
          <span className="text-sm text-ink-muted">
            = {selectedModelIds.size * count} total requests
          </span>
        </div>

        {/* Schedule */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink flex items-center">
            Schedule (optional)
            <HelpIcon text="Set up recurring collection runs. All times are in UTC." />
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
                className="w-full rounded-lg px-3 py-2 text-sm font-mono"
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

        {/* Preview */}
        {previewPrompt && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">Preview</label>
            <div className="bg-paper-dark border border-border rounded-lg p-4 text-sm text-ink-light font-mono">
              {previewPrompt}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-paper-dark border-t border-border">
        <button
          onClick={handleSubmit}
          disabled={submitting || !apiKey || !selectedTopicId || !selectedTemplateId || selectedModelIds.size === 0}
          className="w-full btn-primary py-3 rounded-lg font-medium disabled:opacity-50"
        >
          {submitting
            ? (isEditing ? 'Updating...' : 'Collecting...')
            : (isEditing
                ? `Update & Run (${selectedModelIds.size} model${selectedModelIds.size !== 1 ? 's' : ''})`
                : `Collect from ${selectedModelIds.size} model${selectedModelIds.size !== 1 ? 's' : ''}`)}
        </button>
      </div>

      {/* Log Window */}
      {logs.length > 0 && (
        <div className="border-t border-border">
          <div className="px-6 py-4">
            <h3 className="text-sm font-medium text-ink mb-3">Log</h3>
            <div className="bg-ink text-paper-dark rounded-lg p-4 font-mono text-xs h-48 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className={log.includes('✗') ? 'text-red-400' : log.includes('✓') ? 'text-green-400' : ''}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="border-t border-border">
          <div className="px-6 py-4">
            <h3 className="text-sm font-medium text-ink mb-3">Results</h3>
            <div className="space-y-1">
              {results.map((result, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded bg-paper-dark">
                  <span className="text-sm text-ink">
                    {models.find(m => m.id === result.modelId)?.display_name}
                    {count > 1 && <span className="text-ink-muted ml-1">#{result.iteration}</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    {result.latencyMs && (
                      <span className="text-xs text-ink-muted">{(result.latencyMs / 1000).toFixed(1)}s</span>
                    )}
                    {result.success ? (
                      <span className="text-success font-medium">OK</span>
                    ) : (
                      <span className="text-error" title={result.error}>FAIL</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-muted mt-3">
              {results.filter(r => r.success).length} of {results.length} successful
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

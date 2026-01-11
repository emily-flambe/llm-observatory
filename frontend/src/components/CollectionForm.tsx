import { useState, useEffect, useMemo } from 'react';
import type {
  Topic,
  PromptTemplate,
  Model,
  CollectionResult,
  TopicsResponse,
  PromptTemplatesResponse,
  ModelsResponse,
} from '../types';
import ModelSelector from './ModelSelector';

interface CollectionFormProps {
  onCollectionComplete?: () => void;
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

export default function CollectionForm({ onCollectionComplete }: CollectionFormProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  const [apiKey, setApiKey] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(1);

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

        // Auto-select the most recent model per company
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

        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      });
  }, []);

  const previewPrompt = useMemo(() => {
    const topic = topics.find(t => t.id === selectedTopicId);
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!topic || !template) return null;
    return template.template.replace(/\{topic\}/gi, topic.name);
  }, [selectedTopicId, selectedTemplateId, topics, templates]);

  const toggleModel = (modelId: string) => {
    const newSet = new Set(selectedModelIds);
    if (newSet.has(modelId)) {
      newSet.delete(modelId);
    } else {
      newSet.add(modelId);
    }
    setSelectedModelIds(newSet);
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

    addLog(`Starting parallel collection for "${topic?.name}" with ${modelIds.length} models, ${count} iteration(s)`);
    addLog(`Template: ${template?.name}`);

    // Generate a prompt ID to group all responses from this submission
    const promptId = crypto.randomUUID();

    // Build all request tasks
    const tasks: Array<{ modelId: string; iteration: number; model: Model | undefined }> = [];
    for (const modelId of modelIds) {
      const model = models.find(m => m.id === modelId);
      for (let i = 0; i < count; i++) {
        tasks.push({ modelId, iteration: i + 1, model });
      }
    }

    addLog(`Querying ${tasks.length} endpoints in parallel...`);

    // Execute all requests in parallel
    const promises = tasks.map(async ({ modelId, iteration, model }) => {
      const iterLabel = count > 1 ? ` #${iteration}` : '';
      try {
        const res = await fetch('/api/admin/collect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            topicId: selectedTopicId,
            topicName: topic?.name,
            promptTemplateId: selectedTemplateId,
            modelId,
            promptId,
          }),
        });

        const data = await res.json() as { success: boolean; responseId: string; latencyMs?: number; error?: string };

        if (data.success) {
          addLog(`✓ ${model?.display_name}${iterLabel}: OK (${((data.latencyMs || 0) / 1000).toFixed(1)}s)`);
        } else {
          addLog(`✗ ${model?.display_name}${iterLabel}: ${data.error || 'Failed'}`);
        }

        return {
          modelId,
          iteration,
          success: data.success,
          responseId: data.responseId,
          latencyMs: data.latencyMs,
          error: data.error,
        } as CollectionResult;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Request failed';
        addLog(`✗ ${model?.display_name}${iterLabel}: ${errorMsg}`);
        return {
          modelId,
          iteration,
          success: false,
          responseId: '',
          error: errorMsg,
        } as CollectionResult;
      }
    });

    const allResults = await Promise.all(promises);

    const successful = allResults.filter(r => r.success).length;
    addLog(`Collection complete: ${successful}/${allResults.length} successful`);

    setResults(allResults);
    setSubmitting(false);
    onCollectionComplete?.();
  };

  if (loading) {
    return <div className="text-ink-muted">Loading...</div>;
  }

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <h2 className="text-lg font-medium text-ink">Collect Responses</h2>
        <p className="text-sm text-ink-muted mt-0.5">Query multiple LLMs on a topic</p>
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
                className="flex-1 rounded-lg px-3 py-2.5"
              >
                <option value="">Select a topic...</option>
                {topics.map(topic => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowCustomTopic(true)}
                className="px-3 py-2 bg-paper-dark hover:bg-border rounded-lg text-sm text-ink-light"
              >
                + New
              </button>
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
                className="flex-1 rounded-lg px-3 py-2.5"
              >
                <option value="">Select a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowCustomTemplate(true)}
                className="px-3 py-2 bg-paper-dark hover:bg-border rounded-lg text-sm text-ink-light"
              >
                + New
              </button>
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
          {submitting ? 'Collecting...' : `Collect from ${selectedModelIds.size} model${selectedModelIds.size !== 1 ? 's' : ''}`}
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

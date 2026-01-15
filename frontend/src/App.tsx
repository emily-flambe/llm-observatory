import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useSearchParams,
  useParams,
  Link,
} from 'react-router-dom';
import ObservationForm from './components/ObservationForm';
import Landing from './pages/Landing';
import { parseBigQueryTimestamp } from './utils/date';
import { renderMarkdown } from './utils/markdown';
import type { Topic, TopicsResponse, PromptLabQuery, PromptsResponse, Model, ModelsResponse, Collection } from './types';

function CollectNavTabs() {
  const pathname = window.location.pathname;
  const isManageActive = pathname === '/collect/manage' ||
    (pathname.startsWith('/collect/') && pathname !== '/collect' && !pathname.match(/^\/collect\/[^/]+$/));

  return (
    <div className="flex gap-1 mb-6 border-b border-border">
      <NavLink
        to="/collect"
        end
        className={({ isActive }) =>
          `px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            isActive ? 'border-amber text-amber' : 'border-transparent text-ink-muted hover:text-ink'
          }`
        }
      >
        New
      </NavLink>
      <NavLink
        to="/collect/manage"
        className={() =>
          `px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            isManageActive ? 'border-amber text-amber' : 'border-transparent text-ink-muted hover:text-ink'
          }`
        }
      >
        Manage
      </NavLink>
    </div>
  );
}

function CollectNewPage() {
  return (
    <div>
      <CollectNavTabs />
      <ObservationForm />
    </div>
  );
}

function ManageCollectionCard({ collection }: { collection: Collection }) {
  const lastRunDate = collection.last_run_at ? parseBigQueryTimestamp(collection.last_run_at) : null;
  const displayName = collection.display_name || `${collection.topic_name} - ${collection.template_name}`;
  const isDisabled = collection.disabled === 1;

  let status: { label: string; color: string; icon: string };
  if (isDisabled) {
    status = { label: 'Disabled', color: 'text-ink-muted', icon: '⊘' };
  } else if (!collection.schedule_type) {
    status = { label: 'Manual', color: 'text-ink-muted', icon: '○' };
  } else if (collection.is_paused) {
    status = { label: 'Paused', color: 'text-amber', icon: '⏸' };
  } else {
    status = { label: 'Active', color: 'text-green-600', icon: '●' };
  }

  const formatSchedule = () => {
    if (!collection.schedule_type) return 'No schedule';
    if (collection.schedule_type === 'custom') return collection.cron_expression || 'Custom';
    return collection.schedule_type.charAt(0).toUpperCase() + collection.schedule_type.slice(1);
  };

  return (
    <Link
      to={`/collect/${collection.id}`}
      className={`block bg-white border border-border rounded-lg p-4 hover:border-amber transition-colors ${isDisabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-medium truncate ${isDisabled ? 'text-ink-muted line-through' : 'text-ink'}`}>{displayName}</h3>
            <span className={`text-xs ${status.color}`}>
              {status.icon} {status.label}
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-1 line-clamp-2">{collection.prompt_text}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
            <span>{collection.model_count} model{collection.model_count !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{formatSchedule()}</span>
            {lastRunDate && (
              <>
                <span>·</span>
                <span>Last run: {lastRunDate.toLocaleDateString()} {lastRunDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </>
            )}
          </div>
        </div>
        <span className="text-xs text-ink-muted shrink-0">View →</span>
      </div>
    </Link>
  );
}

function CollectManagePage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);

  useEffect(() => {
    fetch(`/api/observations?includeDisabled=${showDisabled}`)
      .then(async (res) => {
        const data = (await res.json()) as { error?: string; observations?: Collection[] };
        if (!res.ok) throw new Error(data.error || 'Failed to load observations');
        return data;
      })
      .then((data) => {
        setCollections(data.observations || []);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setCollections([]);
      })
      .finally(() => setLoading(false));
  }, [showDisabled]);

  return (
    <div>
      <CollectNavTabs />

      {/* Show disabled toggle */}
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={(e) => setShowDisabled(e.target.checked)}
            className="rounded border-border text-amber focus:ring-amber"
          />
          Show disabled observations
        </label>
      </div>

      {loading ? (
        <div className="text-center py-20 text-ink-muted">Loading observations...</div>
      ) : error ? (
        <div className="text-center py-20">
          <div className="text-error mb-2">Failed to load observations</div>
          <div className="text-sm text-ink-muted">{error}</div>
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-20 text-ink-muted">
          No observations yet. Use the New tab to create your first observation.
        </div>
      ) : (
        <div className="space-y-4">
          {collections.map((collection) => (
            <ManageCollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </div>
  );
}

function PromptCard({ query }: { query: PromptLabQuery }) {
  const [expanded, setExpanded] = useState(false);
  const date = parseBigQueryTimestamp(query.collected_at);

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="space-y-1">
        {/* Row 1: Prompt + Expand */}
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-ink line-clamp-2 flex-1 min-w-0">{query.prompt}</p>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-amber hover:text-amber-dark shrink-0"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {/* Row 2: Metadata + Use Prompt */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span>{date.toLocaleDateString()}</span>
            <span>
              {query.responses.length} model{query.responses.length !== 1 ? 's' : ''}
            </span>
          </div>
          <Link
            to={`/collect?prompt=${encodeURIComponent(query.prompt)}`}
            className="text-xs text-amber hover:text-amber-dark"
          >
            Use Prompt
          </Link>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {query.responses.map((resp, i) => (
            <div key={i} className="bg-paper rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-ink-light">{resp.model}</span>
                {resp.success && (resp.input_tokens > 0 || resp.input_cost !== null || resp.output_cost !== null) && (
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    {resp.input_tokens > 0 && (
                      <span>{resp.input_tokens + resp.output_tokens} tokens</span>
                    )}
                    {(resp.input_cost !== null || resp.output_cost !== null) && (
                      <span className="text-green-600">
                        ${((resp.input_cost || 0) + (resp.output_cost || 0)).toFixed(6)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {resp.success ? (
                <div
                  className="text-sm text-ink markdown-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(resp.response || '') }}
                />
              ) : (
                <p className="text-sm text-error">{resp.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrowseNav() {
  return (
    <div className="flex gap-1 mb-6 border-b border-border">
      <NavLink
        to="/browse/prompts"
        className={({ isActive }) =>
          `px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            isActive ? 'border-amber text-amber' : 'border-transparent text-ink-muted hover:text-ink'
          }`
        }
      >
        Prompt History
      </NavLink>
    </div>
  );
}

interface FilterParams {
  search: string;
  models: string[];
  companies: string[];
  topics: string[];
  sources: string[];
}

// Multi-select dropdown component
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  getLabel = (o: string | { label: string; value: string }) =>
    typeof o === 'string' ? o : o.label,
  getValue = (o: string | { label: string; value: string }) =>
    typeof o === 'string' ? o : o.value,
}: {
  label: string;
  options: string[] | { label: string; value: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  getLabel?: (option: string | { label: string; value: string }) => string;
  getValue?: (option: string | { label: string; value: string }) => string;
}) {
  const [open, setOpen] = useState(false);

  const toggleValue = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-2 border border-border rounded-lg text-sm bg-white flex items-center gap-2 min-w-[140px]"
      >
        <span className="flex-1 text-left truncate">
          {selected.length === 0 ? label : `${selected.length} selected`}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-20 min-w-[200px] max-h-64 overflow-y-auto">
            {options.map((option) => {
              const value = typeof option === 'string' ? option : getValue(option);
              const optionLabel = typeof option === 'string' ? option : getLabel(option);
              return (
                <label
                  key={value}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-paper cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(value)}
                    onChange={() => toggleValue(value)}
                    className="rounded"
                  />
                  <span className="truncate">{optionLabel}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PromptsContent({
  filters,
  models,
  topics,
  onFilterChange,
}: {
  filters: FilterParams;
  models: Model[];
  topics: Topic[];
  onFilterChange: (newFilters: Partial<FilterParams>) => void;
}) {
  const [prompts, setPrompts] = useState<PromptLabQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(filters.search);

  // Derive unique companies from models (actual creators, not hosting providers)
  const companies = [...new Set(models.map((m) => m.company))].sort();

  // Filter models by selected companies (if any selected, show only those companies' models)
  const filteredModels =
    filters.companies.length > 0
      ? models.filter((m) => filters.companies.includes(m.company))
      : models;

  // Load prompts when filters change (component is keyed so loading starts as true)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('limit', '50');
    if (filters.search) params.set('search', filters.search);
    if (filters.models.length > 0) params.set('models', filters.models.join(','));
    if (filters.companies.length > 0) params.set('companies', filters.companies.join(','));
    if (filters.topics.length > 0) params.set('topics', filters.topics.join(','));
    // Only filter by source when exactly one is selected (both or neither means show all)
    if (filters.sources.length === 1) params.set('sources', filters.sources.join(','));

    fetch(`/api/prompts?${params}`)
      .then(async (res) => {
        const data = (await res.json()) as { error?: string } & PromptsResponse;
        if (!res.ok) throw new Error(data.error || 'Failed to load prompts');
        return data;
      })
      .then((data) => {
        setPrompts(data.prompts || []);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setPrompts([]);
      })
      .finally(() => setLoading(false));
  }, [filters.search, filters.models, filters.companies, filters.topics, filters.sources]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ search: searchInput });
  };

  // Source filter: when both or neither are checked, show all (don't filter)
  // When only one is checked, filter to that source
  const sourceFilterActive = filters.sources.length === 1;

  const hasActiveFilters =
    filters.models.length > 0 || filters.companies.length > 0 || filters.topics.length > 0 || sourceFilterActive;

  // Toggle source checkbox - both checked = show all, one checked = filter to that source
  const toggleSource = (source: string) => {
    if (filters.sources.includes(source)) {
      // Unchecking this source
      const newSources = filters.sources.filter((s) => s !== source);
      onFilterChange({ sources: newSources });
    } else {
      // Checking this source
      const newSources = [...filters.sources, source];
      onFilterChange({ sources: newSources });
    }
  };

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <MultiSelect
          label="All Companies"
          options={companies}
          selected={filters.companies}
          onChange={(companies) => onFilterChange({ companies })}
        />

        <MultiSelect
          label="All Models"
          options={filteredModels.map((m) => ({ label: m.display_name, value: m.model_name }))}
          selected={filters.models}
          onChange={(models) => onFilterChange({ models })}
          getLabel={(o) => (typeof o === 'string' ? o : o.label)}
          getValue={(o) => (typeof o === 'string' ? o : o.value)}
        />

        <MultiSelect
          label="All Topics"
          options={topics.map((t) => ({ label: t.name, value: t.id }))}
          selected={filters.topics}
          onChange={(topics) => onFilterChange({ topics })}
          getLabel={(o) => (typeof o === 'string' ? o : o.label)}
          getValue={(o) => (typeof o === 'string' ? o : o.value)}
        />

        {/* Source checkboxes */}
        <div className="flex items-center gap-3 px-2">
          <label className="flex items-center gap-1.5 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={filters.sources.includes('collection')}
              onChange={() => toggleSource('collection')}
              className="rounded border-border text-amber focus:ring-amber"
            />
            Collections
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={filters.sources.includes('prompt-lab')}
              onChange={() => toggleSource('prompt-lab')}
              className="rounded border-border text-amber focus:ring-amber"
            />
            Ad Hoc
          </label>
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => onFilterChange({ models: [], companies: [], topics: [], sources: ['collection', 'prompt-lab'] })}
            className="px-3 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search prompts..."
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber/50"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-amber text-white rounded-lg text-sm font-medium hover:bg-amber-dark transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {loading ? (
        <div className="text-center py-20 text-ink-muted">Loading prompts...</div>
      ) : error ? (
        <div className="text-center py-20">
          <div className="text-error mb-2">Failed to load prompts</div>
          <div className="text-sm text-ink-muted">{error}</div>
        </div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-20 text-ink-muted">
          {hasActiveFilters || filters.search
            ? 'No prompts match the current filters'
            : 'No prompts yet. Use the Collect page to run prompts.'}
        </div>
      ) : (
        <div className="space-y-4">
          {prompts.map((query) => (
            <PromptCard key={query.id} query={query} />
          ))}
        </div>
      )}
    </>
  );
}

function BrowsePromptsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [models, setModels] = useState<Model[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);

  // Load models and topics on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/models').then((r) => r.json() as Promise<ModelsResponse>),
      fetch('/api/topics').then((r) => r.json() as Promise<TopicsResponse>),
    ]).then(([modelsData, topicsData]) => {
      setModels(modelsData.models || []);
      setTopics(topicsData.topics || []);
    });
  }, []);

  // Parse comma-separated values from URL
  const parseArray = (param: string | null): string[] =>
    param ? param.split(',').filter(Boolean) : [];

  // Parse sources from URL, default to both checked (show all)
  const parseSources = (param: string | null): string[] => {
    if (param === null) return ['collection', 'prompt-lab']; // Default: both checked
    const sources = param.split(',').filter(Boolean);
    return sources.length > 0 ? sources : ['collection', 'prompt-lab'];
  };

  const filters: FilterParams = {
    search: searchParams.get('search') || '',
    models: parseArray(searchParams.get('models')),
    companies: parseArray(searchParams.get('companies')),
    topics: parseArray(searchParams.get('topics')),
    sources: parseSources(searchParams.get('sources')),
  };

  const handleFilterChange = (newFilters: Partial<FilterParams>) => {
    const updated = { ...filters, ...newFilters };
    const params = new URLSearchParams();
    if (updated.search) params.set('search', updated.search);
    if (updated.models.length > 0) params.set('models', updated.models.join(','));
    if (updated.companies.length > 0) params.set('companies', updated.companies.join(','));
    if (updated.topics.length > 0) params.set('topics', updated.topics.join(','));
    // Only persist sources to URL if not both selected (both = default = no param needed)
    if (updated.sources.length === 1 || updated.sources.length === 0) {
      params.set('sources', updated.sources.join(','));
    }
    setSearchParams(params);
  };

  // Create a key from all filter params to reset component state when any filter changes
  const filterKey = `${filters.search}-${filters.models.join(',')}-${filters.companies.join(',')}-${filters.topics.join(',')}-${filters.sources.join(',')}`;

  return (
    <div>
      <BrowseNav />
      <PromptsContent
        key={filterKey}
        filters={filters}
        models={models}
        topics={topics}
        onFilterChange={handleFilterChange}
      />
    </div>
  );
}

function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [prompts, setPrompts] = useState<PromptLabQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedExecutions, setExpandedExecutions] = useState<Set<string>>(new Set());
  const [apiKey, setApiKey] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const loadData = useCallback(() => {
    if (!id) return;

    Promise.all([
      fetch(`/api/collections/${id}`).then((res) => res.json()) as Promise<{ error?: string; collection: Collection }>,
      fetch(`/api/collections/${id}/responses`).then((res) => res.json()) as Promise<PromptsResponse & { error?: string }>,
    ])
      .then(([collectionData, responsesData]) => {
        if (collectionData.error) {
          throw new Error(collectionData.error);
        }
        setCollection(collectionData.collection);
        setPrompts(responsesData.prompts || []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const executionGroups = useMemo(() => {
    const groups = new Map<string, PromptLabQuery[]>();
    prompts.forEach((p) => {
      const key = p.id;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(p);
    });
    return Array.from(groups.entries())
      .map(([promptId, queries]) => ({
        promptId,
        queries,
        collectedAt: queries[0]?.collected_at || '',
        responseCount: queries.reduce((acc, q) => acc + q.responses.length, 0),
      }))
      .sort((a, b) => parseBigQueryTimestamp(b.collectedAt).getTime() - parseBigQueryTimestamp(a.collectedAt).getTime());
  }, [prompts]);

  const toggleExecution = (promptId: string) => {
    setExpandedExecutions((prev) => {
      const next = new Set(prev);
      if (next.has(promptId)) {
        next.delete(promptId);
      } else {
        next.add(promptId);
      }
      return next;
    });
  };

  const handleRunNow = async () => {
    if (!apiKey || !id) {
      setActionError('Please enter an API key to run collections');
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setIsRunning(true);

    try {
      const res = await fetch(`/api/admin/collections/${id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to run collection');
      }
      setActionSuccess('Collection run completed successfully!');
      loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to run collection');
    } finally {
      setIsRunning(false);
    }
  };

  const handleTogglePause = async () => {
    if (!apiKey || !id || !collection) {
      setActionError('Please enter an API key to modify collections');
      return;
    }
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ is_paused: !collection.is_paused }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to update collection');
      }
      loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update collection');
    }
  };

  const handleDisable = async () => {
    if (!apiKey || !id) {
      setActionError('Please enter an API key to disable collections');
      return;
    }
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to disable collection');
      }
      loadData();
      setShowDisableConfirm(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to disable collection');
    }
  };

  const handleRestore = async () => {
    if (!apiKey || !id) {
      setActionError('Please enter an API key to restore collections');
      return;
    }
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/collections/${id}/restore`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to restore collection');
      }
      loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to restore collection');
    }
  };

  const formatSchedule = (scheduleType: string | null, cronExpression: string | null): string => {
    if (!scheduleType) return 'No schedule';
    if (scheduleType === 'custom' && cronExpression) return `Custom: ${cronExpression}`;
    return scheduleType.charAt(0).toUpperCase() + scheduleType.slice(1);
  };

  const formatLocalTime = (timestamp: string | null): string => {
    if (!timestamp) return 'Never';
    const date = parseBigQueryTimestamp(timestamp);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div>
        <CollectNavTabs />
        <div className="text-center py-20 text-ink-muted">Loading collection...</div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div>
        <CollectNavTabs />
        <div className="text-center py-20">
          <div className="text-error mb-2">Failed to load collection</div>
          <div className="text-sm text-ink-muted">{error}</div>
          <Link to="/collect/manage" className="text-amber hover:text-amber-dark text-sm mt-4 inline-block">
            ← Back to Manage
          </Link>
        </div>
      </div>
    );
  }

  const displayName = collection.display_name || `${collection.topic_name} - ${collection.template_name}`;
  const isDisabled = collection.disabled === 1;

  let status: { label: string; color: string; icon: string };
  if (isDisabled) {
    status = { label: 'Disabled', color: 'text-ink-muted', icon: '⊘' };
  } else if (!collection.schedule_type) {
    status = { label: 'Manual', color: 'text-ink-muted', icon: '○' };
  } else if (collection.is_paused) {
    status = { label: 'Paused', color: 'text-amber', icon: '⏸' };
  } else {
    status = { label: 'Active', color: 'text-green-600', icon: '●' };
  }

  return (
    <div>
      <CollectNavTabs />

      <div className="mb-6">
        <Link to="/collect/manage" className="text-sm text-amber hover:text-amber-dark mb-2 inline-block">
          ← Back to Manage
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className={`text-xl font-semibold ${isDisabled ? 'text-ink-muted line-through' : 'text-ink'}`}>
                {displayName}
              </h2>
              <span className={`text-sm ${status.color}`}>
                {status.icon} {status.label}
              </span>
            </div>
            <p className="text-sm text-ink-muted mt-1">{collection.prompt_text}</p>
          </div>
        </div>
      </div>

      <div className="bg-paper-dark rounded-lg p-4 mb-6 border border-border">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API key for actions"
            className="flex-1 min-w-[200px] max-w-xs rounded-lg px-3 py-2 text-sm border border-border focus:border-amber focus:ring-1 focus:ring-amber"
          />
          {isDisabled ? (
            <button
              onClick={handleRestore}
              className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Restore
            </button>
          ) : (
            <>
              <button
                onClick={handleRunNow}
                disabled={isRunning}
                className="px-3 py-2 text-sm bg-amber text-white rounded-lg hover:bg-amber-dark disabled:opacity-50"
              >
                {isRunning ? 'Running...' : 'Run Now'}
              </button>
              {collection.schedule_type && (
                <button
                  onClick={handleTogglePause}
                  className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-white"
                >
                  {collection.is_paused ? 'Resume Schedule' : 'Pause Schedule'}
                </button>
              )}
              <Link
                to={`/collect/${collection.id}`}
                className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-white"
              >
                Edit
              </Link>
              {!showDisableConfirm ? (
                <button
                  onClick={() => setShowDisableConfirm(true)}
                  className="px-3 py-2 text-sm text-error border border-error/30 rounded-lg hover:bg-red-50"
                >
                  Disable
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={handleDisable} className="px-3 py-2 text-sm bg-error text-white rounded-lg">
                    Confirm Disable
                  </button>
                  <button
                    onClick={() => setShowDisableConfirm(false)}
                    className="px-3 py-2 text-sm border border-border rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-error text-sm mb-4">{actionError}</div>
        )}
        {actionSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm mb-4">{actionSuccess}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-ink-muted">Schedule</div>
            <div className="font-medium text-ink">{formatSchedule(collection.schedule_type, collection.cron_expression)}</div>
          </div>
          <div>
            <div className="text-ink-muted">Last Run</div>
            <div className="font-medium text-ink">{formatLocalTime(collection.last_run_at)}</div>
          </div>
          <div>
            <div className="text-ink-muted">Models</div>
            <div className="font-medium text-ink">{collection.model_count}</div>
          </div>
          <div>
            <div className="text-ink-muted">Executions</div>
            <div className="font-medium text-ink">{executionGroups.length}</div>
          </div>
        </div>
      </div>

      <h3 className="text-lg font-medium text-ink mb-3">Execution History</h3>
      {executionGroups.length === 0 ? (
        <div className="text-center py-12 text-ink-muted border border-border rounded-lg bg-paper">
          No executions yet. Click "Run Now" to collect responses.
        </div>
      ) : (
        <div className="space-y-3">
          {executionGroups.map((group) => (
            <div key={group.promptId} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleExecution(group.promptId)}
                className="w-full px-4 py-3 bg-paper-dark flex items-center justify-between hover:bg-paper-darker transition-colors text-left"
              >
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium text-ink">{formatLocalTime(group.collectedAt)}</span>
                  <span className="text-ink-muted">{group.responseCount} responses</span>
                </div>
                <span className="text-ink-muted">{expandedExecutions.has(group.promptId) ? '▼' : '▶'}</span>
              </button>
              {expandedExecutions.has(group.promptId) && (
                <div className="p-4 space-y-3 bg-white">
                  {group.queries.flatMap((query) =>
                    query.responses.map((resp, i) => (
                      <div key={`${query.id}-${i}`} className="bg-paper rounded-lg p-4 border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">{resp.model}</span>
                            <span className="text-xs text-ink-muted">({resp.company})</span>
                          </div>
                          {resp.success && (
                            <div className="flex items-center gap-3 text-xs text-ink-muted">
                              <span>{resp.latency_ms}ms</span>
                              {resp.input_tokens > 0 && <span>{resp.input_tokens + resp.output_tokens} tokens</span>}
                              {(resp.input_cost !== null || resp.output_cost !== null) && (
                                <span className="text-green-600">
                                  ${((resp.input_cost || 0) + (resp.output_cost || 0)).toFixed(6)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {resp.success ? (
                          <div
                            className="text-sm text-ink markdown-content"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(resp.response || '') }}
                          />
                        ) : (
                          <p className="text-sm text-error">{resp.error}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">LLM Observatory</h1>
              <p className="text-sm text-ink-muted mt-0.5">
                Compare what different AI models say about topics
              </p>
            </div>
            <nav className="flex border border-border rounded-lg overflow-hidden">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber text-white'
                      : 'bg-white text-ink-light hover:bg-paper-dark'
                  }`
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/collect"
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium transition-colors border-l border-border ${
                    isActive
                      ? 'bg-amber text-white'
                      : 'bg-white text-ink-light hover:bg-paper-dark'
                  }`
                }
              >
                Collect
              </NavLink>
              <NavLink
                to="/browse"
                className={({ isActive }) => {
                  // Also highlight if we're on any /browse/* route
                  const isBrowseRoute = window.location.pathname.startsWith('/browse');
                  return `px-4 py-2 text-sm font-medium transition-colors border-l border-border ${
                    isActive || isBrowseRoute
                      ? 'bg-amber text-white'
                      : 'bg-white text-ink-light hover:bg-paper-dark'
                  }`;
                }}
              >
                Browse
              </NavLink>
            </nav>
            <a
              href="https://github.com/emily-flambe/llm-observatory"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-4 text-ink-muted hover:text-ink transition-colors"
              aria-label="View on GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          {/* Collect routes */}
          <Route path="/collect" element={<CollectNewPage />} />
          <Route path="/collect/manage" element={<CollectManagePage />} />
          <Route path="/collect/:id" element={<CollectionDetailPage />} />
          {/* Browse routes */}
          <Route path="/browse" element={<Navigate to="/browse/prompts" replace />} />
          <Route path="/browse/prompts" element={<BrowsePromptsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

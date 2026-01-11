import { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useSearchParams,
} from 'react-router-dom';
import TopicList from './components/TopicList';
import ResponseView from './components/ResponseView';
import CollectionForm from './components/CollectionForm';
import Landing from './pages/Landing';
import PromptLab from './pages/PromptLab';
import { parseBigQueryTimestamp } from './utils/date';
import { renderMarkdown } from './utils/markdown';
import type { Topic, TopicsResponse, PromptLabQuery, PromptsResponse, Model, ModelsResponse } from './types';

function CollectPage({ onCollectionComplete }: { onCollectionComplete: () => void }) {
  return (
    <div className="max-w-xl">
      <CollectionForm onCollectionComplete={onCollectionComplete} />
    </div>
  );
}

function PromptCard({ query }: { query: PromptLabQuery }) {
  const [expanded, setExpanded] = useState(false);
  const date = parseBigQueryTimestamp(query.collected_at);

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink line-clamp-2">{query.prompt}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
            <span>{date.toLocaleDateString()}</span>
            <span>
              {query.responses.length} model{query.responses.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-amber hover:text-amber-dark shrink-0"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {query.responses.map((resp, i) => (
            <div key={i} className="bg-paper rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-ink-light">{resp.model}</span>
                {resp.success && (
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    <span>{resp.latency_ms}ms</span>
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
        to="/browse/topics"
        className={({ isActive }) =>
          `px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            isActive ? 'border-amber text-amber' : 'border-transparent text-ink-muted hover:text-ink'
          }`
        }
      >
        Topics
      </NavLink>
      <NavLink
        to="/browse/prompt-history"
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

function BrowseTopicsPage({ topics, error }: { topics: Topic[]; error: string | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const topicParam = searchParams.get('topic');

  // Find selected topic from URL param
  const selectedTopic = topicParam ? topics.find((t) => t.id === topicParam) ?? null : null;

  const handleSelectTopic = (topic: Topic | null) => {
    if (topic) {
      setSearchParams({ topic: topic.id });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div>
      <BrowseNav />

      {error ? (
        <div className="text-center py-20">
          <div className="text-error mb-2">Failed to load topics</div>
          <div className="text-sm text-ink-muted">{error}</div>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-20 text-ink-muted">
          No topics with responses yet. Use the Collect page to gather responses.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <aside className="lg:col-span-1">
            <TopicList
              topics={topics}
              selectedTopic={selectedTopic}
              onSelectTopic={handleSelectTopic}
            />
          </aside>
          <section className="lg:col-span-2">
            {selectedTopic ? (
              <ResponseView topic={selectedTopic} />
            ) : (
              <div className="text-center py-20 text-ink-muted">
                Select a topic to view responses
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

interface FilterParams {
  search: string;
  models: string[];
  companies: string[];
  topics: string[];
}

// Multi-select dropdown component
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  getLabel = (o) => o,
  getValue = (o) => o,
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

function PromptHistoryContent({
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

    fetch(`/api/prompts?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load prompts');
        return data as PromptsResponse;
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
  }, [filters.search, filters.models, filters.companies, filters.topics]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ search: searchInput });
  };

  const hasActiveFilters =
    filters.models.length > 0 || filters.companies.length > 0 || filters.topics.length > 0;

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
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

        {hasActiveFilters && (
          <button
            onClick={() => onFilterChange({ models: [], companies: [], topics: [] })}
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
            : 'No prompts yet. Use the Prompt Lab to submit prompts.'}
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

function BrowsePromptHistoryPage() {
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

  const filters: FilterParams = {
    search: searchParams.get('search') || '',
    models: parseArray(searchParams.get('models')),
    companies: parseArray(searchParams.get('companies')),
    topics: parseArray(searchParams.get('topics')),
  };

  const handleFilterChange = (newFilters: Partial<FilterParams>) => {
    const updated = { ...filters, ...newFilters };
    const params = new URLSearchParams();
    if (updated.search) params.set('search', updated.search);
    if (updated.models.length > 0) params.set('models', updated.models.join(','));
    if (updated.companies.length > 0) params.set('companies', updated.companies.join(','));
    if (updated.topics.length > 0) params.set('topics', updated.topics.join(','));
    setSearchParams(params);
  };

  // Create a key from all filter params to reset component state when any filter changes
  const filterKey = `${filters.search}-${filters.models.join(',')}-${filters.companies.join(',')}-${filters.topics.join(',')}`;

  return (
    <div>
      <BrowseNav />
      <PromptHistoryContent
        key={filterKey}
        filters={filters}
        models={models}
        topics={topics}
        onFilterChange={handleFilterChange}
      />
    </div>
  );
}

function Layout({ children, loadTopics }: { children: React.ReactNode; loadTopics: () => void }) {
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
                to="/prompt-lab"
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium transition-colors border-l border-border ${
                    isActive
                      ? 'bg-amber text-white'
                      : 'bg-white text-ink-light hover:bg-paper-dark'
                  }`
                }
              >
                Prompt Lab
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
                to="/browse/topics"
                onClick={() => loadTopics()}
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
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}

export default function App() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTopics = () => {
    fetch('/api/topics-with-responses')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load topics');
        }
        return data as TopicsResponse;
      })
      .then((data) => {
        setTopics(data.topics || []);
        setLoading(false);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setTopics([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadTopics();
  }, []);

  return (
    <BrowserRouter>
      <Layout loadTopics={loadTopics}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/prompt-lab" element={<PromptLab />} />
          <Route path="/collect" element={<CollectPage onCollectionComplete={loadTopics} />} />
          {/* Redirect /browse to /browse/topics */}
          <Route path="/browse" element={<Navigate to="/browse/topics" replace />} />
          <Route
            path="/browse/topics"
            element={
              loading ? (
                <div className="text-center py-20 text-ink-muted">Loading topics...</div>
              ) : (
                <BrowseTopicsPage topics={topics} error={error} />
              )
            }
          />
          <Route path="/browse/prompt-history" element={<BrowsePromptHistoryPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

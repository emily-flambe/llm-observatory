import { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useSearchParams,
  useNavigate,
} from 'react-router-dom';
import TopicList from './components/TopicList';
import ResponseView from './components/ResponseView';
import CollectionForm from './components/CollectionForm';
import Landing from './pages/Landing';
import PromptLab from './pages/PromptLab';
import { parseBigQueryTimestamp } from './utils/date';
import { renderMarkdown } from './utils/markdown';
import type { Topic, TopicsResponse, PromptLabQuery, PromptsResponse } from './types';

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
                {resp.success && <span className="text-xs text-ink-muted">{resp.latency_ms}ms</span>}
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

function PromptHistoryContent({ searchParam }: { searchParam: string }) {
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<PromptLabQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(searchParam);

  // Load prompts on mount (component is keyed by searchParam)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('limit', '50');
    if (searchParam) params.set('search', searchParam);

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
  }, [searchParam]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput) {
      navigate(`/browse/prompt-history?search=${encodeURIComponent(searchInput)}`);
    } else {
      navigate('/browse/prompt-history');
    }
  };

  return (
    <>
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
          {searchParam
            ? `No prompts matching "${searchParam}"`
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
  const [searchParams] = useSearchParams();
  const searchParam = searchParams.get('search') || '';

  return (
    <div>
      <BrowseNav />
      {/* Key by searchParam to reset loading state on search changes */}
      <PromptHistoryContent key={searchParam} searchParam={searchParam} />
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

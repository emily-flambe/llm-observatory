import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import TopicList from './components/TopicList';
import ResponseView from './components/ResponseView';
import CollectionForm from './components/CollectionForm';
import Landing from './pages/Landing';
import PromptLab from './pages/PromptLab';
import type { Topic, TopicsResponse } from './types';

function CollectPage({ onCollectionComplete }: { onCollectionComplete: () => void }) {
  return (
    <div className="max-w-xl">
      <CollectionForm onCollectionComplete={onCollectionComplete} />
    </div>
  );
}

function BrowsePage({ topics, error }: { topics: Topic[]; error: string | null }) {
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  if (error) {
    return (
      <div className="text-center py-20">
        <div className="text-error mb-2">Failed to load topics</div>
        <div className="text-sm text-ink-muted">{error}</div>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="text-center py-20 text-ink-muted">
        No topics with responses yet. Use the Collect page to gather responses.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      <aside className="lg:col-span-1">
        <TopicList
          topics={topics}
          selectedTopic={selectedTopic}
          onSelectTopic={setSelectedTopic}
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
  );
}

function Layout({ children, loadTopics }: { children: React.ReactNode; loadTopics: () => void }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                LLM Observatory
              </h1>
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
                to="/browse"
                onClick={() => loadTopics()}
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium transition-colors border-l border-border ${
                    isActive
                      ? 'bg-amber text-white'
                      : 'bg-white text-ink-light hover:bg-paper-dark'
                  }`
                }
              >
                Browse
              </NavLink>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {children}
      </main>
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
          <Route
            path="/browse"
            element={
              loading ? (
                <div className="text-center py-20 text-ink-muted">Loading topics...</div>
              ) : (
                <BrowsePage topics={topics} error={error} />
              )
            }
          />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

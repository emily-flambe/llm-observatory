import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import TopicList from './components/TopicList';
import ResponseView from './components/ResponseView';
import CollectionForm from './components/CollectionForm';
import type { Topic, TopicsResponse } from './types';

function CollectPage({ onCollectionComplete }: { onCollectionComplete: () => void }) {
  return (
    <div className="max-w-xl">
      <CollectionForm onCollectionComplete={onCollectionComplete} />
    </div>
  );
}

function BrowsePage({ topics }: { topics: Topic[] }) {
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

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
                to="/collect"
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium transition-colors ${
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
      .then(res => res.json() as Promise<TopicsResponse>)
      .then(data => {
        setTopics(data.topics);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadTopics();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-ink-muted">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-error">Error: {error}</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout loadTopics={loadTopics}>
        <Routes>
          <Route path="/" element={<Navigate to="/collect" replace />} />
          <Route path="/collect" element={<CollectPage onCollectionComplete={loadTopics} />} />
          <Route path="/browse" element={<BrowsePage topics={topics} />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

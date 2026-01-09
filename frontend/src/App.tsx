import { useState, useEffect } from 'react';
import TopicList from './components/TopicList';
import ResponseView from './components/ResponseView';

interface Topic {
  id: string;
  name: string;
  category: string;
}

export default function App() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/topics')
      .then(res => res.json() as Promise<{ topics: Topic[] }>)
      .then(data => {
        setTopics(data.topics);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-white">
            LLM Observatory
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            See what different AI models say about various topics
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
              <div className="text-center py-16 text-slate-500">
                Select a topic to view responses
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

import { useState, useEffect } from 'react';
import ResponseCard from './ResponseCard';

interface Topic {
  id: string;
  name: string;
  category: string;
}

interface Response {
  id: string;
  model_name: string;
  provider: string;
  raw_response: string;
  collected_at: string;
  latency_ms: number | null;
  error: string | null;
}

interface ResponseViewProps {
  topic: Topic;
}

export default function ResponseView({ topic }: ResponseViewProps) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [loadedTopicId, setLoadedTopicId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/topics/${topic.id}/responses`, { signal: controller.signal })
      .then(res => res.json() as Promise<{ responses: Response[] }>)
      .then(data => {
        setResponses(data.responses);
        setLoadedTopicId(topic.id);
      })
      .catch((err) => {
        // Ignore abort errors
        if (err.name !== 'AbortError') {
          setResponses([]);
          setLoadedTopicId(topic.id);
        }
      });

    return () => controller.abort();
  }, [topic.id]);

  // Derive loading state
  const loading = loadedTopicId !== topic.id;

  if (loading) {
    return <div className="text-slate-400">Loading responses...</div>;
  }

  if (responses.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">No responses collected yet for {topic.name}</p>
        <p className="text-sm text-slate-600 mt-2">
          Use the admin API to trigger collection
        </p>
      </div>
    );
  }

  // Group by model
  const byModel = responses.reduce((acc, r) => {
    if (!acc[r.model_name]) acc[r.model_name] = [];
    acc[r.model_name].push(r);
    return acc;
  }, {} as Record<string, Response[]>);

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">
        Responses for {topic.name}
      </h2>
      <div className="space-y-6">
        {Object.entries(byModel).map(([modelName, modelResponses]) => (
          <div key={modelName}>
            <h3 className="text-sm font-medium text-slate-400 mb-3">
              {modelName}
            </h3>
            <div className="space-y-4">
              {modelResponses.slice(0, 3).map(response => (
                <ResponseCard key={response.id} response={response} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

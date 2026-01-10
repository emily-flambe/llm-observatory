import { useState, useEffect } from 'react';

interface Stats {
  topicCount: number;
  modelCount: number;
}

export default function Landing() {
  const [stats, setStats] = useState<Stats>({ topicCount: 0, modelCount: 0 });

  useEffect(() => {
    Promise.all([
      fetch('/api/topics').then((r) => r.json()),
      fetch('/api/models').then((r) => r.json()),
    ]).then(([topicsData, modelsData]) => {
      setStats({
        topicCount: topicsData.topics?.length || 0,
        modelCount: modelsData.models?.length || 0,
      });
    });
  }, []);

  return (
    <div className="py-8">
      <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto">
        <div className="bg-white border border-border rounded-lg p-6 text-center">
          <div className="text-3xl font-semibold text-amber">{stats.topicCount}</div>
          <div className="text-sm text-ink-muted mt-1">Topics</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-6 text-center">
          <div className="text-3xl font-semibold text-amber">{stats.modelCount}</div>
          <div className="text-sm text-ink-muted mt-1">Models</div>
        </div>
      </div>
    </div>
  );
}

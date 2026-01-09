import { useState } from 'react';

interface Response {
  id: string;
  model_name: string;
  provider: string;
  raw_response: string;
  collected_at: string;
  latency_ms: number | null;
  error: string | null;
}

interface ResponseCardProps {
  response: Response;
}

export default function ResponseCard({ response }: ResponseCardProps) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (response.error) {
    return (
      <div className="bg-red-950/50 border border-red-900 rounded-lg p-4">
        <div className="text-red-400 text-sm">Error: {response.error}</div>
        <div className="text-xs text-red-600 mt-1">
          {formatDate(response.collected_at)}
        </div>
      </div>
    );
  }

  const preview = response.raw_response.slice(0, 300);
  const hasMore = response.raw_response.length > 300;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <div className="prose prose-invert prose-sm max-w-none">
        <p className="text-slate-300 whitespace-pre-wrap">
          {expanded ? response.raw_response : preview}
          {hasMore && !expanded && '...'}
        </p>
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm text-indigo-400 hover:text-indigo-300"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-700 text-xs text-slate-500">
        <span>{formatDate(response.collected_at)}</span>
        {response.latency_ms && (
          <span>{(response.latency_ms / 1000).toFixed(1)}s</span>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { Response } from '../types';

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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-error text-sm">Error: {response.error}</div>
        <div className="text-xs text-error/70 mt-1">
          {formatDate(response.collected_at)}
        </div>
      </div>
    );
  }

  const content = response.response || '';
  const preview = content.slice(0, 300);
  const hasMore = content.length > 300;

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2 text-xs text-ink-muted">
        <span className="text-amber">{response.prompt_template_name}</span>
        <span>•</span>
        <span>{response.company}</span>
      </div>

      <div className="prose prose-sm max-w-none">
        <p className="text-ink-light whitespace-pre-wrap">
          {expanded ? content : preview}
          {hasMore && !expanded && '...'}
        </p>
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm text-amber hover:text-amber-light"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border text-xs text-ink-muted">
        <span>{formatDate(response.collected_at)}</span>
        {response.latency_ms > 0 && (
          <span>{(response.latency_ms / 1000).toFixed(1)}s</span>
        )}
        {response.input_tokens > 0 && (
          <span>{response.input_tokens + response.output_tokens} tokens</span>
        )}
      </div>
    </div>
  );
}

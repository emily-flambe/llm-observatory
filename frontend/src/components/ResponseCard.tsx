import { useState } from 'react';
import type { Response } from '../types';
import { parseBigQueryTimestamp } from '../utils/date';
import { renderMarkdown } from '../utils/markdown';

interface ResponseCardProps {
  response: Response;
}

export default function ResponseCard({ response }: ResponseCardProps) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = parseBigQueryTimestamp(dateStr);
    if (isNaN(date.getTime())) return 'Unknown date';
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

      <div className="text-ink-light text-sm markdown-content">
        {expanded ? (
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        ) : (
          <p>
            {preview}
            {hasMore && '...'}
          </p>
        )}
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
        {(response.input_cost !== null || response.output_cost !== null) && (
          <span className="text-green-600">
            ${((response.input_cost || 0) + (response.output_cost || 0)).toFixed(6)}
          </span>
        )}
      </div>
    </div>
  );
}

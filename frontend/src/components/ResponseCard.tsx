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

      {response.citations && response.citations.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-xs font-medium text-ink-muted mb-2">Sources</div>
          <div className="flex flex-wrap gap-2">
            {response.citations.map((citation, idx) => (
              <a
                key={idx}
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 truncate max-w-[200px]"
                title={citation.title || citation.url}
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="truncate">{citation.title || new URL(citation.url).hostname}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border text-xs text-ink-muted">
        <span>{formatDate(response.collected_at)}</span>
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

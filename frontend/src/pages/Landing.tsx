import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Model } from '../types';

// Format date as "Jan 2024" or return as-is if parsing fails
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr;
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type SortOption = 'name' | 'released_at' | 'knowledge_cutoff';

export default function Landing() {
  const [models, setModels] = useState<Model[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('released_at');
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json() as Promise<{ models: Model[] }>)
      .then((data) => setModels(data.models || []));
  }, []);

  // Get all unique companies from model data
  const allCompanies = useMemo(() => {
    const companies = new Set<string>();
    for (const model of models) {
      companies.add(model.company);
    }
    return Array.from(companies).sort();
  }, [models]);

  // Filter models by search and company
  const filteredModels = useMemo(() => {
    let result = models;

    if (searchFilter) {
      const lowerSearch = searchFilter.toLowerCase();
      result = result.filter(
        (m) =>
          m.display_name.toLowerCase().includes(lowerSearch) ||
          m.model_name.toLowerCase().includes(lowerSearch)
      );
    }

    if (selectedCompanies.size > 0) {
      result = result.filter((m) => selectedCompanies.has(m.company));
    }

    return result;
  }, [models, searchFilter, selectedCompanies]);

  // Group filtered models by company and sort within groups
  const modelsByCompany = useMemo(() => {
    const groups = new Map<string, Model[]>();

    for (const model of filteredModels) {
      if (!groups.has(model.company)) groups.set(model.company, []);
      groups.get(model.company)!.push(model);
    }

    // Sort models within each group
    for (const [, companyModels] of groups) {
      companyModels.sort((a, b) => {
        if (sortBy === 'name') {
          return a.display_name.localeCompare(b.display_name);
        }
        if (sortBy === 'released_at') {
          if (!a.released_at && !b.released_at) return a.display_name.localeCompare(b.display_name);
          if (!a.released_at) return 1;
          if (!b.released_at) return -1;
          return b.released_at.localeCompare(a.released_at);
        }
        if (sortBy === 'knowledge_cutoff') {
          if (!a.knowledge_cutoff && !b.knowledge_cutoff)
            return a.display_name.localeCompare(b.display_name);
          if (!a.knowledge_cutoff) return 1;
          if (!b.knowledge_cutoff) return -1;
          return b.knowledge_cutoff.localeCompare(a.knowledge_cutoff);
        }
        return 0;
      });
    }

    return groups;
  }, [filteredModels, sortBy]);

  // Sort companies alphabetically
  const sortedCompanies = useMemo(() => {
    return Array.from(modelsByCompany.keys()).sort();
  }, [modelsByCompany]);

  const toggleCompanyFilter = (company: string) => {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(company)) {
        next.delete(company);
      } else {
        next.add(company);
      }
      return next;
    });
  };

  const toggleCompanyExpanded = (company: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(company)) {
        next.delete(company);
      } else {
        next.add(company);
      }
      return next;
    });
  };

  // Model documentation URLs
  const getModelUrl = (model: Model): string => {
    const name = model.model_name.toLowerCase();
    const id = model.id.toLowerCase();

    // OpenAI
    if (name.includes('gpt-4o')) return 'https://platform.openai.com/docs/models/gpt-4o';

    // Anthropic
    if (name.includes('claude-sonnet-4-5') || name.includes('claude-sonnet-4.5'))
      return 'https://www.anthropic.com/claude/sonnet';
    if (name.includes('claude-sonnet')) return 'https://www.anthropic.com/claude/sonnet';

    // Google
    if (name.includes('gemini')) return 'https://ai.google.dev/gemini-api/docs/models/gemini';
    if (name.includes('gemma')) return 'https://ai.google.dev/gemma';

    // Meta
    if (name.includes('llama-4')) return 'https://www.llama.com/';
    if (name.includes('llama-3.3')) return 'https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_3/';
    if (name.includes('llama-3.1') || name.includes('llama-3')) return 'https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_1/';

    // Mistral
    if (id.includes('mistral')) return 'https://mistral.ai/news/mistral-small-3/';

    // Alibaba/Qwen
    if (id.includes('qwq')) return 'https://qwenlm.github.io/blog/qwq-32b/';
    if (id.includes('qwen3')) return 'https://qwenlm.github.io/blog/qwen3/';

    // DeepSeek
    if (id.includes('deepseek')) return 'https://www.deepseek.com/';

    // xAI/Grok
    if (name.includes('grok')) return 'https://x.ai/grok';

    return '#';
  };

  return (
    <div className="space-y-10">
      {/* Welcome */}
      <section>
        <p className="text-ink-light text-lg leading-relaxed">
          Compare how different AI models respond to the same prompts. Collect structured responses
          on specific topics, or test freeform prompts across multiple models simultaneously.
        </p>
      </section>

      {/* Features */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/collect"
          className="bg-white border border-border rounded-lg p-5 hover:border-amber transition-colors"
        >
          <h3 className="font-semibold text-ink mb-2">Collect</h3>
          <p className="text-sm text-ink-muted">
            Run prompts across models, save observations, schedule recurring runs.
          </p>
        </Link>
        <Link
          to="/browse"
          className="bg-white border border-border rounded-lg p-5 hover:border-amber transition-colors"
        >
          <h3 className="font-semibold text-ink mb-2">Browse</h3>
          <p className="text-sm text-ink-muted">
            View and compare collected responses across models for each topic.
          </p>
        </Link>
      </section>

      {/* Models */}
      <section>
        <h2 className="text-lg font-semibold text-ink mb-4">Supported Models</h2>

        {/* Filter/sort controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Search */}
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search models..."
            className="flex-1 min-w-[150px] px-3 py-1.5 rounded-lg text-sm border border-border focus:border-amber focus:ring-1 focus:ring-amber"
          />

          {/* Company filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-ink-muted flex items-center gap-1"
            >
              Companies
              {selectedCompanies.size > 0 && (
                <span className="bg-amber text-white text-xs px-1.5 rounded-full">
                  {selectedCompanies.size}
                </span>
              )}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {companyDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setCompanyDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 z-20 min-w-[150px]">
                  {allCompanies.map((company) => (
                    <label
                      key={company}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-paper-dark cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCompanies.has(company)}
                        onChange={() => toggleCompanyFilter(company)}
                        className="rounded border-border text-amber focus:ring-amber"
                      />
                      {company}
                    </label>
                  ))}
                  {selectedCompanies.size > 0 && (
                    <button
                      onClick={() => setSelectedCompanies(new Set())}
                      className="w-full text-left px-3 py-1.5 text-xs text-ink-muted hover:text-ink border-t border-border mt-1"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg"
          >
            <option value="released_at">Sort: Release Date</option>
            <option value="knowledge_cutoff">Sort: Training Cutoff</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>

        {/* Model count */}
        <div className="text-xs text-ink-muted mb-4">
          {filteredModels.length} models
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedCompanies.map((company) => {
            const companyModels = modelsByCompany.get(company) || [];
            const isExpanded = expandedCompanies.has(company);
            return (
            <div key={company} className="bg-white border border-border rounded-lg p-4">
              {/* Company header - clickable to expand/collapse */}
              <button
                onClick={() => toggleCompanyExpanded(company)}
                className="flex items-center gap-2 text-left w-full"
              >
                <svg
                  className={`w-4 h-4 text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h3 className="font-medium text-ink">{company}</h3>
                <span className="text-xs text-ink-muted ml-auto">{companyModels.length}</span>
              </button>

              {/* Model list - only shown when expanded */}
              {isExpanded && (
                <ul className="space-y-2 mt-3">
                  {companyModels.map((model) => {
                    const url = getModelUrl(model);
                    return (
                      <li key={model.id}>
                        <div className="text-sm text-ink">{model.display_name}</div>
                        {url !== '#' ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-amber hover:text-amber-light font-mono"
                          >
                            {model.model_name}
                          </a>
                        ) : (
                          <div className="text-xs text-ink-muted font-mono">{model.model_name}</div>
                        )}
                        {(model.released_at || model.knowledge_cutoff) && (
                          <div className="text-xs text-ink-muted mt-0.5">
                            {model.released_at && (
                              <span>Released: {formatDate(model.released_at)}</span>
                            )}
                            {model.released_at && model.knowledge_cutoff && (
                              <span className="mx-1">·</span>
                            )}
                            {model.knowledge_cutoff && (
                              <span>Trained: {formatDate(model.knowledge_cutoff)}</span>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            );
          })}
        </div>

        {/* No results */}
        {sortedCompanies.length === 0 && (
          <div className="text-sm text-ink-muted text-center py-8">
            No models match your filters
          </div>
        )}
      </section>
    </div>
  );
}

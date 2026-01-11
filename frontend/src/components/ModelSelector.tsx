import { useState, useMemo } from 'react';
import type { Model } from '../types';

// Format date as "Jan 2024" or "2024-01" if parsing fails
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr;
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface ModelSelectorProps {
  models: Model[];
  selectedModels: Set<string>;
  onToggleModel: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

type SortOption = 'name' | 'released_at' | 'knowledge_cutoff';

export default function ModelSelector({
  models,
  selectedModels,
  onToggleModel,
  onSelectAll,
  onClearAll,
}: ModelSelectorProps) {
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('released_at');

  // Get unique companies
  const allCompanies = useMemo(() => {
    const companies = new Set<string>();
    for (const model of models) {
      companies.add(model.company);
    }
    return Array.from(companies).sort();
  }, [models]);

  // Filter and sort models
  const filteredModels = useMemo(() => {
    let result = models;

    // Filter by search
    if (searchFilter) {
      const lowerSearch = searchFilter.toLowerCase();
      result = result.filter(
        (m) =>
          m.display_name.toLowerCase().includes(lowerSearch) ||
          m.model_name.toLowerCase().includes(lowerSearch)
      );
    }

    // Filter by company
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
          // Newest first, null dates last
          if (!a.released_at && !b.released_at) return a.display_name.localeCompare(b.display_name);
          if (!a.released_at) return 1;
          if (!b.released_at) return -1;
          return b.released_at.localeCompare(a.released_at);
        }
        if (sortBy === 'knowledge_cutoff') {
          // Most recent cutoff first, null dates last
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

  const toggleCompanySelection = (company: string) => {
    const companyModels = modelsByCompany.get(company) || [];
    const allSelected = companyModels.every((m) => selectedModels.has(m.id));
    for (const model of companyModels) {
      if (allSelected) {
        if (selectedModels.has(model.id)) onToggleModel(model.id);
      } else {
        if (!selectedModels.has(model.id)) onToggleModel(model.id);
      }
    }
  };

  const totalSelected = selectedModels.size;
  const totalFiltered = filteredModels.length;

  return (
    <div className="space-y-4">
      {/* Compact filter/sort controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Search models..."
          className="flex-1 min-w-[150px] px-3 py-1.5 rounded-lg text-sm border border-border focus:border-amber focus:ring-1 focus:ring-amber"
        />

        {/* Company filter dropdown */}
        <div className="relative group">
          <button className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-ink-muted flex items-center gap-1">
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
          <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 z-10 hidden group-hover:block min-w-[150px]">
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

        {/* Select all / Clear */}
        <div className="flex gap-2 text-xs">
          <button onClick={onSelectAll} className="text-amber hover:text-amber-light">
            Select all
          </button>
          <span className="text-border">|</span>
          <button onClick={onClearAll} className="text-ink-muted hover:text-ink-light">
            Clear
          </button>
        </div>
      </div>

      {/* Selection summary */}
      <div className="text-xs text-ink-muted">
        {totalSelected} of {totalFiltered} models selected
      </div>

      {/* Company cards grid - like Home page */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedCompanies.map((company) => {
          const companyModels = modelsByCompany.get(company) || [];
          const selectedCount = companyModels.filter((m) => selectedModels.has(m.id)).length;
          const allSelected = selectedCount === companyModels.length;
          const someSelected = selectedCount > 0 && selectedCount < companyModels.length;

          return (
            <div key={company} className="bg-white border border-border rounded-lg p-4">
              {/* Company header with checkbox */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-ink">{company}</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-ink-muted">
                    {selectedCount}/{companyModels.length}
                  </span>
                  <div
                    onClick={() => toggleCompanySelection(company)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${
                      allSelected
                        ? 'bg-amber border-amber'
                        : someSelected
                          ? 'bg-amber/50 border-amber'
                          : 'border-border hover:border-ink-muted'
                    }`}
                  >
                    {(allSelected || someSelected) && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        {allSelected ? (
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                        ) : (
                          <path d="M5 10h10" stroke="currentColor" strokeWidth={2} />
                        )}
                      </svg>
                    )}
                  </div>
                </label>
              </div>

              {/* Model list */}
              <ul className="space-y-1.5">
                {companyModels.map((model) => (
                  <li key={model.id}>
                    <label
                      className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedModels.has(model.id)
                          ? 'bg-amber-bg'
                          : 'hover:bg-paper-dark'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                          selectedModels.has(model.id) ? 'bg-amber border-amber' : 'border-border'
                        }`}
                      >
                        {selectedModels.has(model.id) && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                          </svg>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedModels.has(model.id)}
                        onChange={() => onToggleModel(model.id)}
                        className="sr-only"
                      />
                      <div className="min-w-0">
                        <div className="text-sm text-ink">{model.display_name}</div>
                        <div className="text-xs text-ink-muted font-mono truncate">
                          {model.model_name}
                        </div>
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
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
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
    </div>
  );
}

import { useState, useMemo } from 'react';
import type { Model } from '../types';

interface ModelSelectorProps {
  models: Model[];
  selectedModels: Set<string>;
  onToggleModel: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

interface CompanyGroupProps {
  company: string;
  models: Model[];
  expanded: boolean;
  onToggleExpand: () => void;
  selectedModels: Set<string>;
  onToggleModel: (id: string) => void;
  onToggleAll: () => void;
}

function CompanyGroup({
  company,
  models,
  expanded,
  onToggleExpand,
  selectedModels,
  onToggleModel,
  onToggleAll,
}: CompanyGroupProps) {
  const selectedCount = models.filter((m) => selectedModels.has(m.id)).length;
  const allSelected = selectedCount === models.length;
  const someSelected = selectedCount > 0 && selectedCount < models.length;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header - click to expand/collapse */}
      <div
        className="flex items-center justify-between px-3 py-2.5 bg-paper-dark cursor-pointer hover:bg-border/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleAll();
            }}
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
          <span className="font-medium text-ink">{company}</span>
          <span className="text-xs text-ink-muted">
            ({selectedCount}/{models.length})
          </span>
        </div>
        <ChevronIcon expanded={expanded} />
      </div>

      {/* Expandable model list */}
      {expanded && (
        <div className="p-2 space-y-1 bg-white">
          {models.map((model) => (
            <label
              key={model.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-paper-dark rounded-lg cursor-pointer transition-colors"
            >
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                  selectedModels.has(model.id) ? 'bg-amber border-amber' : 'border-border'
                }`}
              >
                {selectedModels.has(model.id) && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
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
              <span className="text-sm text-ink">{model.display_name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModelSelector({
  models,
  selectedModels,
  onToggleModel,
  onSelectAll,
  onClearAll,
}: ModelSelectorProps) {
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    new Set(['OpenAI', 'Anthropic', 'Google', 'xAI'])
  );
  const [searchFilter, setSearchFilter] = useState('');

  // Group models by company
  const modelsByCompany = useMemo(() => {
    const groups = new Map<string, Model[]>();
    for (const model of models) {
      const company = model.company;
      if (!groups.has(company)) groups.set(company, []);
      groups.get(company)!.push(model);
    }
    // Sort models within each group by display_name
    for (const [, companyModels] of groups) {
      companyModels.sort((a, b) => a.display_name.localeCompare(b.display_name));
    }
    return groups;
  }, [models]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchFilter) return modelsByCompany;
    const filtered = new Map<string, Model[]>();
    const lowerSearch = searchFilter.toLowerCase();
    for (const [company, companyModels] of modelsByCompany) {
      const matches = companyModels.filter(
        (m) =>
          m.display_name.toLowerCase().includes(lowerSearch) ||
          m.model_name.toLowerCase().includes(lowerSearch)
      );
      if (matches.length > 0) filtered.set(company, matches);
    }
    return filtered;
  }, [modelsByCompany, searchFilter]);

  // Sort companies: prioritize main providers, then alphabetical
  const sortedCompanies = useMemo(() => {
    const priority = ['OpenAI', 'Anthropic', 'Google', 'xAI'];
    const companies = Array.from(filteredGroups.keys());
    return companies.sort((a, b) => {
      const aIndex = priority.indexOf(a);
      const bIndex = priority.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [filteredGroups]);

  const toggleExpand = (company: string) => {
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

  const toggleCompany = (company: string) => {
    const companyModels = filteredGroups.get(company) || [];
    const allSelected = companyModels.every((m) => selectedModels.has(m.id));
    for (const model of companyModels) {
      if (allSelected) {
        // Deselect all in this company
        if (selectedModels.has(model.id)) {
          onToggleModel(model.id);
        }
      } else {
        // Select all in this company
        if (!selectedModels.has(model.id)) {
          onToggleModel(model.id);
        }
      }
    }
  };

  const totalSelected = selectedModels.size;
  const totalModels = models.length;

  return (
    <div className="space-y-3">
      {/* Header with search and select all/clear */}
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter models..."
          className="flex-1 px-3 py-2 rounded-lg text-sm border border-border focus:border-amber focus:ring-1 focus:ring-amber"
        />
        <div className="flex gap-3 text-xs whitespace-nowrap">
          <button onClick={onSelectAll} className="text-amber hover:text-amber-light">
            Select all
          </button>
          <button onClick={onClearAll} className="text-ink-muted hover:text-ink-light">
            Clear
          </button>
        </div>
      </div>

      {/* Selection summary */}
      <div className="text-xs text-ink-muted">
        {totalSelected} of {totalModels} models selected
      </div>

      {/* Company groups */}
      <div className="space-y-2">
        {sortedCompanies.map((company) => (
          <CompanyGroup
            key={company}
            company={company}
            models={filteredGroups.get(company) || []}
            expanded={expandedCompanies.has(company)}
            onToggleExpand={() => toggleExpand(company)}
            selectedModels={selectedModels}
            onToggleModel={onToggleModel}
            onToggleAll={() => toggleCompany(company)}
          />
        ))}
      </div>

      {/* No results message */}
      {sortedCompanies.length === 0 && searchFilter && (
        <div className="text-sm text-ink-muted text-center py-4">
          No models match "{searchFilter}"
        </div>
      )}
    </div>
  );
}

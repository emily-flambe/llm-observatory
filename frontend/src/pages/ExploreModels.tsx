import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Model, ModelsResponse } from '../types';

type ColumnKey =
  | 'company'
  | 'display_name'
  | 'family'
  | 'released_at'
  | 'knowledge_cutoff'
  | 'description'
  | 'context_window'
  | 'max_output_tokens'
  | 'pricing'
  | 'supports_reasoning'
  | 'supports_tool_calls'
  | 'supports_attachments'
  | 'open_weights';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'company', label: 'Company', defaultVisible: true },
  { key: 'display_name', label: 'Display Name', defaultVisible: true },
  { key: 'family', label: 'Family', defaultVisible: true },
  { key: 'released_at', label: 'Released', defaultVisible: true },
  { key: 'knowledge_cutoff', label: 'Knowledge Cutoff', defaultVisible: true },
  { key: 'description', label: 'Description', defaultVisible: true },
  { key: 'context_window', label: 'Context Window', defaultVisible: false },
  { key: 'max_output_tokens', label: 'Max Output', defaultVisible: false },
  { key: 'pricing', label: 'Pricing', defaultVisible: false },
  { key: 'supports_reasoning', label: 'Reasoning', defaultVisible: false },
  { key: 'supports_tool_calls', label: 'Tools', defaultVisible: false },
  { key: 'supports_attachments', label: 'Attachments', defaultVisible: false },
  { key: 'open_weights', label: 'Open Weights', defaultVisible: false },
];

const STORAGE_KEY = 'explore-models-columns';

function loadSavedColumns(): Set<ColumnKey> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ColumnKey[];
      return new Set(parsed);
    }
  } catch {
    // Ignore parse errors
  }
  return new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
}

function saveColumns(columns: Set<ColumnKey>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(columns)));
  } catch {
    // Ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '\u2014';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '\u2014';
  }
}

function formatNumber(num: number | null): string {
  if (num === null || num === undefined) return '\u2014';
  return num.toLocaleString();
}

function formatPricing(input: number | null, output: number | null): string {
  if (input === null && output === null) return '\u2014';
  const inputStr = input !== null ? `$${input.toFixed(2)}` : '\u2014';
  const outputStr = output !== null ? `$${output.toFixed(2)}` : '\u2014';
  return `${inputStr} / ${outputStr}`;
}

function formatBoolean(val: number | null): string {
  if (val === null || val === undefined) return '\u2014';
  return val === 1 ? 'Yes' : 'No';
}

type ReleaseDatePreset = 'any' | 'last6months' | 'lastyear' | 'thisyear' | 'prevyear' | 'older' | 'custom';

interface ReleaseDateFilter {
  preset: ReleaseDatePreset;
  customFrom: string;
  customTo: string;
}

// Get current year for dynamic presets
const CURRENT_YEAR = new Date().getFullYear();

// Parse date string to comparable date string (YYYY-MM-DD) without timezone issues
function toComparableDate(dateStr: string): string {
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  // Otherwise parse and format
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

function getDateRangeForPreset(preset: ReleaseDatePreset): { from: string | null; to: string | null } {
  switch (preset) {
    case 'last6months': {
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      return { from: from.toISOString().split('T')[0], to: null };
    }
    case 'lastyear': {
      const from = new Date();
      from.setFullYear(from.getFullYear() - 1);
      return { from: from.toISOString().split('T')[0], to: null };
    }
    case 'thisyear':
      return { from: `${CURRENT_YEAR}-01-01`, to: `${CURRENT_YEAR}-12-31` };
    case 'prevyear':
      return { from: `${CURRENT_YEAR - 1}-01-01`, to: `${CURRENT_YEAR - 1}-12-31` };
    case 'older':
      return { from: null, to: `${CURRENT_YEAR - 2}-12-31` };
    default:
      return { from: null, to: null };
  }
}

const RELEASE_DATE_OPTIONS: { value: ReleaseDatePreset; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'last6months', label: 'Last 6 months' },
  { value: 'lastyear', label: 'Last year' },
  { value: 'thisyear', label: String(CURRENT_YEAR) },
  { value: 'prevyear', label: String(CURRENT_YEAR - 1) },
  { value: 'older', label: `Before ${CURRENT_YEAR - 1}` },
  { value: 'custom', label: 'Custom...' },
];

function parseModalities(jsonStr: string | null): string[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

// Multi-select dropdown component for column picker and company filter
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (values: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggleValue = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-2 border border-border rounded-lg text-sm bg-white flex items-center gap-2 min-w-[140px]"
      >
        <span className="flex-1 text-left truncate">
          {selected.size === 0 ? label : `${selected.size} selected`}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-20 min-w-[200px] max-h-64 overflow-y-auto">
            {options.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 px-3 py-2 hover:bg-paper cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(option)}
                  onChange={() => toggleValue(option)}
                  className="rounded"
                />
                <span className="truncate">{option}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Column picker dropdown
function ColumnPicker({
  columns,
  visibleColumns,
  onChange,
}: {
  columns: ColumnDef[];
  visibleColumns: Set<ColumnKey>;
  onChange: (columns: Set<ColumnKey>) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggleColumn = (key: ColumnKey) => {
    const next = new Set(visibleColumns);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
    saveColumns(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-2 border border-border rounded-lg text-sm bg-white flex items-center gap-2"
      >
        <span>Columns</span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-20 min-w-[180px] max-h-80 overflow-y-auto">
            {columns.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2 px-3 py-2 hover:bg-paper cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.has(col.key)}
                  onChange={() => toggleColumn(col.key)}
                  className="rounded"
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Release Date dropdown component
function ReleaseDateDropdown({
  value,
  onChange,
}: {
  value: ReleaseDateFilter;
  onChange: (value: ReleaseDateFilter) => void;
}) {
  const [open, setOpen] = useState(false);

  const handlePresetChange = (preset: ReleaseDatePreset) => {
    onChange({ ...value, preset });
    if (preset !== 'custom') {
      setOpen(false);
    }
  };

  const selectedLabel = RELEASE_DATE_OPTIONS.find((o) => o.value === value.preset)?.label || 'Any';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-2 border border-border rounded-lg text-sm bg-white flex items-center gap-2 min-w-[140px]"
      >
        <span className="flex-1 text-left truncate">
          {value.preset === 'any' ? 'Release Date' : selectedLabel}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-20 min-w-[200px]">
            {RELEASE_DATE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePresetChange(option.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-paper ${
                  value.preset === option.value ? 'bg-paper font-medium' : ''
                }`}
              >
                {option.label}
              </button>
            ))}
            {value.preset === 'custom' && (
              <div className="px-3 py-2 border-t border-border space-y-2">
                <div>
                  <label htmlFor="release-date-from" className="text-xs text-ink-muted">From</label>
                  <input
                    id="release-date-from"
                    type="date"
                    value={value.customFrom}
                    onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
                    aria-label="Release date from"
                    className="w-full px-2 py-1 border border-border rounded text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="release-date-to" className="text-xs text-ink-muted">To</label>
                  <input
                    id="release-date-to"
                    type="date"
                    value={value.customTo}
                    onChange={(e) => onChange({ ...value, customTo: e.target.value })}
                    aria-label="Release date to"
                    className="w-full px-2 py-1 border border-border rounded text-sm"
                  />
                </div>
                {value.customFrom && value.customTo && value.customFrom > value.customTo && (
                  <div className="text-xs text-amber">Dates will be swapped when filtering</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Tri-state capability filter: 'both' | 'yes' | 'no'
type CapabilityValue = 'both' | 'yes' | 'no';

function CapabilityFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CapabilityValue;
  onChange: (value: CapabilityValue) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm whitespace-nowrap">
      <span className="text-ink-muted">{label}:</span>
      <div className="flex rounded-md border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => onChange('both')}
          className={`px-2 py-0.5 text-xs ${
            value === 'both'
              ? 'bg-amber text-white'
              : 'bg-white text-ink hover:bg-paper'
          }`}
        >
          Both
        </button>
        <button
          type="button"
          onClick={() => onChange('yes')}
          className={`px-2 py-0.5 text-xs border-l border-border ${
            value === 'yes'
              ? 'bg-amber text-white'
              : 'bg-white text-ink hover:bg-paper'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange('no')}
          className={`px-2 py-0.5 text-xs border-l border-border ${
            value === 'no'
              ? 'bg-amber text-white'
              : 'bg-white text-ink hover:bg-paper'
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

type SortDirection = 'asc' | 'desc';
type SortKey = ColumnKey | 'company_display_name';

function ExpandedRowContent({
  model,
  visibleColumns,
}: {
  model: Model;
  visibleColumns: Set<ColumnKey>;
}) {
  // Show all fields not currently visible as columns
  const hiddenFields: { label: string; value: string }[] = [];

  // Always show model_name (API ID) in expanded view
  hiddenFields.push({ label: 'API ID', value: model.model_name });

  if (!visibleColumns.has('description') && model.description) {
    hiddenFields.push({ label: 'Description', value: model.description });
  }

  if (!visibleColumns.has('family') && model.family) {
    hiddenFields.push({ label: 'Family', value: model.family });
  }

  if (!visibleColumns.has('released_at')) {
    hiddenFields.push({ label: 'Released', value: formatDate(model.released_at) });
  }

  if (!visibleColumns.has('knowledge_cutoff')) {
    hiddenFields.push({ label: 'Knowledge Cutoff', value: formatDate(model.knowledge_cutoff) });
  }

  if (!visibleColumns.has('context_window')) {
    hiddenFields.push({ label: 'Context Window', value: formatNumber(model.context_window) });
  }

  if (!visibleColumns.has('max_output_tokens')) {
    hiddenFields.push({ label: 'Max Output Tokens', value: formatNumber(model.max_output_tokens) });
  }

  if (!visibleColumns.has('pricing')) {
    hiddenFields.push({
      label: 'Pricing (per 1M tokens)',
      value: formatPricing(model.input_price_per_m, model.output_price_per_m),
    });
  }

  if (!visibleColumns.has('supports_reasoning')) {
    hiddenFields.push({ label: 'Supports Reasoning', value: formatBoolean(model.supports_reasoning) });
  }

  if (!visibleColumns.has('supports_tool_calls')) {
    hiddenFields.push({ label: 'Supports Tool Calls', value: formatBoolean(model.supports_tool_calls) });
  }

  if (!visibleColumns.has('supports_attachments')) {
    hiddenFields.push({ label: 'Supports Attachments', value: formatBoolean(model.supports_attachments) });
  }

  if (!visibleColumns.has('open_weights')) {
    hiddenFields.push({ label: 'Open Weights', value: formatBoolean(model.open_weights) });
  }

  // Add modalities
  const inputModalities = parseModalities(model.input_modalities);
  const outputModalities = parseModalities(model.output_modalities);
  if (inputModalities.length > 0) {
    hiddenFields.push({ label: 'Input Modalities', value: inputModalities.join(', ') });
  }
  if (outputModalities.length > 0) {
    hiddenFields.push({ label: 'Output Modalities', value: outputModalities.join(', ') });
  }

  // Provider info
  hiddenFields.push({ label: 'Provider', value: model.provider });
  hiddenFields.push({ label: 'Type', value: model.model_type });
  hiddenFields.push({ label: 'Source', value: model.source });

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {hiddenFields.map(({ label, value }) => (
        <div key={label}>
          <div className="text-xs text-ink-muted">{label}</div>
          <div className="text-sm text-ink">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function ExploreModels() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse URL params for initial state
  const getInitialSearchQuery = () => searchParams.get('q') || '';
  const getInitialCompanies = () => {
    const companies = searchParams.get('companies');
    return companies ? new Set(companies.split(',')) : new Set<string>();
  };
  const getInitialFamilies = () => {
    const families = searchParams.get('families');
    return families ? new Set(families.split(',')) : new Set<string>();
  };
  const getInitialCapabilities = (): {
    reasoning: CapabilityValue;
    tools: CapabilityValue;
    attachments: CapabilityValue;
    openWeights: CapabilityValue;
  } => {
    const parseCapability = (param: string | null): CapabilityValue => {
      if (param === 'yes') return 'yes';
      if (param === 'no') return 'no';
      return 'both';
    };
    return {
      reasoning: parseCapability(searchParams.get('reasoning')),
      tools: parseCapability(searchParams.get('tools')),
      attachments: parseCapability(searchParams.get('attachments')),
      openWeights: parseCapability(searchParams.get('openWeights')),
    };
  };
  const getInitialReleaseDate = (): ReleaseDateFilter => {
    const preset = (searchParams.get('releasePreset') as ReleaseDatePreset) || 'any';
    return {
      preset,
      customFrom: searchParams.get('releaseFrom') || '',
      customTo: searchParams.get('releaseTo') || '',
    };
  };

  // Filter state
  const [searchQuery, setSearchQuery] = useState(getInitialSearchQuery);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(getInitialCompanies);
  const [selectedFamilies, setSelectedFamilies] = useState<Set<string>>(getInitialFamilies);
  const [capabilities, setCapabilities] = useState(getInitialCapabilities);
  const [releaseDate, setReleaseDate] = useState<ReleaseDateFilter>(getInitialReleaseDate);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(loadSavedColumns);

  // Sort state - default to company ASC, then display_name ASC
  const [sortKey, setSortKey] = useState<SortKey>('company_display_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Update URL params when filters change
  const updateUrlParams = useCallback(() => {
    const params = new URLSearchParams();

    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (selectedCompanies.size > 0) params.set('companies', Array.from(selectedCompanies).join(','));
    if (selectedFamilies.size > 0) params.set('families', Array.from(selectedFamilies).join(','));
    if (capabilities.reasoning !== 'both') params.set('reasoning', capabilities.reasoning);
    if (capabilities.tools !== 'both') params.set('tools', capabilities.tools);
    if (capabilities.attachments !== 'both') params.set('attachments', capabilities.attachments);
    if (capabilities.openWeights !== 'both') params.set('openWeights', capabilities.openWeights);
    if (releaseDate.preset !== 'any') {
      params.set('releasePreset', releaseDate.preset);
      if (releaseDate.preset === 'custom') {
        if (releaseDate.customFrom) params.set('releaseFrom', releaseDate.customFrom);
        if (releaseDate.customTo) params.set('releaseTo', releaseDate.customTo);
      }
    }

    setSearchParams(params, { replace: true });
  }, [searchQuery, selectedCompanies, selectedFamilies, capabilities, releaseDate, setSearchParams]);

  useEffect(() => {
    updateUrlParams();
  }, [updateUrlParams]);

  useEffect(() => {
    fetch('/api/models')
      .then(async (res) => {
        const data = (await res.json()) as { error?: string } & ModelsResponse;
        if (!res.ok) throw new Error(data.error || 'Failed to load models');
        return data;
      })
      .then((data) => {
        setModels(data.models || []);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setModels([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Extract unique companies for the filter dropdown
  const companies = useMemo(() => {
    return [...new Set(models.map((m) => m.company))].sort();
  }, [models]);

  // Extract unique families for the filter dropdown
  const families = useMemo(() => {
    return [...new Set(models.map((m) => m.family).filter((f): f is string => !!f))].sort();
  }, [models]);

  // Filter models
  const filteredModels = useMemo(() => {
    let result = models;

    // Filter by company
    if (selectedCompanies.size > 0) {
      result = result.filter((m) => selectedCompanies.has(m.company));
    }

    // Filter by family
    if (selectedFamilies.size > 0) {
      result = result.filter((m) => m.family && selectedFamilies.has(m.family));
    }

    // Filter by capabilities (tri-state: both/yes/no)
    if (capabilities.reasoning === 'yes') {
      result = result.filter((m) => m.supports_reasoning === 1);
    } else if (capabilities.reasoning === 'no') {
      result = result.filter((m) => m.supports_reasoning !== 1);
    }
    if (capabilities.tools === 'yes') {
      result = result.filter((m) => m.supports_tool_calls === 1);
    } else if (capabilities.tools === 'no') {
      result = result.filter((m) => m.supports_tool_calls !== 1);
    }
    if (capabilities.attachments === 'yes') {
      result = result.filter((m) => m.supports_attachments === 1);
    } else if (capabilities.attachments === 'no') {
      result = result.filter((m) => m.supports_attachments !== 1);
    }
    if (capabilities.openWeights === 'yes') {
      result = result.filter((m) => m.open_weights === 1);
    } else if (capabilities.openWeights === 'no') {
      result = result.filter((m) => m.open_weights !== 1);
    }

    // Filter by release date (using string comparison for consistency)
    if (releaseDate.preset !== 'any') {
      if (releaseDate.preset === 'custom') {
        // Custom date range - validate and normalize
        let fromDate = releaseDate.customFrom;
        let toDate = releaseDate.customTo;

        // Swap if from > to (auto-correct invalid range)
        if (fromDate && toDate && fromDate > toDate) {
          [fromDate, toDate] = [toDate, fromDate];
        }

        if (fromDate) {
          result = result.filter((m) => {
            if (!m.released_at) return false;
            const modelDate = toComparableDate(m.released_at);
            return modelDate >= fromDate;
          });
        }
        if (toDate) {
          result = result.filter((m) => {
            if (!m.released_at) return false;
            const modelDate = toComparableDate(m.released_at);
            return modelDate <= toDate;
          });
        }
      } else {
        // Preset date range - uses string comparison
        const { from, to } = getDateRangeForPreset(releaseDate.preset);
        if (from) {
          result = result.filter((m) => {
            if (!m.released_at) return false;
            const modelDate = toComparableDate(m.released_at);
            return modelDate >= from;
          });
        }
        if (to) {
          result = result.filter((m) => {
            if (!m.released_at) return false;
            const modelDate = toComparableDate(m.released_at);
            return modelDate <= to;
          });
        }
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((m) => {
        return (
          m.company.toLowerCase().includes(query) ||
          m.display_name.toLowerCase().includes(query) ||
          m.model_name.toLowerCase().includes(query) ||
          (m.family && m.family.toLowerCase().includes(query)) ||
          (m.description && m.description.toLowerCase().includes(query))
        );
      });
    }

    return result;
  }, [models, selectedCompanies, selectedFamilies, capabilities, releaseDate, searchQuery]);

  // Sort models
  const sortedModels = useMemo(() => {
    const sorted = [...filteredModels];

    sorted.sort((a, b) => {
      let comparison = 0;

      if (sortKey === 'company_display_name') {
        // Default sort: company ASC, then display_name ASC
        comparison = a.company.localeCompare(b.company);
        if (comparison === 0) {
          comparison = a.display_name.localeCompare(b.display_name);
        }
      } else if (sortKey === 'company') {
        comparison = a.company.localeCompare(b.company);
      } else if (sortKey === 'display_name') {
        comparison = a.display_name.localeCompare(b.display_name);
      } else if (sortKey === 'family') {
        const aVal = a.family || '';
        const bVal = b.family || '';
        comparison = aVal.localeCompare(bVal);
      } else if (sortKey === 'released_at') {
        // Nulls sort to end regardless of direction
        if (!a.released_at && !b.released_at) comparison = 0;
        else if (!a.released_at) return 1;
        else if (!b.released_at) return -1;
        else comparison = a.released_at.localeCompare(b.released_at);
      } else if (sortKey === 'knowledge_cutoff') {
        // Nulls sort to end regardless of direction
        if (!a.knowledge_cutoff && !b.knowledge_cutoff) comparison = 0;
        else if (!a.knowledge_cutoff) return 1;
        else if (!b.knowledge_cutoff) return -1;
        else comparison = a.knowledge_cutoff.localeCompare(b.knowledge_cutoff);
      } else if (sortKey === 'description') {
        const aVal = a.description || '';
        const bVal = b.description || '';
        comparison = aVal.localeCompare(bVal);
      } else if (sortKey === 'context_window') {
        const aVal = a.context_window || 0;
        const bVal = b.context_window || 0;
        comparison = aVal - bVal;
      } else if (sortKey === 'max_output_tokens') {
        const aVal = a.max_output_tokens || 0;
        const bVal = b.max_output_tokens || 0;
        comparison = aVal - bVal;
      } else if (sortKey === 'pricing') {
        const aVal = a.input_price_per_m || 0;
        const bVal = b.input_price_per_m || 0;
        comparison = aVal - bVal;
      } else if (sortKey === 'supports_reasoning') {
        const aVal = a.supports_reasoning || 0;
        const bVal = b.supports_reasoning || 0;
        comparison = aVal - bVal;
      } else if (sortKey === 'supports_tool_calls') {
        const aVal = a.supports_tool_calls || 0;
        const bVal = b.supports_tool_calls || 0;
        comparison = aVal - bVal;
      } else if (sortKey === 'supports_attachments') {
        const aVal = a.supports_attachments || 0;
        const bVal = b.supports_attachments || 0;
        comparison = aVal - bVal;
      } else if (sortKey === 'open_weights') {
        const aVal = a.open_weights || 0;
        const bVal = b.open_weights || 0;
        comparison = aVal - bVal;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredModels, sortKey, sortDirection]);

  const handleSort = (key: ColumnKey) => {
    if (sortKey === key) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasActiveFilters =
    selectedCompanies.size > 0 ||
    selectedFamilies.size > 0 ||
    capabilities.reasoning !== 'both' ||
    capabilities.tools !== 'both' ||
    capabilities.attachments !== 'both' ||
    capabilities.openWeights !== 'both' ||
    releaseDate.preset !== 'any' ||
    searchQuery.trim() !== '';

  const clearFilters = () => {
    setSelectedCompanies(new Set());
    setSelectedFamilies(new Set());
    setCapabilities({
      reasoning: 'both',
      tools: 'both',
      attachments: 'both',
      openWeights: 'both',
    });
    setReleaseDate({ preset: 'any', customFrom: '', customTo: '' });
    setSearchQuery('');
  };

  const getSortIndicator = (key: ColumnKey) => {
    if (sortKey !== key && !(sortKey === 'company_display_name' && key === 'company')) return null;
    return sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const renderCellValue = (model: Model, key: ColumnKey): React.ReactNode => {
    switch (key) {
      case 'company':
        return model.company;
      case 'display_name':
        return model.display_name;
      case 'family':
        return model.family || '\u2014';
      case 'released_at':
        return formatDate(model.released_at);
      case 'knowledge_cutoff':
        return formatDate(model.knowledge_cutoff);
      case 'description':
        return model.description ? (
          <span className="line-clamp-2" title={model.description}>
            {model.description}
          </span>
        ) : (
          '\u2014'
        );
      case 'context_window':
        return formatNumber(model.context_window);
      case 'max_output_tokens':
        return formatNumber(model.max_output_tokens);
      case 'pricing':
        return formatPricing(model.input_price_per_m, model.output_price_per_m);
      case 'supports_reasoning':
        return formatBoolean(model.supports_reasoning);
      case 'supports_tool_calls':
        return formatBoolean(model.supports_tool_calls);
      case 'supports_attachments':
        return formatBoolean(model.supports_attachments);
      case 'open_weights':
        return formatBoolean(model.open_weights);
      default:
        return '\u2014';
    }
  };

  const visibleColumnDefs = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-ink">Explore Models</h2>
        <p className="text-sm text-ink-muted mt-1">
          Browse and compare LLM models across providers
        </p>
      </div>

      {/* Filters - Row 1 */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search models..."
          className="flex-1 min-w-[200px] max-w-sm px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber/50"
        />

        <MultiSelect
          label="All Companies"
          options={companies}
          selected={selectedCompanies}
          onChange={setSelectedCompanies}
        />

        <MultiSelect
          label="All Families"
          options={families}
          selected={selectedFamilies}
          onChange={setSelectedFamilies}
        />

        <ColumnPicker
          columns={ALL_COLUMNS}
          visibleColumns={visibleColumns}
          onChange={setVisibleColumns}
        />
      </div>

      {/* Filters - Row 2 */}
      <div className="flex flex-wrap gap-3 items-center">
        <CapabilityFilter
          label="Reasoning"
          value={capabilities.reasoning}
          onChange={(value) => setCapabilities((prev) => ({ ...prev, reasoning: value }))}
        />
        <CapabilityFilter
          label="Tools"
          value={capabilities.tools}
          onChange={(value) => setCapabilities((prev) => ({ ...prev, tools: value }))}
        />
        <CapabilityFilter
          label="Attachments"
          value={capabilities.attachments}
          onChange={(value) => setCapabilities((prev) => ({ ...prev, attachments: value }))}
        />
        <CapabilityFilter
          label="Open Weights"
          value={capabilities.openWeights}
          onChange={(value) => setCapabilities((prev) => ({ ...prev, openWeights: value }))}
        />

        <ReleaseDateDropdown value={releaseDate} onChange={setReleaseDate} />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-20 text-ink-muted">Loading models...</div>
      ) : error ? (
        <div className="text-center py-20">
          <div className="text-error mb-2">Failed to load models</div>
          <div className="text-sm text-ink-muted">{error}</div>
        </div>
      ) : sortedModels.length === 0 ? (
        <div className="text-center py-20 text-ink-muted">
          {hasActiveFilters ? 'No models match the current filters' : 'No models available'}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper border-b border-border">
                  {visibleColumnDefs.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-left font-medium text-ink cursor-pointer hover:bg-paper-dark select-none whitespace-nowrap"
                    >
                      {col.label}
                      {getSortIndicator(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedModels.map((model) => (
                  <React.Fragment key={model.id}>
                    <tr
                      onClick={() => toggleRow(model.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleRow(model.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expandedRows.has(model.id)}
                      className={`border-b border-border hover:bg-paper cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-amber/50 focus:ring-inset ${
                        expandedRows.has(model.id) ? 'bg-paper' : ''
                      }`}
                    >
                      {visibleColumnDefs.map((col) => (
                        <td key={col.key} className="px-4 py-3 text-ink">
                          {renderCellValue(model, col.key)}
                        </td>
                      ))}
                    </tr>
                    {expandedRows.has(model.id) && (
                      <tr className="bg-paper-dark">
                        <td colSpan={visibleColumnDefs.length} className="px-4 py-4">
                          <ExpandedRowContent model={model} visibleColumns={visibleColumns} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-paper border-t border-border text-sm text-ink-muted">
            {sortedModels.length} model{sortedModels.length !== 1 ? 's' : ''}
            {hasActiveFilters && ` (filtered from ${models.length})`}
          </div>
        </div>
      )}
    </div>
  );
}

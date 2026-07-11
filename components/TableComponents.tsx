import React, { useState, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Filter, X } from 'lucide-react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export const useSortableTable = <T,>(data: T[], defaultSortKey?: string) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: defaultSortKey || '',
    direction: null,
  });

  const [filters, setFilters] = useState<Record<string, string>>({});

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      return Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        const itemValue = String((item as any)[key] ?? '').toLowerCase();
        return itemValue.includes(String(value).toLowerCase());
      });
    });
  }, [data, filters]);

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return filteredData;
    }

    return [...filteredData].sort((a: any, b: any) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === bValue) return 0;
      
      // Handle undefined/null
      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;

      // Numeric sort
      if (typeof aValue === 'number' && typeof bValue === 'number') {
         return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      // String sort
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  const requestSort = (key: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
        direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const setFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const selectAllFiltered = useCallback((isSelectAll: boolean, getId: (item: T) => string) => {
    if (isSelectAll) {
      const allIds = filteredData.map(getId);
      setSelectedIds(new Set(allIds));
    } else {
      setSelectedIds(new Set());
    }
  }, [filteredData]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return { 
    sortedData, 
    requestSort, 
    sortConfig, 
    filters, 
    setFilter, 
    clearFilters,
    selectedIds,
    toggleSelection,
    selectAllFiltered,
    clearSelection,
    filteredData
  };
};

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSort: SortConfig;
  onSort: (key: string) => void;
  className?: string;
  filterValue?: string;
  onFilter?: (key: string, value: string) => void;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({ 
  label, 
  sortKey, 
  currentSort, 
  onSort, 
  className = "",
  filterValue,
  onFilter
}) => {
  const isActive = currentSort.key === sortKey;
  const isFilterActive = !!filterValue;
  const [showFilter, setShowFilter] = useState(false);
  
  return (
    <th 
      className={`px-4 py-3 text-left align-top bg-inherit border-b border-inherit sticky top-0 z-20 shadow-sm ${className}`}
    >
      <div className="flex flex-col gap-2">
        <div 
          className="flex items-center justify-between gap-2 group cursor-pointer select-none" 
          onClick={() => onSort(sortKey)}
        >
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{label}</span>
          <div className="flex items-center gap-1">
             <span className="text-gray-400">
                 {isActive ? (
                     currentSort.direction === 'asc' ? <ChevronUp size={14} className="text-brand-600" /> : <ChevronDown size={14} className="text-brand-600" />
                 ) : (
                     <ChevronsUpDown size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                 )}
             </span>
             {onFilter && (
                <div 
                    onClick={(e) => { e.stopPropagation(); setShowFilter(!showFilter); }}
                    className={`p-1 rounded hover:bg-black/5 transition-colors ${isFilterActive || showFilter ? 'text-brand-600 bg-brand-50' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}
                >
                    <Filter size={12} />
                </div>
             )}
          </div>
        </div>
        
        {((showFilter || isFilterActive) && onFilter) && (
            <div className="relative animate-in fade-in slide-in-from-top-1">
                <input 
                    type="text" 
                    value={filterValue || ''}
                    onChange={(e) => onFilter(sortKey, e.target.value)}
                    placeholder="Filter..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-brand-500 outline-none font-normal text-gray-700 bg-white"
                    autoFocus={!filterValue}
                    onClick={(e) => e.stopPropagation()}
                />
                {filterValue && (
                    <button 
                        onClick={() => onFilter(sortKey, '')}
                        className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                    >
                        <X size={10} />
                    </button>
                )}
            </div>
        )}
      </div>
    </th>
  );
};

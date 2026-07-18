import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { Download, Search, Trash2, Database, ChevronLeft, ChevronRight, RefreshCw, Loader2, Filter, X, Save, Plus, Layers } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';
import { useSortableTable, SortableHeader } from '../components/TableComponents';
import { BulkActionsToolbar } from '../components/BulkActionsToolbar';
import { formatDateTime } from '../utils/formatting';
import { loadAllArgosPositions, loadAllPositions, deleteArgosPositions, deleteCoordinateRecord, getArgosTransmitterIds, saveDocument, bulkDeleteRecords, bulkUpdateRecords } from '../services/firestoreService';
import { CustomSelect } from '../components/CustomSelect';
import Draggable from 'react-draggable';
import { ArgosMessage } from '../types';

type CollectionMode = 'argos_positions' | 'positions' | 'all';
type DateRangeType = 'latest' | '7d' | '30d' | 'custom';

export const ArgosData = () => {
  const { 
    timeZone,
    isArgosModalOpen: isModalOpen,
    setIsArgosModalOpen: setIsModalOpen,
    editingRecordId,
    setEditingRecordId
  } = useAppStore();

  const [formData, setFormData] = useState<Partial<ArgosMessage>>({});
  const nodeRef = useRef<HTMLDivElement>(null);

  // Data state — loaded directly, not from store
  const [allData, setAllData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Collection mode
  const [collectionMode, setCollectionMode] = useState<CollectionMode>('all');

  // Pagination & Filtering state
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [isConfirming, setIsConfirming] = useState(false);

  // Date Range Filter State
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [historyPreset, setHistoryPreset] = useState('latest');
  const [historyMode, setHistoryMode] = useState<'preset' | 'custom'>('preset');
  const [selectedTransmitterIds, setSelectedTransmitterIds] = useState<string[]>([]);
  const [locationAccuracy, setLocationAccuracy] = useState('All');
  const [filterLocationType, setFilterLocationType] = useState('All');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [customDates, setCustomDates] = useState({ 
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });

  // Load data from Firebase
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let data: any[] = [];
      let sDate: Date | undefined;
      let eDate: Date | undefined;

      if (historyMode === 'preset' && historyPreset === 'latest') {
        const tIds = selectedTransmitterIds.length > 0 ? selectedTransmitterIds : await getArgosTransmitterIds();
        if (collectionMode === 'argos_positions') {
          const { loadLatestArgosPositionsPerTransmitter } = await import('../services/firestoreService');
          const latestArgos = await loadLatestArgosPositionsPerTransmitter(tIds);
          data = latestArgos.map(d => ({ _collection: 'argos_positions', ...d }));
        } else if (collectionMode === 'positions') {
          const { loadLatestPositionsPerTransmitter } = await import('../services/firestoreService');
          const latestPos = await loadLatestPositionsPerTransmitter(tIds);
          data = latestPos.map(d => ({ _collection: 'positions', ...d }));
        } else {
          const { loadLatestArgosPositionsPerTransmitter, loadLatestPositionsPerTransmitter } = await import('../services/firestoreService');
          const [argos, pos] = await Promise.all([
            loadLatestArgosPositionsPerTransmitter(tIds),
            loadLatestPositionsPerTransmitter(tIds)
          ]);
          data = [
            ...argos.map(d => ({ _collection: 'argos_positions', ...d })), 
            ...pos.map(d => ({ _collection: 'positions', ...d }))
          ];
        }
      } else {
        if (historyMode === 'preset') {
          if (historyPreset === '24h') {
            sDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          } else if (historyPreset === '7d') {
            sDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          } else if (historyPreset === '30d') {
            sDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          } else if (historyPreset === '1y') {
            sDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          }
          eDate = new Date();
        } else if (historyMode === 'custom' && customDates.start && customDates.end) {
          sDate = new Date(customDates.start);
          eDate = new Date(customDates.end);
          eDate.setHours(23, 59, 59);
        }

        if (collectionMode === 'argos_positions') {
          data = await loadAllArgosPositions(sDate, eDate);
        } else if (collectionMode === 'positions') {
          data = await loadAllPositions(sDate, eDate);
        } else {
          const [argos, pos] = await Promise.all([loadAllArgosPositions(sDate, eDate), loadAllPositions(sDate, eDate)]);
          data = [...argos, ...pos];
        }
      }

      // Apply Filter Modal client-side filtering
      if (selectedTransmitterIds.length > 0) {
        data = data.filter(d => selectedTransmitterIds.includes(String(d.platformId || d.transmitter_id || '')));
      }

      if (filterLocationType === 'GPS') {
        data = data.filter(d => {
          const lc = d.lc || '';
          return lc.trim() === '' || (!['0','1','2','3','A','B','Z'].includes(lc));
        });
      } else if (filterLocationType === 'Doppler') {
        data = data.filter(d => {
          const lc = d.lc || '';
          return ['0','1','2','3','A','B','Z'].includes(lc);
        });
      }

      setAllData(data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [collectionMode, historyMode, historyPreset, customDates, selectedTransmitterIds, filterLocationType]);

  // Load on mount and when collection changes
  useEffect(() => {
    loadData();
    getArgosTransmitterIds().then(ids => setAvailablePlatforms(ids));
  }, [loadData]);

  useEffect(() => {
    if (isModalOpen) {
      if (editingRecordId) {
        const p = allData.find(x => x.id === editingRecordId);
        if (p) setFormData(p);
      } else {
        setFormData({
          programId: '',
          platformId: '',
          timestamp: new Date().toISOString(),
          lat: '0',
          lon: '0',
          lc: '3',
          msgType: 'ds',
          satellite: 'Manual',
          rawData: ''
        });
      }
    }
  }, [isModalOpen, editingRecordId, allData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingRecordId || `argos-${Date.now()}`;
    const newPos: ArgosMessage = {
      id,
      ...formData as ArgosMessage
    };
    await saveDocument('argos_positions', id, newPos);
    setIsModalOpen(false);
    await loadData();
  };

  // Pre-filter by platform


  // Global search — search across ALL fields
  const searchableData = searchQuery
    ? allData.filter(row => {
        const q = searchQuery.toLowerCase();
        return (
          String(row.platformId || '').toLowerCase().includes(q) ||
          String(row.programId || '').toLowerCase().includes(q) ||
          String(row.lc || '').toLowerCase().includes(q) ||
          String(row.msgType || '').toLowerCase().includes(q) ||
          String(row.satellite || '').toLowerCase().includes(q) ||
          String(row.lat || '').includes(q) ||
          String(row.lon || '').includes(q) ||
          String(row.locationType || '').toLowerCase().includes(q) ||
          String(row._collection || '').toLowerCase().includes(q)
        );
      })
    : allData;

  // Apply sorting, column filtering, and selection
  const { 
    sortedData, 
    requestSort, 
    sortConfig, 
    filters, 
    setFilter, 
    selectedIds,
    toggleSelection,
    selectAllFiltered,
    clearSelection,
    filteredData 
  } = useSortableTable<any>(searchableData, 'timestamp');

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPageIndex(0);
  }, ['', searchQuery, filters, rowsPerPage]);

  const totalRecords = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  
  // Client-side pagination
  const startIndex = currentPageIndex * rowsPerPage;
  const paginatedData = sortedData.slice(startIndex, startIndex + rowsPerPage);

  const handleNextPage = () => {
    if (currentPageIndex < totalPages - 1) setCurrentPageIndex(prev => prev + 1);
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) setCurrentPageIndex(prev => prev - 1);
  };

  const handleRefresh = async () => {
    await loadData();
    getArgosTransmitterIds().then(ids => setAvailablePlatforms(ids));
  };

  const handleExport = () => {
    exportToCSV(sortedData, 'Argos_Firebase_Data');
  };

  const handleClear = async () => {
    if (isConfirming) {
      await deleteArgosPositions('');
      handleRefresh();
      setIsConfirming(false);
    } else {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000);
    }
  };

  const handleDeleteRow = async (row: any) => {
    if (window.confirm("Are you sure you want to permanently delete this coordinate from the database?")) {
      const col = row._collection || 'argos_positions';
      await bulkDeleteRecords(col, [row.id]);
      await loadData();
    }
  };

  // Bulk Handlers — group by collection
  const handleBulkDelete = async (ids: string[]) => {
    // Separate IDs by collection
    const argosIds: string[] = [];
    const posIds: string[] = [];
    ids.forEach(id => {
      const row = allData.find(r => r.id === id);
      if (row?._collection === 'positions') posIds.push(id);
      else argosIds.push(id);
    });
    if (argosIds.length > 0) await bulkDeleteRecords('argos_positions', argosIds);
    if (posIds.length > 0) await bulkDeleteRecords('positions', posIds);
    await loadData();
  };

  const handleBulkReplace = async (ids: string[], field: string, value: string) => {
    const argosIds: string[] = [];
    const posIds: string[] = [];
    ids.forEach(id => {
      const row = allData.find(r => r.id === id);
      if (row?._collection === 'positions') posIds.push(id);
      else argosIds.push(id);
    });
    if (argosIds.length > 0) await bulkUpdateRecords('argos_positions', argosIds, { [field]: value });
    if (posIds.length > 0) await bulkUpdateRecords('positions', posIds, { [field]: value });
    await loadData();
  };

  // Row click handler — toggle selection
  const handleRowClick = (e: React.MouseEvent, rowId: string) => {
    // Don't toggle if clicking on a button or input
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;
    toggleSelection(rowId);
  };

  const isAllSelected = paginatedData.length > 0 && paginatedData.every(r => selectedIds.has(r.id));
  const isSomeSelected = paginatedData.some(r => selectedIds.has(r.id));

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col relative">
      <BulkActionsToolbar
        selectedIds={Array.from(selectedIds)}
        onClearSelection={clearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkReplace={handleBulkReplace}
        availableFields={[
          { key: 'lat', label: 'Latitude' },
          { key: 'lon', label: 'Longitude' },
          { key: 'lc', label: 'Location Class (LC)' },
          { key: 'locationType', label: 'Location Type' },
          { key: 'platformId', label: 'Platform ID' },
          { key: 'satellite', label: 'Satellite' }
        ]}
      />

      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Database Manager</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
             Firebase • {allData.length.toLocaleString()} records loaded
             {collectionMode === 'all' ? ' (argos_positions + positions)' : ` (${collectionMode})`}
          </p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-lg text-sm font-medium hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters + Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-4 flex flex-col gap-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
               {/* Collection Switcher */}
               <div className="flex items-center gap-2">
                 <Layers size={14} className="text-gray-400" />
                 <div className="flex bg-gray-100 dark:bg-slate-900 rounded-lg p-0.5">
                   <button 
                     onClick={() => setCollectionMode('all')}
                     className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${collectionMode === 'all' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                   >
                     All Collections
                   </button>
                   <button 
                     onClick={() => setCollectionMode('argos_positions')}
                     className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${collectionMode === 'argos_positions' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                   >
                     Argos Raw
                   </button>
                   <button 
                     onClick={() => setCollectionMode('positions')}
                     className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${collectionMode === 'positions' ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                   >
                     Map Positions
                   </button>
                 </div>
               </div>

               {/* Advanced Filters Button */}
               <div className="relative">
                 <button 
                   onClick={() => setFilterOpen(!isFilterOpen)}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ${isFilterOpen ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-400' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                 >
                   <Filter size={16} />
                   Advanced Filters
                 </button>
               </div>

               {/* Search */}
               <div className="relative flex-1 max-w-md">
                 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                 <input 
                     type="text" 
                     placeholder="Search all records (coordinates, ID, satellite...)" 
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                 />
               </div>
               {/* Actions */}
               <div className="flex gap-2">
                   <button 
                      onClick={handleClear}
                      className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${isConfirming ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'}`}
                   >
                       <Trash2 size={14} />
                       {isConfirming ? 'Confirm Clear?' : 'Clear All'}
                   </button>
                   <button 
                      onClick={handleExport}
                      className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-600 dark:text-gray-300"
                   >
                       <Download size={14} /> Export CSV
                   </button>
               </div>
          </div>

          {/* Active filter count */}
          {(Object.values(filters).some(v => v) || searchQuery || '') && (
            <div className="flex items-center gap-2 text-xs text-brand-600 dark:text-brand-400">
              <Filter size={12} />
              <span className="font-medium">{totalRecords.toLocaleString()} of {allData.length.toLocaleString()} records match your filters</span>
              {selectedIds.size > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-brand-100 dark:bg-brand-900/30 rounded font-bold">
                  {selectedIds.size} selected
                </span>
              )}
            </div>
          )}
      </div>

      {/* Table Container */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden flex-1 relative">
          <div className="overflow-auto flex-1 relative">
            {isLoading && allData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400">
                <Loader2 size={32} className="mb-2 animate-spin text-brand-500" />
                <p>Loading complete database...</p>
                <p className="text-xs mt-1">This may take a moment for large datasets.</p>
              </div>
            ) : allData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400">
                <Database size={32} className="mb-2 opacity-50" />
                <p>No records found.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                      {/* Sticky checkbox column */}
                      <th className="px-3 py-3 w-10 sticky left-0 top-0 bg-gray-100 dark:bg-slate-900 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <input 
                          type="checkbox" 
                          checked={isAllSelected}
                          ref={el => { if (el) el.indeterminate = isSomeSelected && !isAllSelected; }}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllFiltered(true, (item) => item.id);
                            } else {
                              clearSelection();
                            }
                          }}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                        />
                      </th>
                      {/* Source collection indicator */}
                      {collectionMode === 'all' && (
                        <SortableHeader label="Source" sortKey="_collection" currentSort={sortConfig} onSort={requestSort} filterValue={filters['_collection']} onFilter={setFilter} />
                      )}
                      <SortableHeader label="Device ID" sortKey="platformId" currentSort={sortConfig} onSort={requestSort} filterValue={filters['platformId']} onFilter={setFilter} />
                      <SortableHeader label="Program ID" sortKey="programId" currentSort={sortConfig} onSort={requestSort} filterValue={filters['programId']} onFilter={setFilter} />
                      <SortableHeader label="Location Class" sortKey="lc" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lc']} onFilter={setFilter} />
                      <SortableHeader label="Location Type" sortKey="locationType" currentSort={sortConfig} onSort={requestSort} filterValue={filters['locationType']} onFilter={setFilter} />
                      <SortableHeader label="Msg Type" sortKey="msgType" currentSort={sortConfig} onSort={requestSort} filterValue={filters['msgType']} onFilter={setFilter} />
                      <SortableHeader label="Doppler Error" sortKey="dopplerError" currentSort={sortConfig} onSort={requestSort} filterValue={filters['dopplerError']} onFilter={setFilter} />
                      <SortableHeader label="Location Date" sortKey="timestamp" currentSort={sortConfig} onSort={requestSort} filterValue={filters['timestamp']} onFilter={setFilter} />
                      <SortableHeader label="Latitude" sortKey="lat" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lat']} onFilter={setFilter} />
                      <SortableHeader label="Longitude" sortKey="lon" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lon']} onFilter={setFilter} />
                      <SortableHeader label="Satellite" sortKey="satellite" currentSort={sortConfig} onSort={requestSort} filterValue={filters['satellite']} onFilter={setFilter} />
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right sticky top-0 bg-gray-100 dark:bg-slate-900 z-20 shadow-sm">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                 {paginatedData.map((row: any, idx: number) => {
                      const rawLc = row.lc || '';
                      const dopplerErr = String(row.dopplerError || '');
                      let derivedLc = rawLc;
                      let derivedLocationType = row.locationType || '';
                      if (['0', '1', '2', '3', 'A', 'B', 'Z'].includes(rawLc)) derivedLocationType = 'Doppler';
                      if (dopplerErr === '0' && (!rawLc || rawLc.trim() === '')) { derivedLc = 'GPS'; derivedLocationType = 'GPS'; }

                      const isSelected = selectedIds.has(row.id);
                      const isPositionsCol = row._collection === 'positions';

                      return (
                        <tr 
                          key={row.id || idx} 
                          onClick={(e) => handleRowClick(e, row.id)}
                          className={`transition-colors cursor-pointer group ${isSelected ? 'bg-brand-50 dark:bg-brand-900/20 ring-1 ring-inset ring-brand-300 dark:ring-brand-700' : 'hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                        >
                          {/* Sticky checkbox */}
                          <td className={`px-3 py-2.5 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors ${isSelected ? 'bg-brand-50 dark:bg-brand-900' : 'bg-white dark:bg-slate-900 group-hover:bg-gray-50 dark:group-hover:bg-slate-800'}`}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelection(row.id)}
                              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                            />
                          </td>
                          {/* Source badge */}
                          {collectionMode === 'all' && (
                            <td className="px-4 py-2.5 text-xs">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isPositionsCol ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'}`}>
                                {isPositionsCol ? 'MAP' : 'ARGOS'}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white">{row.platformId}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.programId}</td>
                          <td className="px-4 py-2.5 text-sm">
                              {derivedLc && (
                                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      derivedLc === 'GPS' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                      ['3','2','1'].includes(derivedLc) ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 
                                      ['A','B'].includes(derivedLc) ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 
                                      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                  }`}>
                                      {derivedLc}
                                  </span>
                              )}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{derivedLocationType}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.msgType}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.dopplerError}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDateTime(row.timestamp, timeZone)}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lat}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lon}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.satellite}</td>
                          <td className="px-4 py-2.5 text-sm text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteRow(row); }}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                              title="Delete coordinate"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="bg-gray-50 dark:bg-slate-900 px-6 py-3 border-t border-gray-200 dark:border-slate-700 flex flex-wrap gap-3 items-center justify-between flex-shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {Math.min(startIndex + 1, totalRecords)}-{Math.min(startIndex + rowsPerPage, totalRecords)} of {totalRecords.toLocaleString()} filtered records
                  {selectedIds.size > 0 && <span className="ml-2 font-bold text-brand-600">• {selectedIds.size} selected</span>}
              </span>
              
              <div className="flex items-center gap-2 overflow-visible">
                  <button 
                    onClick={handlePrevPage}
                    disabled={currentPageIndex === 0}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <ChevronLeft size={16} className="text-gray-600 dark:text-gray-400" />
                  </button>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Page {currentPageIndex + 1} of {totalPages}
                  </span>
                  <button 
                    onClick={handleNextPage}
                    disabled={currentPageIndex >= totalPages - 1}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
                  </button>
                  
                  <CustomSelect 
                    value={rowsPerPage.toString()}
                    onChange={(val) => setRowsPerPage(Number(val))}
                    className="ml-2 w-28"
                    menuPlacement="top"
                    buttonClassName="px-2 py-0.5 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px]"
                    options={[
                      { value: '50', label: '50' },
                      { value: '100', label: '100' },
                      { value: '500', label: '500' },
                      { value: '2000', label: '2000' }
                    ]}
                  />
              </div>
          </div>
      </div>

      {/* Dark Mode Filters Modal */}
      {isFilterOpen && (
        <div className="absolute top-[200px] left-1/2 -translate-x-1/2 z-[500] w-full max-w-md bg-[#0f172a] rounded-xl shadow-2xl border border-slate-700/50 flex flex-col font-sans overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-[#0f172a]">
                <h3 className="text-lg font-bold text-white">Filters</h3>
                <button onClick={() => setFilterOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="p-4 flex justify-end bg-[#0f172a]">
                <button 
                    onClick={() => {
                        setHistoryMode('preset');
                        setHistoryPreset('latest');
                        setSelectedTransmitterIds([]);
                        setFilterLocationType('All');
                        setLocationAccuracy('All');
                        setDeviceSearchQuery('');
                    }}
                    className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                    <RefreshCw size={12} /> Reset filters
                </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh] bg-[#0f172a]">
                {/* Period Filter */}
                <div className="bg-[#1e293b] rounded-lg p-4 border border-slate-700/50">
                    <label className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        What period do you want to work on? (UTC)
                    </label>
                    <div className="flex flex-col gap-3">
                        <select 
                            value={historyMode === 'preset' ? historyPreset : 'custom'}
                            onChange={(e) => {
                                if (e.target.value === 'custom') setHistoryMode('custom');
                                else { setHistoryMode('preset'); setHistoryPreset(e.target.value); }
                            }}
                            className="w-full bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                        >
                            <option value="latest">Latest Only (2 positions)</option>
                            <option value="24h">Last 24h</option>
                            <option value="7d">Last 7d</option>
                            <option value="30d">Last 30d</option>
                            <option value="1y">Last 1y</option>
                            <option value="custom">Custom</option>
                        </select>
                        {historyMode === 'custom' && (
                            <div className="flex items-center gap-2 mt-2">
                                <input 
                                    type="date" 
                                    value={customDates.start}
                                    onChange={e => setCustomDates(p => ({ ...p, start: e.target.value }))}
                                    className="flex-1 bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                                />
                                <input 
                                    type="date" 
                                    value={customDates.end}
                                    onChange={e => setCustomDates(p => ({ ...p, end: e.target.value }))}
                                    className="flex-1 bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Devices Filter */}
                <div className="bg-[#1e293b] rounded-lg p-4 border border-slate-700/50">
                    <label className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Devices
                    </label>
                    <div className="flex bg-[#0f172a] p-1 rounded-lg mb-4">
                        <button className="flex-1 py-1.5 px-3 rounded-md bg-emerald-400 text-slate-900 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                            Unitary device
                        </button>
                        <button className="flex-1 py-1.5 px-3 rounded-md text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                            <Layers size={12} />
                            Device group(s)
                        </button>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-400 mb-1 block">Choose devices</label>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Search or copy and paste a list of device IDs"
                                value={deviceSearchQuery}
                                onChange={e => setDeviceSearchQuery(e.target.value)}
                                className="w-full bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2.5 outline-none focus:border-brand-500"
                            />
                        </div>
                        
                        <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
                            {availablePlatforms
                                .filter(id => id.toLowerCase().includes(deviceSearchQuery.toLowerCase()))
                                .map(id => (
                                <div 
                                    key={id}
                                    onClick={() => setSelectedTransmitterIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])}
                                    className={`px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center justify-between transition-colors ${selectedTransmitterIds.includes(id) ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'text-slate-300 hover:bg-slate-700'}`}
                                >
                                    PTT {id}
                                    {selectedTransmitterIds.includes(id) && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Location Accuracy Filter */}
                <div className="bg-[#1e293b] rounded-lg p-4 border border-slate-700/50">
                    <label className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Location accuracy
                    </label>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-slate-400 mb-1 block">Location Type</label>
                            <select 
                                value={filterLocationType}
                                onChange={e => setFilterLocationType(e.target.value)}
                                className="w-full bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                            >
                                <option value="All">Select... (All)</option>
                                <option value="GPS">GPS Only</option>
                                <option value="Doppler">Doppler Only</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-400 mb-1 block">Error radius (for Doppler positions only)</label>
                            <select 
                                value={locationAccuracy}
                                onChange={e => setLocationAccuracy(e.target.value)}
                                className="w-full bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                            >
                                <option value="All">All</option>
                                <option value="high">High Accuracy (&lt; 250m)</option>
                                <option value="medium">Medium Accuracy (250m - 1500m)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#0f172a] border-t border-slate-700/50 flex justify-end gap-3">
                <button 
                    onClick={() => setFilterOpen(false)}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={() => {
                        loadData();
                        setFilterOpen(false);
                    }}
                    className="px-5 py-2 rounded-lg text-sm font-bold bg-emerald-400 text-slate-900 hover:bg-emerald-300 transition-colors shadow-lg shadow-emerald-400/20"
                >
                    Apply
                </button>
            </div>
        </div>
      )}

       {/* Add/Edit Argos Modal */}
       {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          {/* @ts-ignore */}
          <Draggable handle=".modal-handle" nodeRef={nodeRef}>
            <div ref={nodeRef} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col">
              <div className="modal-handle cursor-move px-6 py-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editingRecordId ? 'Edit Argos Record' : 'Add Manual Argos Record'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[70vh]">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Platform ID</label>
                      <input type="text" required value={formData.platformId || ''} onChange={e => setFormData({...formData, platformId: e.target.value})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Timestamp</label>
                      <input type="datetime-local" step="1" required value={formData.timestamp ? formData.timestamp.substring(0, 19) : ''} onChange={e => setFormData({...formData, timestamp: new Date(e.target.value).toISOString()})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude</label>
                      <input type="text" required value={formData.lat || ''} onChange={e => setFormData({...formData, lat: e.target.value})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude</label>
                      <input type="text" required value={formData.lon || ''} onChange={e => setFormData({...formData, lon: e.target.value})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Location Class (LC)</label>
                      <input type="text" required value={formData.lc || ''} onChange={e => setFormData({...formData, lc: e.target.value})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Program ID</label>
                      <input type="text" value={formData.programId || ''} onChange={e => setFormData({...formData, programId: e.target.value})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Raw Data (Optional)</label>
                    <textarea rows={3} value={formData.rawData || ''} onChange={e => setFormData({...formData, rawData: e.target.value})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500 font-mono"></textarea>
                  </div>
                </form>
              </div>

              <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3 flex-shrink-0">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                  <button type="button" onClick={handleSubmit} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 flex items-center gap-2">
                    <Save size={16} /> Save Record
                  </button>
              </div>
            </div>
          </Draggable>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { Download, Search, Trash2, Database, ChevronLeft, ChevronRight, RefreshCw, Loader2, Filter } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';
import { useSortableTable, SortableHeader } from '../components/TableComponents';
import { formatDateTime } from '../utils/formatting';
import { loadArgosPositions, getArgosTransmitterIds, getArgosPositionCount, deleteArgosPositions } from '../services/firestoreService';
import type { DocumentSnapshot } from 'firebase/firestore';

export const ArgosData = () => {
  const { timeZone } = useAppStore();

  // Firebase data state
  const [firebaseData, setFirebaseData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [pageHistory, setPageHistory] = useState<(DocumentSnapshot | null)[]>([null]); // Stack of page cursors
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [isConfirming, setIsConfirming] = useState(false);

  // Load available platform IDs on mount
  useEffect(() => {
    getArgosTransmitterIds().then(ids => setAvailablePlatforms(ids));
  }, []);

  // Load data from Firebase
  const loadData = useCallback(async (cursor: DocumentSnapshot | null = null) => {
    setIsLoading(true);
    try {
      const result = await loadArgosPositions({
        platformId: platformFilter || undefined,
        pageSize: rowsPerPage,
        lastDocument: cursor || undefined,
      });
      setFirebaseData(result.data);
      setLastDoc(result.lastDoc);
      setTotalRecords(result.totalEstimate);
    } catch (err) {
      console.error('[ArgosData] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [platformFilter, rowsPerPage]);

  // Reload on filter change
  useEffect(() => {
    setCurrentPageIndex(0);
    setPageHistory([null]);
    loadData(null);
  }, [platformFilter, rowsPerPage, loadData]);

  // Client-side search on loaded page
  const filteredData = searchQuery
    ? firebaseData.filter(row =>
        String(row.platformId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(row.programId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(row.lc || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(row.msgType || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(row.satellite || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : firebaseData;

  // Apply sorting
  const { sortedData, requestSort, sortConfig, filters, setFilter, clearFilters } = useSortableTable(filteredData, 'timestamp');

  // Pagination handlers
  const handleNextPage = async () => {
    if (!lastDoc) return;
    const newHistory = [...pageHistory];
    if (currentPageIndex + 1 >= newHistory.length) {
      newHistory.push(lastDoc);
    }
    setPageHistory(newHistory);
    setCurrentPageIndex(currentPageIndex + 1);
    await loadData(lastDoc);
  };

  const handlePrevPage = async () => {
    if (currentPageIndex <= 0) return;
    const newIndex = currentPageIndex - 1;
    setCurrentPageIndex(newIndex);
    await loadData(pageHistory[newIndex]);
  };

  // Refresh
  const handleRefresh = () => {
    setCurrentPageIndex(0);
    setPageHistory([null]);
    loadData(null);
    getArgosTransmitterIds().then(ids => setAvailablePlatforms(ids));
  };

  // Export
  const handleExport = () => {
    exportToCSV(sortedData, 'Argos_Firebase_Data');
  };

  // Clear
  const handleClear = async () => {
    if (isConfirming) {
      setIsLoading(true);
      await deleteArgosPositions(platformFilter || undefined);
      handleRefresh();
      setIsConfirming(false);
    } else {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Argos Database</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
             Connected to Firebase • {totalRecords.toLocaleString()} total records
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
               {/* Search */}
               <div className="relative flex-1 max-w-md">
                 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                 <input 
                     type="text" 
                     placeholder="Search this page..." 
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                 />
               </div>

               {/* Platform Filter */}
               <div className="flex items-center gap-2">
                 <Filter size={14} className="text-gray-400" />
                 <select
                   value={platformFilter}
                   onChange={(e) => setPlatformFilter(e.target.value)}
                   className="text-sm border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 min-w-[160px]"
                 >
                   <option value="">All Transmitters</option>
                   {availablePlatforms.map(id => (
                     <option key={id} value={id}>{id}</option>
                   ))}
                 </select>
               </div>
               
               {/* Actions */}
               <div className="flex gap-2">
                   <button 
                      onClick={handleClear}
                      className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${isConfirming ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'}`}
                   >
                       <Trash2 size={14} />
                       {isConfirming ? 'Confirm Clear?' : platformFilter ? `Clear ${platformFilter}` : 'Clear All'}
                   </button>
                   <button 
                      onClick={handleExport}
                      className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-600 dark:text-gray-300"
                   >
                       <Download size={14} /> Export CSV
                   </button>
               </div>
          </div>
      </div>

      {/* Table Container */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden flex-1">
          <div className="overflow-auto flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400">
                <Loader2 size={32} className="mb-2 animate-spin text-brand-500" />
                <p>Loading from Firebase...</p>
              </div>
            ) : sortedData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400">
                <Database size={32} className="mb-2 opacity-50" />
                <p>No records found.</p>
                <p className="text-xs mt-1">Run Argos API ingestion to populate the database.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {sortedData.map((row: any, idx: number) => {
                      const displayLc = row.lc || '';
                      return (
                        <tr key={row.id || idx} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white">{row.platformId}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.programId}</td>
                          <td className="px-4 py-2.5 text-sm">
                              {displayLc && (
                                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      displayLc === 'GPS' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                      ['3','2','1'].includes(displayLc) ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 
                                      ['A','B'].includes(displayLc) ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 
                                      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                  }`}>
                                      {displayLc}
                                  </span>
                              )}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.locationType}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.msgType}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.dopplerError}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDateTime(row.timestamp, timeZone)}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lat}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lon}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.satellite}</td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="bg-gray-50 dark:bg-slate-900 px-6 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                  Page {currentPageIndex + 1} • {sortedData.length} records loaded • {totalRecords.toLocaleString()} total
              </span>
              
              <div className="flex items-center gap-2">
                  <button 
                    onClick={handlePrevPage}
                    disabled={currentPageIndex === 0 || isLoading}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <ChevronLeft size={16} className="text-gray-600 dark:text-gray-400" />
                  </button>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Page {currentPageIndex + 1}
                  </span>
                  <button 
                    onClick={handleNextPage}
                    disabled={!lastDoc || sortedData.length < rowsPerPage || isLoading}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
                  </button>
                  
                  <select 
                    value={rowsPerPage}
                    onChange={(e) => { setRowsPerPage(Number(e.target.value)); }}
                    className="ml-2 text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 rounded px-1 py-0.5 outline-none"
                  >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                  </select>
              </div>
          </div>
      </div>
    </div>
  );
};

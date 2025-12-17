import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Download, Search, Trash2, Smartphone, Radio, BarChart3, MessageSquare, Database, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';
import { useSortableTable, SortableHeader } from '../components/TableComponents';
import { formatDateTime } from '../utils/formatting';

type ViewMode = 'messages' | 'devices' | 'doppler' | 'stats' | 'bulk';

export const ArgosData = () => {
  const { 
    argosData, clearArgosData, 
    argosDevices, clearArgosDevices,
    argosDoppler, clearArgosDoppler,
    argosCounts, clearArgosCounts,
    timeZone
  } = useAppStore();

  const [viewMode, setViewMode] = useState<ViewMode>('messages');
  const [searchQuery, setSearchQuery] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isConfirming, setIsConfirming] = useState(false);

  // --- Dynamic Data Filtering ---
  let currentData: any[] = [];
  
  if (viewMode === 'messages' || viewMode === 'bulk') {
    currentData = argosData.filter(row => 
      row.platformId.includes(searchQuery) || 
      row.programId.includes(searchQuery) ||
      (row.lc && row.lc.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  } else if (viewMode === 'devices') {
    currentData = argosDevices.filter(row => 
      row.deviceRef.includes(searchQuery) || 
      row.programRef.includes(searchQuery) || 
      row.model.toLowerCase().includes(searchQuery.toLowerCase())
    );
  } else if (viewMode === 'doppler') {
    currentData = argosDoppler.filter(row => 
      row.platformId.includes(searchQuery) ||
      row.satellite.toLowerCase().includes(searchQuery.toLowerCase())
    );
  } else if (viewMode === 'stats') {
    currentData = argosCounts.filter(row => 
      row.platformId.includes(searchQuery)
    );
  }

  // --- Apply Sorting and Filtering Hook on filtered data ---
  const defaultSortKey = viewMode === 'messages' ? 'timestamp' : 'platformId';
  const { sortedData, requestSort, sortConfig, filters, setFilter, clearFilters } = useSortableTable(currentData, defaultSortKey);

  // Clear filters when switching tabs
  useEffect(() => {
    clearFilters();
    setCurrentPage(1);
    setSearchQuery('');
    setIsConfirming(false);
  }, [viewMode, clearFilters]);

  const totalRecords = sortedData.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage);
  const paginatedData = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // --- Handlers ---
  const handleExport = () => {
    exportToCSV(sortedData, `Argos_${viewMode}_Data`);
  };

  const handleClear = () => {
    if (isConfirming) {
        if (viewMode === 'messages' || viewMode === 'bulk') clearArgosData();
        if (viewMode === 'devices') clearArgosDevices();
        if (viewMode === 'doppler') clearArgosDoppler();
        if (viewMode === 'stats') clearArgosCounts();
        setIsConfirming(false);
    } else {
        setIsConfirming(true);
        setTimeout(() => setIsConfirming(false), 3000);
    }
  };

  // --- Render Tables ---

  const renderMessagesTable = () => (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-gray-100 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <SortableHeader label="Device ID" sortKey="platformId" currentSort={sortConfig} onSort={requestSort} filterValue={filters['platformId']} onFilter={setFilter} />
            <SortableHeader label="Unit type" sortKey="msgType" currentSort={sortConfig} onSort={requestSort} filterValue={filters['msgType']} onFilter={setFilter} />
            <SortableHeader label="Location class" sortKey="lc" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lc']} onFilter={setFilter} />
            <SortableHeader label="Location type" sortKey="locationType" currentSort={sortConfig} onSort={requestSort} filterValue={filters['locationType']} onFilter={setFilter} />
            <SortableHeader label="Doppler Error (m)" sortKey="dopplerError" currentSort={sortConfig} onSort={requestSort} filterValue={filters['dopplerError']} onFilter={setFilter} />
            <SortableHeader label="Location date" sortKey="timestamp" currentSort={sortConfig} onSort={requestSort} filterValue={filters['timestamp']} onFilter={setFilter} />
            <SortableHeader label="Latitude" sortKey="lat" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lat']} onFilter={setFilter} />
            <SortableHeader label="Longitude" sortKey="lon" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lon']} onFilter={setFilter} />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
        {paginatedData.map((row: any) => {
            const displayLc = row.lc || '';
            const displayDopplerError = row.dopplerError || '';
            return (
              <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                <td className="px-6 py-3 text-sm font-bold text-gray-900 dark:text-white">{row.platformId}</td>
                <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.msgType}</td>
                <td className="px-6 py-3 text-sm">
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
                <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.locationType}</td>
                <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{displayDopplerError}</td>
                <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDateTime(row.timestamp, timeZone)}</td>
                <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lat}</td>
                <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lon}</td>
              </tr>
            );
        })}
      </tbody>
    </table>
  );

  const renderDevicesTable = () => (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-gray-100 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <SortableHeader label="Device Ref" sortKey="deviceRef" currentSort={sortConfig} onSort={requestSort} filterValue={filters['deviceRef']} onFilter={setFilter} />
            <SortableHeader label="Program Ref" sortKey="programRef" currentSort={sortConfig} onSort={requestSort} filterValue={filters['programRef']} onFilter={setFilter} />
            <SortableHeader label="Manufacturer" sortKey="manufacturer" currentSort={sortConfig} onSort={requestSort} filterValue={filters['manufacturer']} onFilter={setFilter} />
            <SortableHeader label="Model" sortKey="model" currentSort={sortConfig} onSort={requestSort} filterValue={filters['model']} onFilter={setFilter} />
            <SortableHeader label="Type" sortKey="transType" currentSort={sortConfig} onSort={requestSort} filterValue={filters['transType']} onFilter={setFilter} />
            <SortableHeader label="Active" sortKey="active" currentSort={sortConfig} onSort={requestSort} filterValue={filters['active']} onFilter={setFilter} />
            <SortableHeader label="Deploy Date" sortKey="deployDate" currentSort={sortConfig} onSort={requestSort} filterValue={filters['deployDate']} onFilter={setFilter} />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
        {paginatedData.map((row: any) => (
          <tr key={row.deviceRef} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
            <td className="px-6 py-3 text-sm font-bold text-gray-900 dark:text-white">{row.deviceRef}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.programRef}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.manufacturer}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.model}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.transType}</td>
            <td className="px-6 py-3 text-sm">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${row.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                    {row.active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.deployDate ? formatDateTime(row.deployDate, timeZone).split(',')[0] : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderDopplerTable = () => (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-gray-100 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
          <SortableHeader label="Platform ID" sortKey="platformId" currentSort={sortConfig} onSort={requestSort} filterValue={filters['platformId']} onFilter={setFilter} />
          <SortableHeader label="Timestamp" sortKey="timestamp" currentSort={sortConfig} onSort={requestSort} filterValue={filters['timestamp']} onFilter={setFilter} />
          <SortableHeader label="Satellite" sortKey="satellite" currentSort={sortConfig} onSort={requestSort} filterValue={filters['satellite']} onFilter={setFilter} />
          <SortableHeader label="Frequency (MHz)" sortKey="frequency" currentSort={sortConfig} onSort={requestSort} filterValue={filters['frequency']} onFilter={setFilter} />
          <SortableHeader label="Loc Class" sortKey="locationClass" currentSort={sortConfig} onSort={requestSort} filterValue={filters['locationClass']} onFilter={setFilter} />
          <SortableHeader label="Lat" sortKey="lat" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lat']} onFilter={setFilter} />
          <SortableHeader label="Lon" sortKey="lon" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lon']} onFilter={setFilter} />
          <SortableHeader label="Error Radius" sortKey="errorRadius" currentSort={sortConfig} onSort={requestSort} filterValue={filters['errorRadius']} onFilter={setFilter} />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
        {paginatedData.map((row: any) => (
          <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
            <td className="px-6 py-3 text-sm font-bold text-gray-900 dark:text-white">{row.platformId}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{formatDateTime(row.timestamp, timeZone)}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.satellite}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.frequency}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.locationClass}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lat}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lon}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.errorRadius}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderStatsTable = () => (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-gray-100 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
          <SortableHeader label="Platform ID" sortKey="platformId" currentSort={sortConfig} onSort={requestSort} filterValue={filters['platformId']} onFilter={setFilter} />
          <SortableHeader label="Message Count" sortKey="count" currentSort={sortConfig} onSort={requestSort} filterValue={filters['count']} onFilter={setFilter} />
          <SortableHeader label="Period Start" sortKey="periodStart" currentSort={sortConfig} onSort={requestSort} filterValue={filters['periodStart']} onFilter={setFilter} />
          <SortableHeader label="Period End" sortKey="periodEnd" currentSort={sortConfig} onSort={requestSort} filterValue={filters['periodEnd']} onFilter={setFilter} />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
        {paginatedData.map((row: any) => (
          <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
            <td className="px-6 py-3 text-sm font-bold text-gray-900 dark:text-white">{row.platformId}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{row.count}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{formatDateTime(row.periodStart, timeZone)}</td>
            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-300">{formatDateTime(row.periodEnd, timeZone)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Argos Raw Data</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
             Inspect low-level API responses and message logs.
          </p>
        </div>
      </div>

      {/* Controls & Toolbar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-4 flex flex-col gap-4 flex-shrink-0">
          {/* View Mode Tabs */}
          <div className="flex bg-gray-100 dark:bg-slate-700 p-1 rounded-lg w-fit">
              <button 
                onClick={() => setViewMode('messages')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'messages' ? 'bg-white dark:bg-slate-600 shadow-sm text-brand-700 dark:text-brand-300' : 'text-gray-500 dark:text-gray-400'}`}
              >
                  <MessageSquare size={14} /> Messages
              </button>
              <button 
                onClick={() => setViewMode('devices')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'devices' ? 'bg-white dark:bg-slate-600 shadow-sm text-brand-700 dark:text-brand-300' : 'text-gray-500 dark:text-gray-400'}`}
              >
                  <Smartphone size={14} /> Device List
              </button>
              <button 
                onClick={() => setViewMode('doppler')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'doppler' ? 'bg-white dark:bg-slate-600 shadow-sm text-brand-700 dark:text-brand-300' : 'text-gray-500 dark:text-gray-400'}`}
              >
                  <Radio size={14} /> Doppler
              </button>
              <button 
                onClick={() => setViewMode('stats')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'stats' ? 'bg-white dark:bg-slate-600 shadow-sm text-brand-700 dark:text-brand-300' : 'text-gray-500 dark:text-gray-400'}`}
              >
                  <BarChart3 size={14} /> Count Stats
              </button>
          </div>

          <div className="flex items-center justify-between gap-4">
               <div className="relative flex-1 max-w-md">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                      type="text" 
                      placeholder={`Search ${viewMode}...`} 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  />
               </div>
               
               <div className="flex gap-2">
                   <button 
                      onClick={handleClear}
                      className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${isConfirming ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'}`}
                   >
                       <Trash2 size={14} />
                       {isConfirming ? 'Confirm Clear?' : 'Clear Data'}
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
              {viewMode === 'messages' && renderMessagesTable()}
              {viewMode === 'devices' && renderDevicesTable()}
              {viewMode === 'doppler' && renderDopplerTable()}
              {viewMode === 'stats' && renderStatsTable()}
              {sortedData.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400">
                      <Database size={32} className="mb-2 opacity-50" />
                      <p>No records found.</p>
                  </div>
              )}
          </div>

          {/* Pagination Footer */}
          <div className="bg-gray-50 dark:bg-slate-900 px-6 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {Math.min(sortedData.length, (currentPage - 1) * rowsPerPage + 1)} to {Math.min(sortedData.length, currentPage * rowsPerPage)} of {sortedData.length} records
              </span>
              
              <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <ChevronLeft size={16} className="text-gray-600 dark:text-gray-400" />
                  </button>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Page {currentPage} of {Math.max(1, totalPages)}</span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
                  </button>
                  
                  <select 
                    value={rowsPerPage}
                    onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    className="ml-2 text-xs border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 rounded px-1 py-0.5 outline-none"
                  >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                  </select>
              </div>
          </div>
      </div>
    </div>
  );
};

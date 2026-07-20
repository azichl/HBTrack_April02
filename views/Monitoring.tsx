import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { Map as MapIcon, Activity, Battery, Navigation, Download, RefreshCw, X, Save, Trash2, Search } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';
import { useSortableTable, SortableHeader } from '../components/TableComponents';
import { Position } from '../types';
import { formatDateTime, formatBattery } from '../utils/formatting';
import Draggable from 'react-draggable';
import { saveDocument } from '../services/firestoreService';
import { CustomSelect } from '../components/CustomSelect';
import { deleteCoordinateRecord } from '../services/firestoreService';

interface MonitoringTableRow {
    id: string;
    platform_id: string;
    bird_ring_id: string;
    bird_id: string;
    status: string;
    model: string;
    lat: number | undefined;
    lon: number | undefined;
    battery_voltage: number | undefined;
    speed: number | undefined;
    timestamp: string | undefined;
    hasPos: boolean;
}

export const Monitoring = () => {
  const { 
    transmitters, 
    birds, 
    positions, 
    setSelectedMapBirdId, 
    setActiveTab,
    setDatabaseActiveTab,
    timeZone,
    isPositionModalOpen: isModalOpen,
    setIsPositionModalOpen: setIsModalOpen,
  } = useAppStore();

  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Position>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isModalOpen) {
      if (editingRecordId) {
        const p = positions.find(x => x.id === editingRecordId);
        if (p) setFormData(p);
      } else {
        setFormData({
          transmitter_id: '',
          timestamp: new Date().toISOString(),
          lat: 0,
          lon: 0,
          lc: '3',
          is_kalman: false,
          speed_kmh: 0,
          course: 0,
          satellite: 'Manual',
          locationType: 'GPS'
        });
      }
    }
  }, [isModalOpen, editingRecordId, positions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingRecordId || `pos-${Date.now()}`;
    const newPos: Position = {
      id,
      ...formData as Position
    };
    await saveDocument('positions', id, newPos);
    setIsModalOpen(false);
  };

  // 1. Prepare Flattened Data for Table
  const latestPositions = useMemo(() => {
    const map = new Map<string, Position>();
    positions.forEach(p => {
      const current = map.get(p.transmitter_id);
      if (!current || new Date(p.timestamp).getTime() > new Date(current.timestamp).getTime()) {
        map.set(p.transmitter_id, p);
      }
    });
    return map;
  }, [positions]);

  const tableData = useMemo<MonitoringTableRow[]>(() => {
    return transmitters.map(t => {
      const bird = birds.find(b => b.id === t.bird_id);
      const pos = latestPositions.get(t.platform_id);
      return {
        id: t.id,
        platform_id: t.platform_id,
        bird_ring_id: bird?.ring_id || 'Unassigned',
        bird_id: t.bird_id, // for actions
        status: t.derived_status || t.status,
        model: t.model,
        lat: pos?.lat,
        lon: pos?.lon,
        battery_voltage: t.battery_voltage,
        speed: pos?.speed_kmh,
        timestamp: pos?.timestamp,
        hasPos: !!pos
      };
    });
  }, [transmitters, birds, latestPositions]);

  // Client-side search filtering
  const filteredData = useMemo(() => {
    if (!searchQuery) return tableData;
    const lowerQuery = searchQuery.toLowerCase();
    return tableData.filter(row => 
      String(row.platform_id || '').toLowerCase().includes(lowerQuery) ||
      String(row.bird_ring_id || '').toLowerCase().includes(lowerQuery) ||
      String(row.lat || '').toLowerCase().includes(lowerQuery) ||
      String(row.lon || '').toLowerCase().includes(lowerQuery)
    );
  }, [tableData, searchQuery]);

  // 2. Hook for Sorting and Filtering
  const { sortedData, requestSort, sortConfig, filters, setFilter } = useSortableTable<MonitoringTableRow>(filteredData, 'timestamp');

  const handleViewOnMap = (birdId: string) => {
    setSelectedMapBirdId(birdId);
    setActiveTab('Live Tracking');
  };

  const handleExport = () => {
    const data = sortedData.map(row => ({
      'Platform ID': row.platform_id,
      'Bird Ring ID': row.bird_ring_id,
      'Status': row.status,
      'Model': row.model,
      'Latitude': row.lat ? row.lat.toFixed(5) : 'N/A',
      'Longitude': row.lon ? row.lon.toFixed(5) : 'N/A',
      'Battery (V)': row.battery_voltage ?? 'N/A',
      'Speed (km/h)': row.speed ? Math.round(row.speed) : 'N/A',
      'Time UTC': row.timestamp ? new Date(row.timestamp).toISOString().replace('T', ' ').substring(0, 19) : 'N/A',
    }));
    exportToCSV(data, 'Monitoring_Data');
  };

  const handleSync = () => {
      // Data is automatically synced to Firebase during ingestion
  };

  const handleDeleteCoordinate = async (platformId: string, timestamp: string | undefined) => {
    if (!timestamp) return;
    if (window.confirm(`Are you sure you want to permanently delete the latest coordinate for PTT ${platformId}?`)) {
      await deleteCoordinateRecord(undefined, platformId, timestamp);
      // Wait a moment for listeners to catch up or refresh state if needed
      // Actually since positions are listener-based in appStore, it will automatically vanish!
    }
  };

  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Live Monitoring</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Real-time status overview of all active tracked assets.</p>
        </div>
         <div className="flex gap-3 items-center">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                    type="text" 
                    placeholder="Search coordinates..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 w-64 transition-all"
                />
              </div>
              <button 
               onClick={handleSync}
               className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-brand-700 dark:text-brand-300 shadow-sm transition-colors"
             >
                <RefreshCw size={16} /> Sync with Argos
             </button>
             <button 
              onClick={handleExport}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-600 dark:text-gray-300 shadow-sm transition-colors"
            >
              <Download size={16} /> Export Data
            </button>
             <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg border border-green-200 dark:border-green-800 text-sm font-medium animate-pulse">
                <Activity size={16} /> Live Data Stream Active
             </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden flex-1">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                <SortableHeader label="Asset Info" sortKey="platform_id" currentSort={sortConfig} onSort={requestSort} filterValue={filters['platform_id']} onFilter={setFilter} />
                <SortableHeader label="Current Status" sortKey="status" currentSort={sortConfig} onSort={requestSort} filterValue={filters['status']} onFilter={setFilter} />
                <SortableHeader label="Latitude" sortKey="lat" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lat']} onFilter={setFilter} />
                <SortableHeader label="Longitude" sortKey="lon" currentSort={sortConfig} onSort={requestSort} filterValue={filters['lon']} onFilter={setFilter} />
                <SortableHeader label="Battery" sortKey="battery_voltage" currentSort={sortConfig} onSort={requestSort} filterValue={filters['battery_voltage']} onFilter={setFilter} />
                <SortableHeader label="Speed" sortKey="speed" currentSort={sortConfig} onSort={requestSort} filterValue={filters['speed']} onFilter={setFilter} />
                <SortableHeader label="Last Fix" sortKey="timestamp" currentSort={sortConfig} onSort={requestSort} filterValue={filters['timestamp']} onFilter={setFilter} />
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap text-center sticky top-0 bg-gray-50 dark:bg-slate-900 z-20 shadow-sm">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {sortedData.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-300 font-bold text-xs">
                        {row.platform_id.slice(-3)}
                      </div>
                      <div>
                        <button 
                          onClick={() => setDatabaseActiveTab('Birds')} 
                          className="font-bold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 hover:underline text-left block transition-colors"
                          title="View Bird Details"
                          style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                        >
                          {row.bird_ring_id}
                        </button>
                        <button 
                            onClick={() => setDatabaseActiveTab('Transmitters')}
                            className="text-xs text-gray-500 dark:text-gray-400 font-mono hover:text-brand-600 dark:hover:text-brand-400 hover:underline text-left block transition-colors"
                            title="View PTT Details"
                        >
                          PTT {row.platform_id}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      (row.status === 'Active' || row.status === 'active') ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                      row.status === 'Potential Mortality' ? 'bg-[#FFAA33]/20 dark:bg-[#FFAA33]/30 text-[#FFAA33]' :
                      row.status === 'Static test' ? 'bg-[#F4F714]/20 dark:bg-[#F4F714]/30 text-[#e6b800] dark:text-[#F4F714]' :
                      row.status === 'Inactive' ? 'bg-[#FF2A00]/20 dark:bg-[#FF2A00]/30 text-[#FF2A00]' :
                      row.status === 'maintenance' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' :
                      'bg-[#FF2A00]/20 dark:bg-[#FF2A00]/30 text-[#FF2A00]'
                    }`}>
                      {row.status}
                    </span>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{row.model}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lat ? row.lat.toFixed(4) : '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{row.lon ? row.lon.toFixed(4) : '-'}</td>
                  <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs">
                        <Battery size={14} className={(row.battery_voltage || 0) < 3.5 ? 'text-red-500' : 'text-green-500'} />
                        <span className="font-medium text-gray-700 dark:text-gray-300">{formatBattery(row.battery_voltage)}</span>
                      </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.speed !== undefined && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                          <Navigation size={14} className="text-blue-500" />
                          <span>{Math.round(row.speed)} km/h</span>
                        </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {formatDateTime(row.timestamp, timeZone)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => handleViewOnMap(row.bird_id || 'all')} 
                        disabled={!row.hasPos}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <MapIcon size={14} /> Visualize
                      </button>
                      <button 
                        onClick={() => handleDeleteCoordinate(row.platform_id, row.timestamp)}
                        disabled={!row.hasPos}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete latest coordinate"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedData.length === 0 && (
                  <tr>
                      <td colSpan={8} className="text-center py-8 text-gray-500 dark:text-gray-400 italic">
                          No transmitters found. Import data via "Data Upload".
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

       {/* Add/Edit Position Modal */}
       {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          {/* @ts-ignore */}
          <Draggable handle=".modal-handle" nodeRef={nodeRef}>
            <div ref={nodeRef} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden flex flex-col">
              <div className="modal-handle cursor-move px-6 py-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editingRecordId ? 'Edit Position' : 'Add Manual Position'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transmitter</label>
                    <CustomSelect
                        value={formData.transmitter_id || ''}
                        onChange={(val) => setFormData({...formData, transmitter_id: val})}
                        options={[
                          { value: '', label: '-- Select Transmitter --' },
                          ...transmitters.map(t => ({ value: t.id, label: `${t.platform_id} (${t.model})` }))
                        ]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Timestamp</label>
                    <input type="datetime-local" step="1" required value={formData.timestamp ? formData.timestamp.substring(0, 19) : ''} onChange={e => setFormData({...formData, timestamp: new Date(e.target.value).toISOString()})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude</label>
                      <input type="number" step="any" required value={formData.lat || ''} onChange={e => setFormData({...formData, lat: parseFloat(e.target.value)})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude</label>
                      <input type="number" step="any" required value={formData.lon || ''} onChange={e => setFormData({...formData, lon: parseFloat(e.target.value)})} className="w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>
                </form>
              </div>

              <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                  <button type="button" onClick={handleSubmit} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 flex items-center gap-2">
                    <Save size={16} /> Save Position
                  </button>
              </div>
            </div>
          </Draggable>
        </div>
      )}
    </div>
  );
};
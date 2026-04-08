import React, { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { Map as MapIcon, Activity, Battery, Navigation, Download, RefreshCw } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';
import { useSortableTable, SortableHeader } from '../components/TableComponents';
import { Position } from '../types';
import { formatDateTime, formatBattery } from '../utils/formatting';

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
    timeZone
  } = useAppStore();

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
        status: t.status,
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

  // 2. Hook for Sorting and Filtering
  const { sortedData, requestSort, sortConfig, filters, setFilter } = useSortableTable<MonitoringTableRow>(tableData, 'timestamp');

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

  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Live Monitoring</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Real-time status overview of all active tracked assets.</p>
        </div>
        <div className="flex gap-3">
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
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                      row.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                      row.status === 'maintenance' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' :
                      'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
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
                    <button 
                      onClick={() => handleViewOnMap(row.bird_id || 'all')} 
                      disabled={!row.hasPos}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <MapIcon size={14} /> Visualize
                    </button>
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
    </div>
  );
};
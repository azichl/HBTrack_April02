import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { AlertTriangle, CheckCircle, Clock, MapPin, Filter, Settings, X } from 'lucide-react';
import { formatDateTime } from '../utils/formatting';
import { CustomSelect } from '../components/CustomSelect';

export const RealTimeAlerts = () => {
  const { alerts, resolveAlert, resolveAllAlerts, timeZone } = useAppStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all'); // Default to all

  const handleClearFilters = () => {
    setFilterSeverity('all');
    setFilterStatus('all');
    setShowFilter(false);
  };

  const filteredAlerts = alerts.filter(alert => {
    if (alert.type === 'ticket_created') return false;
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
    if (filterStatus !== 'all' && alert.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            Real-Time Alerts
            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold border border-red-200 dark:border-red-800 animate-pulse">
              LIVE STREAMING
            </span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Monitoring incoming Argos messages for anomalies.</p>
        </div>
        <div className="flex gap-2 relative">
            <button 
                onClick={() => resolveAllAlerts()}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
            >
                <CheckCircle size={16} />
                Resolve All
            </button>
            <button 
                onClick={() => setShowFilter(!showFilter)}
                className={`px-4 py-2 border rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                    showFilter || filterSeverity !== 'all' || filterStatus !== 'all' 
                    ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/30 dark:border-brand-800 dark:text-brand-400' 
                    : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200'
                }`}
            >
                <Filter size={16} />
                Filter {(filterSeverity !== 'all' || filterStatus !== 'all') && '(Active)'}
            </button>
            
            {/* Filter Dropdown */}
            {showFilter && (
                <div className="absolute top-full right-[100px] mt-2 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-xl rounded-xl p-4 z-50">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-gray-900 dark:text-white">Filter Alerts</h4>
                        <button onClick={() => setShowFilter(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Severity</label>
                            <CustomSelect 
                                value={filterSeverity} 
                                onChange={(val) => setFilterSeverity(val)}
                                className="w-full font-sans"
                                buttonClassName="p-2 border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-sm"
                                options={[
                                    { value: 'all', label: 'All Severities' },
                                    { value: 'critical', label: 'Critical' },
                                    { value: 'warning', label: 'Warning' },
                                    { value: 'info', label: 'Info' }
                                ]}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
                            <CustomSelect 
                                value={filterStatus} 
                                onChange={(val) => setFilterStatus(val)}
                                className="w-full font-sans"
                                buttonClassName="p-2 border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-sm"
                                options={[
                                    { value: 'all', label: 'View All' },
                                    { value: 'active', label: 'Active Only' },
                                    { value: 'resolved', label: 'Resolved Only' }
                                ]}
                            />
                        </div>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-between">
                        <button 
                            onClick={handleClearFilters}
                            className="text-sm font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            Clear Filters
                        </button>
                        <button 
                            onClick={() => setShowFilter(false)}
                            className="text-sm font-bold text-brand-600 hover:text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            )}

            <button 
                onClick={() => setShowSettings(true)}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 flex items-center gap-2"
            >
                <Settings size={16} />
                Settings
            </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Severity</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bird / PTT</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Alert Message</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {filteredAlerts.map((alert) => (
              <tr key={alert.id} className={`group hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${alert.status === 'resolved' ? 'opacity-60 bg-gray-50 dark:bg-slate-800' : ''}`}>
                <td className="px-6 py-4">
                   <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                     alert.severity === 'critical' 
                      ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800' 
                      : alert.severity === 'warning'
                      ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-800'
                      : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-800'
                   }`}>
                     {alert.severity === 'critical' && <AlertTriangle size={12} />}
                     {alert.severity}
                   </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-gray-400" />
                    {formatDateTime(alert.timestamp, timeZone).split(' ')[1] || '-'}
                  </div>
                  <div className="text-xs text-gray-400 pl-6">{formatDateTime(alert.timestamp, timeZone).split(' ')[0] || '-'}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{alert.bird_name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">PTT {alert.transmitter_id}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {alert.message}
                  {alert.type === 'geofence' && (
                    <span className="ml-2 inline-flex items-center text-xs text-brand-600 dark:text-brand-400 cursor-pointer hover:underline">
                      <MapPin size={12} className="mr-1"/> View on Map
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-medium ${
                    alert.status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {alert.status?.toUpperCase() || 'UNKNOWN'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {alert.status !== 'resolved' && (
                    <button 
                      onClick={() => resolveAlert(alert.id)}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-full transition-colors"
                      title="Mark Resolved"
                    >
                      <CheckCircle size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredAlerts.length === 0 && (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                No alerts match the current filters.
                {(filterSeverity !== 'all' || filterStatus !== 'all') && (
                    <button onClick={handleClearFilters} className="block mx-auto mt-4 text-brand-600 font-bold hover:underline">Clear Filters</button>
                )}
            </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-slate-700">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xl font-bold text-gray-900 dark:text-white">Alert Settings</h3>
                 <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
             </div>
             <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">Configure threshold parameters for automated real-time alerts.</p>
             
             <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold mb-1 text-gray-700 dark:text-gray-300">Max Distance Between Fixes (km)</label>
                  <input type="number" defaultValue={50} className="w-full border dark:border-slate-700 rounded-lg p-2.5 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-gray-700 dark:text-gray-300">Max Days Without Transmission</label>
                  <input type="number" defaultValue={3} className="w-full border dark:border-slate-700 rounded-lg p-2.5 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-gray-700 dark:text-gray-300">Battery Warning Threshold (%)</label>
                  <input type="number" defaultValue={20} className="w-full border dark:border-slate-700 rounded-lg p-2.5 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" />
                </div>
             </div>
             
             <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-slate-700">
                <button onClick={() => setShowSettings(false)} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-white font-medium rounded-lg transition-colors">Cancel</button>
                <button onClick={() => setShowSettings(false)} className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-sm transition-colors">Save Configuration</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
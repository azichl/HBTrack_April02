import React from 'react';
import { useAppStore } from '../store/appStore';
import { AlertTriangle, CheckCircle, Clock, MapPin } from 'lucide-react';
import { formatDateTime } from '../utils/formatting';

export const RealTimeAlerts = () => {
  const { alerts, resolveAlert, timeZone } = useAppStore();

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
        <div className="flex gap-2">
            <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200">Filter</button>
            <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200">Settings</button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
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
            {alerts.map((alert) => (
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
                    {formatDateTime(alert.timestamp, timeZone).split(',')[1]}
                  </div>
                  <div className="text-xs text-gray-400 pl-6">{formatDateTime(alert.timestamp, timeZone).split(',')[0]}</div>
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
                    {alert.status.toUpperCase()}
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
        {alerts.length === 0 && (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">No active alerts.</div>
        )}
      </div>
    </div>
  );
};
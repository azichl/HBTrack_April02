import React from 'react';
import { KPICard } from '../components/KPICard';
import { Radio, Bird, AlertTriangle, Satellite } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDateTime } from '../utils/formatting';

// Generate empty chart data for the last 7 days
const generateEmptyChartData = () => {
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({
      name: d.toLocaleDateString('en-US', { weekday: 'short' }),
      fixes: 0
    });
  }
  return data;
};

export const Dashboard = () => {
  const { transmitters, birds, alerts, argosData, timeZone } = useAppStore();
  const chartData = generateEmptyChartData();

  // Dynamic counts
  const activeTransmittersCount = transmitters.filter(t => t.status === 'active').length;
  const birdsCount = birds.length;
  const activeAlertsCount = alerts.filter(a => a.status === 'active').length;
  
  // Determine last ingest from actual data
  const lastIngestDate = argosData.length > 0 
      ? formatDateTime(new Date(Math.max(...argosData.map(d => new Date(d.timestamp).getTime()))).toISOString(), timeZone)
      : 'No Data';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Overview</h2>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Last Ingest: <span className="font-medium text-gray-900 dark:text-gray-200" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{lastIngestDate}</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Active Transmitters" 
          value={activeTransmittersCount} 
          icon={Radio} 
          color="bg-brand-500" 
          trend={activeTransmittersCount > 0 ? "+ deployed" : "-"}
          trendUp={true}
        />
        <KPICard 
          title="Birds Tracked" 
          value={birdsCount} 
          icon={Bird} 
          color="bg-slate-600" 
          trend={birdsCount > 0 ? "Tracking active" : "No active tracking"}
          trendUp={true}
        />
        <KPICard 
          title="Active Alerts" 
          value={activeAlertsCount} 
          icon={AlertTriangle} 
          color="bg-brand-700" 
          trend={activeAlertsCount === 0 ? "System healthy" : "Attention needed"}
          trendUp={activeAlertsCount === 0}
        />
        <KPICard 
          title="Satellites Used" 
          value="0" 
          icon={Satellite} 
          color="bg-slate-500" 
          trend="-"
          trendUp={true}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <div className="w-full min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Argos Message Volume (7 Days)</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                    itemStyle={{ color: '#f3f4f6' }}
                  />
                  <Line type="monotone" dataKey="fixes" stroke="#b79355" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Alerts List */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Alerts</h3>
             <span className="text-xs font-medium text-brand-600 hover:underline cursor-pointer dark:text-brand-400">View All</span>
          </div>
          <div className="space-y-4">
            {alerts.length > 0 ? alerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="flex gap-3 items-start p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                  alert.severity === 'critical' ? 'bg-red-500' : alert.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400'
                }`} />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-200">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{alert.bird_name} ({alert.transmitter_id})</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">• {formatDateTime(alert.timestamp, timeZone)}</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="py-8 text-center text-gray-400 text-sm">
                No active alerts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
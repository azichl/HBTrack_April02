import React, { useMemo } from 'react';
import { KPICard } from '../components/KPICard';
import { Radio, AlertTriangle, Battery, Navigation, Activity, Satellite, Clock, ShieldAlert, Zap } from 'lucide-react';
import { HoubaraIcon } from '../components/HoubaraIcon';
import { useAppStore } from '../store/appStore';
import { 
  AreaChart, Area, 
  BarChart, Bar, 
  PieChart, Pie, Cell, 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { formatDateTime, formatBattery } from '../utils/formatting';

const renderCustomizedLabel = (props: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, value, name, x, y } = props;
  const RADIAN = Math.PI / 180;
  
  // Inner text position (number)
  const insideRadius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const xInside = cx + insideRadius * Math.cos(-midAngle * RADIAN);
  const yInside = cy + insideRadius * Math.sin(-midAngle * RADIAN);

  // Exclude 0 values to avoid clutter
  if (value === 0) return null;

  return (
    <g>
      <text 
        x={x} 
        y={y} 
        fill="currentColor" 
        className="text-slate-700 dark:text-slate-300" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central" 
        fontSize={11} 
        fontWeight="600"
      >
        {name}
      </text>
      <text 
        x={xInside} 
        y={yInside} 
        fill="#ffffff" 
        textAnchor="middle" 
        dominantBaseline="central" 
        fontSize={14} 
        fontWeight="bold"
      >
        {value}
      </text>
    </g>
  );
};

export const Dashboard = () => {
  const { transmitters, birds, alerts, positions, timeZone, setActiveTab } = useAppStore();

  // 1. Generate chart data from real positions for the last 7 days (Volume - Area Chart)
  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);
      
      const fixes = positions.filter(p => {
        const t = new Date(p.timestamp).getTime();
        return t >= dayStart.getTime() && t <= dayEnd.getTime();
      }).length;

      data.push({
        name: d.toLocaleDateString('en-US', { weekday: 'short' }),
        fixes
      });
    }
    return data;
  }, [positions]);

  // 2. Generate Location Class (LC) Data for Radar Chart (Last 7 Days)
  const lcData = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const recentFixes = positions.filter(p => new Date(p.timestamp).getTime() >= sevenDaysAgo);
    const lcCounts: Record<string, number> = { '3': 0, '2': 0, '1': 0, '0': 0, 'A': 0, 'B': 0, 'Z': 0 };
    
    recentFixes.forEach(p => {
      if (p.lc && lcCounts[p.lc] !== undefined) {
        lcCounts[p.lc]++;
      } else if (!p.lc && p.locationType === 'GPS') {
         // GPS positions might not have an LC in some datasets, treat them as high accuracy
         lcCounts['3']++;
      }
    });

    return [
      { lc: 'Class 3 (<250m)', count: lcCounts['3'] },
      { lc: 'Class 2 (<500m)', count: lcCounts['2'] },
      { lc: 'Class 1 (<1500m)', count: lcCounts['1'] },
      { lc: 'Class 0 (>1500m)', count: lcCounts['0'] },
      { lc: 'Class A (No limits)', count: lcCounts['A'] },
      { lc: 'Class B (No limits)', count: lcCounts['B'] },
      { lc: 'Class Z (Invalid)', count: lcCounts['Z'] }
    ];
  }, [positions]);

  // 3. Generate Battery Health Data (Bar Chart)
  const batteryData = useMemo(() => {
    let critical = 0; // < 3.6V
    let low = 0;      // 3.6 - 3.7V
    let healthy = 0;  // >= 3.8V
    let unknown = 0;

    transmitters.forEach(t => {
      if (t.status !== 'active') return;
      if (!t.battery_voltage) {
        unknown++;
      } else if (t.battery_voltage < 3.6) {
        critical++;
      } else if (t.battery_voltage < 3.8) {
        low++;
      } else {
        healthy++;
      }
    });

    return [
      { name: 'Critical (<3.6V)', count: critical, color: '#ef4444' },
      { name: 'Low (3.6-3.7V)', count: low, color: '#f59e0b' },
      { name: 'Healthy (≥3.8V)', count: healthy, color: '#10b981' }
    ].filter(d => d.count > 0);
  }, [transmitters]);

  // Dynamic counts
  const activeBirdIds = transmitters
    .filter(t => {
      const s = t.derived_status || t.status;
      return s === 'Active' || s === 'active';
    })
    .map(t => t.bird_id);
  const activeBirdsCount = birds.filter(b => activeBirdIds.includes(b.id)).length;
  const systemAlerts = alerts.filter(a => a.type !== 'ticket_created');
  const activeAlertsCount = systemAlerts.filter(a => a.status === 'active').length;
  const criticalAlertsCount = systemAlerts.filter(a => a.status === 'active' && a.severity === 'critical').length;
  
  // Recent 24h Activity
  const fixesLast24h = useMemo(() => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    return positions.filter(p => new Date(p.timestamp).getTime() >= dayAgo).length;
  }, [positions]);

  // Determine last ingest from actual data
  const lastIngestDate = positions.length > 0 
      ? formatDateTime(new Date(Math.max(...positions.map(d => new Date(d.timestamp).getTime()))).toISOString(), timeZone)
      : 'No Data';

  // Transmitters Status Data
  const allStatuses = transmitters.reduce((acc, t) => {
    const s = t.derived_status || t.status || 'Unknown';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1', '#a855f7', '#d946ef'];
  const transmitterStatusData = Object.entries(allStatuses).map(([name, value], i) => {
    let color = CHART_COLORS[i % CHART_COLORS.length];
    if (name.toLowerCase() === 'active') color = '#10b981'; // Green
    else if (name.toLowerCase() === 'static test') color = '#eab308'; // Yellow
    else if (name.toLowerCase() === 'potential mortality') color = '#f97316'; // Orange
    else if (name.toLowerCase() === 'inactive') color = '#ef4444'; // Red
    
    return { name, value, color };
  });
  
  // Keep original statusData for the side panel Network Status pie chart
  const statusData = [
    { name: 'Active', value: transmitters.filter(t => t.status === 'active').length, color: '#10b981' },
    { name: 'Maintenance', value: transmitters.filter(t => t.status === 'maintenance').length, color: '#f59e0b' },
    { name: 'Lost', value: transmitters.filter(t => (t.status as string) === 'lost').length, color: '#ef4444' }
  ].filter(d => d.value > 0);

  // Fleet Overview (Top 5 recent)
  const recentFleet = useMemo(() => {
    return [...transmitters]
        .filter(t => t.last_fix)
        .sort((a, b) => new Date(b.last_fix).getTime() - new Date(a.last_fix).getTime())
        .slice(0, 5);
  }, [transmitters]);

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Global Command Center</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Asian Houbara Satellite Tracking Dashboard</p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 py-2 px-4 rounded-full border border-gray-200 dark:border-slate-700 shadow-md flex items-center gap-2">
          <Activity size={16} className="text-brand-600 animate-pulse" />
          Last Ingest: <span className="font-semibold text-gray-900 dark:text-gray-200 tracking-wide" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{lastIngestDate}</span>
        </div>
      </div>

      {/* Top Level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        
        <div className="col-span-1 md:col-span-2 xl:col-span-2 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm relative overflow-hidden group flex flex-col items-center justify-between">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
            <Radio size={80} className="text-slate-600" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-400 w-full text-center mb-1 flex items-center justify-center gap-2 z-10"><Radio size={16}/> Transmitters Status</p>
          
          <div className="h-56 w-full z-10 my-2">
             {transmitterStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={transmitterStatusData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={45} 
                    outerRadius={80} 
                    paddingAngle={2} 
                    dataKey="value" 
                    stroke="none"
                    labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
                    label={renderCustomizedLabel}
                  >
                    {transmitterStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(30, 41, 59, 0.95)', border: 'none', color: '#fff' }} itemStyle={{ color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </div>

          <div className="flex flex-col items-center justify-center z-10 mt-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-700 px-3 py-1.5 rounded-full">
              <span>Total Transmitters:</span>
              <strong className="text-gray-900 dark:text-white text-sm">{transmitters.length}</strong>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-brand-50 to-white dark:from-slate-800 dark:to-slate-800 p-6 rounded-2xl border border-brand-100 dark:border-slate-700 shadow-sm relative overflow-hidden group flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <HoubaraIcon size={80} color="#b79355" />
          </div>
          <div className="relative z-10 flex flex-col justify-center gap-2">
            <div className="flex items-center gap-3">
                <HoubaraIcon size={40} color="currentColor" className="text-brand-700 dark:text-brand-400 flex-shrink-0" /> 
                <div className="flex flex-col justify-center">
                    <p className="text-sm font-semibold text-brand-700 dark:text-brand-400 leading-tight">Birds Tracked</p>
                    <h3 className="text-4xl font-black text-gray-900 dark:text-white leading-tight mt-0.5">{activeBirdsCount}</h3>
                </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-100/50 dark:bg-slate-700 w-fit px-2 py-1 rounded">
              <span>{activeBirdsCount > 0 ? "Fleet tracking active" : "No birds registered"}</span>
            </div>
          </div>
        </div>

        <div className={`bg-gradient-to-br ${criticalAlertsCount > 0 ? 'from-red-50 border-red-200' : 'from-emerald-50 border-emerald-200'} to-white dark:from-slate-800 dark:to-slate-800 p-6 rounded-2xl border dark:border-slate-700 shadow-sm relative overflow-hidden group flex flex-col justify-center`}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShieldAlert size={80} className={criticalAlertsCount > 0 ? "text-red-600" : "text-emerald-600"} />
          </div>
          <div className="relative z-10 flex flex-col justify-center gap-2">
            <p className={`text-sm font-semibold flex items-center gap-2 ${criticalAlertsCount > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              <AlertTriangle size={16}/> Active Alerts
            </p>
            <h3 className="text-4xl font-black text-gray-900 dark:text-white">{activeAlertsCount}</h3>
            <div className={`flex items-center gap-2 text-xs font-medium w-fit px-2 py-1 rounded ${criticalAlertsCount > 0 ? 'text-red-700 bg-red-100/50 dark:bg-slate-700 dark:text-red-400' : 'text-emerald-700 bg-emerald-100/50 dark:bg-slate-700 dark:text-emerald-400'}`}>
              <span>{activeAlertsCount === 0 ? "System completely healthy" : `${criticalAlertsCount} critical alerts`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Analytical Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Column - Large Charts */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Advanced Area Chart for Data Volume */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm relative">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Data Ingestion Flow</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Argos message volume processed over the last 7 days</p>
            
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorFixes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#b79355" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#b79355" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.4} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#6b7280', fontWeight: 500}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#6b7280', fontWeight: 500}} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', borderColor: '#334155', color: '#f8fafc', borderRadius: '12px', backdropFilter: 'blur(4px)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="fixes" name="Total Fixes" stroke="#b79355" strokeWidth={4} fillOpacity={1} fill="url(#colorFixes)" animationDuration={1500} activeDot={{r: 8, strokeWidth: 0, fill: '#b79355'}} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lower Analytical Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* LC Radar Chart */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Location Class Accuracy</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quality distribution (Last 7 Days)</p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={lcData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="lc" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }} />
                    <Radar name="Count" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="#3b82f6" fillOpacity={0.4} animationDuration={1500} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', borderColor: '#334155', borderRadius: '8px' }}
                      itemStyle={{ color: '#3b82f6', fontWeight: 600 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Battery Health Bar Chart */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Active Fleet Battery Health</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Voltage distribution across deployed PTTs</p>
              <div className="h-48 w-full">
                {batteryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={batteryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" opacity={0.5} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#6b7280'}} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#374151', fontWeight: 600}} width={95} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', borderColor: '#334155', borderRadius: '8px' }}
                        itemStyle={{ color: '#f8fafc', fontWeight: 600 }}
                        cursor={{fill: 'rgba(0,0,0,0.05)'}}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} animationDuration={1000} barSize={24}>
                        {batteryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Zap size={24} className="mb-2 opacity-50" />
                    <span className="text-sm">No battery telemetry available</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Right Column - Side Panels */}
        <div className="space-y-6">
          
          {/* Status Donut (Moved to Sidebar) */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Network Status</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Current state of all deployed units</p>
            <div className="h-44 w-full flex justify-center items-center">
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                      animationDuration={1000}
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', borderColor: '#334155', borderRadius: '8px' }}
                      itemStyle={{ color: '#f8fafc', fontWeight: 600 }}
                    />
                    <Legend verticalAlign="bottom" height={20} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500 }}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-gray-400 text-sm">No transmitter data</div>
              )}
            </div>
          </div>

          {/* Recent Alerts Feed */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col h-[380px]">
            <div className="flex justify-between items-center mb-4">
               <div>
                 <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                   Live Alert Feed
                 </h3>
                 <p className="text-xs text-gray-500 dark:text-gray-400">Monitoring anomalies</p>
               </div>
               <button onClick={() => setActiveTab('Real-Time Alerts')} className="text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors shadow-sm dark:text-brand-400 dark:bg-brand-900/20 dark:hover:bg-brand-900/40">View All</button>
            </div>
            <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {systemAlerts.length > 0 ? systemAlerts.slice(0, 6).map((alert) => (
                <div key={alert.id} className="group flex gap-3 items-start p-3.5 rounded-xl bg-gray-50/80 dark:bg-slate-700/50 hover:bg-white dark:hover:bg-slate-600 hover:shadow-md transition-all border border-transparent hover:border-gray-200 dark:hover:border-slate-500">
                  <div className={`w-3 h-3 mt-1 rounded-full flex-shrink-0 shadow-sm ${
                    alert.severity === 'critical' ? 'bg-red-500 shadow-red-500/40' : alert.severity === 'warning' ? 'bg-amber-500 shadow-amber-500/40' : 'bg-blue-400 shadow-blue-400/40'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug mb-1.5 line-clamp-2">{alert.message}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-brand-700 dark:text-brand-400 truncate bg-brand-100/50 dark:bg-brand-900/30 px-2 py-0.5 rounded">{alert.bird_name || `PTT ${alert.transmitter_id}`}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 whitespace-nowrap bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded shadow-sm border border-gray-100 dark:border-slate-600 font-medium">
                        {formatDateTime(alert.timestamp, timeZone).split(' ')[1]}
                      </span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-slate-700/50 flex items-center justify-center">
                    <ShieldAlert size={28} className="text-gray-300 dark:text-gray-500" />
                  </div>
                  <span className="text-sm font-semibold">No anomalies detected</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
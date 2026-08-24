import React, { useState, useEffect, useRef, useMemo } from 'react';
import { KPICard } from '../components/KPICard';
import { Radio, AlertTriangle, Battery, Navigation, Activity, Satellite, Clock, ShieldAlert, Zap, Maximize, Minimize, Filter, Calendar, Search, Check, X, ChevronDown, SlidersHorizontal, Layers, Percent, FileText } from 'lucide-react';
import { HoubaraIcon } from '../components/HoubaraIcon';
import { useAppStore } from '../store/appStore';
import { 
  AreaChart, Area, 
  BarChart, Bar, 
  PieChart, Pie, Cell, 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { formatDateTime, formatBattery, getYearMonthKey, getCurrentYearMonthKey, getSystemTimeZone, findBirdForTransmitter, isBirdLinkedToTransmitter } from '../utils/formatting';
import { calculateNormalAccuracy, calculateStaticTestAccuracy } from '../utils/accuracyCalculator';

const renderCustomizedLabel = (props: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, value, name, x, y } = props;
  const RADIAN = Math.PI / 180;
  const isMobile = typeof window !== 'undefined' && (window.innerWidth < 640 || window.location.search.includes('mode=ios'));
  
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
        className="text-slate-700 dark:text-slate-300 font-medium" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central" 
        fontSize={isMobile ? 11 : 13} 
      >
        {name}
      </text>
      <text 
        x={xInside} 
        y={yInside} 
        fill="#ffffff" 
        textAnchor="middle" 
        dominantBaseline="central" 
        fontSize={isMobile ? 11 : 13} 
        fontWeight="bold"
      >
        {value}
      </text>
    </g>
  );
};

export const Dashboard = () => {
  const { transmitters, birds, alerts, positions, timeZone, setActiveTab, lastIngestTime } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    document.addEventListener('webkitfullscreenchange', handleFSChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFSChange);
      document.removeEventListener('webkitfullscreenchange', handleFSChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current || document.documentElement;
    if (isFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitFullscreenElement) {
        (document as any).webkitExitFullscreen();
      }
      setIsFullscreen(false);
    } else {
      if (el.requestFullscreen) {
        el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => setIsFullscreen(true));
      } else if ((el as any).webkitRequestFullscreen) {
        (el as any).webkitRequestFullscreen();
        setIsFullscreen(true);
      } else {
        setIsFullscreen(true);
      }
    }
  };

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

  // Accuracy analysis state
  const [accuracyMode, setAccuracyMode] = useState<'normal' | 'static_test'>('normal');
  const [selectedAccuracyTxIds, setSelectedAccuracyTxIds] = useState<string[]>([]);
  const [accuracyDatePreset, setAccuracyDatePreset] = useState<'last_7_days' | 'last_30_days' | 'custom'>('last_7_days');
  const [accuracyStartDate, setAccuracyStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [accuracyEndDate, setAccuracyEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [isAccuracyFullscreen, setIsAccuracyFullscreen] = useState(false);

  // Esc key listener to exit full screen view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAccuracyFullscreen) {
        setIsAccuracyFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAccuracyFullscreen]);

  // Handle date preset changes
  const handleDatePresetChange = (preset: 'last_7_days' | 'last_30_days' | 'custom') => {
    setAccuracyDatePreset(preset);
    const end = new Date().toISOString().split('T')[0];
    setAccuracyEndDate(end);
    if (preset === 'last_7_days') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setAccuracyStartDate(start.toISOString().split('T')[0]);
    } else if (preset === 'last_30_days') {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      setAccuracyStartDate(start.toISOString().split('T')[0]);
    }
  };

  // Normal accuracy calculation (percentages by Location Class)
  const { chartData: normalAccuracyData, totalFixes: normalTotalFixes } = useMemo(() => {
    return calculateNormalAccuracy(positions, selectedAccuracyTxIds, accuracyStartDate, accuracyEndDate);
  }, [positions, selectedAccuracyTxIds, accuracyStartDate, accuracyEndDate]);

  // Static Test accuracy calculation (SensorStaticTest.R)
  const staticTestAnalysis = useMemo(() => {
    return calculateStaticTestAccuracy(positions, transmitters, selectedAccuracyTxIds, accuracyStartDate, accuracyEndDate);
  }, [positions, transmitters, selectedAccuracyTxIds, accuracyStartDate, accuracyEndDate]);

  // Modal helpers for selecting transmitters
  const filteredModalTransmitters = useMemo(() => {
    const q = txSearchQuery.toLowerCase().trim();
    return transmitters.filter(t => {
      const bird = findBirdForTransmitter(birds, t.bird_id);
      const matchId = String(t.platform_id).toLowerCase().includes(q);
      const matchBird = bird ? (bird.ring_id.toLowerCase().includes(q) || (bird as any).name?.toLowerCase().includes(q)) : false;
      return !q || matchId || matchBird;
    });
  }, [transmitters, birds, txSearchQuery]);

  const selectAllFilteredTx = () => {
    const ids = filteredModalTransmitters.map(t => String(t.platform_id));
    setSelectedAccuracyTxIds(prev => Array.from(new Set([...prev, ...ids])));
  };

  const clearTxSelection = () => {
    setSelectedAccuracyTxIds([]);
  };

  const toggleTxSelection = (platformId: string) => {
    setSelectedAccuracyTxIds(prev =>
      prev.includes(platformId) ? prev.filter(id => id !== platformId) : [...prev, platformId]
    );
  };

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
  const activeBirdsCount = useMemo(() => {
    const activeTx = transmitters.filter(t => {
      const s = t.derived_status || t.status;
      return s === 'Active' || s === 'active';
    });
    return birds.filter(b => 
      activeTx.some(t => isBirdLinkedToTransmitter(b, t))
    ).length;
  }, [birds, transmitters]);
  const systemAlerts = alerts.filter(a => a.type !== 'ticket_created');
  const activeAlertsCount = systemAlerts.filter(a => a.status === 'active').length;
  const criticalAlertsCount = systemAlerts.filter(a => a.status === 'active' && a.severity === 'critical').length;
  
  // Recent 24h Activity
  const fixesLast24h = useMemo(() => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    return positions.filter(p => new Date(p.timestamp).getTime() >= dayAgo).length;
  }, [positions]);

  // Ingestion date/time (the moment when data update occurred, formatted in device system timezone)
  const lastIngestDate = useMemo(() => {
    if (lastIngestTime) {
      return formatDateTime(lastIngestTime, getSystemTimeZone());
    }
    // Fallback: Find the latest (max) position timestamp or transmitter last_fix across system
    let maxTs: number | null = null;
    positions.forEach(p => {
      const t = new Date(p.timestamp).getTime();
      if (!isNaN(t) && (maxTs === null || t > maxTs)) {
        maxTs = t;
      }
    });
    if (!maxTs) {
      transmitters.forEach(tx => {
        if (tx.last_fix) {
          const t = new Date(tx.last_fix).getTime();
          if (!isNaN(t) && (maxTs === null || t > maxTs)) {
            maxTs = t;
          }
        }
      });
    }
    if (!maxTs) return 'No Data';
    return formatDateTime(new Date(maxTs).toISOString(), getSystemTimeZone());
  }, [lastIngestTime, positions, transmitters]);

  // Current calendar month key for static test active filtering
  const currentYearMonthKey = useMemo(() => getCurrentYearMonthKey(), []);

  const hasCurrentMonthFixesMap = useMemo(() => {
    const map = new Map<string, boolean>();
    positions.forEach(p => {
      const pid = String(p.transmitter_id || (p as any).platformId || (p as any).platform_id || '');
      if (!pid) return;
      if (getYearMonthKey(p.timestamp) === currentYearMonthKey) {
        map.set(pid, true);
      }
    });
    return map;
  }, [positions, currentYearMonthKey]);

  // Transmitters Status Data (Mirroring Live Map current situation)
  const normalizeStatus = (raw?: string): string => {
    if (!raw) return 'Unknown';
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === 'active') return 'Active';
    if (trimmed === 'inactive') return 'Inactive';
    if (trimmed === 'potential mortality' || trimmed === 'potential_mortality') return 'Potential Mortality';
    if (trimmed === 'static test' || trimmed === 'static_test') return 'Static test';
    if (trimmed === 'dead') return 'Dead';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };

  const activeLiveTransmitters = useMemo(() => {
    return transmitters.filter(t => {
      const status = normalizeStatus(t.derived_status || t.status);
      if (status === 'Static test') {
        return hasCurrentMonthFixesMap.get(String(t.platform_id));
      }
      return true;
    });
  }, [transmitters, hasCurrentMonthFixesMap]);

  const allStatuses = useMemo(() => {
    return activeLiveTransmitters.reduce((acc, t) => {
      const s = normalizeStatus(t.derived_status || t.status);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [activeLiveTransmitters]);
  
  const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1', '#a855f7', '#d946ef'];
  const transmitterStatusData = useMemo(() => {
    return Object.entries(allStatuses).map(([name, value], i) => {
      let color = CHART_COLORS[i % CHART_COLORS.length];
      if (name.toLowerCase() === 'active') color = '#10b981'; // Green
      else if (name.toLowerCase() === 'static test') color = '#eab308'; // Yellow
      else if (name.toLowerCase() === 'potential mortality') color = '#f97316'; // Orange
      else if (name.toLowerCase() === 'inactive') color = '#0f172a'; // Slate-900 / Near-black
      else if (name.toLowerCase() === 'dead') color = '#dc2626'; // Red
      
      return { name, value, color };
    });
  }, [allStatuses]);
  
  const statusData = useMemo(() => {
    return [
      { name: 'Active', value: activeLiveTransmitters.filter(t => normalizeStatus(t.derived_status || t.status) === 'Active').length, color: '#10b981' },
      { name: 'Static test', value: activeLiveTransmitters.filter(t => normalizeStatus(t.derived_status || t.status) === 'Static test').length, color: '#eab308' },
      { name: 'Potential Mortality', value: activeLiveTransmitters.filter(t => normalizeStatus(t.derived_status || t.status) === 'Potential Mortality').length, color: '#f97316' },
      { name: 'Inactive', value: activeLiveTransmitters.filter(t => normalizeStatus(t.derived_status || t.status) === 'Inactive').length, color: '#0f172a' },
      { name: 'Dead', value: activeLiveTransmitters.filter(t => normalizeStatus(t.derived_status || t.status) === 'Dead').length, color: '#dc2626' }
    ].filter(d => d.value > 0);
  }, [activeLiveTransmitters]);

  // Fleet Overview (Top 5 recent)
  const recentFleet = useMemo(() => {
    return [...transmitters]
        .filter(t => t.last_fix)
        .sort((a, b) => new Date(b.last_fix).getTime() - new Date(a.last_fix).getTime())
        .slice(0, 5);
  }, [transmitters]);

  const isIOSMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('mode') === 'ios' || searchParams.get('app') === 'ios' || !!(window as any).isIOSApp || !!(window as any).isNativeIOS;
  }, []);

  const [isIPad, setIsIPad] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkIPad = () => {
        // Use 640px to capture iPad mini as well
        setIsIPad((window.innerWidth >= 640 && window.innerHeight >= 800) || (window.innerWidth >= 800 && window.innerHeight >= 640));
      };
      checkIPad();
      window.addEventListener('resize', checkIPad);
      return () => window.removeEventListener('resize', checkIPad);
    }
  }, []);

  if (isIOSMode) {
    return (
      <div className="p-2 sm:p-4 max-w-3xl sm:max-w-4xl lg:max-w-5xl mx-auto space-y-3 animate-fade-in pb-16">
        {/* iOS Transmitters Status Breakdown Card Only */}
        <div className="bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-850 p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-700 shadow-md sm:shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -top-4 -right-4 sm:-top-6 sm:-right-6 p-6 sm:p-10 opacity-5 pointer-events-none">
            <Radio size={isIPad ? 210 : 140} className="text-brand-600 dark:text-brand-400" />
          </div>

          {/* Card Header */}
          <div className="flex items-center justify-between w-full z-10 mb-2 sm:mb-5">
            <div className="flex items-center gap-2.5 sm:gap-4">
              <div className="p-2 sm:p-3 bg-brand-50 dark:bg-brand-900/30 rounded-xl sm:rounded-2xl border border-brand-100 dark:border-brand-800/50">
                <Radio size={isIPad ? 30 : 20} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <h3 className="text-base sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">Transmitters Status</h3>
                <p className="text-xs sm:text-lg text-gray-500 dark:text-gray-400 mt-1 sm:mt-1.5">Real-time health & operational status of deployed PTTs</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2.5 bg-slate-100 dark:bg-slate-700/80 px-3 sm:px-5 py-1 sm:py-2.5 rounded-full border border-slate-200 dark:border-slate-600 flex-shrink-0">
              <span className="text-xs sm:text-base text-slate-500 dark:text-slate-400 font-medium">Total:</span>
              <strong className="text-slate-900 dark:text-white font-bold text-sm sm:text-xl">{activeLiveTransmitters.length}</strong>
            </div>
          </div>
          
          {/* Main Donut Chart Container */}
          <div className="h-[280px] sm:h-[420px] w-full z-10 my-1 sm:my-3 relative flex items-center justify-center">
             {transmitterStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={transmitterStatusData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={isIPad ? 100 : 65} 
                    outerRadius={isIPad ? 165 : 110} 
                    paddingAngle={3} 
                    dataKey="value" 
                    stroke="#ffffff"
                    strokeWidth={isIPad ? 3 : 2}
                    labelLine={{ stroke: '#9ca3af', strokeWidth: isIPad ? 2 : 1.5 }}
                    label={renderCustomizedLabel}
                    animationDuration={1200}
                  >
                    {transmitterStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  {/* Center Donut Label */}
                  <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="fill-gray-900 dark:fill-white font-black text-2xl sm:text-4xl">
                    {activeLiveTransmitters.length}
                  </text>
                  <text x="50%" y="57%" textAnchor="middle" dominantBaseline="middle" className="fill-gray-400 dark:fill-gray-500 font-bold text-[10px] sm:text-[15px] uppercase tracking-wider">
                    Units
                  </text>
                  <RechartsTooltip 
                    contentStyle={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155', color: '#fff', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }} 
                    itemStyle={{ color: '#fff', fontWeight: 600 }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </div>

          {/* Status Breakdown Pills - Adaptable Grid */}
          <div className="z-10 mt-2 sm:mt-6 pt-3 sm:pt-5 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 gap-2 sm:gap-3 w-full">
            {transmitterStatusData.map((st) => (
              <div 
                key={st.name} 
                className="flex items-center justify-between gap-1.5 sm:gap-2 bg-white dark:bg-slate-750 px-3 sm:px-5 py-2 sm:py-3 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs sm:shadow-sm transition-all w-full min-w-0"
              >
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                  <span className="text-[11px] sm:text-lg font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{st.name}:</span>
                </div>
                <span className="text-[11px] sm:text-lg font-black px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white flex-shrink-0 ml-1">
                  {st.value}
                </span>
              </div>
            ))}
          </div>

          {/* Last Data Update Timestamp Info in the same window */}
          <div className="z-10 mt-4 sm:mt-6 pt-3 sm:pt-5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs sm:text-lg text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <Activity size={isIPad ? 20 : 14} className="text-brand-600 animate-pulse" />
              <span>Last Data Update:</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-200 tracking-wide sm:text-xl" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>
              {lastIngestDate}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`space-y-6 animate-fade-in pb-8 transition-all duration-300 ${
        isFullscreen ? 'p-6 bg-slate-50 dark:bg-slate-900 overflow-y-auto h-screen w-screen fixed top-0 left-0 z-50' : ''
      }`}
    >
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Global Command Center</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Asian Houbara Satellite Tracking Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 py-2 px-4 rounded-full border border-gray-200 dark:border-slate-700 shadow-md flex items-center gap-2">
            <Activity size={16} className="text-brand-600 animate-pulse" />
            Last Ingest: <span className="font-semibold text-gray-900 dark:text-gray-200 tracking-wide" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{lastIngestDate}</span>
          </div>

          <button
            onClick={toggleFullscreen}
            className={`py-2 px-4.5 rounded-full border border-gray-200 dark:border-slate-700 shadow-md flex items-center gap-2 text-xs font-bold transition-all ${
              isFullscreen 
                ? 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700' 
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* Top Level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        
        {/* Transmitters Network Status Card */}
        <div className="col-span-1 md:col-span-2 xl:col-span-2 bg-gradient-to-br from-slate-50 via-white to-slate-50/50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-850 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-md relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute -top-4 -right-4 p-6 opacity-5 group-hover:opacity-15 transition-opacity pointer-events-none">
            <Radio size={140} className="text-brand-600 dark:text-brand-400" />
          </div>

          {/* Card Header */}
          <div className="flex items-center justify-between w-full z-10 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-xl border border-brand-100 dark:border-brand-800/50">
                <Radio size={20} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Transmitters Status Breakdown</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Real-time health & operational status of deployed PTTs</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700/80 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-600">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total:</span>
              <strong className="text-slate-900 dark:text-white font-bold text-sm">{activeLiveTransmitters.length}</strong>
            </div>
          </div>
          
          {/* Main Donut Chart Container */}
          <div className="h-[280px] w-full z-10 my-1 relative flex items-center justify-center">
             {transmitterStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={transmitterStatusData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={65} 
                    outerRadius={110} 
                    paddingAngle={3} 
                    dataKey="value" 
                    stroke="#ffffff"
                    strokeWidth={2}
                    labelLine={{ stroke: '#9ca3af', strokeWidth: 1.5 }}
                    label={renderCustomizedLabel}
                    animationDuration={1200}
                  >
                    {transmitterStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  {/* Center Donut Label */}
                  <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="fill-gray-900 dark:fill-white font-black text-2xl">
                    {activeLiveTransmitters.length}
                  </text>
                  <text x="50%" y="57%" textAnchor="middle" dominantBaseline="middle" className="fill-gray-400 dark:fill-gray-500 font-bold text-[10px] uppercase tracking-wider">
                    Units
                  </text>
                  <RechartsTooltip 
                    contentStyle={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155', color: '#fff', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }} 
                    itemStyle={{ color: '#fff', fontWeight: 600 }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </div>

          {/* Status Breakdown Pills - Adaptable Full-Width Grid */}
          <div className="z-10 mt-2 pt-3 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 w-full">
            {transmitterStatusData.map((st) => (
              <div 
                key={st.name} 
                className="flex items-center justify-between gap-1.5 bg-white dark:bg-slate-750 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs hover:shadow-xs transition-all w-full min-w-0"
              >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{st.name}:</span>
                </div>
                <span className="text-xs font-black px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white flex-shrink-0">
                  {st.value}
                </span>
              </div>
            ))}
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

          {/* Lower Analytical Section (Extended Fix Accuracy Analysis) */}
          <div className="w-full">
            
            {/* Fix Accuracy Card (Supports Normal % & SensorStaticTest.R) */}
            <div className={`bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm transition-all w-full ${
              isAccuracyFullscreen 
                ? 'fixed inset-0 z-[9999] m-0 rounded-none p-6 md:p-10 overflow-y-auto w-screen h-screen bg-white dark:bg-slate-900 animate-in fade-in duration-200' 
                : ''
            }`}>
              
              {/* Header & Controls Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100 dark:border-slate-700">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fix Accuracy Analysis</h3>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${accuracyMode === 'normal' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'}`}>
                      {accuracyMode === 'normal' ? 'Percentage Mode' : 'Static Test (SensorStaticTest.R)'}
                    </span>
                    {isAccuracyFullscreen && (
                      <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                        Full Screen Mode
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {selectedAccuracyTxIds.length === 0 ? 'All Transmitters' : `${selectedAccuracyTxIds.length} Transmitters Selected`} · {accuracyStartDate} to {accuracyEndDate}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Mode Toggle */}
                  <div className="flex bg-gray-100 dark:bg-slate-700/60 p-1 rounded-xl">
                    <button
                      onClick={() => setAccuracyMode('normal')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${accuracyMode === 'normal' ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-300 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                    >
                      <Percent size={13} />
                      Normal Fixes
                    </button>
                    <button
                      onClick={() => setAccuracyMode('static_test')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${accuracyMode === 'static_test' ? 'bg-yellow-400 text-slate-900 shadow-sm font-extrabold' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                    >
                      <SlidersHorizontal size={13} />
                      Static Test Only
                    </button>
                  </div>

                  {/* Transmitter Selection Trigger Button */}
                  <button
                    onClick={() => setIsTxModalOpen(true)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300 flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Filter size={13} className="text-brand-600 dark:text-brand-400" />
                    {selectedAccuracyTxIds.length === 0 ? 'All Transmitters' : `${selectedAccuracyTxIds.length} Selected`}
                    <ChevronDown size={13} className="text-gray-400" />
                  </button>

                  {/* Date Range Selector */}
                  <div className="flex items-center gap-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-1 text-xs">
                    <button
                      onClick={() => handleDatePresetChange('last_7_days')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${accuracyDatePreset === 'last_7_days' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                    >
                      7D
                    </button>
                    <button
                      onClick={() => handleDatePresetChange('last_30_days')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${accuracyDatePreset === 'last_30_days' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                    >
                      30D
                    </button>
                    <button
                      onClick={() => setAccuracyDatePreset('custom')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${accuracyDatePreset === 'custom' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                    >
                      Custom
                    </button>
                  </div>

                  {accuracyDatePreset === 'custom' && (
                    <div className="flex items-center gap-1 text-xs">
                      <input
                        type="date"
                        value={accuracyStartDate}
                        onChange={(e) => setAccuracyStartDate(e.target.value)}
                        className="px-2 py-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-gray-300 text-xs"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="date"
                        value={accuracyEndDate}
                        onChange={(e) => setAccuracyEndDate(e.target.value)}
                        className="px-2 py-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-gray-300 text-xs"
                      />
                    </div>
                  )}

                  {/* Full Screen View Toggle Button */}
                  <button
                    onClick={() => setIsAccuracyFullscreen(!isAccuracyFullscreen)}
                    title={isAccuracyFullscreen ? "Exit Full Screen (Esc)" : "Full Screen View"}
                    className="p-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 hover:bg-brand-50 hover:border-brand-300 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 flex items-center justify-center transition-all shadow-sm"
                  >
                    {isAccuracyFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                  </button>
                </div>
              </div>

              {/* Normal Mode Presentation */}
              {accuracyMode === 'normal' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                  <div className={`w-full lg:col-span-1 transition-all ${isAccuracyFullscreen ? 'h-[440px]' : 'h-64'}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={normalAccuracyData}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="lc" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 700 }} />
                        <Radar name="Accuracy (%)" dataKey="percentage" stroke="#3b82f6" strokeWidth={2.5} fill="#3b82f6" fillOpacity={0.4} animationDuration={1200} />
                        <RechartsTooltip 
                          formatter={(val: any, name: any, item: any) => [`${val}% (${item.payload.count} fixes)`, 'Accuracy']}
                          contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', borderColor: '#334155', borderRadius: '8px' }}
                          itemStyle={{ color: '#3b82f6', fontWeight: 600 }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Percentage Pill Breakdown (Expanded Full Width Grid) */}
                  <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {normalAccuracyData.map(item => (
                      <div key={item.lc} className="bg-gray-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-gray-100 dark:border-slate-700/50 shadow-sm flex flex-col justify-between">
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold truncate">{item.label}</div>
                        <div className="text-xl font-extrabold text-gray-900 dark:text-white my-1">{item.percentage}%</div>
                        <div className="text-[11px] text-brand-600 dark:text-brand-400 font-mono font-medium">{item.count} fixes</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Static Test Mode Presentation (SensorStaticTest.R) */}
              {accuracyMode === 'static_test' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Spatial Accuracy Bins Chart */}
                    <div className="md:col-span-1 bg-yellow-50/50 dark:bg-yellow-950/20 p-4 rounded-xl border border-yellow-200 dark:border-yellow-900/40">
                      <h4 className="text-xs font-bold text-yellow-900 dark:text-yellow-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <SlidersHorizontal size={14} /> Spatial Accuracy Bins
                      </h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">Excludes 2 initial days + 1 final day</p>
                      
                      <div className={`w-full transition-all ${isAccuracyFullscreen ? 'h-[360px]' : 'h-44'}`}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={staticTestAnalysis.aggregateSpatial} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                            <XAxis dataKey="bin" tick={{ fontSize: 10, fill: '#854d0e', fontWeight: 600 }} />
                            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} unit="%" />
                            <RechartsTooltip
                              formatter={(val: any) => [`${val}%`, 'Spatial Accuracy']}
                              contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', borderColor: '#eab308', borderRadius: '8px' }}
                              itemStyle={{ color: '#eab308', fontWeight: 600 }}
                            />
                            <Bar dataKey="percentage" radius={[4, 4, 0, 0]} fill="#eab308" animationDuration={1000} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* SensorStaticTest.R Telemetry Sessions Table */}
                    <div className="md:col-span-2 overflow-x-auto">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                          <FileText size={14} className="text-yellow-600" /> Test Sessions Summary (SensorStaticTest.R)
                        </h4>
                        <span className="text-xs text-gray-500">{staticTestAnalysis.results.length} Sessions Analyzed</span>
                      </div>

                      {staticTestAnalysis.results.length > 0 ? (
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 uppercase text-[10px] font-bold">
                              <th className="px-3 py-2">Transmitter</th>
                              <th className="px-3 py-2">Model</th>
                              <th className="px-3 py-2 text-center">Effect. Duration</th>
                              <th className="px-3 py-2 text-center">Barycentre (Lat, Lon)</th>
                              <th className="px-3 py-2 text-center">GPS Fixes (nPos)</th>
                              <th className="px-3 py-2 text-center">Mean/Day</th>
                              <th className="px-3 py-2 text-center">P0_10 (&le;10m)</th>
                              <th className="px-3 py-2 text-center">P0_20 (&le;20m)</th>
                              <th className="px-3 py-2 text-center">P20_50</th>
                              <th className="px-3 py-2 text-center">Psupp50 (&gt;50m)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                            {staticTestAnalysis.results.map((r, idx) => (
                              <tr key={`${r.transmitterId}-${idx}`} className="hover:bg-yellow-50/40 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-3 py-2.5 font-bold text-gray-900 dark:text-white">{r.transmitterId}</td>
                                <td className="px-3 py-2.5 text-gray-500">{r.model || 'SolarPTT'}</td>
                                <td className="px-3 py-2.5 text-center font-medium">{r.effectiveDurationDays} d</td>
                                <td className="px-3 py-2.5 text-center font-mono text-[11px]">{r.mLat.toFixed(3)}, {r.mLon.toFixed(3)}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-brand-600 dark:text-brand-400">{r.nPos}</td>
                                <td className="px-3 py-2.5 text-center font-medium">{r.meanPosDay}</td>
                                <td className="px-3 py-2.5 text-center font-semibold text-emerald-600">{r.p0_10}%</td>
                                <td className="px-3 py-2.5 text-center font-semibold text-emerald-600">{r.p0_20}%</td>
                                <td className="px-3 py-2.5 text-center font-medium text-amber-600">{r.p20_50}%</td>
                                <td className="px-3 py-2.5 text-center font-bold text-red-500">{r.psupp50}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-8 text-center bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700 text-gray-400 text-xs">
                          No active Static Test sessions found in the selected date window.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Right Column - Side Panels */}
        <div className="space-y-6">
          
          {/* Recent Alerts Feed (Moved to Top) */}
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
                      <span className="text-[11px] font-semibold text-brand-700 dark:text-brand-400 truncate bg-brand-100/50 dark:bg-brand-900/30 px-2 py-0.5 rounded">{alert.transmitter_id}</span>
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

      {/* Transmitter Selection Modal */}
      {isTxModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-gray-100 dark:border-slate-700 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Select Transmitters</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Filter accuracy metrics by individual or bulk transmitters</p>
              </div>
              <button
                onClick={() => setIsTxModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3 flex-1 overflow-hidden flex flex-col">
              {/* Search Input */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search Transmitter ID or Bird..."
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 text-gray-800 dark:text-gray-200"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 text-xs">
                <button
                  onClick={selectAllFilteredTx}
                  className="flex-1 py-1.5 font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 rounded-lg transition-colors"
                >
                  Select All ({filteredModalTransmitters.length})
                </button>
                <button
                  onClick={clearTxSelection}
                  className="flex-1 py-1.5 font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Clear Selection
                </button>
              </div>

              {/* Transmitter Checkbox List */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                {filteredModalTransmitters.map((t) => {
                  const bird = findBirdForTransmitter(birds, t.bird_id);
                  const isSelected = selectedAccuracyTxIds.includes(String(t.platform_id));
                  const status = t.derived_status || t.status;

                  let badgeColor = 'bg-slate-900 text-white';
                  if (status === 'Active' || status === 'active') badgeColor = 'bg-green-100 text-green-700';
                  if (status === 'Potential Mortality') badgeColor = 'bg-amber-100 text-amber-800';
                  if (status === 'Static test') badgeColor = 'bg-yellow-100 text-yellow-800';
                  if (status === 'Dead' || status === 'dead') badgeColor = 'bg-red-600 text-white';

                  return (
                    <div
                      key={t.id}
                      onClick={() => toggleTxSelection(String(t.platform_id))}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-900/20'
                          : 'border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                          }`}
                        >
                          {isSelected && <Check size={12} />}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 dark:text-white">{t.platform_id}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {bird ? `Bird: ${bird.ring_id}` : 'Unassigned'} · {t.model}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectedAccuracyTxIds.length === 0 ? 'All Transmitters Active' : `${selectedAccuracyTxIds.length} Transmitters Selected`}
              </span>
              <button
                onClick={() => setIsTxModalOpen(false)}
                className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition-colors"
              >
                Apply Selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
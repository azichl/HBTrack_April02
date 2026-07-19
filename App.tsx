
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { logUserActivity } from './services/activityLogger';
import { Login } from './views/Login';
import { Sidebar } from './components/Sidebar';
import { useAppStore } from './store/appStore';
import { Dashboard } from './views/Dashboard';
import { LiveTracking } from './views/LiveTracking';
import { GeofenceAlerts } from './views/GeofenceAlerts';
import { AIPredictions } from './views/AIPredictions';
import { Database } from './views/Database';
import { Monitoring } from './views/Monitoring';
import { Reports } from './views/Reports';
import { Alerts } from './views/Alerts';
import { UserManagement } from './views/UserManagement';
import { GISFeatures } from './views/GISFeatures';
import { Settings } from './views/Settings';
import { HelpSupport } from './views/HelpSupport';
import { GeoSpatialAnalysis } from './views/GeoSpatialAnalysis';
import { Bell, Search, UserCircle, Menu, LogOut, Radio, X, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { HoubaraIcon } from './components/HoubaraIcon';

// Placeholder components for other views
const PlaceholderView = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-96 text-gray-400 dark:text-gray-500">
    <h2 className="text-2xl font-bold text-gray-300 dark:text-gray-600 mb-2">{title}</h2>
    <p>This module is under construction.</p>
  </div>
);

// ─── Global Search Bar ────────────────────────────────────────────────────────
const GlobalSearch = ({ onNavigate }: { onNavigate: (tab: string) => void }) => {
  const { transmitters, birds, alerts } = useAppStore();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.toLowerCase().trim();

  const matchedTransmitters = q
    ? transmitters.filter(t =>
        t.platform_id?.toLowerCase().includes(q) ||
        t.model?.toLowerCase().includes(q) ||
        t.status?.toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const matchedBirds = q
    ? birds.filter(b =>
        b.ring_id?.toLowerCase().includes(q) ||
        b.species?.toLowerCase().includes(q) ||
        b.sex?.toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const matchedAlerts = q
    ? alerts.filter(a =>
        a.message?.toLowerCase().includes(q) ||
        a.transmitter_id?.toLowerCase().includes(q) ||
        a.type?.toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const hasResults = matchedTransmitters.length > 0 || matchedBirds.length > 0 || matchedAlerts.length > 0;

  const handleSelect = (tab: string) => {
    setQuery('');
    setOpen(false);
    onNavigate(tab);
  };

  return (
    <div ref={ref} className="relative hidden md:flex items-center flex-1 max-w-md">
      <div className="relative w-full">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search birds, PTTs, or alerts..."
          className="w-full pl-9 pr-9 py-2 bg-gray-100 dark:bg-slate-700 border border-transparent focus:border-brand-400 focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-900 rounded-lg text-sm outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {open && q && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xl z-[200] overflow-hidden max-h-96 overflow-y-auto">
          {!hasResults && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">No results for "{query}"</div>
          )}

          {matchedTransmitters.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">Transmitters</div>
              {matchedTransmitters.map(t => (
                <button key={t.id} onClick={() => handleSelect('Database')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-left group">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Radio size={14} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">PTT {t.platform_id}</p>
                    <p className="text-xs text-gray-400 truncate">{t.model} · <span className={`font-medium ${t.status === 'active' ? 'text-green-500' : 'text-red-400'}`}>{t.status}</span></p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {matchedBirds.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">Birds</div>
              {matchedBirds.map(b => (
                <button key={b.id} onClick={() => handleSelect('Live Tracking')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-left">
                  <div className="w-8 h-8 bg-brand-50 dark:bg-brand-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HoubaraIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{b.ring_id}</p>
                    <p className="text-xs text-gray-400 truncate">{b.species} · {b.sex === 'M' ? 'Male' : 'Female'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {matchedAlerts.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">Alerts</div>
              {matchedAlerts.map(a => (
                <button key={a.id} onClick={() => handleSelect('Real-Time Alerts')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-left">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/30' : a.severity === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                    <AlertTriangle size={14} className={a.severity === 'critical' ? 'text-red-600' : a.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.message}</p>
                    <p className="text-xs text-gray-400 truncate">PTT {a.transmitter_id} · {a.type.replace(/_/g, ' ')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Notification Bell Panel ──────────────────────────────────────────────────
const NotificationPanel = ({ onNavigate }: { onNavigate: (tab: string) => void }) => {
  const { alerts, resolveAlert, currentUserRole } = useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeAlerts = alerts.filter(a => {
    if (a.status !== 'active') return false;
    if (a.type === 'ticket_created' && !['Administrator', 'Researcher', 'Data Analyst', 'Data Entry'].includes(currentUserRole)) {
      return false;
    }
    return true;
  });
  
  const recent = [...activeAlerts].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8);

  const severityIcon = (sev: string) => {
    if (sev === 'critical') return <AlertTriangle size={14} className="text-red-500" />;
    if (sev === 'warning') return <AlertTriangle size={14} className="text-amber-500" />;
    return <Info size={14} className="text-blue-500" />;
  };

  const severityBg = (sev: string) => {
    if (sev === 'critical') return 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/30';
    if (sev === 'warning') return 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/30';
    return 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30';
  };

  const formatTime = (ts: string) => {
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"
      >
        <Bell size={20} />
        {activeAlerts.length > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-[9px] font-bold text-white leading-none">
            {activeAlerts.length > 9 ? '9+' : activeAlerts.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xl z-[200] overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Notifications</h3>
              <p className="text-xs text-gray-400">{activeAlerts.length} active alert{activeAlerts.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => { setOpen(false); onNavigate('Real-Time Alerts'); }}
              className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
            >
              View all
            </button>
          </div>

          {/* Alert list */}
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-700">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <CheckCircle size={28} className="mb-2 text-green-400" />
                <p className="text-sm">All clear! No recent alerts.</p>
              </div>
            ) : (
              recent.map(alert => (
                <div key={alert.id} className={`flex items-start gap-3 px-4 py-3 ${alert.status === 'active' ? '' : 'opacity-50'}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border ${severityBg(alert.severity)}`}>
                    {severityIcon(alert.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight truncate">{alert.message}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">PTT {alert.transmitter_id} · {formatTime(alert.timestamp)}</p>
                  </div>
                  {alert.status === 'active' && (
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="flex-shrink-0 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                      title="Resolve alert"
                    >
                      <CheckCircle size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40">
            <button
              onClick={() => { setOpen(false); onNavigate('Real-Time Alerts'); }}
              className="w-full py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
            >
              Manage All Alerts →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────
const App = () => {
  const { activeTab, darkMode, sidebarOpen, toggleSidebar, currentUser, setCurrentUser, authLoading, setAuthLoading, initializeFromFirestore, subscribeToLivePositions, setActiveTab } = useAppStore();
  const liveUnsubRef = useRef<(() => void) | null>(null);
  const firestoreInitialized = useRef(false);

  // Define auto-logout behavior on idle
  const handleIdle = useCallback(() => {
    if (currentUser) {
      logUserActivity(currentUser.uid, currentUser.email || '', 'AUTO_LOGOUT_IDLE', 'Logged out due to 30 mins of inactivity');
      signOut(auth).catch(console.error);
    }
  }, [currentUser]);

  useIdleTimeout({ onIdle: handleIdle, idleTimeMs: 30 * 60 * 1000 }); // 30 minutes

  // --- Tracking: Page Views & Time Spent ---
  const tabEnteredAt = useRef(Date.now());
  const prevTab = useRef(activeTab);

  useEffect(() => {
    if (currentUser && prevTab.current !== activeTab) {
      const timeSpentSeconds = Math.round((Date.now() - tabEnteredAt.current) / 1000);
      
      // Log time spent on the previous page
      logUserActivity(currentUser.uid, currentUser.email || '', 'TIME_SPENT_ON_PAGE', `Spent ${timeSpentSeconds}s on ${prevTab.current}`);
      
      // Log page view for the new page
      logUserActivity(currentUser.uid, currentUser.email || '', 'PAGE_VIEW', `Viewed ${activeTab}`);

      tabEnteredAt.current = Date.now();
      prevTab.current = activeTab;
    }
  }, [activeTab, currentUser]);

  // --- Tracking: Meaningful Clicks ---
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!currentUser) return;
      const target = e.target as HTMLElement;
      // Find closest button or link
      const clickable = target.closest('button, a');
      if (clickable) {
        const text = clickable.textContent?.trim().slice(0, 50) || clickable.getAttribute('aria-label') || clickable.getAttribute('title') || 'Icon/Element';
        if (text) {
          const type = clickable.tagName.toLowerCase();
          logUserActivity(currentUser.uid, currentUser.email || '', 'USER_CLICK', `Clicked ${type} "${text}"`);
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [currentUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(false);

      if (user && !firestoreInitialized.current) {
        firestoreInitialized.current = true;
        // Log Session Start when user successfully authenticates
        logUserActivity(user.uid, user.email || '', 'SESSION_START', 'User logged in');
        
        await initializeFromFirestore();
        liveUnsubRef.current = subscribeToLivePositions();
      }

      if (!user) {
        firestoreInitialized.current = false;
        if (liveUnsubRef.current) {
          liveUnsubRef.current();
          liveUnsubRef.current = null;
        }
      }
    });
    return () => {
      unsubscribe();
      if (liveUnsubRef.current) liveUnsubRef.current();
    };
  }, []);

  const handleLogout = async () => {
    try {
      if (currentUser) {
        await logUserActivity(currentUser.uid, currentUser.email || '', 'SESSION_END', 'User logged out manually');
      }
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleNavigate = useCallback((tab: string) => {
    setActiveTab(tab);
  }, [setActiveTab]);

  const searchParams = new URLSearchParams(window.location.search);
  const isStandalone = searchParams.get('standalone') === 'true';
  const urlTab = searchParams.get('tab');
  const currentView = (isStandalone && urlTab) ? urlTab : activeTab;

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  const renderContent = () => {
    switch (currentView) {
      case 'Dashboard': return <Dashboard />;
      case 'Real-Time Alerts': return <Alerts />;
      case 'Live Tracking': return <LiveTracking />;
      case 'AI Predictions': return <AIPredictions />;
      case 'Database': return <Database />;
      case 'Monitoring': return <Monitoring />;
      case 'Reports': return <Reports />;
      case 'Geo Spatial Analysis': return <GeoSpatialAnalysis />;
      case 'Alerts': return <Alerts />;
      case 'Geofence Alerts': return <GeofenceAlerts />;

      case 'User Management': return <UserManagement />;
      case 'GIS Features': return <GISFeatures />;
      case 'Settings': return <Settings />;
      case 'Help & Support': return <HelpSupport />;
      default: return <PlaceholderView title={currentView} />;
    }
  };

  if (isStandalone) {
     return (
        <div className={`${darkMode ? 'dark' : ''} h-screen w-screen bg-gray-50 dark:bg-slate-900 overflow-hidden flex flex-col`}>
             <main className="flex-1 overflow-y-auto p-4 md:p-6">
                {renderContent()}
             </main>
        </div>
     );
  }

  return (
    <div className={`${darkMode ? 'dark' : ''} h-full`}>
      <div className="flex h-screen bg-gray-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-gray-100 transition-colors duration-300">

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-[990] bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={toggleSidebar}
          />
        )}

        <div className={`
            fixed inset-y-0 left-0 z-[1000] w-64 bg-white dark:bg-slate-900 transition-transform duration-300 shadow-2xl lg:shadow-none lg:static lg:transform-none lg:transition-[width] lg:overflow-hidden
            ${sidebarOpen ? 'translate-x-0 lg:w-64' : '-translate-x-full lg:w-0'}
        `}>
           <Sidebar />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden w-full relative">
          {/* Top Header */}
          <header className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-4 md:px-6 shadow-sm z-[900] relative transition-colors duration-300 flex-shrink-0">
            <div className="flex items-center gap-4 flex-1">
              <button
                onClick={toggleSidebar}
                onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSidebar();
                }}
                className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Toggle Sidebar"
                style={{ minWidth: 44, minHeight: 44, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                <Menu size={20} />
              </button>

              {/* Functional Global Search */}
              <GlobalSearch onNavigate={handleNavigate} />
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              {/* Mobile Search Button */}
              <button className="md:hidden p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full">
                <Search size={20} />
              </button>

              {/* Functional Notification Bell */}
              <NotificationPanel onNavigate={handleNavigate} />

              <div className="flex items-center gap-3 pl-2 md:pl-4 border-l border-gray-200 dark:border-slate-700">
                <div className="text-right hidden md:block">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser?.email || ''}</p>
                </div>
                <div className="w-8 h-8 md:w-10 md:h-10 bg-brand-50 dark:bg-slate-700 rounded-full flex items-center justify-center text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-slate-600">
                  <UserCircle size={20} className="md:w-6 md:h-6" />
                </div>
                <button
                  onClick={handleLogout}
                  title="Log out"
                  className="p-2 ml-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-400/10 rounded-lg transition-colors flex items-center gap-2"
                >
                  <LogOut size={20} />
                  <span className="hidden md:inline text-sm font-medium">Logout</span>
                </button>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-hidden relative bg-gray-50/50 dark:bg-slate-900/50 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 w-full mx-auto flex flex-col h-full">
               {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;

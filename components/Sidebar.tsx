
import React, { useState } from 'react';
import { performGlobalArgosSync } from '../services/argosService';
import { 
  LayoutDashboard, 
  Map, 
  FileText, 
  AlertTriangle, 
  Clock, 
  BrainCircuit, 
  Users, 
  ShieldCheck,
  Bird,
  Settings,
  Database, 
  Save, 
  Pin, 
  PinOff, 
  PanelLeftClose,
  HelpCircle
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { formatDateTime } from '../utils/formatting';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

const NavItem = ({ 
  icon: Icon, 
  label, 
  active, 
  badge, 
  badgeColor = 'bg-gray-200 text-gray-800',
  onClick 
}: { 
  icon: any, 
  label: string, 
  active?: boolean, 
  badge?: string | number, 
  badgeColor?: string,
  onClick: () => void
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-4 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors duration-150 ${
      active 
        ? 'bg-brand-50 text-brand-900 dark:bg-brand-900 dark:text-brand-50' 
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-200'
    }`}
  >
    <div className="flex items-center gap-3">
      <Icon size={20} className={active ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'} />
      <span>{label}</span>
    </div>
    {badge !== undefined && (
      <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${badgeColor}`}>
        {badge}
      </span>
    )}
  </button>
);

const GroupLabel = ({ label }: { label: string }) => (
  <div className="px-4 mt-6 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider dark:text-gray-500">
    {label}
  </div>
);

export const Sidebar = () => {
  const { 
    activeTab, 
    setActiveTab, 
    lastSaved,
    alerts,
    timeZone,
    sidebarPinned,
    toggleSidebarPinned,
    toggleSidebar,
    apiConfig,
    syncArgosToFirebase,
    currentUserRole,
    currentUserPermissions
  } = useAppStore();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  const activeAlertCount = alerts.filter(a => a.status === 'active').length;

  // RBAC helpers
  const hasPermission = (perm: string) => currentUserPermissions.includes(perm);
  const isAdmin = currentUserRole === 'Administrator';

  const handleNavigation = (tabName: string) => {
      setActiveTab(tabName);
      if (!sidebarPinned || window.innerWidth < 1024) {
          toggleSidebar();
      }
  };

  const handleGlobalSync = async () => {
    setIsSyncing(true);
    setSyncStatus('idle');
    try {
      if (!apiConfig.username || !apiConfig.password) {
         throw new Error("Missing Argos credentials. Configure in Data Upload.");
      }
      const stats = await performGlobalArgosSync(
          apiConfig, 
          syncArgosToFirebase, 
          (msg) => {
            console.log('[Global Sync]', msg);
            setSyncMessage(msg);
          }
      );
      setSyncMessage(`${stats.transmittersUpdated} TRx, ${stats.positionsCreated} Pos`);
      setSyncStatus('success');
    } catch (err: any) {
      console.error(err);
      setSyncMessage(err.message || 'Sync failed');
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
         setSyncStatus('idle');
         setSyncMessage('');
      }, 5000);
    }
  };

  return (
    <div className="w-full h-full bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col shadow-sm overflow-y-auto scrollbar-hide transition-colors duration-300">
      {/* Logo Section */}
      <div className="p-6 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-100 dark:shadow-none">
                <Bird className="text-white" size={24} strokeWidth={2.5} />
            </div>
            <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">RAF HoubaraTracker</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">v2.1</p>
            </div>
        </div>
        <div className="flex items-center gap-1">
             <button 
                onClick={toggleSidebarPinned} 
                className={`hidden lg:block p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${sidebarPinned ? 'text-brand-600' : 'text-gray-400'}`} 
                title={sidebarPinned ? "Unpin Sidebar" : "Pin Sidebar"}
             >
                {sidebarPinned ? <Pin size={16} /> : <PinOff size={16} />}
             </button>
             <button 
                onClick={toggleSidebar}
                className="lg:hidden p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                title="Close Sidebar"
             >
                <PanelLeftClose size={16} />
             </button>
        </div>
      </div>

      {/* Navigation — filtered by role permissions */}
      <div className="flex-1 px-3 pb-6">
        <GroupLabel label="Overview" />
        {(hasPermission('View Data') || isAdmin) && (
          <NavItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'Dashboard'} onClick={() => handleNavigation('Dashboard')} />
        )}
        
        {(hasPermission('Live Tracking') || isAdmin) && (
          <button 
            onClick={() => handleNavigation('Live Tracking')}
            className={`w-full mt-1 flex items-center justify-between px-4 py-3 text-sm font-bold rounded-lg transition-all shadow-sm ${
               activeTab === 'Live Tracking'
                ? 'bg-brand-50 text-brand-900 border border-brand-100 dark:bg-brand-900 dark:text-brand-50 dark:border-brand-800' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <Map size={20} className={activeTab === 'Live Tracking' ? 'text-brand-500 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'} />
              <span>Live Tracking</span>
            </div>
            <span className="text-lg">›</span>
          </button>
        )}

        {(hasPermission('Generate Reports') || hasPermission('Manage Alerts') || isAdmin) && (
          <>
            <GroupLabel label="Analysis" />
            {(hasPermission('Generate Reports') || isAdmin) && (
              <NavItem icon={FileText} label="Reports" active={activeTab === 'Reports'} onClick={() => handleNavigation('Reports')} />
            )}
            {(hasPermission('Manage Alerts') || isAdmin) && (
              <NavItem 
                icon={AlertTriangle} label="Alerts" 
                active={activeTab === 'Alerts' || activeTab === 'Real-Time Alerts' || activeTab === 'Geofence Alerts'} 
                badge={activeAlertCount > 0 ? activeAlertCount : undefined}
                badgeColor="bg-red-500 text-white"
                onClick={() => handleNavigation('Alerts')} 
              />
            )}
          </>
        )}

        {(hasPermission('Live Tracking') || isAdmin) && (
          <>
            <GroupLabel label="Advanced" />
            <NavItem icon={Clock} label="History Timeline" active={activeTab === 'History Timeline'} onClick={() => handleNavigation('History Timeline')} />
            <NavItem icon={BrainCircuit} label="AI Predictions" active={activeTab === 'AI Predictions'} badge="AI" onClick={() => handleNavigation('AI Predictions')} />
          </>
        )}

        {(hasPermission('Manage Database') || hasPermission('Upload Data') || isAdmin) && (
          <>
            <GroupLabel label="Database" />
            <NavItem icon={Database} label="Database" active={activeTab === 'Database'} onClick={() => handleNavigation('Database')} />
          </>
        )}
        
        {/* Sync Button — Admin + API Integration only */}
        {(hasPermission('API Integration') || isAdmin) && (
          <div className="px-4 mt-2 mb-4">
              <button 
                 onClick={handleGlobalSync}
                 disabled={isSyncing}
                 className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-all shadow-sm ${
                     isSyncing ? 'bg-gray-100 text-gray-500 cursor-not-allowed' :
                     syncStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                     syncStatus === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                     'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-700'
                 }`}
              >
                  {isSyncing ? (
                      <RefreshCw size={14} className="animate-spin text-brand-500" />
                  ) : syncStatus === 'success' ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                  ) : syncStatus === 'error' ? (
                      <AlertCircle size={14} className="text-red-500" />
                  ) : (
                      <RefreshCw size={14} className="text-brand-500" />
                  )}
                  <span>
                     {isSyncing ? 'Syncing Base...' : 
                      syncStatus === 'idle' ? 'Sync Argos Database' : 
                      syncMessage}
                  </span>
              </button>
          </div>
        )}

        <NavItem icon={Map} label="GIS" active={activeTab === 'GIS Features'} onClick={() => handleNavigation('GIS Features')} />

        {/* Administration — Admin only */}
        {(hasPermission('Manage Users') || isAdmin) && (
          <>
            <GroupLabel label="Administration" />
            <NavItem icon={Users} label="User Management" active={activeTab === 'User Management'} onClick={() => handleNavigation('User Management')} />
            <NavItem icon={ShieldCheck} label="Admin Permissions" active={activeTab === 'Admin Permissions'} onClick={() => handleNavigation('Admin Permissions')} />
          </>
        )}
        
        <div className="my-2 border-t border-gray-100 dark:border-slate-800"></div>

        {(hasPermission('System Settings') || isAdmin) && (
          <NavItem icon={Settings} label="Settings" active={activeTab === 'Settings'} onClick={() => handleNavigation('Settings')} />
        )}
        <NavItem icon={HelpCircle} label="Help & Support" active={activeTab === 'Help & Support'} onClick={() => handleNavigation('Help & Support')} />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 transition-colors sticky bottom-0 z-10">
        <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">SYSTEM</div>
            {lastSaved && (
                <div className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-500 font-medium" title={`Last saved: ${formatDateTime(lastSaved, timeZone)}`}>
                    <Save size={10} /> Saved
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

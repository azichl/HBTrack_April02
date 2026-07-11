
import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Map, 
  FileText, 
  AlertTriangle, 
  Clock, 
  BrainCircuit, 
  Users, 
  ShieldCheck,
  Settings,
  Database, 
  Save, 
  Pin, 
  PinOff, 
  PanelLeftClose,
  HelpCircle,
  Globe
} from 'lucide-react';
import { HoubaraIcon } from './HoubaraIcon';
import { useAppStore } from '../store/appStore';
import { formatDateTime } from '../utils/formatting';

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
    currentUserRole,
    currentUserPermissions
  } = useAppStore();

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

  return (
    <div className="w-full h-full bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col shadow-sm overflow-y-auto scrollbar-hide transition-colors duration-300">
      {/* Logo Section */}
      <div className="py-5 px-4 flex items-center justify-center sticky top-0 bg-white dark:bg-slate-900 z-10">
        <div className="flex items-center justify-center w-full">
            <img src="/ministry-logo.png" alt="Ministry Logo" className="w-[90%] max-w-[220px] h-auto object-contain transform scale-[1.25] origin-center dark:brightness-0 dark:invert" />
        </div>
        <div className="absolute right-3 top-5 flex items-center gap-1">

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
            {(hasPermission('Generate Reports') || isAdmin) && (
              <NavItem icon={Globe} label="Geo Spatial Analysis" active={activeTab === 'Geo Spatial Analysis'} onClick={() => handleNavigation('Geo Spatial Analysis')} />
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
            <NavItem icon={BrainCircuit} label="AI Predictions" active={activeTab === 'AI Predictions'} badge="AI" onClick={() => handleNavigation('AI Predictions')} />
          </>
        )}

        {(hasPermission('Manage Database') || hasPermission('Upload Data') || isAdmin) && (
          <>
            <GroupLabel label="Database" />
            <NavItem icon={Database} label="Database" active={activeTab === 'Database'} onClick={() => handleNavigation('Database')} />
          </>
        )}
        


        <NavItem icon={Map} label="GIS" active={activeTab === 'GIS Features'} onClick={() => handleNavigation('GIS Features')} />

        {/* Administration — Admin only */}
        {(hasPermission('Manage Users') || isAdmin) && (
          <>
            <GroupLabel label="Administration" />
            <NavItem icon={Users} label="User Management" active={activeTab === 'User Management'} onClick={() => handleNavigation('User Management')} />

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

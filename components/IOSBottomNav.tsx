import React from 'react';
import { LayoutDashboard, Map, UploadCloud, Settings as SettingsIcon } from 'lucide-react';
import { useAppStore } from '../store/appStore';

interface IOSBottomNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const IOSBottomNav: React.FC<IOSBottomNavProps> = ({ activeTab, onSelectTab }) => {
  const { setDatabaseActiveTab, currentUserRole, currentUserAppAccess, currentUserIosDataUpload } = useAppStore();

  const canUploadData = 
    currentUserRole === 'Manager' || 
    currentUserIosDataUpload === true ||
    (currentUserAppAccess && currentUserAppAccess.includes('ios_data_upload'));

  const navItems = [
    {
      id: 'Dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      onClick: () => onSelectTab('Dashboard'),
      isActive: activeTab === 'Dashboard'
    },
    {
      id: 'Live Tracking',
      label: 'Live Map',
      icon: Map,
      onClick: () => onSelectTab('Live Tracking'),
      isActive: activeTab === 'Live Tracking'
    },
    ...(canUploadData ? [{
      id: 'Data Upload',
      label: 'Data Upload',
      icon: UploadCloud,
      onClick: () => {
        setDatabaseActiveTab('Data Upload');
        onSelectTab('Data Upload');
      },
      isActive: activeTab === 'Data Upload' || activeTab === 'CLS Sync'
    }] : []),
    {
      id: 'Settings',
      label: 'Settings',
      icon: SettingsIcon,
      onClick: () => onSelectTab('Settings'),
      isActive: activeTab === 'Settings'
    }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1000] bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-gray-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom,0px)] shadow-lg transition-all duration-200">
      <div className="flex items-center justify-around h-16 px-2 max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive;
          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`flex flex-col items-center justify-center flex-1 h-full px-2 py-1 rounded-xl transition-all duration-150 active:scale-95 ${
                active
                  ? 'text-brand-600 dark:text-brand-400 font-bold'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <div className={`p-1.5 rounded-full transition-colors ${active ? 'bg-brand-50 dark:bg-brand-900/40' : ''}`}>
                <Icon size={22} className={active ? 'text-brand-600 dark:text-brand-400 stroke-[2.5]' : 'stroke-[1.75]'} />
              </div>
              <span className="text-[11px] font-medium tracking-tight mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

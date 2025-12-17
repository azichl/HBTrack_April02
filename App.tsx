
import React from 'react';
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
import { Bell, Search, UserCircle, Menu } from 'lucide-react';

// Placeholder components for other views
const PlaceholderView = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-96 text-gray-400 dark:text-gray-500">
    <h2 className="text-2xl font-bold text-gray-300 dark:text-gray-600 mb-2">{title}</h2>
    <p>This module is under construction.</p>
  </div>
);

const App = () => {
  const { activeTab, darkMode, sidebarOpen, toggleSidebar } = useAppStore();

  // Handle Standalone Mode (New Window) logic
  const searchParams = new URLSearchParams(window.location.search);
  const isStandalone = searchParams.get('standalone') === 'true';
  const urlTab = searchParams.get('tab');
  
  // Determine which view to render: URL param overrides store if in standalone mode
  const currentView = (isStandalone && urlTab) ? urlTab : activeTab;

  const renderContent = () => {
    switch (currentView) {
      case 'Dashboard': return <Dashboard />;
      case 'Real-Time Alerts': return <Alerts />;
      case 'Live Tracking': return <LiveTracking />;
      case 'AI Predictions': return <AIPredictions />;
      case 'Database': return <Database />; // New Unified Database View
      case 'Monitoring': return <Monitoring />;
      case 'Reports': return <Reports />;
      case 'Alerts': return <Alerts />;
      case 'Geofence Alerts': return <Alerts />; 
      case 'User Management': return <UserManagement />;
      case 'GIS Features': return <GISFeatures />;
      case 'Settings': return <Settings />;
      case 'Help & Support': return <HelpSupport />;
      default: return <PlaceholderView title={currentView} />;
    }
  };

  // If standalone, render only the main content without layout shell
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
        
        {/* Mobile Sidebar Backdrop */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={toggleSidebar}
          />
        )}

        {/* Sidebar Container */}
        {/* Mobile: Fixed drawer. Desktop: Collapsible flow element. */}
        <div className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 transition-transform duration-300 shadow-2xl lg:shadow-none lg:static lg:transform-none lg:transition-[width] lg:overflow-hidden
            ${sidebarOpen ? 'translate-x-0 lg:w-64' : '-translate-x-full lg:w-0'}
        `}>
           <Sidebar />
        </div>
        
        <div className="flex-1 flex flex-col overflow-hidden w-full relative">
          {/* Top Header */}
          <header className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-4 md:px-6 shadow-sm z-10 transition-colors duration-300 flex-shrink-0">
            <div className="flex items-center gap-4 flex-1">
              <button 
                onClick={toggleSidebar}
                className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Toggle Sidebar"
              >
                <Menu size={20} />
              </button>

              {/* Search Bar - Hidden on small mobile, visible on tablet+ */}
              <div className="hidden md:flex items-center bg-gray-100 dark:bg-slate-700 px-3 py-2 rounded-lg w-full max-w-sm lg:max-w-md transition-all">
                <Search size={18} className="text-gray-400 dark:text-gray-400 mr-2 flex-shrink-0" />
                <input 
                  type="text" 
                  placeholder="Search birds, PTTs, or alerts..." 
                  className="bg-transparent border-none outline-none text-sm w-full text-gray-700 dark:text-gray-200 placeholder-gray-400"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 md:gap-4">
              {/* Mobile Search Button */}
              <button className="md:hidden p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full">
                  <Search size={20} />
              </button>

              <button className="relative p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <Bell size={20} />
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-800"></span>
              </button>
              
              <div className="flex items-center gap-3 pl-2 md:pl-4 border-l border-gray-200 dark:border-slate-700">
                <div className="text-right hidden md:block">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Abdelaziz CHLIH</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Administrator</p>
                </div>
                <div className="w-8 h-8 md:w-10 md:h-10 bg-brand-50 dark:bg-slate-700 rounded-full flex items-center justify-center text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-slate-600">
                  <UserCircle size={20} className="md:w-6 md:h-6" />
                </div>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/50 dark:bg-slate-900/50 relative">
            <div className="max-w-full mx-auto h-full">
               {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;

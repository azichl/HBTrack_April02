import React, { useRef, useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Transmitters } from './Transmitters';
import { Birds } from './Birds';
import { DataUpload } from './DataUpload';
import { Monitoring } from './Monitoring';
import { ArgosData } from './ArgosData';
import { Radio, Bird, UploadCloud, Monitor, FileSpreadsheet, Maximize, Minimize, ExternalLink } from 'lucide-react';

export const Database = () => {
  const { databaseActiveTab, setDatabaseActiveTab } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Check if we are currently in standalone mode
  const isStandalone = new URLSearchParams(window.location.search).get('standalone') === 'true';

  // Handle Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
  };

  // Sync state with actual fullscreen changes (ESC key etc)
  useEffect(() => {
      const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', handleFSChange);
      return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const openNewWindow = () => {
      // Construct URL robustly preserving the current origin and path
      const url = new URL(window.location.href);
      url.searchParams.set('standalone', 'true');
      url.searchParams.set('tab', 'Database');
      
      // Open in new window with appropriate features
      window.open(url.toString(), 'HoubaraDatabase', 'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
  };

  return (
    <div 
      ref={containerRef} 
      className={`space-y-6 transition-all duration-300 ${isFullscreen ? 'p-6 bg-gray-50 dark:bg-slate-900 overflow-y-auto h-screen w-screen fixed top-0 left-0 z-50' : ''}`}
    >
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Tab Navigation */}
        <div className="bg-white dark:bg-slate-800 p-1 rounded-xl border border-gray-200 dark:border-slate-700 inline-flex shadow-sm flex-wrap gap-1">
          <button
            onClick={() => setDatabaseActiveTab('Monitoring')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              databaseActiveTab === 'Monitoring'
                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 shadow-sm border border-brand-100 dark:border-brand-800'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <Monitor size={16} />
            Monitoring
          </button>
          <button
            onClick={() => setDatabaseActiveTab('Transmitters')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              databaseActiveTab === 'Transmitters'
                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 shadow-sm border border-brand-100 dark:border-brand-800'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <Radio size={16} />
            Transmitters
          </button>
          <button
            onClick={() => setDatabaseActiveTab('Birds')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              databaseActiveTab === 'Birds'
                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 shadow-sm border border-brand-100 dark:border-brand-800'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <Bird size={16} />
            Birds
          </button>
          <button
            onClick={() => setDatabaseActiveTab('Argos Data')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              databaseActiveTab === 'Argos Data'
                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 shadow-sm border border-brand-100 dark:border-brand-800'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <FileSpreadsheet size={16} />
            Argos Data
          </button>
          <button
            onClick={() => setDatabaseActiveTab('Data Upload')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              databaseActiveTab === 'Data Upload'
                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 shadow-sm border border-brand-100 dark:border-brand-800'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <UploadCloud size={16} />
            Data Upload
          </button>
        </div>

        {/* View Actions */}
        <div className="flex gap-2 bg-white dark:bg-slate-800 p-1 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
           <button 
             onClick={toggleFullscreen}
             className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
             title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
           >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
           </button>
           {!isFullscreen && !isStandalone && (
             <>
               <div className="w-px bg-gray-200 dark:bg-slate-700 my-1"></div>
               <button 
                 onClick={openNewWindow}
                 className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
                 title="Open in New Window"
               >
                  <ExternalLink size={16} />
                  <span className="hidden sm:inline">New Window</span>
               </button>
             </>
           )}
        </div>
      </div>

      {/* Content Area */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
        {databaseActiveTab === 'Monitoring' && <Monitoring />}
        {databaseActiveTab === 'Transmitters' && <Transmitters />}
        {databaseActiveTab === 'Birds' && <Birds />}
        {databaseActiveTab === 'Argos Data' && <ArgosData />}
        {databaseActiveTab === 'Data Upload' && <DataUpload />}
      </div>
    </div>
  );
};
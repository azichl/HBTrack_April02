import React, { useRef, useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Transmitters } from './Transmitters';
import { Birds } from './Birds';
import { DataUpload } from './DataUpload';
import { Monitoring } from './Monitoring';
import { ArgosData } from './ArgosData';
import {
  Radio, Bird, UploadCloud, Monitor, FileSpreadsheet,
  Maximize, Minimize, Trash2, AlertTriangle,
  ShieldAlert, CheckCircle2, Loader2, X, Database as DbIcon, Plus
} from 'lucide-react';

// ─── Danger Zone ──────────────────────────────────────────────────────────────

type ClearTarget = 'transmitters' | 'birds' | 'positions' | 'argos_positions' | 'alerts' | 'all';

interface TableConfig {
  id: ClearTarget;
  label: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

const TABLE_CONFIGS: TableConfig[] = [
  {
    id: 'transmitters',
    label: 'Transmitters',
    description: 'All PTT device records',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    icon: <Radio size={16} />,
  },
  {
    id: 'birds',
    label: 'Birds',
    description: 'All bird registry records',
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    icon: <Bird size={16} />,
  },
  {
    id: 'positions',
    label: 'Positions',
    description: 'All processed tracking positions',
    color: 'text-purple-700 dark:text-purple-300',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-200 dark:border-purple-800',
    icon: <DbIcon size={16} />,
  },
  {
    id: 'argos_positions',
    label: 'Argos Raw Data',
    description: 'All raw Argos API ingestion records',
    color: 'text-orange-700 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    icon: <FileSpreadsheet size={16} />,
  },
  {
    id: 'alerts',
    label: 'Alerts',
    description: 'All alert history records',
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    icon: <AlertTriangle size={16} />,
  },
];

const DangerZone = () => {
  const { clearTable, currentUserRole } = useAppStore();

  const [confirmTarget, setConfirmTarget] = useState<ClearTarget | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const isAdmin = currentUserRole === 'Administrator';

  const addLog = (msg: string) =>
    setProgressLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const handleClear = async () => {
    if (!confirmTarget) return;
    const expected = confirmTarget === 'all' ? 'DELETE ALL' : confirmTarget.toUpperCase();
    if (confirmInput.trim() !== expected) return;

    setIsClearing(true);
    setProgressLog([]);
    setDone(false);
    try {
      await clearTable(confirmTarget, addLog);
      setDone(true);
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`);
    } finally {
      setIsClearing(false);
      setConfirmInput('');
    }
  };

  const closeModal = () => {
    if (isClearing) return;
    setConfirmTarget(null);
    setConfirmInput('');
    setProgressLog([]);
    setDone(false);
  };

  const getExpected = (t: ClearTarget) =>
    t === 'all' ? 'DELETE ALL' : t.toUpperCase();

  if (!isAdmin) {
    return (
      <div className="mt-6 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 flex items-center gap-3 text-red-700 dark:text-red-400 text-sm">
        <ShieldAlert size={18} />
        <span>Administrator access required to manage Danger Zone actions.</span>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm uppercase tracking-widest">
          <AlertTriangle size={16} />
          Danger Zone
        </div>
        <div className="flex-1 h-px bg-red-200 dark:bg-red-800" />
      </div>

      <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-3">
        <p className="text-xs text-red-600 dark:text-red-400 font-medium">
          These actions permanently delete data from Firestore. They cannot be undone.
        </p>

        {/* Per-table delete cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TABLE_CONFIGS.map(t => (
            <div
              key={t.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${t.bg} ${t.border}`}
            >
              <div className="flex items-center gap-2">
                <span className={t.color}>{t.icon}</span>
                <div>
                  <div className={`text-xs font-bold ${t.color}`}>{t.label}</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">{t.description}</div>
                </div>
              </div>
              <button
                onClick={() => setConfirmTarget(t.id)}
                className="ml-2 p-1.5 rounded-md text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 transition-colors"
                title={`Clear ${t.label}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        {/* Wipe all button & Purge Invalid Coordinates */}
        <div className="flex justify-end pt-1 gap-3">
          <button
            onClick={async () => {
              if (window.confirm("Are you sure you want to search and purge all invalid (0,0) coordinates from the database? This might take a few moments.")) {
                setIsClearing(true);
                setProgressLog([]);
                setConfirmTarget('positions' as ClearTarget);
                const { purgeInvalidCoordinates } = await import('../services/firestoreService');
                await purgeInvalidCoordinates((msg) => addLog(msg));
                setDone(true);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
          >
            <ShieldAlert size={14} />
            Purge 0,0 Coordinates
          </button>
          
          <button
            onClick={() => setConfirmTarget('all')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
          >
            <Trash2 size={14} />
            Wipe Entire Database
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-red-200 dark:border-red-700 w-full max-w-md mx-4 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                <AlertTriangle size={20} />
                {confirmTarget === 'all' ? 'Wipe Entire Database' : `Clear "${confirmTarget.replace('_', ' ')}" Table`}
              </div>
              {!isClearing && (
                <button onClick={closeModal} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X size={18} />
                </button>
              )}
            </div>

            {!done ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  This will permanently delete{' '}
                  <strong className="text-red-600 dark:text-red-400">
                    {confirmTarget === 'all' ? 'ALL data in every table' : `all records in the "${confirmTarget.replace('_', ' ')}" collection`}
                  </strong>
                  . This action cannot be undone.
                </p>

                {/* Progress log during deletion */}
                {isClearing && (
                  <div className="mb-4 bg-gray-900 text-green-400 rounded-lg p-3 text-xs font-mono h-28 overflow-y-auto flex flex-col-reverse gap-0.5">
                    {progressLog.map((l, i) => <div key={i}>{l}</div>)}
                    <div className="flex items-center gap-2 text-yellow-400">
                      <Loader2 size={12} className="animate-spin" /> Working...
                    </div>
                  </div>
                )}

                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Type <code className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1 rounded">{getExpected(confirmTarget)}</code> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={e => setConfirmInput(e.target.value)}
                  disabled={isClearing}
                  placeholder={getExpected(confirmTarget)}
                  className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white dark:bg-slate-900 text-gray-900 dark:text-white mb-4 font-mono"
                />

                <div className="flex gap-3">
                  <button
                    onClick={closeModal}
                    disabled={isClearing}
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={confirmInput.trim() !== getExpected(confirmTarget) || isClearing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {isClearing ? 'Deleting...' : 'Delete Permanently'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
                <p className="font-bold text-gray-900 dark:text-white text-lg">Done!</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">The data has been permanently deleted from Firebase.</p>
                {progressLog.length > 0 && (
                  <div className="mt-3 bg-gray-900 text-green-400 rounded-lg p-3 text-xs font-mono h-24 overflow-y-auto flex flex-col-reverse gap-0.5 text-left">
                    {progressLog.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                )}
                <button
                  onClick={closeModal}
                  className="mt-4 px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Database View ───────────────────────────────────────────────────────

export const Database = () => {
  const { 
    databaseActiveTab, 
    setDatabaseActiveTab,
    setIsTransmitterModalOpen,
    setIsBirdModalOpen,
    setIsPositionModalOpen,
    setIsArgosModalOpen,
    setEditingRecordId
  } = useAppStore();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [showManageMenu, setShowManageMenu] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const handleAddNew = () => {
    setEditingRecordId(null);
    setShowManageMenu(false);
    if (databaseActiveTab === 'Transmitters') setIsTransmitterModalOpen(true);
    else if (databaseActiveTab === 'Birds') setIsBirdModalOpen(true);
    else if (databaseActiveTab === 'Monitoring') setIsPositionModalOpen(true);
    else if (databaseActiveTab === 'Argos Data') setIsArgosModalOpen(true);
  };

  const tabs = [
    { id: 'Monitoring',   label: 'Monitoring',   icon: <Monitor size={16} /> },
    { id: 'Transmitters', label: 'Transmitters', icon: <Radio size={16} /> },
    { id: 'Birds',        label: 'Birds',        icon: <Bird size={16} /> },
    { id: 'Argos Data',   label: 'Argos Data',   icon: <FileSpreadsheet size={16} /> },
    { id: 'Data Upload',  label: 'Data Upload',  icon: <UploadCloud size={16} /> },
  ];

  return (
    <div
      ref={containerRef}
      className={`space-y-4 transition-all duration-300 ${isFullscreen ? 'p-6 bg-gray-50 dark:bg-slate-900 overflow-y-auto h-screen w-screen fixed top-0 left-0 z-50' : ''}`}
    >
      {/* Header & Navigation */}
      <div className="flex flex-row justify-between items-center gap-4">
        {/* Tab Navigation */}
        <div className="bg-white dark:bg-slate-800 p-1 rounded-xl border border-gray-200 dark:border-slate-700 inline-flex shadow-sm flex-nowrap overflow-x-auto gap-1 w-full md:w-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setDatabaseActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                databaseActiveTab === tab.id
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 shadow-sm border border-brand-100 dark:border-brand-800'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* View Actions */}
        <div className="flex gap-2">
          {/* Manage Data Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowManageMenu(v => !v)}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition-all shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              <DbIcon size={14} />
              <span className="hidden sm:inline">Manage Data</span>
            </button>
            {showManageMenu && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden z-50">
                {databaseActiveTab !== 'Data Upload' && (
                  <button 
                    onClick={handleAddNew}
                    className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Plus size={16} className="text-green-600" /> 
                    Add New Record
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowManageMenu(false);
                    setShowDangerZone(v => !v);
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 border-t border-gray-100 dark:border-slate-700"
                >
                  <Trash2 size={16} /> Wipe Data (Danger Zone)
                </button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 p-1 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm flex gap-1">
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone Panel (collapsible) */}
      {showDangerZone && <DangerZone />}

      {/* Content Area */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
        {databaseActiveTab === 'Monitoring'   && <Monitoring />}
        {databaseActiveTab === 'Transmitters' && <Transmitters />}
        {databaseActiveTab === 'Birds'        && <Birds />}
        {databaseActiveTab === 'Argos Data'   && <ArgosData />}
        {databaseActiveTab === 'Data Upload'  && <DataUpload />}
      </div>
    </div>
  );
};
import React from 'react';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, Radio, Bird as BirdIcon, 
  Database, RefreshCw, X, Download 
} from 'lucide-react';
import { IntegrityReport } from '../data/repository/reconcilePipeline';

interface Props {
  isOpen: boolean;
  report: IntegrityReport | null;
  onClose: () => void;
  onTriggerResync: () => void;
  isResyncing?: boolean;
}

export const IntegrityReportModal: React.FC<Props> = ({
  isOpen,
  report,
  onClose,
  onTriggerResync,
  isResyncing,
}) => {
  if (!isOpen || !report) return null;

  const totalOrphans =
    report.argosWithoutTransmitter.length +
    report.transmitterWithoutBird.length +
    report.birdWithoutTransmitter.length +
    report.transmitterWithoutFixes.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-100 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Database Integrity & Orphan Report
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cross-table consistency analysis for telemetry & registry
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 text-center">
              <div className="text-xl font-bold text-gray-800 dark:text-white">{report.totalTransmitters}</div>
              <div className="text-[11px] text-gray-500 font-medium">Transmitters</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 text-center">
              <div className="text-xl font-bold text-gray-800 dark:text-white">{report.totalBirds}</div>
              <div className="text-[11px] text-gray-500 font-medium">Birds Registered</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 text-center">
              <div className="text-xl font-bold text-brand-600 dark:text-brand-400">{report.totalArgosPtts}</div>
              <div className="text-[11px] text-gray-500 font-medium">Argos PTTs Active</div>
            </div>
          </div>

          {/* Status Banner */}
          {totalOrphans === 0 ? (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 size={24} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <div className="text-sm font-bold">100% Database Integrity</div>
                <div className="text-xs opacity-90">All Argos PTTs are mapped to transmitters, linked with birds, and have valid fixes.</div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                <span>Found <strong>{totalOrphans}</strong> potential orphan/linkage discrepancy items.</span>
              </div>
              <button
                onClick={onTriggerResync}
                disabled={isResyncing}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw size={12} className={isResyncing ? 'animate-spin' : ''} />
                Re-sync All
              </button>
            </div>
          )}

          {/* Section: Argos PTTs without Transmitter Doc */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <Database size={14} className="text-brand-500" />
                PTTs in Argos without Transmitter Record ({report.argosWithoutTransmitter.length})
              </span>
            </div>
            {report.argosWithoutTransmitter.length > 0 ? (
              <div className="p-2.5 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 text-xs text-red-700 dark:text-red-300 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {report.argosWithoutTransmitter.map((pid) => (
                  <span key={pid} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 font-mono rounded-md font-bold">
                    {pid}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">None (All Argos PTTs registered)</div>
            )}
          </div>

          {/* Section: Transmitters without Bird link */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <Radio size={14} className="text-sky-500" />
                Transmitters without Assigned Bird ({report.transmitterWithoutBird.length})
              </span>
            </div>
            {report.transmitterWithoutBird.length > 0 ? (
              <div className="p-2.5 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 text-xs text-gray-700 dark:text-gray-300 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto font-mono">
                {report.transmitterWithoutBird.slice(0, 30).map((pid) => (
                  <span key={pid} className="px-2 py-0.5 bg-gray-200 dark:bg-slate-700 rounded-md">
                    {pid}
                  </span>
                ))}
                {report.transmitterWithoutBird.length > 30 && (
                  <span className="text-gray-400 text-[10px] self-center">
                    +{report.transmitterWithoutBird.length - 30} more
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">None (All transmitters linked)</div>
            )}
          </div>

          {/* Section: Birds without Transmitter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <BirdIcon size={14} className="text-emerald-500" />
                Birds without Transmitter ({report.birdWithoutTransmitter.length})
              </span>
            </div>
            {report.birdWithoutTransmitter.length > 0 ? (
              <div className="p-2.5 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 text-xs text-gray-700 dark:text-gray-300 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto font-mono">
                {report.birdWithoutTransmitter.slice(0, 30).map((ring) => (
                  <span key={ring} className="px-2 py-0.5 bg-gray-200 dark:bg-slate-700 rounded-md">
                    {ring}
                  </span>
                ))}
                {report.birdWithoutTransmitter.length > 30 && (
                  <span className="text-gray-400 text-[10px] self-center">
                    +{report.birdWithoutTransmitter.length - 30} more
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">None (All birds linked)</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={onTriggerResync}
            disabled={isResyncing}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
          >
            <RefreshCw size={14} className={isResyncing ? 'animate-spin' : ''} />
            {isResyncing ? 'Re-syncing...' : 'Re-sync All Tables'}
          </button>
        </div>
      </div>
    </div>
  );
};

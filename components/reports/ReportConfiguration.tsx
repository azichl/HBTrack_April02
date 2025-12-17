import React, { useState } from 'react';
import { BarChart, Filter, ChevronDown } from 'lucide-react';

interface ReportConfigurationProps {
  selectedReport: any;
  dateRange: { start: string; end: string };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  selectedTransmitters: string;
  onTransmittersChange: (value: string) => void;
  transmittersCount: number;
  onGenerate: () => void;
}

export const ReportConfiguration: React.FC<ReportConfigurationProps> = ({
  selectedReport,
  dateRange,
  onDateRangeChange,
  selectedTransmitters,
  onTransmittersChange,
  transmittersCount,
  onGenerate
}) => {
  const [isTransmittersOpen, setIsTransmittersOpen] = useState(false);

  const getTransmitterLabel = () => {
    if (selectedTransmitters === 'all') return `All Transmitters (${transmittersCount})`;
    if (selectedTransmitters === 'active') return 'Active Only';
    if (selectedTransmitters === 'inactive') return 'Inactive Only';
    return selectedTransmitters;
  };

  const transmitterOptions = [
    { value: 'all', label: `All Transmitters (${transmittersCount})` },
    { value: 'active', label: 'Active Only' },
    { value: 'inactive', label: 'Inactive Only' }
  ];

  return (
    <div className="">
      <div className="flex items-center gap-2 mb-4 border-b border-gray-100 dark:border-slate-700 pb-3">
        <div className="p-1.5 bg-gray-100 dark:bg-slate-700 rounded-lg text-gray-600 dark:text-gray-300">
          <Filter size={16} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Report Config</h2>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Set parameters & filters</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Date Range */}
        <div>
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 block">Date Range</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-md text-xs text-gray-900 dark:text-gray-200 focus:ring-1 focus:ring-brand-500 outline-none"
                style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
              />
              <span className="text-[9px] text-gray-400 mt-0.5 block">Start Date</span>
            </div>
            <div>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-md text-xs text-gray-900 dark:text-gray-200 focus:ring-1 focus:ring-brand-500 outline-none"
                style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
              />
              <span className="text-[9px] text-gray-400 mt-0.5 block">End Date</span>
            </div>
          </div>
        </div>

        {/* Transmitters - Custom Dropdown for Font Enforcement */}
        <div className="relative">
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 block">Transmitters</label>
          
          <button
            onClick={() => setIsTransmittersOpen(!isTransmittersOpen)}
            className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-md text-xs text-gray-900 dark:text-gray-200 focus:ring-1 focus:ring-brand-500 outline-none flex items-center justify-between"
            style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
          >
            <span className="truncate">{getTransmitterLabel()}</span>
            <ChevronDown size={14} className="text-gray-500 flex-shrink-0 ml-1" />
          </button>

          {isTransmittersOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsTransmittersOpen(false)} />
              <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md shadow-lg z-20 overflow-hidden">
                {transmitterOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onTransmittersChange(opt.value);
                      setIsTransmittersOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                      selectedTransmitters === opt.value 
                        ? 'bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-brand-400 font-bold' 
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                    style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
            {selectedTransmitters === 'all' 
              ? `All ${transmittersCount} included` 
              : `Only ${selectedTransmitters} included`}
          </p>
        </div>

        <div className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
          <button className="w-full py-2 px-4 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-md text-xs font-bold hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors flex items-center justify-center gap-2 border border-orange-200 dark:border-orange-800">
            <BarChart size={14} /> Preview Data
          </button>
          
          {!selectedReport && (
            <p className="text-center text-[10px] text-gray-400">Select a template to continue</p>
          )}
        </div>
      </div>
    </div>
  );
};
import re

with open('views/ArgosData.tsx', 'r') as f:
    content = f.read()

# Add states for Filter Modal
state_repl = """  const [isFilterOpen, setFilterOpen] = useState(false);
  const [historyPreset, setHistoryPreset] = useState('latest');
  const [historyMode, setHistoryMode] = useState<'preset' | 'custom'>('preset');
  const [selectedTransmitterIds, setSelectedTransmitterIds] = useState<string[]>([]);
  const [locationAccuracy, setLocationAccuracy] = useState('All');
  const [filterLocationType, setFilterLocationType] = useState('All');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');"""

content = re.sub(
    r"  const \[dateRange, setDateRange\] = useState<DateRangeType>\('latest'\);",
    state_repl,
    content
)

# Update loadData to use new filter states
load_data_repl = """  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let data: any[] = [];
      let sDate: Date | undefined;
      let eDate: Date | undefined;

      if (historyMode === 'preset' && historyPreset === 'latest') {
        const tIds = selectedTransmitterIds.length > 0 ? selectedTransmitterIds : await getArgosTransmitterIds();
        if (collectionMode === 'argos_positions') {
          const { loadLatestArgosPositionsPerTransmitter } = await import('../services/firestoreService');
          const latestArgos = await loadLatestArgosPositionsPerTransmitter(tIds);
          data = latestArgos.map(d => ({ _collection: 'argos_positions', ...d }));
        } else if (collectionMode === 'positions') {
          const { loadLatestPositionsPerTransmitter } = await import('../services/firestoreService');
          const latestPos = await loadLatestPositionsPerTransmitter(tIds);
          data = latestPos.map(d => ({ _collection: 'positions', ...d }));
        } else {
          const { loadLatestArgosPositionsPerTransmitter, loadLatestPositionsPerTransmitter } = await import('../services/firestoreService');
          const [argos, pos] = await Promise.all([
            loadLatestArgosPositionsPerTransmitter(tIds),
            loadLatestPositionsPerTransmitter(tIds)
          ]);
          data = [
            ...argos.map(d => ({ _collection: 'argos_positions', ...d })), 
            ...pos.map(d => ({ _collection: 'positions', ...d }))
          ];
        }
      } else {
        if (historyMode === 'preset') {
          if (historyPreset === '24h') {
            sDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          } else if (historyPreset === '7d') {
            sDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          } else if (historyPreset === '30d') {
            sDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          } else if (historyPreset === '1y') {
            sDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          }
          eDate = new Date();
        } else if (historyMode === 'custom' && customDates.start && customDates.end) {
          sDate = new Date(customDates.start);
          eDate = new Date(customDates.end);
          eDate.setHours(23, 59, 59);
        }

        if (collectionMode === 'argos_positions') {
          data = await loadAllArgosPositions(sDate, eDate);
        } else if (collectionMode === 'positions') {
          data = await loadAllPositions(sDate, eDate);
        } else {
          const [argos, pos] = await Promise.all([loadAllArgosPositions(sDate, eDate), loadAllPositions(sDate, eDate)]);
          data = [...argos, ...pos];
        }
      }

      // Apply Filter Modal client-side filtering
      if (selectedTransmitterIds.length > 0) {
        data = data.filter(d => selectedTransmitterIds.includes(String(d.platformId || d.transmitter_id || '')));
      }

      if (filterLocationType === 'GPS') {
        data = data.filter(d => {
          const lc = d.lc || '';
          return lc.trim() === '' || (!['0','1','2','3','A','B','Z'].includes(lc));
        });
      } else if (filterLocationType === 'Doppler') {
        data = data.filter(d => {
          const lc = d.lc || '';
          return ['0','1','2','3','A','B','Z'].includes(lc);
        });
      }

      setAllData(data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [collectionMode, historyMode, historyPreset, customDates, selectedTransmitterIds, filterLocationType]);"""

content = re.sub(
    r"  const loadData = useCallback\(async \(\) => \{[\s\S]*?\}, \[collectionMode, dateRange, customDates\]\);",
    load_data_repl,
    content
)

# Replace the UI filters with the new Filter button
ui_filters_repl = """               {/* Advanced Filters Button */}
               <div className="relative">
                 <button 
                   onClick={() => setFilterOpen(!isFilterOpen)}
                   className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ${isFilterOpen ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-400' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                 >
                   <Filter size={16} />
                   Advanced Filters
                 </button>
               </div>

               {/* Search */}
               <div className="relative flex-1 max-w-md">
                 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                 <input 
                     type="text" 
                     placeholder="Search all records (coordinates, ID, satellite...)" 
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                 />
               </div>"""

content = re.sub(
    r"               \{\/\* Date Range Filter \*\/\}[\s\S]*?\{\/\* Actions \*\/\}",
    ui_filters_repl + "\n               {/* Actions */}",
    content
)

# Append the Modal JSX at the end, right before the Add/Edit Argos Modal
modal_jsx = """      {/* Dark Mode Filters Modal */}
      {isFilterOpen && (
        <div className="absolute top-[200px] left-1/2 -translate-x-1/2 z-[500] w-full max-w-md bg-[#0f172a] rounded-xl shadow-2xl border border-slate-700/50 flex flex-col font-sans overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-[#0f172a]">
                <h3 className="text-lg font-bold text-white">Filters</h3>
                <button onClick={() => setFilterOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="p-4 flex justify-end bg-[#0f172a]">
                <button 
                    onClick={() => {
                        setHistoryMode('preset');
                        setHistoryPreset('latest');
                        setSelectedTransmitterIds([]);
                        setFilterLocationType('All');
                        setLocationAccuracy('All');
                        setDeviceSearchQuery('');
                    }}
                    className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                    <RefreshCw size={12} /> Reset filters
                </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh] bg-[#0f172a]">
                {/* Period Filter */}
                <div className="bg-[#1e293b] rounded-lg p-4 border border-slate-700/50">
                    <label className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        What period do you want to work on? (UTC)
                    </label>
                    <div className="flex flex-col gap-3">
                        <select 
                            value={historyMode === 'preset' ? historyPreset : 'custom'}
                            onChange={(e) => {
                                if (e.target.value === 'custom') setHistoryMode('custom');
                                else { setHistoryMode('preset'); setHistoryPreset(e.target.value); }
                            }}
                            className="w-full bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                        >
                            <option value="latest">Latest Only (2 positions)</option>
                            <option value="24h">Last 24h</option>
                            <option value="7d">Last 7d</option>
                            <option value="30d">Last 30d</option>
                            <option value="1y">Last 1y</option>
                            <option value="custom">Custom</option>
                        </select>
                        {historyMode === 'custom' && (
                            <div className="flex items-center gap-2 mt-2">
                                <input 
                                    type="date" 
                                    value={customDates.start}
                                    onChange={e => setCustomDates(p => ({ ...p, start: e.target.value }))}
                                    className="flex-1 bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                                />
                                <input 
                                    type="date" 
                                    value={customDates.end}
                                    onChange={e => setCustomDates(p => ({ ...p, end: e.target.value }))}
                                    className="flex-1 bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Devices Filter */}
                <div className="bg-[#1e293b] rounded-lg p-4 border border-slate-700/50">
                    <label className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Devices
                    </label>
                    <div className="flex bg-[#0f172a] p-1 rounded-lg mb-4">
                        <button className="flex-1 py-1.5 px-3 rounded-md bg-emerald-400 text-slate-900 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                            Unitary device
                        </button>
                        <button className="flex-1 py-1.5 px-3 rounded-md text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                            <Layers size={12} />
                            Device group(s)
                        </button>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-400 mb-1 block">Choose devices</label>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Search or copy and paste a list of device IDs"
                                value={deviceSearchQuery}
                                onChange={e => setDeviceSearchQuery(e.target.value)}
                                className="w-full bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2.5 outline-none focus:border-brand-500"
                            />
                        </div>
                        
                        <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
                            {availablePlatforms
                                .filter(id => id.toLowerCase().includes(deviceSearchQuery.toLowerCase()))
                                .map(id => (
                                <div 
                                    key={id}
                                    onClick={() => setSelectedTransmitterIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])}
                                    className={`px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center justify-between transition-colors ${selectedTransmitterIds.includes(id) ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'text-slate-300 hover:bg-slate-700'}`}
                                >
                                    PTT {id}
                                    {selectedTransmitterIds.includes(id) && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Location Accuracy Filter */}
                <div className="bg-[#1e293b] rounded-lg p-4 border border-slate-700/50">
                    <label className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Location accuracy
                    </label>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-slate-400 mb-1 block">Location Type</label>
                            <select 
                                value={filterLocationType}
                                onChange={e => setFilterLocationType(e.target.value)}
                                className="w-full bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                            >
                                <option value="All">Select... (All)</option>
                                <option value="GPS">GPS Only</option>
                                <option value="Doppler">Doppler Only</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-400 mb-1 block">Error radius (for Doppler positions only)</label>
                            <select 
                                value={locationAccuracy}
                                onChange={e => setLocationAccuracy(e.target.value)}
                                className="w-full bg-[#0f172a] border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500"
                            >
                                <option value="All">All</option>
                                <option value="high">High Accuracy (&lt; 250m)</option>
                                <option value="medium">Medium Accuracy (250m - 1500m)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#0f172a] border-t border-slate-700/50 flex justify-end gap-3">
                <button 
                    onClick={() => setFilterOpen(false)}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={() => {
                        loadData();
                        setFilterOpen(false);
                    }}
                    className="px-5 py-2 rounded-lg text-sm font-bold bg-emerald-400 text-slate-900 hover:bg-emerald-300 transition-colors shadow-lg shadow-emerald-400/20"
                >
                    Apply
                </button>
            </div>
        </div>
      )}
"""

content = re.sub(
    r"       \{/\* Add/Edit Argos Modal \*/\}",
    modal_jsx + "\n       {/* Add/Edit Argos Modal */}",
    content
)

# Remove platformFilteredData dependency and use allData directly for searchableData
content = content.replace(
    "  const platformFilteredData = platformFilter \n    ? allData.filter(row => (row.platformId || row.transmitter_id) === platformFilter)\n    : allData;",
    ""
)

content = content.replace("platformFilteredData", "allData")
content = content.replace("platformFilter", "''")

with open('views/ArgosData.tsx', 'w') as f:
    f.write(content)

print("ArgosData.tsx modified successfully")

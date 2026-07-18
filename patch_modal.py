import re

with open('views/ArgosData.tsx', 'r') as f:
    content = f.read()

# Replace the Filter Modal
filter_modal_start = "      {/* Dark Mode Filters Modal */}"
filter_modal_end = "       {/* Add/Edit Argos Modal */}"

new_modal_jsx = """      {/* Filter Modal */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center pointer-events-none">
          <Draggable handle=".modal-handle" nodeRef={nodeRef}>
            <div ref={nodeRef} className="pointer-events-auto w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700/50 flex flex-col font-sans overflow-hidden relative z-[500]">
              <div className="modal-handle flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-900 cursor-move">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white select-none">Filters</h3>
                  <button onClick={() => setFilterOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer p-1">
                      <X size={20} />
                  </button>
              </div>

              <div className="p-4 flex justify-end bg-white dark:bg-slate-900">
                  <button 
                      onClick={() => {
                          setHistoryMode('preset');
                          setHistoryPreset('latest');
                          setSelectedTransmitterIds([]);
                          setFilterLocationType('All');
                          setLocationAccuracy('All');
                          setDeviceSearchQuery('');
                      }}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-slate-300 dark:hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                      <RefreshCw size={12} /> Reset filters
                  </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh] bg-white dark:bg-slate-900">
                  {/* Period Filter */}
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                      <label className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-3 flex items-center gap-2">
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
                              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                          >
                              <option value="latest">Latest Only (1 position)</option>
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
                                      className="flex-1 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                                  />
                                  <input 
                                      type="date" 
                                      value={customDates.end}
                                      onChange={e => setCustomDates(p => ({ ...p, end: e.target.value }))}
                                      className="flex-1 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                                  />
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Devices Filter */}
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                      <label className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                          Devices
                      </label>
                      <div className="flex bg-gray-200 dark:bg-slate-900 p-1 rounded-lg mb-4">
                          <button className="flex-1 py-1.5 px-3 rounded-md bg-white dark:bg-emerald-400 text-gray-900 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-slate-900"></div>
                              Unitary device
                          </button>
                          <button className="flex-1 py-1.5 px-3 rounded-md text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                              <Layers size={12} />
                              Device group(s)
                          </button>
                      </div>
                      <div>
                          <label className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 block">Choose devices</label>
                          <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400" />
                              <input 
                                  type="text"
                                  placeholder="Search or copy and paste a list of device IDs"
                                  value={deviceSearchQuery}
                                  onChange={e => setDeviceSearchQuery(e.target.value)}
                                  className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2.5 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                              />
                          </div>
                          
                          <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
                              {availablePlatforms
                                  .filter(id => id.toLowerCase().includes(deviceSearchQuery.toLowerCase()))
                                  .map(id => (
                                  <div 
                                      key={id}
                                      onClick={() => setSelectedTransmitterIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])}
                                      className={`px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center justify-between transition-colors ${selectedTransmitterIds.includes(id) ? 'bg-brand-50 dark:bg-emerald-400/10 text-brand-700 dark:text-emerald-400 border border-brand-200 dark:border-emerald-400/20' : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                                  >
                                      PTT {id}
                                      {selectedTransmitterIds.includes(id) && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>

                  {/* Location Accuracy Filter */}
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                      <label className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          Location accuracy
                      </label>
                      <div className="space-y-4">
                          <div>
                              <label className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 block">Location Type</label>
                              <select 
                                  value={filterLocationType}
                                  onChange={e => setFilterLocationType(e.target.value)}
                                  className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                              >
                                  <option value="All">Select... (All)</option>
                                  <option value="GPS">GPS Only</option>
                                  <option value="Doppler">Doppler Only</option>
                              </select>
                          </div>
                          <div>
                              <label className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 block">Error radius (for Doppler positions only)</label>
                              <select 
                                  value={locationAccuracy}
                                  onChange={e => setLocationAccuracy(e.target.value)}
                                  className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
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
              <div className="p-4 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700/50 flex justify-end gap-3 rounded-b-xl">
                  <button 
                      onClick={() => setFilterOpen(false)}
                      className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white transition-colors"
                  >
                      Cancel
                  </button>
                  <button 
                      onClick={() => {
                          loadData();
                          setFilterOpen(false);
                      }}
                      className="px-5 py-2 rounded-lg text-sm font-bold bg-brand-600 text-white dark:bg-emerald-400 dark:text-slate-900 hover:bg-brand-700 dark:hover:bg-emerald-300 transition-colors shadow-lg shadow-brand-500/20 dark:shadow-emerald-400/20"
                  >
                      Apply
                  </button>
              </div>
            </div>
          </Draggable>
        </div>
      )}
"""

start_idx = content.find(filter_modal_start)
end_idx = content.find(filter_modal_end)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_modal_jsx + content[end_idx:]
    with open('views/ArgosData.tsx', 'w') as f:
        f.write(new_content)
    print("Modal successfully patched!")
else:
    print("Could not find modal section.")


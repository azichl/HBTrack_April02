import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Edit, Trash2, Download, MapPin, Plus, X, Save, Map, Activity } from 'lucide-react';
import { Bird } from '../types';
import { exportToCSV } from '../utils/csvExport';
import { useSortableTable, SortableHeader } from '../components/TableComponents';
import { BulkActionsToolbar } from '../components/BulkActionsToolbar';
import { formatDateTime } from '../utils/formatting';
import { CustomSelect } from '../components/CustomSelect';

type BirdTableRow = Bird & {
    associated_ptt: string | null;
    sex_label: string;
};

export const Birds = () => {
  const { 
    birds, 
    transmitters, 
    addBird, 
    updateBird, 
    deleteBird, 
    bulkDeleteBirds,
    bulkUpdateBirds,
    assignTransmitterToBird,
    setSelectedMapBirdId,
    setActiveTab,
    setDatabaseActiveTab,
    timeZone,
    isBirdModalOpen: isModalOpen,
    setIsBirdModalOpen: setIsModalOpen,
    editingRecordId,
    setEditingRecordId
  } = useAppStore();
  
  const editingBird = birds.find(b => b.id === editingRecordId) || null;
  
  // Form State
  const [formData, setFormData] = useState<Partial<Bird>>({
    ring_id: '',
    species: 'Houbara Bustard',
    sex: 'M',
    hatch_date: '',
    release_location: '',
    release_lat: '',
    release_lon: ''
  });
  const [selectedTransmitterId, setSelectedTransmitterId] = useState<string>('');

  // 1. Prepare Table Data
  const tableData = useMemo<BirdTableRow[]>(() => {
    return birds.map(bird => {
      const transmitter = transmitters.find(t => t.bird_id === bird.id);
      return {
        ...bird,
        associated_ptt: transmitter ? transmitter.platform_id : null,
        sex_label: bird.sex === 'M' ? 'Male' : 'Female'
      };
    });
  }, [birds, transmitters]);

  // 2. Sorting Hook
  const { 
    sortedData, requestSort, sortConfig, filters, setFilter, clearFilters,
    selectedIds, toggleSelection, selectAllFiltered, clearSelection, filteredData
  } = useSortableTable<BirdTableRow>(tableData);

  const handleBulkDelete = async (ids: string[]) => {
    await bulkDeleteBirds(ids);
  };

  const handleBulkReplace = async (ids: string[], field: string, value: string) => {
    await bulkUpdateBirds(ids, { [field]: value });
  };

  const isAllSelected = sortedData.length > 0 && sortedData.every(r => selectedIds.has(r.id));
  const isSomeSelected = sortedData.some(r => selectedIds.has(r.id));

  useEffect(() => {
    if (isModalOpen) {
      if (editingRecordId) {
        const bird = birds.find(b => b.id === editingRecordId);
        if (bird) {
          setFormData({ ...bird });
          const associatedTransmitter = transmitters.find(t => t.bird_id === bird.id);
          setSelectedTransmitterId(associatedTransmitter ? associatedTransmitter.id : '');
        }
      } else {
        setFormData({
          ring_id: '',
          species: 'Houbara Bustard',
          sex: 'M',
          hatch_date: '',
          release_location: '',
          release_lat: '',
          release_lon: ''
        });
        setSelectedTransmitterId('');
      }
    }
  }, [isModalOpen, editingRecordId, birds, transmitters]);

  const handleOpenModal = (b?: Bird) => {
    if (b) {
      setEditingRecordId(b.id || null);
      setFormData(b);
    } else {
      setEditingRecordId(null);
      setFormData({
        ring_id: '',
        species: 'Houbara Bustard',
        sex: 'M',
        hatch_date: '',
        release_location: '',
        release_lat: '',
        release_lon: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let birdId = '';

    if (editingBird && editingBird.id) {
      birdId = editingBird.id;
      const { id, ...updates } = formData as Bird;
      updateBird(birdId, updates);
    } else {
      birdId = `bird-${Date.now()}`;
      const newBird: Bird = {
        ...(formData as Bird),
        id: birdId,
      };
      addBird(newBird);
    }
    assignTransmitterToBird(selectedTransmitterId, birdId);
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this bird record?')) {
      deleteBird(id);
    }
  };

  const handleExport = () => {
    exportToCSV(sortedData, 'Birds_Database');
  };

  const handleTrack = (birdId: string) => {
    setSelectedMapBirdId(birdId);
    setActiveTab('Live Tracking');
  };

  const handleViewStatus = () => {
      setDatabaseActiveTab('Monitoring');
  };

  const availableTransmitters = transmitters.filter(t => !t.bird_id || (editingBird && t.bird_id === editingBird.id));

  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col relative">
      <BulkActionsToolbar
        selectedIds={Array.from(selectedIds)}
        onClearSelection={clearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkReplace={handleBulkReplace}
        availableFields={[
          { key: 'species', label: 'Species' },
          { key: 'sex', label: 'Sex (M/F)' },
          { key: 'release_location', label: 'Release Location' }
        ]}
      />

      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Bird Registry</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage individual bird records and PTT assignments.</p>
        </div>
        <div className="flex gap-3">
            <button 
              onClick={handleExport}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-600 dark:text-gray-300"
            >
              <Download size={16} /> Export CSV
            </button>
            <button 
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 shadow-sm shadow-emerald-600/20"
            >
              <Plus size={16} /> Add Bird
            </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden flex-1">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-emerald-100 dark:bg-emerald-900 border-b border-emerald-200 dark:border-emerald-800">
                <th className="px-4 py-3 w-10 border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 sticky top-0 z-20">
                  <input 
                    type="checkbox" 
                    checked={isAllSelected}
                    ref={el => { if (el) el.indeterminate = isSomeSelected && !isAllSelected; }}
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectAllFiltered(true, (item) => item.id);
                      } else {
                        clearSelection();
                      }
                    }}
                    className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Assoc. PTT" sortKey="associated_ptt" currentSort={sortConfig} onSort={requestSort} filterValue={filters['associated_ptt']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Ring ID" sortKey="ring_id" currentSort={sortConfig} onSort={requestSort} filterValue={filters['ring_id']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Species" sortKey="species" currentSort={sortConfig} onSort={requestSort} filterValue={filters['species']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Sex" sortKey="sex_label" currentSort={sortConfig} onSort={requestSort} filterValue={filters['sex_label']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Hatch Date" sortKey="hatch_date" currentSort={sortConfig} onSort={requestSort} filterValue={filters['hatch_date']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Release Site" sortKey="release_location" currentSort={sortConfig} onSort={requestSort} filterValue={filters['release_location']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Latitude" sortKey="release_lat" currentSort={sortConfig} onSort={requestSort} filterValue={filters['release_lat']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Longitude" sortKey="release_lon" currentSort={sortConfig} onSort={requestSort} filterValue={filters['release_lon']} onFilter={setFilter} />
                <th className="px-4 py-3 text-xs font-bold text-emerald-800 dark:text-emerald-100 uppercase tracking-wider whitespace-nowrap text-center sticky top-0 bg-emerald-100 dark:bg-emerald-900 z-20 border-b border-emerald-200 dark:border-emerald-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {sortedData.map((bird) => {
                const isSelected = selectedIds.has(bird.id);
                return (
                <tr 
                  key={bird.id} 
                  onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON') { toggleSelection(bird.id); } }}
                  className={`transition-colors cursor-pointer group ${isSelected ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}
                >
                  <td className="px-4 py-3 border-r border-gray-100 dark:border-slate-700">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => toggleSelection(bird.id)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap border-r border-gray-100 dark:border-slate-700 font-mono">
                    {bird.associated_ptt ? (
                      <button 
                          onClick={handleViewStatus} 
                          className="text-brand-600 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1.5"
                          title="View Status in Monitoring"
                      >
                          {bird.associated_ptt} <Activity size={12} className="text-gray-400" />
                      </button>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 italic">Not Tagged</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap border-r border-gray-100 dark:border-slate-700" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{bird.ring_id}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{bird.species}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${bird.sex === 'M' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300' : 'bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300'}`}>
                      {bird.sex_label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{formatDateTime(bird.hatch_date, timeZone).split(',')[0]}</td>
                  <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap border-r border-gray-100 dark:border-slate-700 flex items-center gap-2">
                      <MapPin size={14} className="text-emerald-600 dark:text-emerald-400" />
                      {bird.release_location}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{bird.release_lat}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{bird.release_lon}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      {bird.associated_ptt && (
                          <button onClick={() => handleTrack(bird.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-md transition-colors" title="Track on Map">
                              <Map size={16} />
                          </button>
                      )}
                      <button onClick={() => handleOpenModal(bird)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-md transition-colors" title="Edit">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(bird.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 dark:bg-slate-900 px-6 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Showing {sortedData.length} entries</span>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editingBird ? 'Edit Bird Record' : 'Add New Bird'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Ring ID</label>
                  <input 
                    type="text" required
                    value={formData.ring_id}
                    onChange={e => setFormData({...formData, ring_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                    placeholder="AE-2023-XXX"
                  />
                </div>
                <div>
                   <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Assigned Transmitter (PTT)</label>
                   <CustomSelect 
                    value={selectedTransmitterId}
                    onChange={(val) => setSelectedTransmitterId(val)}
                    className="font-sans w-full text-sm font-mono"
                    buttonClassName="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    options={[
                      { value: '', label: '-- None --' },
                      ...availableTransmitters.map(t => ({ value: t.id, label: `${t.platform_id} (${t.status})` }))
                    ]}
                   />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Species</label>
                  <input 
                    type="text" required
                    value={formData.species}
                    onChange={e => setFormData({...formData, species: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sex</label>
                  <CustomSelect 
                    value={formData.sex}
                    onChange={(val) => setFormData({...formData, sex: val as 'M'|'F'})}
                    className="font-sans w-full text-sm"
                    buttonClassName="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    options={[
                      { value: 'M', label: 'Male' },
                      { value: 'F', label: 'Female' }
                    ]}
                  />
                </div>
              </div>

               <div className="grid grid-cols-1 gap-4">
                 <div>
                   <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Hatch Date</label>
                   <input 
                    type="date" required
                    value={formData.hatch_date ? new Date(formData.hatch_date).toISOString().split('T')[0] : ''}
                    onChange={e => setFormData({...formData, hatch_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                 <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Release Site Name</label>
                  <input 
                    type="text" required
                    value={formData.release_location}
                    onChange={e => setFormData({...formData, release_location: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                    placeholder="e.g. Al Reem Reserve"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude</label>
                    <input 
                      type="text" required
                      value={formData.release_lat}
                      onChange={e => setFormData({...formData, release_lat: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono outline-none"
                      placeholder="Lat"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude</label>
                    <input 
                      type="text" required
                      value={formData.release_lon}
                      onChange={e => setFormData({...formData, release_lon: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono outline-none"
                      placeholder="Lon"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-slate-700">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2">
                  <Save size={16} /> Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
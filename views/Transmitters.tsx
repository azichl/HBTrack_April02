import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Edit, Trash2, Download, Check, X, Plus, Save } from 'lucide-react';
import { Transmitter } from '../types';
import { exportToCSV } from '../utils/csvExport';
import { useSortableTable, SortableHeader } from '../components/TableComponents';
import { BulkActionsToolbar } from '../components/BulkActionsToolbar';
import { formatDateTime } from '../utils/formatting';
import { CustomSelect } from '../components/CustomSelect';
import Draggable from 'react-draggable';

type TransmitterTableRow = Transmitter & {
  bird_species: string;
  assigned_bird_ring: string;
  deployed_status: string;
};

export const Transmitters = () => {
  const { 
    transmitters, birds, addTransmitter, updateTransmitter, deleteTransmitter, timeZone,
    bulkDeleteTransmitters, bulkUpdateTransmitters,
    isTransmitterModalOpen: isModalOpen,
    setIsTransmitterModalOpen: setIsModalOpen,
    editingRecordId,
    setEditingRecordId
  } = useAppStore();

  const editingTransmitter = transmitters.find(t => t.id === editingRecordId) || null;

  const [formData, setFormData] = useState<Partial<Transmitter>>({});
  const nodeRef = useRef<HTMLDivElement>(null);

  // 1. Prepare Flattened Data
  const tableData = useMemo<TransmitterTableRow[]>(() => {
    return transmitters.map(t => {
      const bird = birds.find(b => b.id === t.bird_id);
      return {
        ...t,
        bird_species: bird?.species || 'Unknown',
        assigned_bird_ring: bird?.ring_id || 'Unassigned',
        deployed_status: t.deployed ? 'Yes' : 'No'
      };
    });
  }, [transmitters, birds]);

  // 2. Sorting Hook
  const { 
    sortedData, requestSort, sortConfig, filters, setFilter, clearFilters,
    selectedIds, toggleSelection, selectAllFiltered, clearSelection, filteredData
  } = useSortableTable<TransmitterTableRow>(tableData);

  const handleBulkDelete = async (ids: string[]) => {
    await bulkDeleteTransmitters(ids);
  };

  const handleBulkReplace = async (ids: string[], field: string, value: string) => {
    await bulkUpdateTransmitters(ids, { [field]: value === 'true' ? true : value === 'false' ? false : value });
  };

  const isAllSelected = sortedData.length > 0 && sortedData.every(r => selectedIds.has(r.id));
  const isSomeSelected = sortedData.some(r => selectedIds.has(r.id));

  useEffect(() => {
    if (isModalOpen) {
      if (editingRecordId) {
        const t = transmitters.find(x => x.id === editingRecordId);
        if (t) setFormData(t);
      } else {
        setFormData({
          platform_id: '',
          model: 'GeoTrack 20g',
          status: 'active',
          bird_id: '',
          battery_voltage: 4.0,
          last_fix: new Date().toISOString(),
          duty_cycle: '8h ON/16h OFF',
          frequency: '',
          hex_id: '',
          manufacturer: '',
          program_region: '',
          site_location: '',
          satellite_time: 'Continuous',
          radio_time: 'None',
          deployed: false,
          comment: ''
        });
      }
    }
  }, [isModalOpen, editingRecordId, transmitters]);

  const handleOpenModal = (transmitter?: Transmitter) => {
    if (transmitter) {
      setEditingRecordId(transmitter.id || null);
    } else {
      setEditingRecordId(null);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTransmitter) {
      updateTransmitter(editingTransmitter.id, formData);
    } else {
      const newTransmitter: Transmitter = {
        id: `trans-${Date.now()}`,
        ...formData as Transmitter
      };
      addTransmitter(newTransmitter);
    }
    setIsModalOpen(false);
  };

  const handleExport = () => {
    exportToCSV(sortedData, 'Transmitters_Database');
  };

  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col relative">
      <BulkActionsToolbar
        selectedIds={Array.from(selectedIds)}
        onClearSelection={clearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkReplace={handleBulkReplace}
        availableFields={[
          { key: 'status', label: 'Status' },
          { key: 'deployed', label: 'Deployed' },
          { key: 'program_region', label: 'Program Region' },
          { key: 'site_location', label: 'Site Location' },
          { key: 'manufacturer', label: 'Manufacturer' },
          { key: 'comment', label: 'Comment' }
        ]}
      />

      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Transmitter Management</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage Argos Platform Terminal Transmitters (PTTs) and configurations.</p>
        </div>
        <div className="flex gap-3">
            <button 
              onClick={async (e) => {
                const btn = e.currentTarget;
                const originalText = btn.innerHTML;
                btn.innerHTML = 'Calculating...';
                btn.disabled = true;
                try {
                  const db = (await import('../firebase')).db;
                  const { collection, query, where, getDocs } = await import('firebase/firestore');
                  const { evaluateTransmitterStatus } = await import('../utils/statusCalculator');
                  const store = useAppStore.getState();
                  const currentTransmitters = store.transmitters;
                  
                  let debugLog = "Evaluation Results:\n";
                  let numUpdated = 0;

                  for (const t of currentTransmitters) {
                    const qPos = query(collection(db, 'positions'), where('transmitter_id', '==', String(t.platform_id)));
                    const snap = await getDocs(qPos);
                    const positions = snap.docs.map(d => d.data());
                    const status = evaluateTransmitterStatus(t, positions);
                    
                    if (t.derived_status !== status) {
                      numUpdated++;
                      try {
                        const { saveDocument } = await import('../services/firestoreService');
                        await saveDocument('transmitters', t.id, { derived_status: status });
                      } catch (err: any) {
                        console.error(`DB Update Error for ${t.platform_id}: ${err.message}`);
                      }
                    }
                  }
                  
                  if (numUpdated > 0) {
                    const { loadCollection } = await import('../services/firestoreService');
                    const freshTransmitters = await loadCollection('transmitters');
                    store.transmitters = freshTransmitters as any;
                    // Force a re-render by updating the store using the set function if available
                    useAppStore.setState({ transmitters: freshTransmitters as any });
                  }
                  
                  // Run the background update just in case it missed anything
                  store.recalculateTransmitterStatuses();
                } catch (err: any) {
                  alert('Failed: ' + err.message);
                } finally {
                  btn.innerHTML = originalText;
                  btn.disabled = false;
                }
              }}
              className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-2"
            >
              Recalculate Statuses
            </button>
            <button 
              onClick={handleExport}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-600 dark:text-gray-300"
            >
              <Download size={16} /> Export CSV
            </button>
            <button 
              onClick={() => { setEditingRecordId(null); setIsModalOpen(true); }}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 flex items-center gap-2 shadow-sm shadow-sky-600/20"
            >
              <Plus size={16} /> Add Transmitter
            </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden flex-1">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-sky-200 dark:bg-sky-900 border-b border-sky-300 dark:border-sky-800">
                <th className="px-4 py-3 w-10 border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 sticky top-0 z-20">
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
                    className="rounded border-sky-400 text-sky-600 focus:ring-sky-500"
                  />
                </th>
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Platform ID" sortKey="platform_id" currentSort={sortConfig} onSort={requestSort} filterValue={filters['platform_id']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Frequency" sortKey="frequency" currentSort={sortConfig} onSort={requestSort} filterValue={filters['frequency']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Hex ID" sortKey="hex_id" currentSort={sortConfig} onSort={requestSort} filterValue={filters['hex_id']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Model" sortKey="model" currentSort={sortConfig} onSort={requestSort} filterValue={filters['model']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Bird Species" sortKey="bird_species" currentSort={sortConfig} onSort={requestSort} filterValue={filters['bird_species']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Origin Company" sortKey="manufacturer" currentSort={sortConfig} onSort={requestSort} filterValue={filters['manufacturer']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Last Fix" sortKey="last_fix" currentSort={sortConfig} onSort={requestSort} filterValue={filters['last_fix']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Site Location" sortKey="site_location" currentSort={sortConfig} onSort={requestSort} filterValue={filters['site_location']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Program Region" sortKey="program_region" currentSort={sortConfig} onSort={requestSort} filterValue={filters['program_region']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Sat Time" sortKey="satellite_time" currentSort={sortConfig} onSort={requestSort} filterValue={filters['satellite_time']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Radio Time" sortKey="radio_time" currentSort={sortConfig} onSort={requestSort} filterValue={filters['radio_time']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Deployed" sortKey="deployed_status" currentSort={sortConfig} onSort={requestSort} filterValue={filters['deployed_status']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Status" sortKey="status" currentSort={sortConfig} onSort={requestSort} filterValue={filters['status']} onFilter={setFilter} />
                <SortableHeader className="border-r border-sky-300/50 dark:border-sky-800/50 bg-sky-200 dark:bg-sky-900 text-slate-800 dark:text-sky-100" label="Comment" sortKey="comment" currentSort={sortConfig} onSort={requestSort} filterValue={filters['comment']} onFilter={setFilter} />
                <th className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-sky-100 uppercase tracking-wider whitespace-nowrap text-center sticky top-0 bg-sky-200 dark:bg-sky-900 z-20 border-b border-sky-300 dark:border-sky-800">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {sortedData.map((t) => {
                const isSelected = selectedIds.has(t.id);
                return (
                <tr 
                  key={t.id} 
                  onClick={(e) => handleRowClick(e, t.id)}
                  className={`transition-colors cursor-pointer group ${isSelected ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}
                >
                  <td className="px-4 py-3 border-r border-gray-100 dark:border-slate-700">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => toggleSelection(t.id)}
                      className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-brand-900 dark:text-brand-100 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.platform_id}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.frequency || '-'}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.hex_id || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.model}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.bird_species}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.manufacturer || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{formatDateTime(t.last_fix, timeZone)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.site_location || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.program_region || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.satellite_time || t.duty_cycle}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{t.radio_time || '-'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap border-r border-gray-100 dark:border-slate-700">
                    {t.deployed ? (
                      <span className="flex items-center gap-1 text-green-700 dark:text-green-400"><Check size={14} /> Yes</span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-700 dark:text-red-400"><X size={14} /> No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                      (t.derived_status || t.status) === 'Active' || (t.derived_status || t.status) === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                      (t.derived_status || t.status) === 'Potential Mortality' ? 'bg-[#FFAA33]/20 dark:bg-[#FFAA33]/30 text-[#FFAA33]' :
                      (t.derived_status || t.status) === 'Inactive' ? 'bg-[#FF2A00]/20 dark:bg-[#FF2A00]/30 text-[#FF2A00]' :
                      (t.derived_status || t.status) === 'Static test' ? 'bg-[#F4F714]/20 dark:bg-[#F4F714]/30 text-[#e6b800] dark:text-[#F4F714]' :
                      'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                    }`}>
                      {t.derived_status || t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 italic border-r border-gray-100 dark:border-slate-700 max-w-[150px] truncate" title={t.comment}>
                    {t.comment || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleOpenModal(t)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-md" title="Edit">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md" title="Delete">
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
          {/* Pagination could be added here if needed */}
        </div>
      </div>

       {/* Add/Edit Modal */}
       {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          {/* @ts-ignore - react-draggable types are missing default props */}
          <Draggable handle=".modal-handle" nodeRef={nodeRef}>
            <div ref={nodeRef} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
              <div className="modal-handle cursor-move px-6 py-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editingTransmitter ? 'Edit Transmitter' : 'Add New Transmitter'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div>
                  <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100 dark:border-slate-700">Identification</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Platform ID (PTT)</label>
                      <input type="text" required value={formData.platform_id} onChange={e => setFormData({...formData, platform_id: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Frequency (MHz)</label>
                      <input type="text" value={formData.frequency} onChange={e => setFormData({...formData, frequency: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Hex ID</label>
                      <input type="text" value={formData.hex_id} onChange={e => setFormData({...formData, hex_id: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>
                </div>

                {/* Hardware */}
                <div>
                  <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100 dark:border-slate-700">Hardware & Config</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Manufacturer</label>
                      <input type="text" value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
                      <input type="text" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                      <CustomSelect 
                        value={formData.status} 
                        onChange={(val) => setFormData({...formData, status: val as any})} 
                        className="w-full font-sans"
                        buttonClassName="p-2 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                        options={[
                          { value: 'active', label: 'Active' },
                          { value: 'inactive', label: 'Inactive' },
                          { value: 'maintenance', label: 'Maintenance' }
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* Deployment */}
                <div>
                  <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100 dark:border-slate-700">Deployment</h4>
                  <div className="grid grid-cols-3 gap-4">
                     <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Assigned Bird</label>
                      <CustomSelect 
                        value={formData.bird_id || ''} 
                        onChange={(val) => setFormData({...formData, bird_id: val})} 
                        className="w-full font-sans"
                        buttonClassName="p-2 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                        options={[
                          { value: '', label: '-- Unassigned --' },
                          ...birds.map(b => ({ value: b.id, label: b.ring_id || 'Unknown' }))
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Site Location</label>
                      <input type="text" value={formData.site_location} onChange={e => setFormData({...formData, site_location: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                     <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Program Region</label>
                      <input type="text" value={formData.program_region} onChange={e => setFormData({...formData, program_region: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.deployed} onChange={e => setFormData({...formData, deployed: e.target.checked})} className="rounded text-sky-600 focus:ring-sky-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Device is currently deployed</span>
                    </label>
                  </div>
                </div>

                 {/* Transmission Settings */}
                 <div>
                  <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100 dark:border-slate-700">Cycles & Timings</h4>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Satellite Transmission Time</label>
                      <input type="text" value={formData.satellite_time} onChange={e => setFormData({...formData, satellite_time: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" placeholder="e.g. 08:00 - 16:00" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Radio Transmission</label>
                      <input type="text" value={formData.radio_time} onChange={e => setFormData({...formData, radio_time: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                  </div>
                </div>

                {/* Comments */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Comments</label>
                  <textarea value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} className="input-field w-full border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white p-2 rounded text-sm h-20 outline-none focus:ring-2 focus:ring-sky-500" />
                </div>

              </form>
            </div>

            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3 flex-shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                <button type="button" onClick={handleSubmit} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors flex items-center gap-2">
                  <Save size={16} /> Save Transmitter
                </button>
            </div>
          </div>
          </Draggable>
        </div>
      )}
    </div>
  );
};
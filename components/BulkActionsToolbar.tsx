import React, { useState } from 'react';
import { Trash2, Edit2, X, Check, Database, Loader2 } from 'lucide-react';

interface BulkActionsToolbarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onBulkReplace: (ids: string[], field: string, value: string) => Promise<void>;
  availableFields: { key: string; label: string }[];
}

export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedIds,
  onClearSelection,
  onBulkDelete,
  onBulkReplace,
  availableFields
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [replaceField, setReplaceField] = useState(availableFields[0]?.key || '');
  const [replaceValue, setReplaceValue] = useState('');

  if (selectedIds.length === 0) return null;

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} selected records?`)) {
      setIsDeleting(true);
      await onBulkDelete(selectedIds);
      setIsDeleting(false);
      onClearSelection();
    }
  };

  const handleReplace = async () => {
    if (window.confirm(`Are you sure you want to update "${replaceField}" to "${replaceValue}" for ${selectedIds.length} selected records?`)) {
      setIsReplacing(true);
      await onBulkReplace(selectedIds, replaceField, replaceValue);
      setIsReplacing(false);
      setReplaceMode(false);
      onClearSelection();
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="bg-slate-900/95 backdrop-blur-md shadow-2xl border border-slate-700/50 rounded-2xl px-6 py-3 flex items-center gap-6">
        
        <div className="flex items-center gap-3">
          <div className="bg-brand-500 text-white font-bold px-2 py-0.5 rounded text-sm">
            {selectedIds.length}
          </div>
          <span className="text-slate-200 font-medium text-sm">Rows Selected</span>
        </div>

        <div className="h-6 w-px bg-slate-700" />

        {replaceMode ? (
          <div className="flex items-center gap-3">
            <select
              value={replaceField}
              onChange={(e) => setReplaceField(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500"
            >
              {availableFields.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="New Value"
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 w-48"
            />
            <button
              onClick={handleReplace}
              disabled={isReplacing}
              className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-1 px-3 text-sm font-bold"
            >
              {isReplacing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Apply
            </button>
            <button
              onClick={() => setReplaceMode(false)}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setReplaceMode(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700"
            >
              <Edit2 size={14} /> Replace By
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors border border-red-500/20"
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete Selection
            </button>
          </div>
        )}

        <div className="h-6 w-px bg-slate-700" />

        <button
          onClick={onClearSelection}
          className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
          title="Clear Selection"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

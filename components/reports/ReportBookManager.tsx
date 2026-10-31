// components/reports/ReportBookManager.tsx
// The "Save to Report" modal + the "My Report Collections" panel.
// Place the <SaveToReportButton /> anywhere near the existing Export button.
// The <ReportBookManager /> is the full side-panel / modal.

import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Trash2, Download, ChevronDown, ChevronUp,
  GripVertical, FileText, X, Edit2, Loader2, FolderOpen,
  Archive,
} from 'lucide-react';
import type { ReportBookMeta, ReportBookPage, ReportBookCategory } from '../../src/types/multiReport';
import {
  createReportBook, listReportBooks, updateReportBookMeta, deleteReportBook,
  addPageToBook, listPages, removePageFromBook,
  exportBookAsPdf, exportBookAsPngZip,
} from '../../services/multiReportService';

// ─── props ───────────────────────────────────────────────────────────────────

export interface ReportBookManagerProps {
  /** Called to get the current report's PDF blob (uses the existing generateReportPdfBlob). */
  onGetCurrentPdfBlob: () => Promise<Blob>;
  /** The cover-page DOM node for multi-page export (passed from the parent that renders <CoverPage />). */
  coverNodeRef: React.RefObject<HTMLDivElement | null>;
  /** Label shown in the book page list, e.g. "244289" or "Ring 7751". */
  currentBirdLabel: string;
  /** PTT / ring / darvic value. */
  currentBirdId: string;
  /** If true the panel is shown inline, otherwise it is a modal. */
  inline?: boolean;
  /** Optional callback to notify parent before export (e.g., to update CoverPage props in DOM). */
  onBeforeExport?: (book: ReportBookMeta, pages: ReportBookPage[]) => void;
}

// ─── "Save to report" button (appears next to the Export button) ─────────────

export function SaveToReportButton({
  onGetCurrentPdfBlob,
  currentBirdLabel,
  currentBirdId,
  coverNodeRef,
  onBeforeExport,
}: Omit<ReportBookManagerProps, 'inline'>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
        title="حفظ صفحة هذا التقرير في مجموعة تقارير متعددة"
      >
        <BookOpen size={14} />
        <span>Save to Report</span>
      </button>
      {open && (
        <ReportBookManager
          onGetCurrentPdfBlob={onGetCurrentPdfBlob}
          coverNodeRef={coverNodeRef}
          currentBirdLabel={currentBirdLabel}
          currentBirdId={currentBirdId}
          inline={false}
          onBeforeExport={onBeforeExport}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── main panel ──────────────────────────────────────────────────────────────

interface ManagerProps extends ReportBookManagerProps {
  onClose?: () => void;
}

export function ReportBookManager({
  onGetCurrentPdfBlob, coverNodeRef, currentBirdLabel, currentBirdId, inline, onBeforeExport, onClose,
}: ManagerProps) {
  const [books, setBooks] = useState<ReportBookMeta[]>([]);
  const [pages, setPages] = useState<Record<string, ReportBookPage[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);   // bookId being saved to
  const [exporting, setExporting] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ step: string; pct: number } | null>(null);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookCat, setNewBookCat] = useState<ReportBookCategory>('almaty');
  const [showNewForm, setShowNewForm] = useState(false);
  const [expandedBook, setExpandedBook] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleVal, setEditTitleVal] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setBooks(await listReportBooks()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadPages = useCallback(async (bookId: string) => {
    const p = await listPages(bookId);
    setPages(prev => ({ ...prev, [bookId]: p }));
  }, []);

  const handleExpandBook = (bookId: string) => {
    if (expandedBook === bookId) { setExpandedBook(null); return; }
    setExpandedBook(bookId);
    loadPages(bookId);
  };

  const handleCreateBook = async () => {
    if (!newBookTitle.trim() && newBookCat === 'custom') return;
    const title = newBookTitle.trim() || undefined;
    await createReportBook(newBookCat, title);
    setNewBookTitle(''); setShowNewForm(false);
    await refresh();
  };

  const handleSavePage = async (bookId: string, pageCount: number) => {
    setSaving(bookId);
    try {
      const blob = await onGetCurrentPdfBlob();
      const p = await addPageToBook(bookId, blob, currentBirdId, currentBirdLabel, pageCount);
      setPages(prev => ({ ...prev, [bookId]: [...(prev[bookId] ?? []), p] }));
      setBooks(prev => prev.map(b => b.id === bookId ? { ...b, pageCount: pageCount + 1 } : b));
    } finally { setSaving(null); }
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!confirm('Delete this entire report collection? This cannot be undone.')) return;
    await deleteReportBook(bookId);
    await refresh();
  };

  const handleRemovePage = async (bookId: string, page: ReportBookPage) => {
    await removePageFromBook(bookId, page);
    await loadPages(bookId);
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, pageCount: Math.max(0, b.pageCount - 1) } : b));
  };

  const handleExportPdf = async (book: ReportBookMeta) => {
    if (!coverNodeRef.current) return;
    setExporting(book.id);
    try {
      const bookPages = pages[book.id] ?? await listPages(book.id);
      onBeforeExport?.(book, bookPages);
      await new Promise(r => setTimeout(r, 60));
      await exportBookAsPdf(book, bookPages, coverNodeRef.current,
        (step, pct) => setProgress({ step, pct }));
    } finally { setExporting(null); setProgress(null); }
  };

  const handleExportZip = async (book: ReportBookMeta) => {
    if (!coverNodeRef.current) return;
    setExporting(book.id);
    try {
      const bookPages = pages[book.id] ?? await listPages(book.id);
      onBeforeExport?.(book, bookPages);
      await new Promise(r => setTimeout(r, 60));
      await exportBookAsPngZip(book, bookPages, coverNodeRef.current,
        (step, pct) => setProgress({ step, pct }));
    } finally { setExporting(null); setProgress(null); }
  };

  const startEditTitle = (book: ReportBookMeta) => {
    setEditingTitle(book.id);
    setEditTitleVal(book.title);
  };
  const saveTitle = async (bookId: string) => {
    if (!editTitleVal.trim()) return;
    await updateReportBookMeta(bookId, { title: editTitleVal.trim() });
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, title: editTitleVal.trim() } : b));
    setEditingTitle(null);
  };

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 font-bold text-sm">
          <BookOpen size={16} className="text-indigo-600" />
          Report Collections
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewForm(v => !v)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus size={12} /> New collection
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* new collection form */}
      {showNewForm && (
        <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-950/30">
          <div className="text-xs font-semibold mb-2 text-indigo-700 dark:text-indigo-300">New collection</div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {(['almaty', 'zhezqazgan', 'custom'] as ReportBookCategory[]).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setNewBookCat(cat); if (cat !== 'custom') setNewBookTitle(''); }}
                  className={`flex-1 text-xs py-1 px-2 rounded-lg border font-medium transition-colors ${newBookCat === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'}`}
                >
                  {cat === 'almaty' ? 'Almaty' : cat === 'zhezqazgan' ? 'Zhezqazgan' : 'Custom'}
                </button>
              ))}
            </div>
            {newBookCat === 'custom' && (
              <input
                type="text"
                value={newBookTitle}
                onChange={e => setNewBookTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateBook()}
                placeholder="Collection title…"
                className="text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 w-full"
                autoFocus
              />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateBook}
                disabled={newBookCat === 'custom' && !newBookTitle.trim()}
                className="flex-1 text-xs py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="flex-1 text-xs py-1 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* book list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-slate-400 text-sm gap-2">
            <FolderOpen size={28} />
            <p>No collections yet. Create one above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {books.map(book => (
              <li key={book.id} className="group">
                {/* book row */}
                <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <button
                    type="button"
                    onClick={() => handleExpandBook(book.id)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    {expandedBook === book.id ? <ChevronUp size={14} className="shrink-0 text-slate-400" /> : <ChevronDown size={14} className="shrink-0 text-slate-400" />}
                    <div className="min-w-0">
                      {editingTitle === book.id ? (
                        <input
                          type="text"
                          value={editTitleVal}
                          onChange={e => setEditTitleVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveTitle(book.id); if (e.key === 'Escape') setEditingTitle(null); }}
                          onBlur={() => saveTitle(book.id)}
                          className="text-xs rounded border border-indigo-400 px-1 py-0.5 w-full"
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-xs font-semibold truncate block">{book.title}</span>
                      )}
                      <span className="text-[10px] text-slate-400">{book.pageCount} page{book.pageCount !== 1 ? 's' : ''} · {book.issueDate}</span>
                    </div>
                  </button>

                  {/* actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* save current page here */}
                    <button
                      type="button"
                      disabled={saving === book.id}
                      onClick={() => handleSavePage(book.id, book.pageCount)}
                      className="text-[10px] px-2 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50 flex items-center gap-0.5"
                      title={`Save "${currentBirdLabel}" here`}
                    >
                      {saving === book.id ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                      Save here
                    </button>

                    {/* export PDF */}
                    <button
                      type="button"
                      disabled={exporting === book.id || book.pageCount === 0}
                      onClick={() => handleExportPdf(book)}
                      className="p-1 rounded-md text-slate-400 hover:text-emerald-600 disabled:opacity-30"
                      title="Export as PDF"
                    >
                      {exporting === book.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    </button>

                    {/* export ZIP (cover PNG + PDF pages) */}
                    <button
                      type="button"
                      disabled={exporting === book.id || book.pageCount === 0}
                      onClick={() => handleExportZip(book)}
                      className="p-1 rounded-md text-slate-400 hover:text-sky-600 disabled:opacity-30"
                      title="Export as ZIP (PNG cover + PDF pages)"
                    >
                      <Archive size={13} />
                    </button>

                    {/* rename */}
                    <button
                      type="button"
                      onClick={() => startEditTitle(book)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white"
                      title="Rename"
                    >
                      <Edit2 size={13} />
                    </button>

                    {/* delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteBook(book.id)}
                      className="p-1 rounded-md text-slate-300 hover:text-red-500"
                      title="Delete collection"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* expanded pages list */}
                {expandedBook === book.id && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 px-3 pb-2 pt-1">
                    {!pages[book.id] ? (
                      <div className="text-xs text-slate-400 py-1 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Loading pages…</div>
                    ) : pages[book.id].length === 0 ? (
                      <div className="text-xs text-slate-400 py-1">No pages yet. Click "Save here" to add this bird.</div>
                    ) : (
                      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                        {pages[book.id].map((p, idx) => (
                          <li key={p.id} className="flex items-center gap-2 py-1.5 text-xs">
                            <GripVertical size={12} className="text-slate-300 shrink-0" />
                            <FileText size={12} className="text-indigo-400 shrink-0" />
                            <span className="flex-1 truncate font-medium">{p.birdLabel}</span>
                            <span className="text-slate-400 shrink-0">p.{idx + 1}</span>
                            <a href={p.downloadUrl} target="_blank" rel="noopener noreferrer"
                              className="p-0.5 text-slate-400 hover:text-sky-600" title="Open PDF">
                              <Download size={11} />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRemovePage(book.id, p)}
                              className="p-0.5 text-slate-300 hover:text-red-500"
                              title="Remove this page"
                            >
                              <X size={11} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* export progress bar */}
      {progress && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{progress.step}</span><span>{progress.pct}%</span>
          </div>
          <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );

  if (inline) return <div className="w-72 border rounded-xl shadow-xl overflow-hidden">{content}</div>;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[420px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

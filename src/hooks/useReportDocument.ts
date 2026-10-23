import { useReducer, useEffect, useRef, useState, useCallback } from 'react';
import {
  ReportDocument,
  DEFAULT_REPORT_COLORS,
  DEFAULT_SECTIONS,
  DEFAULT_SECTION_ORDER,
  DEFAULT_LAYOUT,
  DEFAULT_MAP_ELEMENTS
} from '../types/report';

export const INITIAL_REPORT_DOCUMENT: ReportDocument = {
  lang: 'ar',
  layout: structuredClone(DEFAULT_LAYOUT),
  mapElements: structuredClone(DEFAULT_MAP_ELEMENTS),
  reportScale: 1.0,
  texts: {
    reportTitle: 'تقرير متابعة طائر حبارى مزود بجهاز تتبع',
    subtitle: 'بيانات وإحداثيات مسار التتبع الميداني',
    orgNameAr: 'الصندوق الدولي للحفاظ على الحبارى',
    orgNameEn: 'International Fund for Houbara Conservation',
    footerText: 'جميع البيانات والإحداثيات الواردة في هذا التقرير سرية وخاصة بمشروع المتابعة الميدانية',
    notes: 'ملاحظات: مسار الطيران والبيانات محدثة تلقائياً وفق آخر إرسال عبر الأقمار الصناعية.',
    preparedBy: 'فريق التتبع الميداني',
    issueDate: new Date().toISOString().slice(0, 10)
  },
  styles: {},
  colors: structuredClone(DEFAULT_REPORT_COLORS),
  sections: structuredClone(DEFAULT_SECTIONS),
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  labels: [],
  columnLabels: {},
  cellOverrides: {},
  kpiOverrides: {}
};

type Action =
  | { type: 'SET_DOCUMENT'; payload: ReportDocument }
  | { type: 'UPDATE_TEXTS'; payload: Record<string, string> }
  | { type: 'UPDATE_COLORS'; payload: Partial<ReportDocument['colors']> }
  | { type: 'UPDATE_SECTIONS'; payload: Record<string, boolean> }
  | { type: 'UPDATE_LABELS'; payload: ReportDocument['labels'] }
  | { type: 'UPDATE_MAP_IMAGE'; payload: ReportDocument['mapImage'] }
  | { type: 'OVERRIDE_CELL'; tableId: string; rowId: string; colKey: string; value: string }
  | { type: 'REVERT_CELL'; tableId: string; rowId: string; colKey: string }
  | { type: 'OVERRIDE_COLUMN_LABEL'; tableId: string; colKey: string; label: string };

function reportReducer(state: ReportDocument, action: Action): ReportDocument {
  switch (action.type) {
    case 'SET_DOCUMENT':
      return action.payload;
    case 'UPDATE_TEXTS':
      return { ...state, texts: { ...state.texts, ...action.payload } };
    case 'UPDATE_COLORS':
      return { ...state, colors: { ...state.colors, ...action.payload } };
    case 'UPDATE_SECTIONS':
      return { ...state, sections: { ...state.sections, ...action.payload } as any };
    case 'UPDATE_LABELS':
      return { ...state, labels: action.payload };
    case 'UPDATE_MAP_IMAGE':
      return { ...state, mapImage: action.payload };
    case 'OVERRIDE_CELL': {
      const prevTables = state.cellOverrides[action.tableId] || {};
      const prevRow = prevTables[action.rowId] || {};
      return {
        ...state,
        cellOverrides: {
          ...state.cellOverrides,
          [action.tableId]: {
            ...prevTables,
            [action.rowId]: {
              ...prevRow,
              [action.colKey]: action.value
            }
          }
        }
      };
    }
    case 'REVERT_CELL': {
      const table = { ...(state.cellOverrides[action.tableId] || {}) };
      if (table[action.rowId]) {
        const row = { ...table[action.rowId] };
        delete row[action.colKey];
        if (Object.keys(row).length === 0) {
          delete table[action.rowId];
        } else {
          table[action.rowId] = row;
        }
      }
      return {
        ...state,
        cellOverrides: {
          ...state.cellOverrides,
          [action.tableId]: table
        }
      };
    }
    case 'OVERRIDE_COLUMN_LABEL':
      return {
        ...state,
        columnLabels: {
          ...state.columnLabels,
          [action.tableId]: {
            ...(state.columnLabels[action.tableId] || {}),
            [action.colKey]: action.label
          }
        }
      };
    default:
      return state;
  }
}

export function useReportDocument(birdId: string) {
  const storageKey = `hbtrack_report_doc_${birdId || 'default'}`;

  const [document, dispatch] = useReducer(reportReducer, INITIAL_REPORT_DOCUMENT, () => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return { ...INITIAL_REPORT_DOCUMENT, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load document from localStorage', e);
    }
    return INITIAL_REPORT_DOCUMENT;
  });

  // Undo / Redo history
  const [history, setHistory] = useState<ReportDocument[]>([INITIAL_REPORT_DOCUMENT]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'idle'>('saved');
  const debounceTimerRef = useRef<any>(null);

  // Push snapshot to history
  const pushHistory = useCallback((nextDoc: ReportDocument) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIdx + 1);
      if (sliced.length >= 100) sliced.shift();
      return [...sliced, nextDoc];
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 99));
  }, [historyIdx]);

  // Load when birdId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = { ...INITIAL_REPORT_DOCUMENT, ...JSON.parse(saved) };
        dispatch({ type: 'SET_DOCUMENT', payload: parsed });
        setHistory([parsed]);
        setHistoryIdx(0);
        return;
      }
    } catch (e) {
      // ignore
    }
    dispatch({ type: 'SET_DOCUMENT', payload: INITIAL_REPORT_DOCUMENT });
    setHistory([INITIAL_REPORT_DOCUMENT]);
    setHistoryIdx(0);
  }, [birdId, storageKey]);

  // Autosave to localStorage (and debounced status)
  useEffect(() => {
    setSaveStatus('saving');
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(document));
        setSaveStatus('saved');
      } catch (e) {
        console.warn('Failed to autosave report document', e);
        setSaveStatus('idle');
      }
    }, 1200);

    return () => clearTimeout(debounceTimerRef.current);
  }, [document, storageKey]);

  // Undo / Redo operations
  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const targetIdx = historyIdx - 1;
    const targetDoc = history[targetIdx];
    if (targetDoc) {
      setHistoryIdx(targetIdx);
      dispatch({ type: 'SET_DOCUMENT', payload: targetDoc });
    }
  }, [canUndo, history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const targetIdx = historyIdx + 1;
    const targetDoc = history[targetIdx];
    if (targetDoc) {
      setHistoryIdx(targetIdx);
      dispatch({ type: 'SET_DOCUMENT', payload: targetDoc });
    }
  }, [canRedo, history, historyIdx]);

  // Keyboard shortcuts Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  const updateTexts = useCallback((patch: Record<string, string>) => {
    dispatch({ type: 'UPDATE_TEXTS', payload: patch });
  }, []);

  const updateColors = useCallback((patch: Partial<ReportDocument['colors']>) => {
    dispatch({ type: 'UPDATE_COLORS', payload: patch });
  }, []);

  const updateSections = useCallback((patch: Record<string, boolean>) => {
    dispatch({ type: 'UPDATE_SECTIONS', payload: patch });
  }, []);

  const updateLabels = useCallback((labels: ReportDocument['labels']) => {
    dispatch({ type: 'UPDATE_LABELS', payload: labels });
  }, []);

  const updateMapImage = useCallback((mapImage: ReportDocument['mapImage']) => {
    dispatch({ type: 'UPDATE_MAP_IMAGE', payload: mapImage });
  }, []);

  const overrideCell = useCallback((tableId: string, rowId: string, colKey: string, value: string) => {
    dispatch({ type: 'OVERRIDE_CELL', tableId, rowId, colKey, value });
  }, []);

  const revertCell = useCallback((tableId: string, rowId: string, colKey: string) => {
    dispatch({ type: 'REVERT_CELL', tableId, rowId, colKey });
  }, []);

  return {
    document,
    dispatch,
    canUndo,
    canRedo,
    undo: handleUndo,
    redo: handleRedo,
    saveStatus,
    updateTexts,
    updateColors,
    updateSections,
    updateLabels,
    updateMapImage,
    overrideCell,
    revertCell
  };
}

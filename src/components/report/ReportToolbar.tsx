import React, { useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Eye,
  Palette,
  MapPin,
  Type,
  Undo2,
  Redo2,
  Download,
  ChevronDown,
  Printer,
  FileDown,
  CheckCircle2,
  RefreshCw,
  Share2
} from 'lucide-react';
import { MapImagePopover } from './popovers/MapImagePopover';
import { SectionsPopover } from './popovers/SectionsPopover';
import { ColorsPopover } from './popovers/ColorsPopover';
import { LabelsPopover } from './popovers/LabelsPopover';
import { TextPopover, ReportTexts } from './popovers/TextPopover';
import { SectionId, MapLabel } from '../../types/report';
import { ReportColors } from './popovers/ColorsPopover';

export interface ReportToolbarProps {
  // Map image
  mapImage?: { url: string; fit: 'fill' | 'cover' | 'contain' };
  isSnapshotMode: boolean;
  onChangeMapImage: (url: string | null) => void;
  onChangeMapFit: (fit: 'fill' | 'cover' | 'contain') => void;
  onToggleMapMode: (mode: 'interactive' | 'snapshot') => void;

  // Sections
  sections: Record<SectionId, boolean>;
  onChangeSections: (sections: Record<SectionId, boolean>) => void;

  // Colors
  colors: ReportColors;
  onChangeColors: (colors: ReportColors) => void;

  // Labels
  labels: MapLabel[];
  onChangeLabels: (labels: MapLabel[]) => void;

  // Texts
  texts: ReportTexts;
  onChangeTexts: (texts: ReportTexts) => void;

  // Undo / Redo
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;

  // Save status
  saveStatus?: 'saving' | 'saved' | 'idle';

  // Export handlers
  onExportPdf: () => void;
  onExportPng: () => void;
  onPrint: () => void;
  onShareWhatsApp?: () => void;
  isExporting?: boolean;

  language?: 'ar' | 'en';
}

type ActivePopover = 'mapImage' | 'sections' | 'colors' | 'labels' | 'text' | null;

export const ReportToolbar: React.FC<ReportToolbarProps> = ({
  mapImage,
  isSnapshotMode,
  onChangeMapImage,
  onChangeMapFit,
  onToggleMapMode,
  sections,
  onChangeSections,
  colors,
  onChangeColors,
  labels,
  onChangeLabels,
  texts,
  onChangeTexts,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  saveStatus = 'saved',
  onExportPdf,
  onExportPng,
  onPrint,
  onShareWhatsApp,
  isExporting = false,
  language = 'ar'
}) => {
  const isAr = language === 'ar';
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);

  // Button refs for anchoring
  const mapImageBtnRef = useRef<HTMLButtonElement>(null);
  const sectionsBtnRef = useRef<HTMLButtonElement>(null);
  const colorsBtnRef = useRef<HTMLButtonElement>(null);
  const labelsBtnRef = useRef<HTMLButtonElement>(null);
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  const togglePopover = (popover: ActivePopover) => {
    setActivePopover((prev) => (prev === popover ? null : popover));
  };

  return (
    <div className="sticky top-0 z-[500] flex flex-wrap items-center justify-between gap-2 p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-gray-200 dark:border-slate-800 rounded-xl shadow-xs text-xs mb-3">
      {/* 1. Popover Tool Buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Map Image Button */}
        <button
          ref={mapImageBtnRef}
          type="button"
          onClick={() => togglePopover('mapImage')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
            activePopover === 'mapImage'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700'
          }`}
        >
          <ImageIcon size={13} />
          <span>{isAr ? 'خريطة QGIS' : 'Map image'}</span>
          <ChevronDown size={11} className={`transition-transform ${activePopover === 'mapImage' ? 'rotate-180' : ''}`} />
        </button>

        {/* Sections Button */}
        <button
          ref={sectionsBtnRef}
          type="button"
          onClick={() => togglePopover('sections')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
            activePopover === 'sections'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700'
          }`}
        >
          <Eye size={13} />
          <span>{isAr ? 'الأقسام' : 'Sections'}</span>
          <ChevronDown size={11} className={`transition-transform ${activePopover === 'sections' ? 'rotate-180' : ''}`} />
        </button>

        {/* Colors Button */}
        <button
          ref={colorsBtnRef}
          type="button"
          onClick={() => togglePopover('colors')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
            activePopover === 'colors'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700'
          }`}
        >
          <Palette size={13} />
          <span>{isAr ? 'الألوان' : 'Colors'}</span>
          <ChevronDown size={11} className={`transition-transform ${activePopover === 'colors' ? 'rotate-180' : ''}`} />
        </button>

        {/* Labels Button */}
        <button
          ref={labelsBtnRef}
          type="button"
          onClick={() => togglePopover('labels')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
            activePopover === 'labels'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700'
          }`}
        >
          <MapPin size={13} />
          <span>{isAr ? 'العلامات' : 'Labels'}</span>
          <ChevronDown size={11} className={`transition-transform ${activePopover === 'labels' ? 'rotate-180' : ''}`} />
        </button>

        {/* Text Button */}
        <button
          ref={textBtnRef}
          type="button"
          onClick={() => togglePopover('text')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
            activePopover === 'text'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700'
          }`}
        >
          <Type size={13} />
          <span>{isAr ? 'النصوص' : 'Text'}</span>
          <ChevronDown size={11} className={`transition-transform ${activePopover === 'text' ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* 2. Middle: Autosave Status Chip */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
            saveStatus === 'saving'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          }`}
        >
          {saveStatus === 'saving' ? (
            <>
              <RefreshCw size={10} className="animate-spin" />
              <span>{isAr ? 'جارٍ الحفظ...' : 'Saving…'}</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={10} />
              <span>{isAr ? 'تم الحفظ ✓' : 'Saved ✓'}</span>
            </>
          )}
        </span>

        {/* Undo / Redo */}
        <div className="flex items-center border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-slate-800">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title={isAr ? 'تراجع (Ctrl+Z)' : 'Undo (Cmd+Z)'}
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors border-l rtl:border-r rtl:border-l-0 border-gray-200 dark:border-slate-700"
            title={isAr ? 'إعادة (Ctrl+Shift+Z)' : 'Redo (Cmd+Shift+Z)'}
          >
            <Redo2 size={13} />
          </button>
        </div>
      </div>

      {/* 3. Export Menu Trigger */}
      <div className="relative">
        <button
          ref={exportBtnRef}
          type="button"
          onClick={() => setIsExportMenuOpen((prev) => !prev)}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-brand-600 hover:from-indigo-700 hover:to-brand-700 text-white rounded-lg font-bold shadow-xs transition-all disabled:opacity-50"
        >
          {isExporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
          <span>{isAr ? 'تصدير التقرير' : 'Export'}</span>
          <ChevronDown size={11} className={`transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {isExportMenuOpen && (
          <div
            className="absolute z-[999] top-full mt-1.5 right-0 rtl:right-auto rtl:left-0 w-44 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in zoom-in-95"
            onMouseLeave={() => setIsExportMenuOpen(false)}
          >
            <button
              type="button"
              onClick={() => {
                setIsExportMenuOpen(false);
                onExportPdf();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
            >
              <FileDown size={14} className="text-red-500" />
              <span>{isAr ? 'تصدير PDF (A4 رسمي)' : 'Export PDF (A4)'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsExportMenuOpen(false);
                onExportPng();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ImageIcon size={14} className="text-indigo-500" />
              <span>{isAr ? 'تصدير صورة عالية الدقة (PNG)' : 'Export PNG Image'}</span>
            </button>
            {onShareWhatsApp && (
              <button
                type="button"
                onClick={() => {
                  setIsExportMenuOpen(false);
                  onShareWhatsApp();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors border-t border-gray-100 dark:border-slate-800 text-emerald-600 dark:text-emerald-400"
              >
                <Share2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                <span>{isAr ? 'مشاركة عبر واتساب' : 'Share on WhatsApp'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsExportMenuOpen(false);
                onPrint();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors border-t border-gray-100 dark:border-slate-800"
            >
              <Printer size={14} className="text-gray-500" />
              <span>{isAr ? 'طباعة مباشرة' : 'Direct Print'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Popovers */}
      <MapImagePopover
        anchorRef={mapImageBtnRef}
        open={activePopover === 'mapImage'}
        onClose={() => setActivePopover(null)}
        mapImage={mapImage}
        isSnapshotMode={isSnapshotMode}
        onChangeImage={onChangeMapImage}
        onChangeFit={onChangeMapFit}
        onToggleMode={onToggleMapMode}
        language={language}
      />

      <SectionsPopover
        anchorRef={sectionsBtnRef}
        open={activePopover === 'sections'}
        onClose={() => setActivePopover(null)}
        sections={sections}
        onChange={onChangeSections}
        language={language}
      />

      <ColorsPopover
        anchorRef={colorsBtnRef}
        open={activePopover === 'colors'}
        onClose={() => setActivePopover(null)}
        colors={colors}
        onChange={onChangeColors}
        language={language}
      />

      <LabelsPopover
        anchorRef={labelsBtnRef}
        open={activePopover === 'labels'}
        onClose={() => setActivePopover(null)}
        labels={labels}
        onChange={onChangeLabels}
        language={language}
      />

      <TextPopover
        anchorRef={textBtnRef}
        open={activePopover === 'text'}
        onClose={() => setActivePopover(null)}
        texts={texts}
        onChange={onChangeTexts}
        language={language}
      />
    </div>
  );
};

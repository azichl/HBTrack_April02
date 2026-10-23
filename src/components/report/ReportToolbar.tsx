import React, { useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Edit3,
  Check,
  Mountain,
  Eye,
  Palette,
  MapPin,
  ListOrdered,
  Type,
  Route,
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
import { MapElementsPopover } from './popovers/MapElementsPopover';
import { SectionsPopover } from './popovers/SectionsPopover';
import { ColorsPopover, ReportColors } from './popovers/ColorsPopover';
import { LabelsPopover } from './popovers/LabelsPopover';
import { LegendPopover } from './popovers/LegendPopover';
import { TextPopover, ReportTexts } from './popovers/TextPopover';
import { TrackPathPopover } from '../track/TrackPathPopover';
import { SectionId, MapLabel, ReportLegendItem, ReportLegendLayout, MapElements, ReportLanguage } from '../../types/report';
import { TrackPathSettings } from '../../types/track';

export interface ReportToolbarProps {
  // Edit Mode
  isEditMode: boolean;
  onToggleEditMode: () => void;

  // Map elements
  mapElements: MapElements;
  onChangeMapElements: (elements: MapElements) => void;
  visibleCampIds?: string[];
  onChangeVisibleCampIds?: (ids: string[]) => void;
  campDistToLastEnabled?: Record<string, boolean>;
  onChangeCampDistToLastEnabled?: (rec: Record<string, boolean>) => void;
  activeBaseLayer?: string;
  onChangeBaseLayer?: (layer: string) => void;
  showGoogleLabels?: boolean;
  onChangeShowGoogleLabels?: (show: boolean) => void;
  showGraticule?: boolean;
  onChangeShowGraticule?: (show: boolean) => void;
  coordFormat?: 'DD' | 'DMM' | 'DMS';
  onChangeCoordFormat?: (fmt: 'DD' | 'DMM' | 'DMS') => void;
  distUnit?: 'km' | 'mi';
  onChangeDistUnit?: (unit: 'km' | 'mi') => void;

  // Sections
  sections: Record<SectionId, boolean>;
  onChangeSections: (sections: Record<SectionId, boolean>) => void;

  // Colors
  colors: ReportColors;
  onChangeColors: (colors: ReportColors) => void;

  // Labels
  labels: MapLabel[];
  onChangeLabels: (labels: MapLabel[]) => void;
  mapCenter?: { lat: number; lon: number };

  // Legend
  legendItems?: ReportLegendItem[];
  onChangeLegendItems?: (items: ReportLegendItem[]) => void;
  legendLayout?: ReportLegendLayout;
  onChangeLegendLayout?: (layout: ReportLegendLayout) => void;
  defaultLegendItems?: ReportLegendItem[];

  // Track Path
  trackSettings?: TrackPathSettings;
  onChangeTrackSettings?: (settings: TrackPathSettings) => void;
  onPreviewTrackSettings?: (settings: TrackPathSettings) => void;
  trackPointsCount?: { displayed: number; total: number };

  // Texts
  texts: ReportTexts;
  onChangeTexts: (texts: ReportTexts) => void;

  // Report Language (AR | EN | AR+EN)
  reportLanguage?: ReportLanguage;
  onChangeReportLanguage?: (lang: ReportLanguage) => void;

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

type ActivePopover = 'mapElements' | 'sections' | 'colors' | 'labels' | 'legend' | 'text' | 'track' | null;

export const ReportToolbar: React.FC<ReportToolbarProps> = ({
  isEditMode,
  onToggleEditMode,
  mapElements,
  onChangeMapElements,
  visibleCampIds,
  onChangeVisibleCampIds,
  campDistToLastEnabled,
  onChangeCampDistToLastEnabled,
  activeBaseLayer,
  onChangeBaseLayer,
  showGoogleLabels,
  onChangeShowGoogleLabels,
  showGraticule,
  onChangeShowGraticule,
  coordFormat,
  onChangeCoordFormat,
  distUnit,
  onChangeDistUnit,
  sections,
  onChangeSections,
  colors,
  onChangeColors,
  labels,
  onChangeLabels,
  mapCenter,
  legendItems = [],
  onChangeLegendItems = () => {},
  legendLayout,
  onChangeLegendLayout,
  defaultLegendItems,
  trackSettings,
  onChangeTrackSettings,
  onPreviewTrackSettings,
  trackPointsCount,
  texts,
  onChangeTexts,
  reportLanguage = 'ar',
  onChangeReportLanguage,
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
  const isAr = reportLanguage === 'ar';
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Button anchor refs
  const mapElementsBtnRef = useRef<HTMLButtonElement>(null);
  const sectionsBtnRef = useRef<HTMLButtonElement>(null);
  const colorsBtnRef = useRef<HTMLButtonElement>(null);
  const labelsBtnRef = useRef<HTMLButtonElement>(null);
  const legendBtnRef = useRef<HTMLButtonElement>(null);
  const textBtnRef = useRef<HTMLButtonElement>(null);
  const trackBtnRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  const [exportPos, setExportPos] = useState<{ top: number; left: number } | null>(null);

  const togglePopover = (name: ActivePopover) => {
    setActivePopover((prev) => (prev === name ? null : name));
    setIsExportMenuOpen(false);
  };

  useLayoutEffect(() => {
    if (!isExportMenuOpen || !exportBtnRef.current) {
      setExportPos(null);
      return;
    }
    const rect = exportBtnRef.current.getBoundingClientRect();
    const isRtl = document.documentElement.dir === 'rtl' || document.body.dir === 'rtl';
    const menuWidth = 190;
    let left = isRtl ? rect.right - menuWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    setExportPos({
      top: rect.bottom + 6,
      left
    });
  }, [isExportMenuOpen]);

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40
      }}
      className="flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 shadow-xs text-xs mb-3 select-none"
    >
      {/* Top Toolbar Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
        {/* 1. Edit Button + Popovers */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Edit Toggle Button */}
          <button
            type="button"
            aria-pressed={isEditMode}
            onClick={onToggleEditMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold border transition-all ${
              isEditMode
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-500 shadow-sm ring-2 ring-amber-400/40'
                : 'bg-white hover:bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-slate-700'
            }`}
            title="تفعيل / إيقاف وضع التعديل (E)"
          >
            <Edit3 size={13} />
            <span>{isAr ? (isEditMode ? 'تعديل (مفعل)' : 'تعديل') : (isEditMode ? 'Editing' : 'Edit')}</span>
          </button>

          <div className="h-4 w-px bg-gray-300 dark:bg-slate-700 mx-0.5" />

          {/* Map Elements Button (Spec v3 §1) */}
          <button
            ref={mapElementsBtnRef}
            type="button"
            onClick={() => togglePopover('mapElements')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
              activePopover === 'mapElements'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700'
            }`}
          >
            <Mountain size={13} className="text-amber-500" />
            <span className="hidden sm:inline">{isAr ? 'الخريطة' : 'Map'}</span>
            <ChevronDown size={11} className={`transition-transform ${activePopover === 'mapElements' ? 'rotate-180' : ''}`} />
          </button>

          {/* Track Customizer Button */}
          {trackSettings && onChangeTrackSettings && (
            <button
              ref={trackBtnRef}
              type="button"
              onClick={() => togglePopover('track')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
                activePopover === 'track'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700'
              }`}
            >
              <Route size={13} className="text-indigo-500" />
              <span className="hidden sm:inline">{isAr ? 'المسار' : 'Track'}</span>
              {trackPointsCount && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-black/10 dark:bg-white/10 font-mono">
                  {trackPointsCount.displayed}
                </span>
              )}
              <ChevronDown size={11} className={`transition-transform ${activePopover === 'track' ? 'rotate-180' : ''}`} />
            </button>
          )}

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
            <Eye size={13} className="text-teal-500" />
            <span className="hidden sm:inline">{isAr ? 'الأقسام' : 'Sections'}</span>
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
            <Palette size={13} className="text-rose-500" />
            <span className="hidden sm:inline">{isAr ? 'الألوان' : 'Colors'}</span>
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
            <MapPin size={13} className="text-emerald-500" />
            <span className="hidden sm:inline">{isAr ? 'العلامات' : 'Labels'}</span>
            <ChevronDown size={11} className={`transition-transform ${activePopover === 'labels' ? 'rotate-180' : ''}`} />
          </button>

          {/* Legend Button */}
          <button
            ref={legendBtnRef}
            type="button"
            onClick={() => togglePopover('legend')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
              activePopover === 'legend'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700'
            }`}
          >
            <ListOrdered size={13} className="text-amber-500" />
            <span className="hidden sm:inline">{isAr ? 'المفتاح' : 'Legend'}</span>
            <ChevronDown size={11} className={`transition-transform ${activePopover === 'legend' ? 'rotate-180' : ''}`} />
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
            <Type size={13} className="text-sky-500" />
            <span className="hidden sm:inline">{isAr ? 'النصوص' : 'Text'}</span>
            <ChevronDown size={11} className={`transition-transform ${activePopover === 'text' ? 'rotate-180' : ''}`} />
          </button>

          <div className="h-4 w-px bg-gray-300 dark:bg-slate-700 mx-0.5" />

          {/* 2. Report Language Switcher (AR | EN | AR+EN) - Spec v3 §7 */}
          {onChangeReportLanguage && (
            <div className="flex items-center p-0.5 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              {(['ar', 'en', 'ar+en'] as ReportLanguage[]).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => onChangeReportLanguage(lng)}
                  className={`px-2 py-0.5 rounded text-[10.5px] font-bold font-mono transition-all ${
                    reportLanguage === lng
                      ? 'bg-brand-600 text-white shadow-2xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. Autosave Status & Undo/Redo & Export */}
        <div className="flex items-center gap-2">
          {/* Status Chip */}
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

          {/* Export Menu */}
          <div className="relative">
            <button
              ref={exportBtnRef}
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-lg font-bold shadow-xs transition-all disabled:opacity-50"
            >
              {isExporting ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
              <span>{isAr ? 'تصدير التقرير' : 'Export'}</span>
              <ChevronDown size={11} className={`transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isExportMenuOpen && exportPos && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: exportPos.top,
                  left: exportPos.left,
                  zIndex: 1100,
                  width: 200
                }}
                className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95"
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
                  <Download size={14} className="text-indigo-500" />
                  <span>{isAr ? 'تصدير صورة (PNG)' : 'Export PNG Image'}</span>
                </button>
                {onShareWhatsApp && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      onShareWhatsApp();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors border-t border-gray-100 dark:border-slate-800"
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
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>

      {/* Slim Editing Mode Banner under Studio Bar (Spec v3 §2.1) */}
      {isEditMode && (
        <div className="no-print no-export px-4 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>
              {isAr
                ? 'وضع التعديل مفعل — انقر على أي نص لتعديله أو اسحب الأقسام لإعادة ترتيبها.'
                : 'Editing mode active — click text to edit in place, or drag sections to reorder.'}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleEditMode}
            className="px-2.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold transition-colors flex items-center gap-1 shadow-2xs"
          >
            <Check size={11} />
            <span>{isAr ? 'إتمام التعديل' : 'Done'}</span>
          </button>
        </div>
      )}

      {/* Popovers */}
      <MapElementsPopover
        anchorRef={mapElementsBtnRef}
        open={activePopover === 'mapElements'}
        onClose={() => setActivePopover(null)}
        elements={mapElements}
        onChangeElements={onChangeMapElements}
        visibleCampIds={visibleCampIds}
        onChangeVisibleCampIds={onChangeVisibleCampIds}
        campDistToLastEnabled={campDistToLastEnabled}
        onChangeCampDistToLastEnabled={onChangeCampDistToLastEnabled}
        activeBaseLayer={activeBaseLayer}
        onChangeBaseLayer={onChangeBaseLayer}
        showGoogleLabels={showGoogleLabels}
        onChangeShowGoogleLabels={onChangeShowGoogleLabels}
        showGraticule={showGraticule}
        onChangeShowGraticule={onChangeShowGraticule}
        coordFormat={coordFormat}
        onChangeCoordFormat={onChangeCoordFormat}
        distUnit={distUnit}
        onChangeDistUnit={onChangeDistUnit}
        language={reportLanguage}
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
        mapCenter={mapCenter}
        language={language}
      />

      <LegendPopover
        anchorRef={legendBtnRef}
        open={activePopover === 'legend'}
        onClose={() => setActivePopover(null)}
        items={legendItems}
        onChangeItems={onChangeLegendItems}
        layout={legendLayout}
        onChangeLayout={onChangeLegendLayout}
        defaultItems={defaultLegendItems}
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

      {trackSettings && onChangeTrackSettings && (
        <TrackPathPopover
          anchorRef={trackBtnRef}
          open={activePopover === 'track'}
          onClose={() => setActivePopover(null)}
          settings={trackSettings}
          onApply={(next) => {
            onChangeTrackSettings(next);
            setActivePopover(null);
          }}
          onPreview={onPreviewTrackSettings}
          language={language}
        />
      )}
    </div>
  );
};

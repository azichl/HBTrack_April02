import React from 'react';
import { Popover } from '../../ui/Popover';
import { Switch } from '../../ui/Switch';
import { ColorChip } from '../../ui/ColorChip';
import { MapElements, MapElementId, DEFAULT_MAP_ELEMENTS, ReportLanguage } from '../../../types/report';
import { IconSizeSection } from '../../../features/report-track/IconSizeSection';
import { DEFAULT_ICON_SCALE } from '../../../features/report-track/iconScale';
import { FIXED_FIELD_CAMPS } from '../../../../constants';
import { RotateCcw, Check, MapPin, Navigation, Compass, Ruler, Globe, Mountain } from 'lucide-react';

interface MapElementsPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  elements: MapElements;
  onChangeElements: (next: MapElements) => void;
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
  language?: ReportLanguage;
}

export const MapElementsPopover: React.FC<MapElementsPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  elements,
  onChangeElements,
  visibleCampIds = [],
  onChangeVisibleCampIds,
  campDistToLastEnabled = {},
  onChangeCampDistToLastEnabled,
  activeBaseLayer = 'google_hybrid',
  onChangeBaseLayer,
  showGoogleLabels = true,
  onChangeShowGoogleLabels,
  showGraticule = false,
  onChangeShowGraticule,
  coordFormat = 'DD',
  onChangeCoordFormat,
  distUnit = 'km',
  onChangeDistUnit,
  language = 'ar'
}) => {
  const isAr = language === 'ar';

  const update = (id: MapElementId, patch: Partial<MapElements[MapElementId]>) => {
    onChangeElements({
      ...elements,
      [id]: { ...elements[id], ...patch }
    });
  };

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={isAr ? 'عناصر وفلاتر الخريطة' : 'Map Elements & Overlays'}
      width={420}
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs" dir={isAr ? 'rtl' : 'ltr'}>
          {/* GROUP 1: BASE MAP & TILES */}
          <div className="space-y-2 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
            <span className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
              <Globe size={13} className="text-blue-500" />
              <span>{isAr ? 'نوع الخريطة والتضاريس' : 'Base Map & Terrain'}</span>
            </span>
            <div className="grid grid-cols-1 gap-2">
              <select
                value={activeBaseLayer}
                onChange={e => onChangeBaseLayer?.(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-xs font-semibold outline-none"
              >
                <option value="google_hybrid">خرائط جوجل هجين (Google Hybrid)</option>
                <option value="google_satellite">خرائط جوجل أقمار صناعية (Google Satellite)</option>
                <option value="google_roadmap">خرائط جوجل شوارع (Google Roadmap)</option>
                <option value="scienceterrain">أقمار صناعية Esri World Imagery</option>
                <option value="roadmap">خريطة الشوارع المفتوحة (OpenStreetMap)</option>
              </select>

              <div className="flex items-center justify-between pt-1">
                <span className="text-gray-700 dark:text-gray-300">
                  {isAr ? 'تسميات جوجل (المدن والطرق)' : 'Google Labels (Roads & Cities)'}
                </span>
                <Switch
                  checked={showGoogleLabels}
                  onChange={v => onChangeShowGoogleLabels?.(v)}
                />
              </div>
            </div>
          </div>

          {/* GROUP 2: POINTS & LOCATIONS */}
          <div className="space-y-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
            <span className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
              <MapPin size={13} className="text-emerald-500" />
              <span>{isAr ? 'النقاط والمواقع (Points)' : 'Points & Locations'}</span>
            </span>

            {/* Release Location */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={elements.release?.visible ?? true}
                  onChange={v => update('release', { visible: v })}
                />
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  {isAr ? 'موقع تركيب الجهاز (الإطلاق)' : 'Release Location'}
                </span>
              </div>
              <ColorChip
                color={elements.release?.color || '#701a2b'}
                onChange={c => update('release', { color: c })}
              />
            </div>

            {/* Latest Location */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={elements.latest?.visible ?? true}
                  onChange={v => update('latest', { visible: v })}
                />
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  {isAr ? 'آخر موقع مسجل (Latest)' : 'Latest Location'}
                </span>
              </div>
              <ColorChip
                color={elements.latest?.color || '#22c55e'}
                onChange={c => update('latest', { color: c })}
              />
            </div>

            {/* Field Camps & Per-Camp checklist */}
            <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={elements.camps?.visible ?? true}
                    onChange={v => {
                      update('camps', { visible: v });
                      if (!v) onChangeVisibleCampIds?.([]);
                      else onChangeVisibleCampIds?.(FIXED_FIELD_CAMPS.map(c => c.id));
                    }}
                  />
                  <span className="text-gray-800 dark:text-gray-200 font-medium">
                    {isAr ? 'المخيمات الميدانية (Camps)' : 'Field Camps'}
                  </span>
                </div>
                <ColorChip
                  color={elements.camps?.color || '#f59e0b'}
                  onChange={c => update('camps', { color: c })}
                />
              </div>

              {/* Per-Camp Checklist */}
              {elements.camps?.visible && (
                <div className="pl-4 pr-4 py-1.5 space-y-1.5 bg-white dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800">
                  <div className="flex justify-between items-center text-[10.5px] text-gray-500 font-bold mb-1">
                    <span>{isAr ? 'المخيم' : 'Camp'}</span>
                    <span>{isAr ? 'إظهار / خط المسافة للآخر' : 'Show / Distance Line'}</span>
                  </div>
                  {FIXED_FIELD_CAMPS.map(camp => {
                    const isCampVis = visibleCampIds.includes(camp.id);
                    const isDistOn = campDistToLastEnabled[camp.id] || false;
                    return (
                      <div key={camp.id} className="flex items-center justify-between text-[11px]">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isCampVis}
                            onChange={e => {
                              if (e.target.checked) {
                                onChangeVisibleCampIds?.([...visibleCampIds, camp.id]);
                              } else {
                                onChangeVisibleCampIds?.(visibleCampIds.filter(id => id !== camp.id));
                              }
                            }}
                            className="rounded text-amber-600 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{camp.name}</span>
                        </label>
                        <label className={`flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer ${!isCampVis ? 'opacity-30' : ''}`}>
                          <span>{isAr ? 'خط مسافة' : 'Dist'}</span>
                          <input
                            type="checkbox"
                            disabled={!isCampVis}
                            checked={isDistOn}
                            onChange={e => {
                              onChangeCampDistToLastEnabled?.({
                                ...campDistToLastEnabled,
                                [camp.id]: e.target.checked
                              });
                            }}
                            className="rounded text-emerald-600 w-3 h-3 cursor-pointer"
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stopovers */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={elements.stopovers?.visible ?? false}
                  onChange={v => update('stopovers', { visible: v })}
                />
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  {isAr ? 'محطات التوقف (Stopovers)' : 'Stopovers'}
                </span>
              </div>
              <ColorChip
                color={elements.stopovers?.color || '#3b82f6'}
                onChange={c => update('stopovers', { color: c })}
              />
            </div>
          </div>

          {/* GROUP 3: LINES & DISTANCES */}
          <div className="space-y-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
            <span className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
              <Ruler size={13} className="text-indigo-500" />
              <span>{isAr ? 'المسارات وخطوط المسافات' : 'Lines & Distances'}</span>
            </span>

            {/* Flight Track */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={elements.track?.visible ?? true}
                  onChange={v => update('track', { visible: v })}
                />
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  {isAr ? 'مسار الطيران التاريخي' : 'Flight Track'}
                </span>
              </div>
              <ColorChip
                color={elements.track?.color || '#6366f1'}
                onChange={c => update('track', { color: c })}
              />
            </div>

            {/* Dist: Release -> Latest */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={elements.distRelease?.visible ?? true}
                  onChange={v => update('distRelease', { visible: v })}
                />
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  {isAr ? 'مسافة الإطلاق إلى آخر موقع' : 'Distance: Release → Latest'}
                </span>
              </div>
              <ColorChip
                color={elements.distRelease?.color || '#dc2626'}
                onChange={c => update('distRelease', { color: c })}
              />
            </div>

            {/* Dist: Camp -> Latest */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={elements.distCamp?.visible ?? true}
                  onChange={v => update('distCamp', { visible: v })}
                />
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  {isAr ? 'مسافة المخيم إلى آخر موقع' : 'Distance: Camp → Latest'}
                </span>
              </div>
              <ColorChip
                color={elements.distCamp?.color || '#d97706'}
                onChange={c => update('distCamp', { color: c })}
              />
            </div>

            {/* Units & Decimals */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-slate-700 text-[11px]">
              <span className="text-gray-700 dark:text-gray-300">
                {isAr ? 'وحدة المسافات:' : 'Distance Unit:'}
              </span>
              <div className="flex gap-1">
                {(['km', 'mi'] as const).map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => onChangeDistUnit?.(u)}
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      distUnit === u
                        ? 'bg-brand-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-gray-300 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* GROUP 4: MAP FURNITURE */}
          <div className="space-y-2 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
            <span className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
              <Compass size={13} className="text-rose-500" />
              <span>{isAr ? 'أدوات الخريطة (Furniture)' : 'Map Furniture'}</span>
            </span>

            {/* North Arrow */}
            <div className="flex items-center justify-between">
              <span className="text-gray-800 dark:text-gray-200 font-medium">
                {isAr ? 'سهم اتجاه الشمال (North Arrow)' : 'North Arrow'}
              </span>
              <Switch
                checked={elements.northArrow?.visible ?? true}
                onChange={v => update('northArrow', { visible: v })}
              />
            </div>

            {/* Scale Bar */}
            <div className="flex items-center justify-between">
              <span className="text-gray-800 dark:text-gray-200 font-medium">
                {isAr ? 'مقياس الرسم الجغرافي (Scale Bar)' : 'Graphic Scale Bar'}
              </span>
              <Switch
                checked={elements.scaleBar?.visible ?? true}
                onChange={v => update('scaleBar', { visible: v })}
              />
            </div>

            {/* Graticule Grid & Coord Format */}
            <div className="space-y-1.5 pt-1 border-t border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  {isAr ? 'شبكة خطوط الطول والعرض (Graticule)' : 'Graticule Grid'}
                </span>
                <Switch
                  checked={showGraticule}
                  onChange={v => onChangeShowGraticule?.(v)}
                />
              </div>

              {showGraticule && (
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-gray-600 dark:text-gray-400">{isAr ? 'صيغة الإحداثيات:' : 'Coord Format:'}</span>
                  <div className="flex gap-1">
                    {(['DD', 'DMM', 'DMS'] as const).map(fmt => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => onChangeCoordFormat?.(fmt)}
                        className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                          coordFormat === fmt
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white dark:bg-slate-900 border border-gray-300 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Mini Map Inset */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-slate-700">
              <span className="text-gray-800 dark:text-gray-200 font-medium">
                {isAr ? 'خريطة مصغرة لموقع كازاخستان (Mini-Map Inset)' : 'Mini-map Inset (Kazakhstan)'}
              </span>
              <Switch
                checked={elements.miniMap?.visible ?? false}
                onChange={v => update('miniMap', { visible: v })}
              />
            </div>
          </div>

          {/* GROUP: ICON SIZES (POINTS & LOCATIONS) */}
          <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700">
            <IconSizeSection
              value={elements.iconScale ?? DEFAULT_ICON_SCALE}
              onChange={iconScale => onChangeElements({ ...elements, iconScale })}
            />
          </div>

          {/* FOOTER */}
          <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChangeElements(DEFAULT_MAP_ELEMENTS)}
              className="px-2.5 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 text-xs font-bold flex items-center gap-1 rounded hover:bg-gray-100"
            >
              <RotateCcw size={12} />
              <span>{isAr ? 'استعادة الافتراضي' : 'Reset'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1"
            >
              <Check size={13} />
              <span>{isAr ? 'تم' : 'Done'}</span>
            </button>
          </div>
        </div>
    </Popover>
  );
};

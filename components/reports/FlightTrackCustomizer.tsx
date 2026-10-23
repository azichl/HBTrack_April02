import React from 'react';
import { Calendar, Plus, Trash2, Filter, Route, Sparkles } from 'lucide-react';
import { classifyLocationType, safeParseTimestamp } from '../../utils/formatting';

export type TrackLocationTypeFilter = 'ALL' | 'GPS' | 'DOPPLER';

export interface TrackColorPeriod {
  id: string;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  color: string;
}

export interface FlightTrackConfig {
  enabled: boolean;
  locationType: TrackLocationTypeFilter;
  filterStartDate?: string; // YYYY-MM-DD (empty = no lower bound)
  filterEndDate?: string;   // YYYY-MM-DD (empty = no upper bound)
  useColorPeriods: boolean;
  defaultColor: string;
  lineWeight: number;
  lineDashed: boolean;
  showTrackPoints: boolean;
  periods: TrackColorPeriod[];
}

export interface ColoredTrackSegment {
  id: string;
  label: string;
  color: string;
  positions: [number, number][];
  pointCount: number;
  startDate: string;
  endDate: string;
}

const PRESET_PALETTE = [
  '#2563eb', // Royal Blue
  '#f97316', // Vivid Orange
  '#10b981', // Emerald Green
  '#dc2626', // Crimson Red
  '#9333ea', // Purple
  '#eab308', // Amber Gold
  '#06b6d4', // Cyan
  '#ec4899', // Pink
];

/**
 * Filters raw history points by Location Type (GPS / DOPPLER / ALL) and overall Date Range,
 * orders them chronologically by true locationDate/timestamp, and splits them into colored
 * polyline segments per user-defined date period.
 */
export function buildColoredTrackSegments(
  rawPoints: any[],
  config: FlightTrackConfig
): {
  segments: ColoredTrackSegment[];
  filteredPoints: Array<{ lat: number; lon: number; ts: number; type: 'GPS' | 'DOPPLER'; color: string }>;
} {
  if (!config.enabled || !Array.isArray(rawPoints) || rawPoints.length === 0) {
    return { segments: [], filteredPoints: [] };
  }

  const minMs = config.filterStartDate
    ? new Date(`${config.filterStartDate}T00:00:00.000Z`).getTime()
    : -Infinity;
  const maxMs = config.filterEndDate
    ? new Date(`${config.filterEndDate}T23:59:59.999Z`).getTime()
    : Infinity;

  // 1. Normalize, classify GPS vs DOPPLER, and filter
  const normalized: Array<{ lat: number; lon: number; ts: number; type: 'GPS' | 'DOPPLER' }> = [];
  let fallbackTs = 1000;

  for (const pt of rawPoints) {
    let lat: number;
    let lon: number;
    let locType: 'GPS' | 'DOPPLER' = 'GPS';
    let ts: number;

    if (Array.isArray(pt)) {
      lat = Number(pt[0]);
      lon = Number(pt[1]);
      locType = 'GPS';
      ts = fallbackTs++;
    } else {
      lat = Number(pt.lat ?? pt.latitude);
      lon = Number(pt.lon ?? pt.longitude);
      locType = (pt.type === 'GPS' || pt.type === 'DOPPLER')
        ? pt.type
        : classifyLocationType(pt.lc || pt.locationClass, pt.locationType, pt.satellite);
      const dateStr = pt.locationDate || pt.fixTime || pt.timestamp || pt.date || pt.ts;
      ts = safeParseTimestamp(dateStr);
    }

    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    if (config.locationType === 'GPS' && locType !== 'GPS') continue;
    if (config.locationType === 'DOPPLER' && locType !== 'DOPPLER') continue;

    if (isNaN(ts) || ts <= 0) continue;

    if (ts < minMs || ts > maxMs) continue;

    normalized.push({ lat, lon, ts, type: locType });
  }

  // 2. Sort strictly chronologically by location timestamp
  normalized.sort((a, b) => a.ts - b.ts);

  if (normalized.length === 0) {
    return { segments: [], filteredPoints: [] };
  }

  // 3. If multi-period coloring is OFF, return a single segment with defaultColor
  if (!config.useColorPeriods || config.periods.length === 0) {
    const coloredPts = normalized.map(p => ({ ...p, color: config.defaultColor }));
    return {
      segments: [
        {
          id: 'single-track',
          label:
            config.filterStartDate || config.filterEndDate
              ? `${config.filterStartDate || '...'} → ${config.filterEndDate || '...'}`
              : 'Flight Path',
          color: config.defaultColor,
          positions: normalized.map(p => [p.lat, p.lon] as [number, number]),
          pointCount: normalized.length,
          startDate: config.filterStartDate || '',
          endDate: config.filterEndDate || ''
        }
      ],
      filteredPoints: coloredPts
    };
  }

  // 4. Multi-period coloring: build segments for each defined period
  const segments: ColoredTrackSegment[] = [];
  const coloredPoints: Array<{ lat: number; lon: number; ts: number; type: 'GPS' | 'DOPPLER'; color: string }> = [];

  // Sort periods chronologically
  const sortedPeriods = [...config.periods].sort((a, b) =>
    (a.startDate || '').localeCompare(b.startDate || '')
  );

  let previousLastCoord: [number, number] | null = null;

  for (const period of sortedPeriods) {
    const pStartMs = period.startDate
      ? new Date(`${period.startDate}T00:00:00.000Z`).getTime()
      : -Infinity;
    const pEndMs = period.endDate
      ? new Date(`${period.endDate}T23:59:59.999Z`).getTime()
      : Infinity;

    const ptsInPeriod = normalized.filter(p => p.ts >= pStartMs && p.ts <= pEndMs);
    if (ptsInPeriod.length === 0) continue;

    for (const p of ptsInPeriod) {
      coloredPoints.push({ ...p, color: period.color });
    }

    const coords: [number, number][] = ptsInPeriod.map(p => [p.lat, p.lon]);

    // Stitch with previous period's last coordinate so the path line is continuous
    if (previousLastCoord && coords.length > 0) {
      coords.unshift(previousLastCoord);
    }
    previousLastCoord = coords[coords.length - 1];

    segments.push({
      id: period.id,
      label: period.label || `${period.startDate} → ${period.endDate}`,
      color: period.color,
      positions: coords,
      pointCount: ptsInPeriod.length,
      startDate: period.startDate,
      endDate: period.endDate
    });
  }

  return { segments, filteredPoints: coloredPoints };
}

interface FlightTrackCustomizerProps {
  config: FlightTrackConfig;
  onChange: (next: FlightTrackConfig) => void;
  totalRawPoints: number;
  activePointCount: number;
  allHistoryPoints: any[];
}

export const FlightTrackCustomizer: React.FC<FlightTrackCustomizerProps> = ({
  config,
  onChange,
  totalRawPoints,
  activePointCount,
  allHistoryPoints
}) => {
  const update = (patch: Partial<FlightTrackConfig>) => {
    onChange({ ...config, ...patch });
  };

  const handleAddPeriod = () => {
    const nextColor = PRESET_PALETTE[config.periods.length % PRESET_PALETTE.length];
    const lastPeriod = config.periods[config.periods.length - 1];
    let defaultStart = '2026-01-01';
    let defaultEnd = '2026-04-30';

    if (lastPeriod && lastPeriod.endDate) {
      const d = new Date(`${lastPeriod.endDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      defaultStart = d.toISOString().slice(0, 10);
      defaultEnd = new Date().toISOString().slice(0, 10);
    }

    const newPeriod: TrackColorPeriod = {
      id: `period-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: `${defaultStart} → ${defaultEnd}`,
      startDate: defaultStart,
      endDate: defaultEnd,
      color: nextColor
    };

    update({
      enabled: true,
      useColorPeriods: true,
      periods: [...config.periods, newPeriod]
    });
  };

  const handleAutoSplitTwoPeriods = () => {
    // Example preset requested by user: 01/01/2026 -> 30/04/2026 and 01/05/2026 -> 20/10/2026
    const p1: TrackColorPeriod = {
      id: `period-1-${Date.now()}`,
      label: '01/01/2026 - 30/04/2026',
      startDate: '2026-01-01',
      endDate: '2026-04-30',
      color: '#2563eb'
    };
    const p2: TrackColorPeriod = {
      id: `period-2-${Date.now() + 1}`,
      label: '01/05/2026 - 22/10/2026',
      startDate: '2026-05-01',
      endDate: new Date().toISOString().slice(0, 10),
      color: '#f97316'
    };
    update({
      enabled: true,
      useColorPeriods: true,
      periods: [p1, p2]
    });
  };

  const handleUpdatePeriod = (id: string, patch: Partial<TrackColorPeriod>) => {
    const nextPeriods = config.periods.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, ...patch };
      if ((patch.startDate || patch.endDate) && (!p.label || p.label.includes('→') || p.label.includes('-'))) {
        updated.label = `${updated.startDate} → ${updated.endDate}`;
      }
      return updated;
    });
    update({ periods: nextPeriods });
  };

  const handleRemovePeriod = (id: string) => {
    update({ periods: config.periods.filter(p => p.id !== id) });
  };

  return (
    <div className="bg-indigo-50/50 dark:bg-slate-800/70 border border-indigo-200 dark:border-slate-700 rounded-xl p-4 space-y-4 mt-3" dir="rtl">
      {/* Header & Master Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 dark:border-slate-700 pb-3">
        <div className="flex items-center gap-2">
          <Route size={18} className="text-indigo-600 dark:text-indigo-400" />
          <div>
            <h4 className="text-xs font-bold text-gray-900 dark:text-white">
              تخصيص مسار الطيران حسب الفترة والنوع واللون (Flight Path Customizer)
            </h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              فلترة المسار حسب (GPS / Doppler / ALL) وتلوين كل فترة زمنية بلون مخصص
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200">
            النقاط المعروضة: {activePointCount} / {totalRawPoints}
          </span>
          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => update({ enabled: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
            />
            <span>إظهار مسار التتبع (Show Track)</span>
          </label>
        </div>
      </div>

      {config.enabled && (
        <div className="space-y-4">
          {/* Row 1: Location Type (GPS / DOPPLER / ALL) + Global Date Filter + Line Style */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            {/* Location Type Selector */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                نوع النقاط (Location Type):
              </label>
              <div className="grid grid-cols-3 gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-gray-200 dark:border-slate-700" dir="ltr">
                {(['ALL', 'GPS', 'DOPPLER'] as TrackLocationTypeFilter[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => update({ locationType: type })}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-all ${
                      config.locationType === type
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Global Period Filter Start */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                من تاريخ (From Date):
              </label>
              <input
                type="date"
                dir="ltr"
                value={config.filterStartDate}
                onChange={e => update({ filterStartDate: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg"
              />
            </div>

            {/* Global Period Filter End */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                إلى تاريخ (To Date):
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  dir="ltr"
                  value={config.filterEndDate}
                  onChange={e => update({ filterEndDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg"
                />
                {(config.filterStartDate || config.filterEndDate) && (
                  <button
                    type="button"
                    onClick={() => update({ filterStartDate: '', filterEndDate: '' })}
                    className="px-2 py-1.5 text-[10px] font-bold bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-lg whitespace-nowrap"
                    title="إلغاء فلتر التاريخ وعرض كل التواريخ"
                  >
                    الكل
                  </button>
                )}
              </div>
            </div>

            {/* Default Color & Weight */}
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                  اللون الافتراضي:
                </label>
                <input
                  type="color"
                  value={config.defaultColor}
                  onChange={e => update({ defaultColor: e.target.value })}
                  className="h-8 w-12 rounded cursor-pointer border border-gray-300"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                  سمك الخط ({config.lineWeight}px):
                </label>
                <input
                  type="range"
                  min={1.5}
                  max={7}
                  step={0.5}
                  value={config.lineWeight}
                  onChange={e => update({ lineWeight: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
              </div>
              <label className="flex items-center gap-1 text-[11px] font-bold text-gray-700 dark:text-gray-300 cursor-pointer pt-4">
                <input
                  type="checkbox"
                  checked={config.showTrackPoints}
                  onChange={e => update({ showTrackPoints: e.target.checked })}
                  className="rounded text-indigo-600 h-3.5 w-3.5"
                />
                <span>نقاط</span>
              </label>
            </div>
          </div>

          {/* Row 2: Multi-Period Color Segmentation */}
          <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-slate-700 rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.useColorPeriods}
                  onChange={e => update({ useColorPeriods: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span>تلوين المسار حسب فترات زمنية مخصصة (Color Path by Date Periods)</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoSplitTwoPeriods}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 rounded-lg text-[11px] font-bold flex items-center gap-1"
                >
                  <Sparkles size={12} />
                  <span>مثال جاهز (فترتين: يناير-أبريل / مايو-أكتوبر)</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddPeriod}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-xs"
                >
                  <Plus size={13} />
                  <span>إضافة فترة لونية (+ Add Period)</span>
                </button>
              </div>
            </div>

            {config.useColorPeriods && (
              <div className="space-y-2 pt-1">
                {config.periods.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-2">
                    اضغط على "+ إضافة فترة لونية" أو "مثال جاهز" لتحديد ألوان المسار حسب التاريخ.
                  </p>
                ) : (
                  config.periods.map((period, idx) => (
                    <div
                      key={period.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-slate-800/70 p-2 rounded-lg border border-gray-200 dark:border-slate-700"
                    >
                      <div className="sm:col-span-1 flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-gray-500">#{idx + 1}</span>
                        <input
                          type="color"
                          value={period.color}
                          onChange={e => handleUpdatePeriod(period.id, { color: e.target.value })}
                          className="h-7 w-9 rounded cursor-pointer border-0 p-0"
                        />
                      </div>

                      {/* Quick Palette Swatches */}
                      <div className="sm:col-span-3 flex items-center gap-1" dir="ltr">
                        {PRESET_PALETTE.map(swatch => (
                          <button
                            key={swatch}
                            type="button"
                            onClick={() => handleUpdatePeriod(period.id, { color: swatch })}
                            className={`w-4 h-4 rounded-full border transition-transform ${
                              period.color.toLowerCase() === swatch.toLowerCase()
                                ? 'scale-125 border-gray-900 dark:border-white ring-2 ring-offset-1 ring-indigo-400'
                                : 'border-white/50 opacity-80 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: swatch }}
                            title={swatch}
                          />
                        ))}
                      </div>

                      <div className="sm:col-span-3 flex items-center gap-1" dir="ltr">
                        <span className="text-[10px] text-gray-500 font-bold">From:</span>
                        <input
                          type="date"
                          value={period.startDate}
                          onChange={e => handleUpdatePeriod(period.id, { startDate: e.target.value })}
                          className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded"
                        />
                      </div>

                      <div className="sm:col-span-3 flex items-center gap-1" dir="ltr">
                        <span className="text-[10px] text-gray-500 font-bold">To:</span>
                        <input
                          type="date"
                          value={period.endDate}
                          onChange={e => handleUpdatePeriod(period.id, { endDate: e.target.value })}
                          className="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded"
                        />
                      </div>

                      <div className="sm:col-span-2 flex items-center gap-1">
                        <input
                          type="text"
                          value={period.label}
                          onChange={e => handleUpdatePeriod(period.id, { label: e.target.value })}
                          placeholder="وصف الفترة (مثال: ربيع)"
                          className="w-full px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePeriod(period.id)}
                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          title="حذف الفترة"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

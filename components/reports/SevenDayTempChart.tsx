import React, { useEffect, useState } from 'react';
import { Thermometer, Loader2 } from 'lucide-react';

export interface DailyTempPoint {
  date: string;
  label: string;
  min: number;
  max: number;
}

interface SevenDayTempChartProps {
  lat: number;
  lon: number;
  language: 'ar' | 'en';
  regionName?: string;
  maxColor?: string;
  minColor?: string;
  customTitle?: string;
  isEditing?: boolean;
  onTitleChange?: (newTitle: string) => void;
}

export const SevenDayTempChart: React.FC<SevenDayTempChartProps> = ({
  lat,
  lon,
  language,
  regionName,
  maxColor = '#dc2626',
  minColor = '#0284c7',
  customTitle,
  isEditing = false,
  onTitleChange
}) => {
  const [data, setData] = useState<DailyTempPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const numLat = Number(lat);
    const numLon = Number(lon);
    if (!numLat || !numLon || isNaN(numLat) || isNaN(numLon) || (numLat === 0 && numLon === 0)) {
      setData([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${numLat.toFixed(4)}&longitude=${numLon.toFixed(4)}&past_days=6&forecast_days=1&daily=temperature_2m_max,temperature_2m_min&timezone=UTC`;

    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (!isMounted) return;
        const times: string[] = json?.daily?.time || [];
        const maxs: number[] = json?.daily?.temperature_2m_max || [];
        const mins: number[] = json?.daily?.temperature_2m_min || [];

        const pts: DailyTempPoint[] = times.slice(-7).map((t, idx) => {
          const parts = t.split('-');
          const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : t;
          return {
            date: t,
            label,
            max: Math.round((maxs[idx] ?? 22) * 10) / 10,
            min: Math.round((mins[idx] ?? 8) * 10) / 10
          };
        });

        if (pts.length > 0) {
          setData(pts);
        }
      })
      .catch(err => {
        console.warn('Open-Meteo 7-day temp fetch warning:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [lat, lon]);

  const defaultTitle =
    language === 'ar'
      ? (regionName ? `درجات الحرارة لآخر 7 أيام - ${regionName} (الصغرى / الكبرى °C)` : 'درجات الحرارة لآخر 7 أيام (الصغرى / الكبرى °C)')
      : (regionName ? `Last 7 Days Temperature - ${regionName} (Min / Max °C)` : 'Last 7 Days Temperature (Min / Max °C)');

  const displayTitle = customTitle || defaultTitle;

  if (data.length === 0 && !loading) return null;

  const allValues = data.flatMap(d => [d.min, d.max]);
  const absMin = allValues.length ? Math.min(...allValues) : 0;
  const absMax = allValues.length ? Math.max(...allValues) : 35;
  const padMin = Math.floor(absMin - 4);
  const padMax = Math.ceil(absMax + 4);
  const range = Math.max(1, padMax - padMin);

  const svgW = 410;
  const svgH = 96;
  const padLeft = 26;
  const padRight = 26;
  const padTop = 18;
  const padBottom = 20;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const getX = (i: number) =>
    data.length <= 1 ? padLeft + plotW / 2 : padLeft + (i / (data.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - ((val - padMin) / range) * plotH;

  const maxPoints = data.map((d, i) => `${getX(i).toFixed(1)},${getY(d.max).toFixed(1)}`).join(' ');
  const minPoints = data.map((d, i) => `${getX(i).toFixed(1)},${getY(d.min).toFixed(1)}`).join(' ');

  const areaPoints =
    data.length > 1
      ? [
          ...data.map((d, i) => `${getX(i).toFixed(1)},${getY(d.max).toFixed(1)}`),
          ...[...data].reverse().map((d, revIdx) => {
            const i = data.length - 1 - revIdx;
            return `${getX(i).toFixed(1)},${getY(d.min).toFixed(1)}`;
          })
        ].join(' ')
      : '';

  return (
    <section className="trk-card border border-[#d9dbe1] rounded-lg bg-white overflow-hidden">
      <div
        className="px-3 py-1.5 bg-[#f6f7f9] border-b border-[#eceef2] flex items-center justify-between text-[11.5px] font-bold text-gray-800"
        dir={language === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-1.5 flex-1">
          <Thermometer size={13} className="text-red-500 shrink-0" />
          {isEditing && onTitleChange ? (
            <input
              type="text"
              value={displayTitle}
              onChange={e => onTitleChange(e.target.value)}
              className="w-full px-1.5 py-0.5 text-[11px] bg-amber-50 border border-amber-300 rounded"
            />
          ) : (
            <span>{displayTitle}</span>
          )}
        </div>

        {data.length > 0 && (
          <div className="flex items-center gap-2 text-[10.5px] font-mono shrink-0" dir="ltr">
            <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold border border-sky-200">
              Min: {absMin.toFixed(1)}°C
            </span>
            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold border border-red-200">
              Max: {absMax.toFixed(1)}°C
            </span>
          </div>
        )}
      </div>

      <div className="p-1.5 bg-white flex items-center justify-center" dir="ltr">
        {loading && data.length === 0 ? (
          <div className="h-[88px] flex items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 size={14} className="animate-spin" />
            <span>Loading 7-day temperature...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[88px] flex items-center justify-center text-xs text-gray-400 font-sans italic">
            <span>{language === 'ar' ? 'لا تتوفر بيانات درجات الحرارة' : 'No temperature data available'}</span>
          </div>
        ) : (
          <svg
            width="100%"
            height="92"
            viewBox={`0 0 ${svgW} ${svgH}`}
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {[0.2, 0.5, 0.8].map((ratio, idx) => {
              const y = padTop + ratio * plotH;
              return (
                <line
                  key={idx}
                  x1={padLeft}
                  y1={y}
                  x2={svgW - padRight}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
              );
            })}

            {areaPoints && (
              <polygon points={areaPoints} fill="#fef2f2" fillOpacity="0.65" />
            )}

            {data.length > 1 && (
              <polyline
                fill="none"
                stroke={maxColor}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={maxPoints}
              />
            )}

            {data.length > 1 && (
              <polyline
                fill="none"
                stroke={minColor}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={minPoints}
              />
            )}

            {data.map((d, i) => {
              const x = getX(i);
              const yMax = getY(d.max);
              const yMin = getY(d.min);
              return (
                <g key={d.date}>
                  <line
                    x1={x}
                    y1={yMax}
                    x2={x}
                    y2={yMin}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                  <circle cx={x} cy={yMax} r="3.2" fill={maxColor} stroke="#ffffff" strokeWidth="1.2" />
                  <text
                    x={x}
                    y={yMax - 5.5}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="700"
                    fill={maxColor}
                    fontFamily="monospace, Arial, sans-serif"
                  >
                    {d.max.toFixed(0)}°
                  </text>

                  <circle cx={x} cy={yMin} r="3.2" fill={minColor} stroke="#ffffff" strokeWidth="1.2" />
                  <text
                    x={x}
                    y={yMin + 11}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="700"
                    fill={minColor}
                    fontFamily="monospace, Arial, sans-serif"
                  >
                    {d.min.toFixed(0)}°
                  </text>

                  <text
                    x={x}
                    y={svgH - 3}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="#64748b"
                    fontFamily="monospace, Arial, sans-serif"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </section>
  );
};

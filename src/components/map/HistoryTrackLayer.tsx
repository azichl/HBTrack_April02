import React, { useMemo } from 'react';
import { Polyline, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { TrackPathSettings, ColoredTrackSegment } from '../../types/track';
import { buildColoredTrackSegments, FlightTrackConfig } from '../../../components/reports/FlightTrackCustomizer';
import { haversineKm } from '../../data/positions/positionsEngine';

export interface HistoryPoint {
  lat: number;
  lon: number;
  timestamp: string;
  fixDate?: string;
  locationDate?: string;
  messageDate?: string | null;
  usedFallback?: boolean;
  type?: string;
  isDegraded?: boolean;
  locationClass?: string | null;
  errorRadiusM?: number;
  delay?: number | string;
  color?: string;
}

export interface HistoryPathItem {
  id: string;
  color?: string;
  path: HistoryPoint[];
  polyline?: [number, number][];
  styledSegments?: Array<{
    positions: [number, number][];
    color: string;
    weight?: number;
    dashArray?: string;
    opacity?: number;
  }>;
}

export interface HistoryTrackLayerProps {
  mode?: 'live' | 'report';
  historyPaths: HistoryPathItem[];
  settings?: TrackPathSettings;
  timeZone?: string;
  coordFormat?: 'DD' | 'DMM' | 'DMS';
  isExporting?: boolean;
  renderPointMarker?: (point: HistoryPoint, pttId: string, color: string) => React.ReactNode;
}

const formatDM = (val: number, isLat: boolean) => {
  const abs = Math.abs(val || 0);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${deg}° ${min.toFixed(2)}' ${dir}`;
};

const formatDMS = (val: number, isLat: boolean) => {
  const abs = Math.abs(val || 0);
  const deg = Math.floor(abs);
  const min = Math.floor((abs - deg) * 60);
  const sec = ((abs - deg) * 60 - min) * 60;
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${deg}° ${min}' ${sec.toFixed(0)}" ${dir}`;
};

const formatCoord = (lat: number, lon: number, fmt: string = 'DD') => {
  if (fmt === 'DMM') return `${formatDM(lat, true)}, ${formatDM(lon, false)}`;
  if (fmt === 'DMS') return `${formatDMS(lat, true)}, ${formatDMS(lon, false)}`;
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
};

/**
 * Shared History Track Layer for BOTH Live Tracking Map and Custom Report Map.
 * Provides consistent polyline coloring, period segmentation, vertices, and coordinate labels.
 */
export const HistoryTrackLayer: React.FC<HistoryTrackLayerProps> = ({
  mode = 'report',
  historyPaths,
  settings,
  timeZone = 'UTC',
  coordFormat = 'DD',
  isExporting = false,
  renderPointMarker
}) => {
  const map = useMap();

  // Consolidate track settings
  const isEnabled = settings ? settings.show : true;
  const trackColor = settings?.color || '#6366f1';
  const trackWidth = settings?.width || 3;
  const showPoints = Boolean(settings?.showPoints);
  const showLabels = Boolean(settings?.showCoordinateLabels);

  return (
    <>
      {isEnabled && historyPaths.map((hp) => {
        const itemColor = hp.color || trackColor;

        // In Live Tracking mode, render directly from the normalized chronological polyline and points
        if (mode === 'live') {
          // 2. FORCE strict chronological sorting by the actual GPS/location timestamp (oldest to newest)
          const sortedHistoryPoints = [...hp.path].sort((a, b) => {
            const timeA = new Date(a.locationDate || a.timestamp || a.fixTime || a.fixDate || 0).getTime();
            const timeB = new Date(b.locationDate || b.timestamp || b.fixTime || b.fixDate || 0).getTime();
            return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB); // Prevents packet ingestion-order zig-zag jumps
          });

          // 2.5 Hard Anti-Zigzag Guard:
          // A) Coordinate deduplication - keep earliest genuine acquisition fix, purge late arrival echo packets
          const seenCoordSet = new Set<string>();
          const coordDedupedPoints: typeof sortedHistoryPoints = [];
          for (const pt of sortedHistoryPoints) {
            const cKey = `${pt.lat.toFixed(4)},${pt.lon.toFixed(4)}`;
            if (seenCoordSet.has(cKey)) {
              continue;
            }
            seenCoordSet.add(cKey);
            coordDedupedPoints.push(pt);
          }

          // B) Robust Excursion / Hairpin Reversal Filter
          // Catches both single-point spikes and multi-point buffered echo bursts (k = 3, 2, 1 consecutive points)
          // that jump >35km away from the base location and return to <25km of where they started.
          const cleanHistoryPoints: typeof sortedHistoryPoints = [];
          let curIdx = 0;
          while (curIdx < coordDedupedPoints.length) {
            const prev = cleanHistoryPoints[cleanHistoryPoints.length - 1];
            if (prev && curIdx < coordDedupedPoints.length - 1) {
              let matchedBurstLen = 0;
              for (let k = Math.min(3, coordDedupedPoints.length - 1 - curIdx); k >= 1; k--) {
                const after = coordDedupedPoints[curIdx + k];
                const dNet = haversineKm(prev.lat, prev.lon, after.lat, after.lon);
                if (dNet < 25) {
                  let allAway = true;
                  for (let j = 0; j < k; j++) {
                    const pt = coordDedupedPoints[curIdx + j];
                    const dAway = haversineKm(prev.lat, prev.lon, pt.lat, pt.lon);
                    if (dAway < 35) {
                      allAway = false;
                      break;
                    }
                  }
                  if (allAway) {
                    matchedBurstLen = k;
                    break;
                  }
                }
              }

              if (matchedBurstLen > 0) {
                curIdx += matchedBurstLen;
                continue;
              }
            }

            cleanHistoryPoints.push(coordDedupedPoints[curIdx]);
            curIdx++;
          }

          // 3. Map into clean [lat, lng] tuples for Leaflet's Polyline
          const polylineCoordinates: [number, number][] = cleanHistoryPoints
            .filter(pt => (pt.lat !== undefined && (pt.lon !== undefined || (pt as any).lng !== undefined)) || (pt as any).HDD)
            .map(pt => [pt.lat ?? (pt as any).HDD?.lat, pt.lon ?? (pt as any).lng ?? (pt as any).HDD?.lng ?? (pt as any).HDD?.lon] as [number, number]);

          const polyPositions: [number, number][] = polylineCoordinates.length > 1
            ? polylineCoordinates
            : (hp.polyline && hp.polyline.length > 1 ? hp.polyline : []);

          return (
            <React.Fragment key={`history-track-${hp.id}`}>
              {/* Continuous chronological polyline */}
              {polyPositions.length > 1 && (
                <Polyline
                  positions={polyPositions}
                  pathOptions={{
                    color: itemColor,
                    weight: trackWidth,
                    opacity: 0.85,
                    lineJoin: 'round',
                    lineCap: 'round'
                  }}
                />
              )}

              {/* Point Markers along the path with full metadata preserved */}
              {cleanHistoryPoints.map((pt, idx) => {
                if (renderPointMarker) {
                  return (
                    <React.Fragment key={`custom-pt-${hp.id}-${idx}`}>
                      {renderPointMarker(pt, hp.id, itemColor)}
                    </React.Fragment>
                  );
                }
                const isDoppler = (pt.type || '').toUpperCase() === 'DOPPLER';
                return (
                  <CircleMarker
                    key={`pt-${hp.id}-${idx}`}
                    center={[pt.lat, pt.lon]}
                    radius={isDoppler ? 3 : 4}
                    pathOptions={isDoppler ? {
                      color: itemColor,
                      fillColor: '#ffffff',
                      fillOpacity: 0.4,
                      weight: 1.5
                    } : {
                      color: itemColor,
                      fillColor: itemColor,
                      fillOpacity: 0.9,
                      weight: 1.5
                    }}
                  />
                );
              })}
            </React.Fragment>
          );
        }

        // Report mode: multi-period segmentation if enabled
        const config: FlightTrackConfig = {
          enabled: true,
          locationType: settings?.type || 'ALL',
          filterStartDate: settings?.from || '',
          filterEndDate: settings?.to || '',
          defaultColor: itemColor,
          lineWeight: trackWidth,
          lineDashed: false,
          showTrackPoints: showPoints,
          useColorPeriods: Boolean(settings?.periodsEnabled && settings?.periods?.length),
          periods: (settings?.periods || []).map(p => ({
            id: p.id,
            label: p.label || `${p.from} → ${p.to}`,
            startDate: p.from,
            endDate: p.to,
            color: p.color
          }))
        };

        const { segments, filteredPoints } = buildColoredTrackSegments(hp.path, config);

        // Thinning algorithm for static coordinate labels: minimum 70px spacing
        const labeledPoints: Array<{ lat: number; lon: number; text: string }> = [];
        if (showLabels && filteredPoints.length > 0 && map) {
          let lastPointPixels: L.Point | null = null;
          for (const pt of filteredPoints) {
            try {
              const currentPixels = map.latLngToContainerPoint([pt.lat, pt.lon]);
              if (!lastPointPixels || currentPixels.distanceTo(lastPointPixels) >= 70) {
                labeledPoints.push({
                  lat: pt.lat,
                  lon: pt.lon,
                  text: formatCoord(pt.lat, pt.lon, coordFormat)
                });
                lastPointPixels = currentPixels;
              }
            } catch {
              // Map might be unprojecting before tiles load
            }
          }
        }

        return (
          <React.Fragment key={`history-track-${hp.id}`}>
            {/* Polylines: Multi-period segmented or single */}
            {segments.length > 0 ? (
              segments.map((seg) => (
                <Polyline
                  key={`seg-${seg.id}`}
                  positions={seg.positions}
                  pathOptions={{
                    color: seg.color,
                    weight: trackWidth,
                    opacity: 0.85,
                    lineJoin: 'round',
                    lineCap: 'round'
                  }}
                />
              ))
            ) : (
              hp.polyline && hp.polyline.length > 1 && (
                <Polyline
                  positions={hp.polyline}
                  pathOptions={{
                    color: itemColor,
                    weight: trackWidth,
                    opacity: 0.85,
                    lineJoin: 'round',
                    lineCap: 'round'
                  }}
                />
              )
            )}

            {/* Vertices / Point Markers */}
            {showPoints && filteredPoints.map((pt, idx) => {
              if (renderPointMarker) {
                const origPt = hp.path[idx] || {
                  lat: pt.lat,
                  lon: pt.lon,
                  timestamp: new Date(pt.ts).toISOString(),
                  type: pt.type
                };
                return (
                  <React.Fragment key={`custom-pt-${hp.id}-${idx}`}>
                    {renderPointMarker(origPt, hp.id, pt.color || itemColor)}
                  </React.Fragment>
                );
              }
              const isDoppler = pt.type === 'DOPPLER';
              const dotColor = pt.color || itemColor;

              return (
                <CircleMarker
                  key={`pt-${hp.id}-${idx}`}
                  center={[pt.lat, pt.lon]}
                  radius={isDoppler ? 3 : 4}
                  pathOptions={isDoppler ? {
                    color: dotColor,
                    fillColor: '#ffffff',
                    fillOpacity: 0.4,
                    weight: 1.5
                  } : {
                    color: dotColor,
                    fillColor: dotColor,
                    fillOpacity: 0.9,
                    weight: 1.5
                  }}
                >
                  {!isExporting && (
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                      <div className="text-[11px] font-sans text-center leading-tight">
                        <div className="font-bold text-gray-900">{formatCoord(pt.lat, pt.lon, coordFormat)}</div>
                        <div className="text-gray-500 font-mono text-[9.5px]">
                          {pt.type} · {new Date(pt.ts).toISOString().replace('T', ' ').slice(0, 16)}
                        </div>
                      </div>
                    </Tooltip>
                  )}
                </CircleMarker>
              );
            })}

            {/* Static Printed Coordinate Labels on Report Map (Thinned with 70px collision avoidance) */}
            {mode === 'report' && showLabels && labeledPoints.map((lbl, i) => (
              <Marker
                key={`coord-lbl-${i}`}
                position={[lbl.lat, lbl.lon]}
                interactive={false}
                icon={L.divIcon({
                  className: 'bg-transparent',
                  html: `
                    <div style="
                      transform: translate(8px, -14px);
                      background: rgba(15, 23, 42, 0.85);
                      color: #f8fafc;
                      font-family: 'IBM Plex Sans Arabic', -apple-system, sans-serif;
                      font-size: 9px;
                      font-weight: 700;
                      padding: 1.5px 5px;
                      border-radius: 4px;
                      white-space: nowrap;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                      border: 0.5px solid rgba(255,255,255,0.2);
                      pointer-events: none;
                    ">
                      ${lbl.text}
                    </div>
                  `,
                  iconSize: [0, 0]
                })}
              />
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
};

import React, { useMemo, useEffect, useState } from 'react';
import { Polyline, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  TrackSettings,
  DEFAULT_TRACK_SETTINGS,
  TrackRenderModel,
  buildTrackRenderModel,
  formatCoord,
  formatLatLon,
  thinLabels,
  DashStyle
} from '../../features/track/trackRenderModel';
import { toFix } from '../../features/track/toFix';

export interface HistoryPoint {
  lat: number;
  lon: number;
  timestamp: string;
  type?: string;
  isDegraded?: boolean;
  locationClass?: string | null;
  errorRadiusM?: number;
  delay?: number | string;
  id?: string;
}

export interface HistoryPathItem {
  id: string;
  color?: string;
  path: HistoryPoint[] | any[];
  polyline?: [number, number][];
}

export interface HistoryTrackLayerProps {
  mode?: 'live' | 'report';
  historyPaths: HistoryPathItem[];
  settings?: TrackSettings;
  model?: TrackRenderModel;
  trackRenderModel?: TrackRenderModel;
  timeZone?: string;
  coordFormat?: 'DD' | 'DMM' | 'DMS';
  isExporting?: boolean;
  renderPointMarker?: (point: HistoryPoint, pttId: string, color: string) => React.ReactNode;
}

const getDashArray = (dash?: DashStyle): string | undefined => {
  if (dash === 'dashed') return '8, 8';
  if (dash === 'dotted') return '2, 6';
  return undefined;
};

/**
 * Shared History Track Layer for BOTH Live Tracking Map and Custom Report Map.
 * Directly draws the pure TrackRenderModel: segments, markers, and coordinate labels.
 */
export const HistoryTrackLayer: React.FC<HistoryTrackLayerProps> = ({
  mode = 'report',
  historyPaths,
  settings,
  model: explicitModel,
  trackRenderModel,
  timeZone = 'UTC',
  coordFormat = 'DMM',
  isExporting = false,
  renderPointMarker
}) => {
  const map = useMap();
  const activeExplicitModel = explicitModel || trackRenderModel;

  const effectiveSettings = useMemo<TrackSettings>(() => ({
    ...DEFAULT_TRACK_SETTINGS,
    ...(settings || {}),
    coordFormat: (settings?.coordFormat || coordFormat || 'DMM') as any
  }), [settings, coordFormat]);

  const isEnabled = effectiveSettings.show !== false;

  // Flatten fixes across all paths
  const allFixes = useMemo(() => {
    return historyPaths.flatMap(hp => (hp.path || []).map((pt, idx) => toFix(pt, idx)));
  }, [historyPaths]);

  // Build the render model if not explicitly passed
  const model = useMemo<TrackRenderModel>(() => {
    if (activeExplicitModel) return activeExplicitModel;
    return buildTrackRenderModel(allFixes, effectiveSettings);
  }, [activeExplicitModel, allFixes, effectiveSettings]);

  // Debug ?debug=track check
  const [isDebugTrack, setIsDebugTrack] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isDbg = params.get('debug') === 'track';
      setIsDebugTrack(isDbg);
      if (isDbg) {
        console.log('[TrackRenderModel Debug]', {
          total: model.total,
          shown: model.shown,
          segments: model.segments.length,
          markers: model.markers.length,
          settings: effectiveSettings,
          model
        });
      }
    }
  }, [model, effectiveSettings]);

  // Compute thinned labels using thinLabels from pure model
  const labeledMarkers = useMemo(() => {
    if (!effectiveSettings.showCoordinateLabels || !map || model.markers.length === 0) {
      return [];
    }

    try {
      const size = map.getSize();
      const bounds = { w: size.x || 800, h: size.y || 465 };
      const project = (lat: number, lon: number) => {
        const pt = map.latLngToContainerPoint([lat, lon]);
        return { x: pt.x, y: pt.y };
      };

      const kept = thinLabels(
        model.markers,
        project,
        effectiveSettings.labelMinSpacingPx || 70,
        bounds,
        [],
        80
      );

      const keptIdSet = new Set(kept.map(k => k.id));
      return model.markers.filter(m => keptIdSet.has(m.id));
    } catch (e) {
      return [];
    }
  }, [effectiveSettings.showCoordinateLabels, effectiveSettings.labelMinSpacingPx, map, model.markers]);

  if (!isEnabled) {
    return null;
  }

  const dashArray = getDashArray(effectiveSettings.dash);
  const strokeColor = effectiveSettings.color || '#6366f1';
  const strokeWidth = effectiveSettings.width || 3;
  const strokeOpacity = effectiveSettings.opacity ?? 1;

  return (
    <>
      {/* 1. Debug Switch Chip (when ?debug=track in URL) */}
      {isDebugTrack && (
        <div
          className="leaflet-top leaflet-right"
          style={{ pointerEvents: 'none', margin: '8px', zIndex: 1200 }}
        >
          <div
            id="track-debug-chip"
            className="leaflet-control bg-slate-900/95 text-emerald-400 font-mono text-[10.5px] px-2.5 py-1 rounded-md shadow-lg border border-emerald-500/30 flex items-center gap-1.5"
            style={{ pointerEvents: 'auto' }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>track: {model.total} total · {model.shown} shown · {model.segments.length} segs · {model.markers.length} pts · {labeledMarkers.length} lbls</span>
          </div>
        </div>
      )}

      {/* 2. Track Segments (Bottom Layer) */}
      {model.segments.length > 0 ? (
        model.segments.map((seg, idx) => (
          <Polyline
            key={`seg-${seg.periodId || 'default'}-${idx}`}
            positions={seg.coords}
            pathOptions={{
              color: seg.color || strokeColor,
              weight: strokeWidth,
              opacity: strokeOpacity,
              dashArray: dashArray,
              lineJoin: 'round',
              lineCap: 'round'
            }}
          />
        ))
      ) : (
        historyPaths.map(hp => (
          hp.polyline && hp.polyline.length > 1 ? (
            <Polyline
              key={`fallback-poly-${hp.id}`}
              positions={hp.polyline}
              pathOptions={{
                color: strokeColor,
                weight: strokeWidth,
                opacity: strokeOpacity,
                dashArray: dashArray,
                lineJoin: 'round',
                lineCap: 'round'
              }}
            />
          ) : null
        ))
      )}

      {/* 3. Point Markers (Middle Layer) */}
      {(effectiveSettings.showPoints || mode === 'live') && model.markers.map((m, idx) => {
        if (renderPointMarker) {
          return (
            <React.Fragment key={`custom-pt-${m.id}-${idx}`}>
              {renderPointMarker({
                lat: m.lat,
                lon: m.lon,
                timestamp: new Date(m.t).toISOString(),
                type: m.kind,
                id: m.id
              }, m.id, m.fill)}
            </React.Fragment>
          );
        }

        const radius = (m.diameter || 6) / 2;
        return (
          <CircleMarker
            key={`marker-${m.id}-${idx}`}
            center={[m.lat, m.lon]}
            radius={radius}
            pathOptions={{
              color: m.stroke || '#ffffff',
              fillColor: m.fill,
              fillOpacity: m.opacity ?? 1,
              weight: 1,
              opacity: m.opacity ?? 1
            }}
          >
            {!isExporting && (
              <Tooltip direction="top" offset={[0, -radius - 2]} opacity={0.95}>
                <div className="text-[11px] font-sans text-center leading-tight">
                  <div className="font-bold text-gray-900">
                    {formatLatLon(m.lat, m.lon, effectiveSettings.coordFormat)}
                  </div>
                  <div className="text-gray-500 font-mono text-[9.5px]">
                    {m.kind} · {new Date(m.t).toISOString().replace('T', ' ').slice(0, 16)}
                  </div>
                </div>
              </Tooltip>
            )}
          </CircleMarker>
        );
      })}

      {/* 4. Coordinate Labels (Top Layer, Collision avoided & thinned) */}
      {effectiveSettings.showCoordinateLabels && labeledMarkers.map((m, i) => {
        const text = formatLatLon(m.lat, m.lon, effectiveSettings.coordFormat);
        const fontSize = effectiveSettings.labelFontSize || 10;

        return (
          <Marker
            key={`coord-lbl-${m.id}-${i}`}
            position={[m.lat, m.lon]}
            interactive={false}
            icon={L.divIcon({
              className: 'bg-transparent',
              html: `
                <div style="
                  transform: translate(8px, -14px);
                  background: rgba(15, 23, 42, 0.88);
                  color: #f8fafc;
                  font-family: 'IBM Plex Sans Arabic', -apple-system, sans-serif;
                  font-size: ${fontSize}px;
                  font-weight: 700;
                  padding: 2px 6px;
                  border-radius: 4px;
                  white-space: nowrap;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.35);
                  border: 0.5px solid rgba(255,255,255,0.25);
                  pointer-events: none;
                ">
                  ${text}
                </div>
              `,
              iconSize: [0, 0]
            })}
          />
        );
      })}
    </>
  );
};

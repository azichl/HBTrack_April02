import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapLabel } from '../../types/report';
import { MapPin, Trash2, Copy, Edit2, Anchor, Check } from 'lucide-react';
import L from 'leaflet';

export interface MapLabelsOverlayProps {
  labels: MapLabel[];
  onChangeLabels: (labels: MapLabel[]) => void;
  mapInstance?: L.Map | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isExporting?: boolean;
  language?: 'ar' | 'en';
}

export const MapLabelsOverlay: React.FC<MapLabelsOverlayProps> = ({
  labels,
  onChangeLabels,
  mapInstance,
  containerRef,
  isExporting = false,
  language = 'ar'
}) => {
  const isAr = language === 'ar';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [dragState, setDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialX: number; // in pixels
    initialY: number; // in pixels
  } | null>(null);

  // Keyboard navigation & deletion
  useEffect(() => {
    if (isExporting || !selectedId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (editingId) return; // Typing in input

      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;

      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onChangeLabels(labels.filter(l => l.id !== selectedId));
        setSelectedId(null);
        return;
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setEditingId(null);
        return;
      }

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        onChangeLabels(labels.map(l => {
          if (l.id !== selectedId) return l;
          const currentPxX = (l.x / 100) * rect.width;
          const currentPxY = (l.y / 100) * rect.height;
          const newPxX = Math.max(0, Math.min(rect.width, currentPxX + dx));
          const newPxY = Math.max(0, Math.min(rect.height, currentPxY + dy));
          const nextPercentX = (newPxX / rect.width) * 100;
          const nextPercentY = (newPxY / rect.height) * 100;

          let nextLat = l.lat;
          let nextLon = l.lon;
          if (mapInstance && l.anchor !== 'frame') {
            try {
              const latlng = mapInstance.containerPointToLatLng([newPxX, newPxY]);
              nextLat = latlng.lat;
              nextLon = latlng.lng;
            } catch {}
          }

          return {
            ...l,
            x: nextPercentX,
            y: nextPercentY,
            lat: nextLat,
            lon: nextLon
          };
        }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, editingId, labels, onChangeLabels, containerRef, mapInstance, isExporting]);

  // Compute pixel positions: if geo-anchored and map available, convert lat/lon to container point
  const getLabelPixelPos = useCallback((label: MapLabel) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();

    if (label.anchor === 'geo' && mapInstance && label.lat !== undefined && label.lon !== undefined) {
      try {
        const pt = mapInstance.latLngToContainerPoint([label.lat, label.lon]);
        return { x: pt.x, y: pt.y };
      } catch {}
    }
    return {
      x: (label.x / 100) * rect.width,
      y: (label.y / 100) * rect.height
    };
  }, [mapInstance, containerRef]);

  // Pointer drag handlers
  const handlePointerDown = (e: React.PointerEvent, label: MapLabel) => {
    if (isExporting) return;
    e.stopPropagation();
    e.preventDefault();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(label.id);

    const pos = getLabelPixelPos(label);
    setDragState({
      id: label.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !containerRef.current) return;
    e.stopPropagation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const rawDx = e.clientX - dragState.startX;
    const rawDy = e.clientY - dragState.startY;

    let targetX = dragState.initialX + rawDx;
    let targetY = dragState.initialY + rawDy;

    // Grid snap 4px unless Alt key is held
    if (!e.altKey) {
      targetX = Math.round(targetX / 4) * 4;
      targetY = Math.round(targetY / 4) * 4;
    }

    // Clamp inside container
    targetX = Math.max(10, Math.min(rect.width - 10, targetX));
    targetY = Math.max(10, Math.min(rect.height - 10, targetY));

    const nextPercentX = (targetX / rect.width) * 100;
    const nextPercentY = (targetY / rect.height) * 100;

    let nextLat: number | undefined;
    let nextLon: number | undefined;
    if (mapInstance) {
      try {
        const latlng = mapInstance.containerPointToLatLng([targetX, targetY]);
        nextLat = latlng.lat;
        nextLon = latlng.lng;
      } catch {}
    }

    onChangeLabels(labels.map(l => {
      if (l.id !== dragState.id) return l;
      return {
        ...l,
        x: nextPercentX,
        y: nextPercentY,
        lat: nextLat ?? l.lat,
        lon: nextLon ?? l.lon
      };
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragState) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setDragState(null);
  };

  const handleDuplicate = (label: MapLabel) => {
    const dup: MapLabel = {
      ...label,
      id: `label-${Date.now()}`,
      text: `${label.text} (نسخة)`,
      x: Math.min(95, label.x + 3),
      y: Math.min(95, label.y + 3)
    };
    onChangeLabels([...labels, dup]);
    setSelectedId(dup.id);
  };

  const handleToggleAnchor = (label: MapLabel) => {
    const nextAnchor = label.anchor === 'frame' ? 'geo' : 'frame';
    onChangeLabels(labels.map(l => l.id === label.id ? { ...l, anchor: nextAnchor } : l));
  };

  const handleStartInlineEdit = (label: MapLabel) => {
    setEditingId(label.id);
    setEditingText(label.text);
  };

  const handleCommitInlineEdit = (id: string) => {
    if (editingText.trim()) {
      onChangeLabels(labels.map(l => l.id === id ? { ...l, text: editingText.trim() } : l));
    }
    setEditingId(null);
  };

  return (
    <div
      className="absolute inset-0 z-[1500] pointer-events-none overflow-hidden select-none"
      onClick={() => {
        if (!dragState) {
          setSelectedId(null);
          setEditingId(null);
        }
      }}
    >
      {labels.filter(l => !l.hidden).map(label => {
        const isSelected = selectedId === label.id && !isExporting;
        const isEditing = editingId === label.id;
        const pos = getLabelPixelPos(label);

        return (
          <div
            key={label.id}
            onPointerDown={(e) => handlePointerDown(e, label)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleStartInlineEdit(label);
            }}
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform: 'translate(-50%, -50%)',
              touchAction: 'none'
            }}
            className={`absolute pointer-events-auto transition-transform ${
              isSelected
                ? 'cursor-grabbing ring-2 ring-indigo-500 shadow-xl z-20 scale-105'
                : 'cursor-grab hover:scale-102 hover:shadow-md z-10'
            }`}
          >
            {/* Label Body Render */}
            {isEditing ? (
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded shadow-lg border border-indigo-400">
                <input
                  type="text"
                  autoFocus
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCommitInlineEdit(label.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="px-1.5 py-0.5 text-xs text-black border-none outline-none font-bold min-w-[80px]"
                />
                <button
                  type="button"
                  onClick={() => handleCommitInlineEdit(label.id)}
                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: label.bg,
                  color: label.fg,
                  borderColor: label.border,
                  fontSize: `${label.fontSize}px`,
                  borderRadius: label.shape === 'pill' ? '9999px' : label.shape === 'circle' ? '50%' : '6px',
                  borderWidth: '1.5px',
                  borderStyle: 'solid',
                  padding: label.shape === 'circle' ? '8px' : '3px 10px',
                  fontFamily: "'IBM Plex Sans Arabic', -apple-system, sans-serif",
                  fontWeight: 700,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  whiteSpace: 'nowrap'
                }}
                className="flex items-center gap-1"
              >
                <span>{label.text}</span>
              </div>
            )}

            {/* Selected Mini-Toolbar */}
            {isSelected && !isEditing && (
              <div
                className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-900/95 text-white px-2 py-1 rounded-lg shadow-xl text-[10px] whitespace-nowrap z-30"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => handleStartInlineEdit(label)}
                  className="p-1 hover:bg-slate-800 rounded transition-colors text-amber-300"
                  title={isAr ? 'تعديل النص' : 'Edit text'}
                >
                  <Edit2 size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAnchor(label)}
                  className={`p-1 hover:bg-slate-800 rounded transition-colors flex items-center gap-0.5 ${
                    label.anchor === 'frame' ? 'text-sky-300' : 'text-emerald-300'
                  }`}
                  title={
                    label.anchor === 'frame'
                      ? isAr ? 'مثبت بنسبة الإطار (Frame)' : 'Frame anchor'
                      : isAr ? 'مثبت جغرافياً بالإحداثيات (Geo)' : 'Geo anchor'
                  }
                >
                  {label.anchor === 'frame' ? <Anchor size={11} /> : <MapPin size={11} />}
                  <span className="text-[9px]">{label.anchor === 'frame' ? 'Frame' : 'Geo'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicate(label)}
                  className="p-1 hover:bg-slate-800 rounded transition-colors text-gray-300"
                  title={isAr ? 'نسخ' : 'Duplicate'}
                >
                  <Copy size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeLabels(labels.filter(l => l.id !== label.id));
                    setSelectedId(null);
                  }}
                  className="p-1 hover:bg-red-900/60 rounded transition-colors text-red-400"
                  title={isAr ? 'حذف' : 'Delete'}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapLabel } from '../../types/report';
import { MapPin, Trash2, Copy, Edit2, Anchor, Check, X } from 'lucide-react';
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

  // Edit style & text modal state
  const [editModalId, setEditModalId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editShape, setEditShape] = useState<'pill' | 'rect' | 'circle'>('pill');
  const [editFontSize, setEditFontSize] = useState<number>(12);
  const [editBg, setEditBg] = useState('#ffffff');
  const [editFg, setEditFg] = useState('#1f2937');
  const [editBorder, setEditBorder] = useState('#dc2626');

  // Geo customize coordinates modal state
  const [geoCustomizeId, setGeoCustomizeId] = useState<string | null>(null);
  const [geoLatInput, setGeoLatInput] = useState('');
  const [geoLonInput, setGeoLonInput] = useState('');

  // Inline quick double-click edit
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineEditingText, setInlineEditingText] = useState('');

  // Drag state
  const [dragState, setDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    hasMoved: boolean;
  } | null>(null);

  // Re-render when map moves so geo-anchored labels stay glued
  const [, setMapTick] = useState(0);
  useEffect(() => {
    if (!mapInstance) return;
    const update = () => setMapTick(t => t + 1);
    mapInstance.on('move', update);
    mapInstance.on('zoom', update);
    mapInstance.on('resize', update);
    return () => {
      mapInstance.off('move', update);
      mapInstance.off('zoom', update);
      mapInstance.off('resize', update);
    };
  }, [mapInstance]);

  // Keyboard navigation & deletion
  useEffect(() => {
    if (isExporting || !selectedId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (inlineEditingId || editModalId || geoCustomizeId) return;

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
        setEditModalId(null);
        setGeoCustomizeId(null);
        setInlineEditingId(null);
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
  }, [selectedId, inlineEditingId, editModalId, geoCustomizeId, labels, onChangeLabels, containerRef, mapInstance, isExporting]);

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
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea')) return;

    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    setSelectedId(label.id);
    const pos = getLabelPixelPos(label);
    setDragState({
      id: label.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y,
      hasMoved: false
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !containerRef.current) return;
    e.stopPropagation();

    const rawDx = e.clientX - dragState.startX;
    const rawDy = e.clientY - dragState.startY;

    if (!dragState.hasMoved && Math.hypot(rawDx, rawDy) < 4) {
      return;
    }

    if (!dragState.hasMoved) {
      setDragState(prev => prev ? { ...prev, hasMoved: true } : null);
    }

    const rect = containerRef.current.getBoundingClientRect();
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
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setDragState(null);
  };

  // Duplicate
  const handleDuplicate = (label: MapLabel) => {
    const dup: MapLabel = {
      ...label,
      id: `label-${Date.now()}`,
      text: `${label.text} (2)`,
      x: Math.min(95, label.x + 3),
      y: Math.min(95, label.y + 3)
    };
    if (mapInstance && label.lat !== undefined && label.lon !== undefined) {
      dup.lat = label.lat + 0.01;
      dup.lon = label.lon + 0.01;
    }
    onChangeLabels([...labels, dup]);
    setSelectedId(dup.id);
  };

  // Delete
  const handleDelete = (id: string) => {
    onChangeLabels(labels.filter(l => l.id !== id));
    setSelectedId(null);
    setEditModalId(null);
    setGeoCustomizeId(null);
    setInlineEditingId(null);
  };

  // Open Edit Dialog
  const handleOpenEdit = (label: MapLabel) => {
    setEditModalId(label.id);
    setGeoCustomizeId(null);
    setInlineEditingId(null);
    setEditText(label.text);
    setEditShape((label.shape as any) || 'pill');
    setEditFontSize(label.fontSize || 12);
    setEditBg(label.bg || '#ffffff');
    setEditFg(label.fg || '#1f2937');
    setEditBorder(label.border || '#dc2626');
  };

  // Save Edit Dialog
  const handleSaveEdit = (id: string) => {
    if (editText.trim()) {
      onChangeLabels(labels.map(l => l.id === id ? {
        ...l,
        text: editText.trim(),
        shape: editShape,
        fontSize: editFontSize,
        bg: editBg,
        fg: editFg,
        border: editBorder
      } : l));
    }
    setEditModalId(null);
  };

  // Open Geo Customize Dialog
  const handleOpenGeo = (label: MapLabel) => {
    setGeoCustomizeId(label.id);
    setEditModalId(null);
    setInlineEditingId(null);
    setGeoLatInput(label.lat !== undefined ? String(Number(label.lat).toFixed(5)) : '');
    setGeoLonInput(label.lon !== undefined ? String(Number(label.lon).toFixed(5)) : '');
  };

  // Save Geo Coordinates
  const handleSaveGeo = (id: string) => {
    const lat = parseFloat(geoLatInput);
    const lon = parseFloat(geoLonInput);
    if (!isNaN(lat) && !isNaN(lon)) {
      let percentX = 50;
      let percentY = 50;
      if (mapInstance && containerRef.current) {
        try {
          const pt = mapInstance.latLngToContainerPoint([lat, lon]);
          const rect = containerRef.current.getBoundingClientRect();
          percentX = (pt.x / rect.width) * 100;
          percentY = (pt.y / rect.height) * 100;
        } catch {}
      }
      onChangeLabels(labels.map(l => l.id === id ? {
        ...l,
        lat,
        lon,
        x: percentX,
        y: percentY,
        anchor: 'geo'
      } : l));
    }
    setGeoCustomizeId(null);
  };

  // Inline Quick Text Edit
  const handleStartInlineEdit = (label: MapLabel) => {
    setInlineEditingId(label.id);
    setInlineEditingText(label.text);
    setEditModalId(null);
    setGeoCustomizeId(null);
  };

  const handleCommitInlineEdit = (id: string) => {
    if (inlineEditingText.trim()) {
      onChangeLabels(labels.map(l => l.id === id ? { ...l, text: inlineEditingText.trim() } : l));
    }
    setInlineEditingId(null);
  };

  return (
    <div
      className="absolute inset-0 z-[1500] pointer-events-none overflow-hidden select-none"
      onClick={(e) => {
        if ((e.target as HTMLElement) === e.currentTarget && !dragState) {
          setSelectedId(null);
          setEditModalId(null);
          setGeoCustomizeId(null);
          setInlineEditingId(null);
        }
      }}
    >
      {labels.filter(l => !l.hidden).map(label => {
        const isSelected = selectedId === label.id && !isExporting;
        const isInlineEditing = inlineEditingId === label.id;
        const pos = getLabelPixelPos(label);

        return (
          <div
            key={label.id}
            onPointerDown={(e) => handlePointerDown(e, label)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(label.id);
            }}
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
                ? 'cursor-grab ring-2 ring-blue-500 rounded-sm shadow-xl z-30'
                : 'cursor-grab hover:scale-102 hover:shadow-md z-10'
            }`}
          >
            {/* 1. Label Body Render */}
            {isInlineEditing ? (
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg shadow-lg border border-blue-500">
                <input
                  type="text"
                  autoFocus
                  value={inlineEditingText}
                  onChange={(e) => setInlineEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCommitInlineEdit(label.id);
                    if (e.key === 'Escape') setInlineEditingId(null);
                  }}
                  className="px-2 py-0.5 text-xs text-black border-none outline-none font-bold min-w-[90px]"
                />
                <button
                  type="button"
                  onClick={() => handleCommitInlineEdit(label.id)}
                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                >
                  <Check size={13} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: label.bg || '#ffffff',
                  color: label.fg || '#1f2937',
                  borderColor: label.border || '#dc2626',
                  fontSize: `${label.fontSize || 12}px`,
                  borderRadius: label.shape === 'pill' ? '9999px' : label.shape === 'circle' ? '50%' : '6px',
                  borderWidth: '1.5px',
                  borderStyle: 'solid',
                  padding: label.shape === 'circle' ? '8px' : '4px 12px',
                  fontFamily: "'IBM Plex Sans Arabic', -apple-system, sans-serif",
                  fontWeight: 700,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  whiteSpace: 'nowrap'
                }}
                className="flex items-center gap-1 select-none hb-label-custom"
              >
                <span>{label.text}</span>
              </div>
            )}

            {/* 2. Floating Toolbar (Exact Match to Screenshot 1) */}
            {isSelected && !isInlineEditing && (
              <div
                className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1e293b] text-white px-3 py-1.5 rounded-xl shadow-2xl text-xs whitespace-nowrap z-40 border border-slate-700/60 select-none animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => handleOpenEdit(label)}
                  className="p-1 hover:bg-slate-700/70 rounded-lg transition-colors text-amber-400 flex items-center justify-center font-bold"
                  title={isAr ? 'تعديل النص والمظهر' : 'Edit text & style'}
                >
                  <Edit2 size={13} />
                </button>

                {/* Geo Button (Customize Coordinates) */}
                <button
                  type="button"
                  onClick={() => handleOpenGeo(label)}
                  className="px-1.5 py-0.5 hover:bg-slate-700/70 rounded-lg transition-colors flex items-center gap-1 text-emerald-400 font-bold"
                  title={isAr ? 'تخصيص الإحداثيات الجغرافية (Geo coordinates)' : 'Customize Geo coordinates'}
                >
                  <MapPin size={13} />
                  <span className="text-[11px]">Geo</span>
                </button>

                {/* Duplicate Button */}
                <button
                  type="button"
                  onClick={() => handleDuplicate(label)}
                  className="p-1 hover:bg-slate-700/70 rounded-lg transition-colors text-slate-300 flex items-center justify-center"
                  title={isAr ? 'نسخ' : 'Duplicate'}
                >
                  <Copy size={13} />
                </button>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => handleDelete(label.id)}
                  className="p-1 hover:bg-red-900/60 rounded-lg transition-colors text-red-400 flex items-center justify-center"
                  title={isAr ? 'حذف' : 'Delete'}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            {/* 3. Geo Customize Coordinates Popover Modal */}
            {geoCustomizeId === label.id && (
              <div
                className="absolute -top-52 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white p-3 rounded-xl shadow-2xl text-xs z-50 border border-slate-700 min-w-[250px] space-y-2 select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <MapPin size={13} />
                    <span>{isAr ? 'تخصيص الإحداثيات (Geo)' : 'Customize Coordinates'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGeoCustomizeId(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <label className="block text-gray-400 text-[10px] mb-0.5">{isAr ? 'خط العرض (Latitude):' : 'Latitude (N):'}</label>
                    <input
                      type="number"
                      step="any"
                      value={geoLatInput}
                      onChange={(e) => setGeoLatInput(e.target.value)}
                      placeholder="e.g. 46.9965"
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded font-mono text-white text-xs outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-[10px] mb-0.5">{isAr ? 'خط الطول (Longitude):' : 'Longitude (E):'}</label>
                    <input
                      type="number"
                      step="any"
                      value={geoLonInput}
                      onChange={(e) => setGeoLonInput(e.target.value)}
                      placeholder="e.g. 67.0222"
                      className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded font-mono text-white text-xs outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      const nextAnchor = label.anchor === 'frame' ? 'geo' : 'frame';
                      onChangeLabels(labels.map(l => l.id === label.id ? { ...l, anchor: nextAnchor } : l));
                    }}
                    className="text-[10px] text-sky-400 hover:underline flex items-center gap-1"
                    title={isAr ? 'التبديل بين التثبيت الجغرافي والإطار' : 'Toggle Geo / Frame Anchor'}
                  >
                    <Anchor size={10} />
                    <span>{label.anchor === 'frame' ? (isAr ? 'تثبيت بالإطار' : 'Frame Anchor') : (isAr ? 'تثبيت جغرافي' : 'Geo Anchor')}</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGeoCustomizeId(null)}
                      className="px-2 py-0.5 rounded text-gray-400 hover:text-white"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveGeo(label.id)}
                      className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow-xs"
                    >
                      {isAr ? 'تطبيق' : 'Apply'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Edit Style & Text Popover Modal */}
            {editModalId === label.id && (
              <div
                className="absolute -top-56 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white p-3 rounded-xl shadow-2xl text-xs z-50 border border-slate-700 min-w-[260px] space-y-2 select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400">
                    <Edit2 size={13} />
                    <span>{isAr ? 'تعديل مظهر العلامة' : 'Edit Label Style'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditModalId(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div>
                  <label className="block text-gray-400 text-[10px] mb-0.5">{isAr ? 'نص العلامة:' : 'Text:'}</label>
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs font-bold outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <label className="block text-gray-400 mb-0.5">{isAr ? 'الشكل:' : 'Shape:'}</label>
                    <select
                      value={editShape}
                      onChange={(e) => setEditShape(e.target.value as any)}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white outline-none cursor-pointer"
                    >
                      <option value="pill">{isAr ? 'كبسولة (Pill)' : 'Pill'}</option>
                      <option value="rect">{isAr ? 'مستطيل (Rect)' : 'Rectangle'}</option>
                      <option value="circle">{isAr ? 'دائرة (Circle)' : 'Circle'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-0.5">{isAr ? 'الحجم:' : 'Font Size:'}</label>
                    <select
                      value={editFontSize}
                      onChange={(e) => setEditFontSize(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white outline-none cursor-pointer"
                    >
                      <option value={10}>10px</option>
                      <option value={12}>12px</option>
                      <option value={14}>14px</option>
                      <option value={16}>16px</option>
                      <option value={18}>18px</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] pt-1">
                  <div className="flex items-center gap-1" title={isAr ? 'لون الخلفية' : 'Background'}>
                    <span className="text-gray-400">BG:</span>
                    <input
                      type="color"
                      value={editBg}
                      onChange={(e) => setEditBg(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border border-slate-700 p-0"
                    />
                  </div>
                  <div className="flex items-center gap-1" title={isAr ? 'لون النص' : 'Text color'}>
                    <span className="text-gray-400">Text:</span>
                    <input
                      type="color"
                      value={editFg}
                      onChange={(e) => setEditFg(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border border-slate-700 p-0"
                    />
                  </div>
                  <div className="flex items-center gap-1" title={isAr ? 'لون الإطار' : 'Border color'}>
                    <span className="text-gray-400">Border:</span>
                    <input
                      type="color"
                      value={editBorder}
                      onChange={(e) => setEditBorder(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border border-slate-700 p-0"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditModalId(null)}
                    className="px-2 py-0.5 rounded text-gray-400 hover:text-white"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(label.id)}
                    className="px-2.5 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded shadow-xs"
                  >
                    {isAr ? 'حفظ' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

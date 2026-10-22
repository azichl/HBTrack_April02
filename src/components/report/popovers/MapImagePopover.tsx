import React, { useRef } from 'react';
import { Popover } from '../../ui/Popover';
import { Segmented } from '../../ui/Segmented';
import { Upload, Trash2, Map as MapIcon, Image as ImageIcon } from 'lucide-react';

export interface MapImagePopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  mapImage?: { url: string; fit: 'fill' | 'cover' | 'contain' };
  isSnapshotMode: boolean;
  onChangeImage: (url: string | null) => void;
  onChangeFit: (fit: 'fill' | 'cover' | 'contain') => void;
  onToggleMode: (mode: 'interactive' | 'snapshot') => void;
  language?: 'ar' | 'en';
}

export const MapImagePopover: React.FC<MapImagePopoverProps> = ({
  anchorRef,
  open,
  onClose,
  mapImage,
  isSnapshotMode,
  onChangeImage,
  onChangeFit,
  onToggleMode,
  language = 'ar'
}) => {
  const isAr = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (url) {
        onChangeImage(url);
        onToggleMode('snapshot');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={isAr ? 'صورة خريطة QGIS' : 'Map Image (QGIS)'}
      width={340}
      footer={
        <div className="flex items-center justify-end w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
          >
            {isAr ? 'تم (Done)' : 'Done'}
          </button>
        </div>
      }
    >
      {/* 1. Mode Switch: Interactive vs QGIS Snapshot */}
      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">
          {isAr ? 'نوع عرض الخريطة بالتقرير:' : 'Map Display Mode:'}
        </label>
        <Segmented<'interactive' | 'snapshot'>
          value={isSnapshotMode ? 'snapshot' : 'interactive'}
          onChange={(m) => onToggleMode(m)}
          options={[
            {
              value: 'interactive',
              label: (
                <span className="flex items-center gap-1">
                  <MapIcon size={12} />
                  <span>{isAr ? 'تفاعلية (Live)' : 'Live Map'}</span>
                </span>
              )
            },
            {
              value: 'snapshot',
              label: (
                <span className="flex items-center gap-1">
                  <ImageIcon size={12} />
                  <span>{isAr ? 'خريطة QGIS' : 'QGIS Image'}</span>
                </span>
              )
            }
          ]}
        />
      </div>

      <div className="border-t border-gray-100 dark:border-slate-800" />

      {/* 2. Upload / Preview Drop-zone */}
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png, image/jpeg, image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
          }}
        />

        {mapImage?.url ? (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 aspect-video bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
              <img
                src={mapImage.url}
                alt="QGIS Map Preview"
                className="w-full h-full"
                style={{ objectFit: mapImage.fit || 'contain' }}
              />
              <button
                type="button"
                onClick={() => onChangeImage(null)}
                className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-md hover:bg-red-700 shadow-sm transition-colors"
                title={isAr ? 'إزالة الصورة' : 'Remove Image'}
              >
                <Trash2 size={12} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-1 px-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <Upload size={12} />
                <span>{isAr ? 'استبدال الصورة' : 'Replace Image'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-gray-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl p-4 text-center cursor-pointer transition-colors bg-gray-50/50 dark:bg-slate-800/40"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center mb-1.5">
              <Upload size={15} />
            </div>
            <span className="block text-xs font-bold text-gray-800 dark:text-gray-200">
              {isAr ? 'انقر أو اسحب صورة خريطة QGIS هنا' : 'Click or drop QGIS map image here'}
            </span>
            <span className="block text-[10.5px] text-gray-400 mt-0.5">PNG / JPG (Max 10 MB)</span>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 dark:border-slate-800" />

      {/* 3. Fit Mode Segmented Control: Fill | Cover | Contain */}
      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">
          {isAr ? 'ملاءمة أبعاد الخريطة (Fit Mode):' : 'Display Fit:'}
        </label>
        <Segmented<'contain' | 'cover' | 'fill'>
          value={mapImage?.fit || 'contain'}
          onChange={(fit) => onChangeFit(fit)}
          options={[
            { value: 'contain', label: isAr ? 'احتواء (Contain)' : 'Contain' },
            { value: 'cover', label: isAr ? 'تغطية (Cover)' : 'Cover' },
            { value: 'fill', label: isAr ? 'ملء (Fill)' : 'Fill' }
          ]}
        />
      </div>
    </Popover>
  );
};

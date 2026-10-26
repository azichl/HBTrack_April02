import React from 'react';
import { Popover } from '../../ui/Popover';
import { LegendEditorPanel } from '../../../features/report-track/LegendEditorPanel';
import { LegendStore } from '../../../features/report-track/legendStore';
import { ExtraItem } from '../../../features/report-track/legendModel';

export interface LegendPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  store: LegendStore;
  presence?: Record<string, boolean>;
  extra?: ExtraItem[];
  language?: 'ar' | 'en';
}

export const LegendPopover: React.FC<LegendPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  store,
  presence,
  extra,
  language = 'ar'
}) => {
  const isAr = language === 'ar';

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={isAr ? 'مفتاح الخريطة (Legend)' : 'Map Legend'}
      width={460}
    >
      <div className="max-h-[75vh] overflow-y-auto pr-1" dir={isAr ? 'rtl' : 'ltr'}>
        <LegendEditorPanel
          store={store}
          lang={isAr ? 'ar' : 'en'}
          presence={presence}
          extra={extra}
          onDone={onClose}
        />
      </div>
    </Popover>
  );
};

import { ReportLayout, ZoneId, BlockId, DEFAULT_LAYOUT } from '../../types/report';

export function findZone(layout: ReportLayout, blockId: BlockId): ZoneId | undefined {
  const zones: ZoneId[] = ['full-top', 'left', 'right', 'full-bottom'];
  for (const z of zones) {
    if (layout.zones[z]?.includes(blockId)) {
      return z;
    }
  }
  return undefined;
}

export function moveWithinZone(
  layout: ReportLayout,
  zone: ZoneId,
  fromIndex: number,
  toIndex: number
): ReportLayout {
  const currentList = [...(layout.zones[zone] || [])];
  if (fromIndex < 0 || fromIndex >= currentList.length) return layout;
  if (toIndex < 0 || toIndex >= currentList.length) return layout;
  if (fromIndex === toIndex) return layout;

  const [item] = currentList.splice(fromIndex, 1);
  currentList.splice(toIndex, 0, item);

  return {
    ...layout,
    zones: {
      ...layout.zones,
      [zone]: currentList
    }
  };
}

export function moveAcrossZones(
  layout: ReportLayout,
  fromZone: ZoneId,
  toZone: ZoneId,
  blockId: BlockId,
  targetIndex?: number
): ReportLayout {
  if (fromZone === toZone) {
    const list = layout.zones[fromZone] || [];
    const curIdx = list.indexOf(blockId);
    if (curIdx >= 0 && targetIndex !== undefined && targetIndex >= 0) {
      return moveWithinZone(layout, fromZone, curIdx, targetIndex);
    }
    return layout;
  }

  const fromList = (layout.zones[fromZone] || []).filter(b => b !== blockId);
  const toList = [...(layout.zones[toZone] || []).filter(b => b !== blockId)];

  const idx = targetIndex !== undefined && targetIndex >= 0 ? targetIndex : toList.length;
  toList.splice(idx, 0, blockId);

  return {
    ...layout,
    zones: {
      ...layout.zones,
      [fromZone]: fromList,
      [toZone]: toList
    }
  };
}

export function moveBlockByStep(
  layout: ReportLayout,
  blockId: BlockId,
  direction: 'up' | 'down'
): ReportLayout {
  const zone = findZone(layout, blockId);
  if (!zone) return layout;

  const list = layout.zones[zone] || [];
  const idx = list.indexOf(blockId);
  if (idx < 0) return layout;

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  return moveWithinZone(layout, zone, idx, targetIdx);
}

export function moveBlockToZone(
  layout: ReportLayout,
  blockId: BlockId,
  targetZone: ZoneId
): ReportLayout {
  const currentZone = findZone(layout, blockId);
  if (!currentZone) return layout;
  return moveAcrossZones(layout, currentZone, targetZone, blockId);
}

export function hideBlock(layout: ReportLayout, blockId: BlockId): ReportLayout {
  if (layout.hidden.includes(blockId)) return layout;
  return {
    ...layout,
    hidden: [...layout.hidden, blockId]
  };
}

export function showBlock(layout: ReportLayout, blockId: BlockId): ReportLayout {
  return {
    ...layout,
    hidden: layout.hidden.filter(b => b !== blockId)
  };
}

export function resetLayout(): ReportLayout {
  return structuredClone(DEFAULT_LAYOUT);
}

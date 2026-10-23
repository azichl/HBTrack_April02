export type BirdStatus = 'alive' | 'dead' | 'potential_mortality' | 'inactive';

export const STATUS_LABEL = {
  alive:               { en: 'Alive',               ar: 'حي' },
  dead:                { en: 'Dead',                ar: 'نافق' },
  potential_mortality: { en: 'Potential mortality', ar: 'نفوق محتمل' },
  inactive:            { en: 'Inactive',            ar: 'غير نشط' },
} as const;

/**
 * Shared status colors matching the live map and Spec v4
 */
export const STATUS_COLORS: Record<BirdStatus, {
  color: string;       // main text/border color
  bg: string;          // ~12% background
  border: string;      // ~25% border
}> = {
  alive: {
    color: '#16a34a', // green
    bg: '#dcfce7',
    border: '#86efac'
  },
  dead: {
    color: '#dc2626', // red
    bg: '#fee2e2',
    border: '#fca5a5'
  },
  potential_mortality: {
    color: '#ea580c', // orange
    bg: '#ffedd5',
    border: '#fdba74'
  },
  inactive: {
    color: '#18181b', // black
    bg: '#f4f4f5',
    border: '#d4d4d8'
  }
};

/**
 * Table-driven normaliser: EN/AR, case, spaces, underscores, hyphens
 */
export function normalizeStatus(raw?: string | null): BirdStatus | null {
  const s = (raw ?? '').toString().trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (['alive', 'حي', 'active', 'نشط'].includes(s)) return 'alive';
  if (['dead', 'ميت', 'نافق'].includes(s)) return 'dead';
  if (['potential mortality', 'نفوق محتمل', 'احتمال نفوق'].includes(s)) return 'potential_mortality';
  if (['inactive', 'غير نشط', 'خامل'].includes(s)) return 'inactive';
  return null;
}

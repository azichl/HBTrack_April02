import { describe, it, expect } from 'vitest';
import { STATUS_COLORS, STATUS_LABEL, normalizeStatus, BirdStatus } from '../src/constants/statusColors';

describe('Bird Status Spec v4 Contracts', () => {
  it('defines the required status colors: green, red, orange, black', () => {
    expect(STATUS_COLORS.alive.color).toBe('#16a34a'); // green
    expect(STATUS_COLORS.dead.color).toBe('#dc2626');  // red
    expect(STATUS_COLORS.potential_mortality.color).toBe('#ea580c'); // orange
    expect(STATUS_COLORS.inactive.color).toBe('#18181b'); // black
  });

  it('defines labels in Arabic and English for all four statuses', () => {
    const statuses: BirdStatus[] = ['alive', 'dead', 'potential_mortality', 'inactive'];
    for (const s of statuses) {
      expect(STATUS_LABEL[s].en).toBeTruthy();
      expect(STATUS_LABEL[s].ar).toBeTruthy();
    }
    expect(STATUS_LABEL.alive.ar).toBe('حي');
    expect(STATUS_LABEL.dead.ar).toBe('نافق');
    expect(STATUS_LABEL.potential_mortality.ar).toBe('نفوق محتمل');
    expect(STATUS_LABEL.inactive.ar).toBe('غير نشط');
  });

  it('provides ~12% tinted backgrounds and ~25% borders', () => {
    expect(STATUS_COLORS.alive.bg).toBe('#dcfce7');
    expect(STATUS_COLORS.dead.bg).toBe('#fee2e2');
    expect(STATUS_COLORS.potential_mortality.bg).toBe('#ffedd5');
    expect(STATUS_COLORS.inactive.bg).toBe('#f4f4f5');
  });
});

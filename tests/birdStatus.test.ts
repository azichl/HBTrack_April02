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

  it('correctly identifies real vs placeholder transmitters with isRealTransmitter', async () => {
    const { isRealTransmitter, resolveReportSubject } = await import('../src/utils/reportSubject');
    
    expect(isRealTransmitter(null)).toBe(false);
    expect(isRealTransmitter(undefined)).toBe(false);
    expect(isRealTransmitter({ id: 't1', platform_id: 'No Transmitter' } as any)).toBe(false);
    expect(isRealTransmitter({ id: 't2', platform_id: 'بدون جهاز' } as any)).toBe(false);
    expect(isRealTransmitter({ id: 't3', platform_id: 'NA' } as any)).toBe(false);
    expect(isRealTransmitter({ id: 't4', platform_id: 'None' } as any)).toBe(false);
    expect(isRealTransmitter({ id: 't5', platform_id: '' } as any)).toBe(false);

    expect(isRealTransmitter({ id: 't6', platform_id: '244292' } as any)).toBe(true);
    expect(isRealTransmitter({ id: 't7', platform_id: 'trans-244289' } as any)).toBe(true);
  });

  it('determines editable status for ring-only/Darvic-only vs transmitter birds', async () => {
    const { resolveReportSubject } = await import('../src/utils/reportSubject');

    const birds = [
      { id: 'b1', ring_id: 'RING-100', darvic_number: 'D-10', status: 'alive' } as any,
      { id: 'b2', ring_id: 'RING-200', assigned_transmitter_id: '244292', status: 'dead' } as any
    ];
    const transmitters = [
      { id: 'tx-244292', platform_id: '244292', bird_id: 'b2', derived_status: 'Active' } as any,
      { id: 'placeholder-tx', platform_id: 'No Transmitter', bird_id: 'b1' } as any
    ];

    // Bird 1 has only placeholder transmitter => ring-only, editable
    const subj1 = resolveReportSubject('RING-100', birds, transmitters);
    expect(subj1.status.editable).toBe(true);
    expect(subj1.status.source).toBe('bird');
    expect(subj1.display.transmitterId).toBe('بدون جهاز');

    // Bird 2 has genuine transmitter 244292 => locked
    const subj2 = resolveReportSubject('244292', birds, transmitters);
    expect(subj2.status.editable).toBe(false);
    expect(subj2.status.source).toBe('transmitter');
    expect(subj2.display.transmitterId).toBe('244292');
  });
});

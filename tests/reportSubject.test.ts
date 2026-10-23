import { describe, it, expect } from 'vitest';
import { resolveReportSubject } from '../src/utils/reportSubject';
import { normalizeStatus, STATUS_COLORS, STATUS_LABEL } from '../src/constants/statusColors';
import { Bird, Transmitter } from '../types';

describe('normalizeStatus', () => {
  it('normalizes alive in English and Arabic', () => {
    expect(normalizeStatus('alive')).toBe('alive');
    expect(normalizeStatus('Alive')).toBe('alive');
    expect(normalizeStatus('حي')).toBe('alive');
    expect(normalizeStatus('active')).toBe('alive');
  });

  it('normalizes dead in English and Arabic', () => {
    expect(normalizeStatus('dead')).toBe('dead');
    expect(normalizeStatus('Dead')).toBe('dead');
    expect(normalizeStatus('ميت')).toBe('dead');
    expect(normalizeStatus('نافق')).toBe('dead');
  });

  it('normalizes potential mortality in English and Arabic', () => {
    expect(normalizeStatus('potential mortality')).toBe('potential_mortality');
    expect(normalizeStatus('Potential Mortality')).toBe('potential_mortality');
    expect(normalizeStatus('نفوق محتمل')).toBe('potential_mortality');
    expect(normalizeStatus('احتمال نفوق')).toBe('potential_mortality');
  });

  it('normalizes inactive in English and Arabic', () => {
    expect(normalizeStatus('inactive')).toBe('inactive');
    expect(normalizeStatus('Inactive')).toBe('inactive');
    expect(normalizeStatus('غير نشط')).toBe('inactive');
    expect(normalizeStatus('خامل')).toBe('inactive');
  });

  it('returns null for unknown status', () => {
    expect(normalizeStatus('unknown')).toBeNull();
    expect(normalizeStatus('')).toBeNull();
    expect(normalizeStatus(null)).toBeNull();
  });
});

describe('resolveReportSubject', () => {
  const mockBirdWithTx: Bird = {
    id: 'bird-244289',
    ring_id: 'QA-8821',
    darvic_number: 'D244',
    species: 'Asian Houbara',
    sex: 'M',
    release_date: '2024-03-15',
    release_location: 'South Kazakhstan',
    release_lat: '46.8545',
    release_lon: '67.0123',
    assigned_transmitter_id: '244289'
  };

  const mockTx: Transmitter = {
    id: 'trans-244289',
    platform_id: '244289',
    model: 'Solar PTT',
    status: 'active',
    derived_status: 'Active',
    bird_id: 'bird-244289',
    last_fix: '2024-04-10T12:00:00Z',
    duty_cycle: '10h ON'
  };

  const mockRingOnlyBird: Bird = {
    id: 'bird-7751',
    ring_id: 'Qatar.Environment 7751',
    darvic_number: '7751',
    species: 'Asian Houbara',
    sex: 'F',
    release_date: '2025-05-20',
    release_location: 'Central Reserve',
    release_lat: '47.1234',
    release_lon: '68.5678'
  };

  const birds = [mockBirdWithTx, mockRingOnlyBird];
  const transmitters = [mockTx];

  it('(b) a bird with a transmitter shows its PTT and transmitter status (read-only)', () => {
    const subject = resolveReportSubject('244289', birds, transmitters, 'ar');
    expect(subject.bird?.id).toBe('bird-244289');
    expect(subject.active?.platform_id).toBe('244289');
    expect(subject.display.transmitterId).toBe('244289');
    expect(subject.display.ringNumber).toBe('QA-8821');
    expect(subject.display.mapChipLabel).toBe('244289');
    expect(subject.status.source).toBe('transmitter');
    expect(subject.status.editable).toBe(false);
    expect(subject.status.value).toBe('alive');
  });

  it('(c) a ring-only bird (7751) shows "No Transmitter" and no stale numbers', () => {
    const subjectEn = resolveReportSubject('7751', birds, transmitters, 'en');
    expect(subjectEn.bird?.id).toBe('bird-7751');
    expect(subjectEn.active).toBeUndefined();
    expect(subjectEn.display.transmitterId).toBe('No Transmitter');
    expect(subjectEn.display.ringNumber).toBe('Qatar.Environment 7751');
    expect(subjectEn.display.mapChipLabel).toBe('Qatar.Environment 7751');
    expect(subjectEn.release).toEqual({
      date: '2025-05-20',
      lat: 47.1234,
      lon: 68.5678
    });
    expect(subjectEn.status.source).toBe('bird');
    expect(subjectEn.status.editable).toBe(true);

    const subjectAr = resolveReportSubject({ birdId: 'bird-7751', value: '7751', kind: 'ring' }, birds, transmitters, 'ar');
    expect(subjectAr.display.transmitterId).toBe('بدون جهاز');
  });

  it('(d) selecting by Darvic and by PTT resolve the same bird', () => {
    const byPtt = resolveReportSubject('244289', birds, transmitters);
    const byDarvic = resolveReportSubject('D244', birds, transmitters);
    const byRing = resolveReportSubject('QA-8821', birds, transmitters);

    expect(byPtt.bird?.id).toBe('bird-244289');
    expect(byDarvic.bird?.id).toBe('bird-244289');
    expect(byRing.bird?.id).toBe('bird-244289');
  });
});

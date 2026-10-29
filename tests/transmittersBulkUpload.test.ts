import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { TransmitterRowSchema } from '../src/data/repository/bulkUploadTransmitters';

describe('TransmitterRowSchema', () => {
  it('validates a complete row with reception_date as a year only (e.g. 2024) and Hex ID', () => {
    const rawRow = {
      ptt_id: '244289',
      frequency: '401.650',
      hex_id: '112A3F',
      transmitter_model: 'Solar Argos/GPS PTT',
      manufacturer: 'Microwave Telemetry',
      reception_date: '2024', // Year only (obligatory)
      status: 'Active',
      deployed: 'Yes',
      site_location: 'Al Ain Desert',
      program_region: 'UAE East',
      satellite_time: '10h ON / 24h OFF',
      radio_time: '12:00 - 18:00',
      duty_cycle: '10h ON / 24h OFF',
      weight_g: 22,
      bird_ring_number: 'UA-9982',
      darvic_number: 'DV-104',
      species: 'Houbara Bustard',
      sex: 'M',
      origin: 'Breeding',
      hatch_date: '2023-05-10',
      release_date: '2024-03-15',
      release_lat: 24.12345,
      release_lon: 54.54321,
      notes: 'Test transmitter note'
    };

    const parsed = TransmitterRowSchema.safeParse(rawRow);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.ptt_id).toBe('244289');
    expect(parsed.data.hex_id).toBe('112A3F');
    expect(parsed.data.reception_date).toBe('2024'); // Year only accepted
    expect(parsed.data.status).toBe('Active');
    expect(parsed.data.deployed).toBe(true);
  });

  it('validates reception_date as a full date (YYYY-MM-DD or DD/MM/YYYY)', () => {
    const rowFullDate = {
      ptt_id: '242080',
      transmitter_model: 'GeoTrack 20g',
      reception_date: '15/01/2024',
      status: 'Active'
    };
    const parsed = TransmitterRowSchema.safeParse(rowFullDate);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.reception_date).toBe('2024-01-15');
    }
  });

  it('fails validation when reception_date is missing or empty (obligatory)', () => {
    const rowMissing = {
      ptt_id: '242080',
      transmitter_model: 'GeoTrack 20g',
      status: 'Active'
    };
    const parsed = TransmitterRowSchema.safeParse(rowMissing);
    expect(parsed.success).toBe(false);
  });

  it('verifies that the generated template Excel file matches schema', () => {
    const wb = XLSX.readFile('./public/templates/HBTrack_Transmitters_Bulk_Upload_Template.xlsx');
    expect(wb.SheetNames).toContain('Transmitters');
    expect(wb.SheetNames).toContain('Instructions');

    const sheet = wb.Sheets['Transmitters'];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    expect(rows.length).toBeGreaterThanOrEqual(1);

    const firstRow = rows[0];
    expect(firstRow['ptt_id *']).toBe('244289');
    expect(firstRow['reception_date *']).toBe('2024');
    expect(firstRow['hex_id']).toBe('112A3F');
    expect(firstRow['serial_number']).toBeUndefined(); // Replaced with hex_id
  });
});

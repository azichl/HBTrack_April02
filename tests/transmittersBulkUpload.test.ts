import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { TransmitterRowSchema } from '../src/data/repository/bulkUploadTransmitters';

describe('TransmitterRowSchema', () => {
  it('validates a complete row with all transmitter and bird info including reception_date', () => {
    const rawRow = {
      ptt_id: '244289',
      frequency: '401.650',
      hex_id: '112A3F',
      transmitter_model: 'Solar Argos/GPS PTT',
      manufacturer: 'Microwave Telemetry',
      reception_date: '2024-01-15',
      status: 'Active',
      deployed: 'Yes',
      site_location: 'Al Ain Desert',
      program_region: 'UAE East',
      satellite_time: '10h ON / 24h OFF',
      radio_time: '12:00 - 18:00',
      duty_cycle: '10h ON / 24h OFF',
      serial_number: 'SN-244289',
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
    expect(parsed.data.frequency).toBe('401.650');
    expect(parsed.data.hex_id).toBe('112A3F');
    expect(parsed.data.reception_date).toBe('2024-01-15');
    expect(parsed.data.status).toBe('Active');
    expect(parsed.data.deployed).toBe(true);
    expect(parsed.data.bird_ring_number).toBe('UA-9982');
    expect(parsed.data.darvic_number).toBe('DV-104');
    expect(parsed.data.species).toBe('Houbara Bustard');
    expect(parsed.data.release_lat).toBe(24.12345);
    expect(parsed.data.release_lon).toBe(54.54321);
  });

  it('correctly parses dates formatted in DD/MM/YYYY or as Date objects', () => {
    const rawRow = {
      ptt_id: '242080',
      transmitter_model: 'GeoTrack 20g',
      reception_date: '15/01/2024',
      status: 'Active',
      release_date: '25/03/2024'
    };

    const parsed = TransmitterRowSchema.safeParse(rawRow);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.reception_date).toBe('2024-01-15');
    expect(parsed.data.release_date).toBe('2024-03-25');
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
    expect(firstRow['reception_date']).toBe('2024-01-15');
    expect(firstRow['frequency']).toBe('401.650');
    expect(firstRow['bird_ring_number']).toBe('UA-9982');
  });
});

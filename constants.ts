
import { Alert, Bird, KPI, Position, Transmitter, User } from './types';

// Mock Users
export const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'Abdelaziz CHLIH',
    email: 'admin@houbaratracker.com',
    role: 'Administrator',
    status: 'active',
    lastLogin: new Date().toISOString(),
    permissions: ['view_dashboard', 'view_tracking', 'manage_alerts', 'view_reports', 'manage_database', 'manage_users']
  },
  {
    id: 'u2',
    name: 'Sarah Analyst',
    email: 'sarah@houbaratracker.com',
    role: 'Researcher',
    status: 'active',
    lastLogin: new Date(Date.now() - 86400000).toISOString(),
    permissions: ['view_dashboard', 'view_tracking', 'manage_alerts', 'view_reports', 'manage_database']
  },
  {
    id: 'u3',
    name: 'Field Observer',
    email: 'observer@houbaratracker.com',
    role: 'Field Coordinator',
    status: 'active',
    lastLogin: new Date(Date.now() - 172800000).toISOString(),
    permissions: ['view_dashboard', 'view_tracking', 'manage_transmitters']
  }
];

// Mock Data Generation for Demo
export const MOCK_BIRDS: Bird[] = [
  { id: 'b1', ring_id: 'AE-2023-001', species: 'Houbara Bustard', sex: 'F', hatch_date: '2021-04-12', release_location: 'Al Reem Reserve', release_lat: '24.4500', release_lon: '54.3700' },
  { id: 'b2', ring_id: 'AE-2023-002', species: 'Houbara Bustard', sex: 'M', hatch_date: '2020-05-20', release_location: 'Yazd Protected Area', release_lat: '32.0000', release_lon: '54.0000' },
  { id: 'b3', ring_id: 'AE-2023-005', species: 'Houbara Bustard', sex: 'M', hatch_date: '2022-01-15', release_location: 'Karakum Desert', release_lat: '39.0000', release_lon: '60.0000' },
  { id: 'b4', ring_id: 'AE-2023-009', species: 'Houbara Bustard', sex: 'F', hatch_date: '2021-11-30', release_location: 'Kyzylkum Desert', release_lat: '41.5000', release_lon: '64.0000' },
  { id: 'b5', ring_id: 'AE-2023-010', species: 'Houbara Bustard', sex: 'F', hatch_date: '2021-03-10', release_location: 'Kyzylkum Desert', release_lat: '41.6000', release_lon: '64.2000' },
  { id: 'b6', ring_id: 'AE-2023-012', species: 'Houbara Bustard', sex: 'M', hatch_date: '2020-11-05', release_location: 'Bukhara Region', release_lat: '39.7000', release_lon: '64.4000' },
  { id: 'b7', ring_id: 'AE-2023-015', species: 'Houbara Bustard', sex: 'M', hatch_date: '2022-02-20', release_location: 'Betpak-Dala', release_lat: '46.0000', release_lon: '70.0000' },
  { id: 'b8', ring_id: 'AE-2023-018', species: 'Houbara Bustard', sex: 'F', hatch_date: '2021-08-15', release_location: 'Torgay Region', release_lat: '49.0000', release_lon: '66.0000' },
  { id: 'b9', ring_id: 'AE-2023-021', species: 'Houbara Bustard', sex: 'M', hatch_date: '2020-04-10', release_location: 'Almaty Region', release_lat: '43.2000', release_lon: '76.9000' },
  { id: 'b10', ring_id: 'AE-2023-025', species: 'Houbara Bustard', sex: 'F', hatch_date: '2022-05-01', release_location: 'Balkhash District', release_lat: '46.5000', release_lon: '74.5000' },
  { id: 'b11', ring_id: 'AE-2023-030', species: 'Houbara Bustard', sex: 'M', hatch_date: '2021-01-20', release_location: 'Karaganda Region', release_lat: '49.8000', release_lon: '73.1000' },
];

export const MOCK_TRANSMITTERS: Transmitter[] = [
  { 
    id: 't1', platform_id: '189021', model: 'GeoTrack 20g', status: 'active', bird_id: 'b1', battery_voltage: 3.8, last_fix: new Date().toISOString(), duty_cycle: '8h ON/16h OFF',
    frequency: '401.650', hex_id: '4A2B1', manufacturer: 'Microwave Telemetry', program_region: 'Middle East', site_location: 'Qatar - Al Reem', satellite_time: '08:00 - 16:00', radio_time: 'Enabled', comment: 'Optimal performance', deployed: true
  },
  { 
    id: 't2', platform_id: '189022', model: 'GeoTrack 20g', status: 'active', bird_id: 'b2', battery_voltage: 3.6, last_fix: new Date(Date.now() - 3600000).toISOString(), duty_cycle: '8h ON/16h OFF',
    frequency: '401.650', hex_id: '4A2B2', manufacturer: 'Microwave Telemetry', program_region: 'Middle East', site_location: 'Iran - Yazd', satellite_time: '08:00 - 16:00', radio_time: 'Enabled', comment: 'Battery stable', deployed: true
  },
  { 
    id: 't3', platform_id: '189025', model: 'SolarPTT', status: 'maintenance', bird_id: 'b3', battery_voltage: 3.2, last_fix: new Date(Date.now() - 86400000).toISOString(), duty_cycle: '24h ON',
    frequency: '401.678', hex_id: '4A2C5', manufacturer: 'GeoTrak', program_region: 'Central Asia', site_location: 'Turkmenistan - Karakum', satellite_time: 'Continuous', radio_time: 'Disabled', comment: 'Low voltage warning', deployed: true
  },
  { 
    id: 't4', platform_id: '189029', model: 'SolarPTT', status: 'active', bird_id: 'b4', battery_voltage: 4.1, last_fix: new Date().toISOString(), duty_cycle: '8h ON/16h OFF',
    frequency: '401.650', hex_id: '4A2D9', manufacturer: 'GeoTrak', program_region: 'Central Asia', site_location: 'Uzbekistan - Kyzylkum', satellite_time: '06:00 - 14:00', radio_time: 'Enabled', comment: 'Migrating North', deployed: true
  },
  { 
    id: 't5', platform_id: '189033', model: 'GeoTrack 30g', status: 'active', bird_id: 'b5', battery_voltage: 3.9, last_fix: new Date().toISOString(), duty_cycle: '10h ON/14h OFF',
    frequency: '401.662', hex_id: '4A2E1', manufacturer: 'Microwave Telemetry', program_region: 'Central Asia', site_location: 'Uzbekistan - Navoi', satellite_time: '05:00 - 15:00', radio_time: 'Enabled', comment: '', deployed: true
  },
  { 
    id: 't6', platform_id: '189036', model: 'GeoTrack 20g', status: 'active', bird_id: 'b6', battery_voltage: 3.7, last_fix: new Date().toISOString(), duty_cycle: '8h ON/16h OFF',
    frequency: '401.650', hex_id: '4A2E4', manufacturer: 'Microwave Telemetry', program_region: 'Central Asia', site_location: 'Uzbekistan - Bukhara', satellite_time: '08:00 - 16:00', radio_time: 'Enabled', comment: '', deployed: true
  },
  { 
    id: 't7', platform_id: '189040', model: 'SolarPTT', status: 'active', bird_id: 'b7', battery_voltage: 4.0, last_fix: new Date().toISOString(), duty_cycle: '12h ON/12h OFF',
    frequency: '401.678', hex_id: '4A2F8', manufacturer: 'GeoTrak', program_region: 'Central Asia', site_location: 'Kazakhstan - Betpak-Dala', satellite_time: '06:00 - 18:00', radio_time: 'Disabled', comment: 'Strong signal', deployed: true
  },
  { 
    id: 't8', platform_id: '189045', model: 'GeoTrack 20g', status: 'inactive', bird_id: 'b8', battery_voltage: 0.0, last_fix: new Date(Date.now() - 100000000).toISOString(), duty_cycle: '8h ON/16h OFF',
    frequency: '401.650', hex_id: '4A3A1', manufacturer: 'Microwave Telemetry', program_region: 'Central Asia', site_location: 'Kazakhstan - Torgay', satellite_time: 'Off', radio_time: 'Off', comment: 'Lost signal 3 months ago', deployed: true
  },
  { 
    id: 't9', platform_id: '189050', model: 'SolarPTT', status: 'active', bird_id: 'b9', battery_voltage: 3.8, last_fix: new Date().toISOString(), duty_cycle: '24h ON',
    frequency: '401.678', hex_id: '4A3B5', manufacturer: 'GeoTrak', program_region: 'Central Asia', site_location: 'Kazakhstan - Almaty', satellite_time: 'Continuous', radio_time: 'Enabled', comment: '', deployed: true
  },
  { 
    id: 't10', platform_id: '189055', model: 'GeoTrack 30g', status: 'active', bird_id: 'b10', battery_voltage: 3.5, last_fix: new Date().toISOString(), duty_cycle: '8h ON/16h OFF',
    frequency: '401.662', hex_id: '4A3C2', manufacturer: 'Microwave Telemetry', program_region: 'Central Asia', site_location: 'Kazakhstan - Balkhash', satellite_time: '08:00 - 16:00', radio_time: 'Enabled', comment: 'Voltage fluctuating', deployed: true
  },
  { 
    id: 't11', platform_id: '189060', model: 'SolarPTT', status: 'active', bird_id: 'b11', battery_voltage: 4.2, last_fix: new Date().toISOString(), duty_cycle: '12h ON/12h OFF',
    frequency: '401.678', hex_id: '4A3D7', manufacturer: 'GeoTrak', program_region: 'Central Asia', site_location: 'Kazakhstan - Karaganda', satellite_time: '06:00 - 18:00', radio_time: 'Disabled', comment: 'New deployment', deployed: true
  },
];

export const MOCK_ALERTS: Alert[] = [
  { id: 'a1', type: 'geofence', severity: 'critical', transmitter_id: 't1', bird_name: 'AE-2023-001', message: 'Exited "Breeding Zone A"', timestamp: new Date().toISOString(), status: 'active' },
  { id: 'a2', type: 'battery_low', severity: 'warning', transmitter_id: 't3', bird_name: 'AE-2023-005', message: 'Battery below 3.3V', timestamp: new Date(Date.now() - 7200000).toISOString(), status: 'active' },
  { id: 'a3', type: 'speed_anomaly', severity: 'info', transmitter_id: 't2', bird_name: 'AE-2023-002', message: 'Speed > 80km/h detected (flight?)', timestamp: new Date(Date.now() - 14000000).toISOString(), status: 'acknowledged' },
];

export const MOCK_KPI: KPI = {
  activeTransmitters: 12,
  birdsTracked: 45,
  alerts24h: 3,
  ingestionLatency: '14 min'
};

// Helper to generate random positions for map
export const generatePositions = (count: number): Position[] => {
  const positions: Position[] = [];
  const baseLat = 24.4539;
  const baseLon = 54.3773; // Abu Dhabi roughly

  for (let i = 0; i < count; i++) {
    positions.push({
      id: `pos-${i}`,
      transmitter_id: 't1',
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      lat: baseLat + (Math.random() - 0.5) * 2,
      lon: baseLon + (Math.random() - 0.5) * 2,
      lc: Math.random() > 0.8 ? '3' : Math.random() > 0.5 ? '2' : '1',
      is_kalman: true,
      speed_kmh: Math.random() * 60,
      course: Math.floor(Math.random() * 360),
      satellite: 'NOAA-19'
    });
  }
  return positions;
};

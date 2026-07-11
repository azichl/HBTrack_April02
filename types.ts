
export type Role = 'Administrator' | 'Researcher' | 'Field Coordinator' | 'Data Entry' | 'Viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  status: 'active' | 'inactive';
  lastLogin?: string;
  permissions: string[]; // List of accessible modules/actions
}

export interface Bird {
  id: string;
  ring_id: string;
  // Name field removed
  species: string; // e.g., "Houbara Bustard"
  sex: 'M' | 'F';
  hatch_date: string;
  release_location: string; // Maps to "Release Site"
  release_lat: string;
  release_lon: string;
}

export interface Transmitter {
  id: string;
  platform_id: string; // PTT ID
  model: string;
  status: 'active' | 'inactive' | 'maintenance';
  bird_id: string;
  battery_voltage?: number; // Optional now
  last_fix: string; // ISO Date
  duty_cycle: string; // e.g., "8h ON / 16h OFF"
  // New fields for detailed table
  frequency?: string;
  hex_id?: string;
  manufacturer?: string;
  program_region?: string;
  site_location?: string;
  satellite_time?: string;
  radio_time?: string;
  comment?: string;
  deployed?: boolean;
}

export interface Position {
  id: string;
  transmitter_id: string;
  timestamp: string;
  lat: number;
  lon: number;
  lc: '3' | '2' | '1' | '0' | 'A' | 'B' | 'Z';
  is_kalman: boolean;
  speed_kmh: number;
  course: number;
  satellite: string;
  locationType?: 'GPS' | 'Doppler'; // Added field
}

export interface Alert {
  id: string;
  type: 'geofence' | 'border' | 'distance' | 'battery_low' | 'no_fix' | 'speed_anomaly' | 'temp_anomaly' | 'ticket_created';
  severity: 'critical' | 'warning' | 'info';
  transmitter_id?: string;
  bird_name?: string;
  message: string;
  timestamp: string;
  status: 'active' | 'acknowledged' | 'resolved';
  location?: { lat: number; lon: number };
}

export interface KPI {
  activeTransmitters: number;
  birdsTracked: number;
  alerts24h: number;
  ingestionLatency: string;
}

// 1. retrieve-bulk & retrieve-realtime
export interface ArgosMessage {
  id: string;
  programId: string;
  platformId: string;
  timestamp: string;
  lat: string;
  lon: string;
  lc: string;
  msgType: string;
  satellite: string;
  rawData?: string;
  locationType?: string;
  dopplerError?: string;
}

// 2. retrieve-device-list
export interface ArgosDevice {
  deviceRef: string;
  programRef: string;
  manufacturer: string;
  model: string;
  active: boolean;
  transType: string;
  deployDate?: string;
}

// 3. retrieve-doppler
export interface ArgosDoppler {
  id: string;
  platformId: string;
  programId: string;
  timestamp: string;
  satellite: string;
  frequency: number;
  locationClass: string;
  lat: number;
  lon: number;
  errorRadius: number;
}

// 4. retrieve-bulk-count
export interface ArgosCount {
  id: string;
  platformId: string;
  count: number;
  periodStart: string;
  periodEnd: string;
}

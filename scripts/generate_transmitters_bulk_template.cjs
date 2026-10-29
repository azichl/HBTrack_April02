const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const headers = [
  'ptt_id *',
  'frequency',
  'hex_id',
  'transmitter_model *',
  'manufacturer',
  'reception_date *',
  'status *',
  'deployed',
  'site_location',
  'program_region',
  'satellite_time',
  'radio_time',
  'duty_cycle',
  'weight_g',
  'bird_ring_number',
  'darvic_number',
  'species',
  'sex',
  'origin',
  'hatch_date',
  'release_date',
  'release_lat',
  'release_lon',
  'notes'
];

const exampleRow = [
  '244289',
  '401.650',
  '112A3F',
  'Solar Argos/GPS PTT',
  'Microwave Telemetry',
  '2024',
  'Active',
  'Yes',
  'Al Ain Desert',
  'UAE East',
  '10h ON / 24h OFF',
  '12:00 - 18:00',
  '10h ON / 24h OFF',
  22,
  'UA-9982',
  'DV-104',
  'Houbara Bustard',
  'M',
  'Breeding',
  '2023-05-10',
  '2024-03-15',
  24.12345,
  54.54321,
  'Example row - replace with your data'
];

const instructionsData = [
  ['HBTrack — Transmitters & Birds Bulk Upload Instructions'],
  ['This template allows uploading transmitters and automatically linking or creating associated bird profiles.'],
  [''],
  ['Column Name', 'Required', 'Format / Allowed Values', 'Description'],
  ['ptt_id', 'YES', '3-10 digits (e.g. 244289)', 'Unique platform ID of the transmitter.'],
  ['frequency', 'No', 'Number/Text (e.g. 401.650)', 'Transmission frequency in MHz.'],
  ['hex_id', 'No', 'Hexadecimal (e.g. 112A3F)', 'Argos Hex ID (optional, replaces serial number).'],
  ['transmitter_model', 'YES', 'Text (e.g. Solar Argos/GPS PTT, GeoTrack 20g)', 'Model of the transmitter.'],
  ['manufacturer', 'No', 'Text (e.g. Microwave Telemetry, North Star)', 'Origin company / manufacturer.'],
  ['reception_date', 'YES (Obligatory)', 'Year (e.g. 2024) or YYYY-MM-DD (e.g. 2024-01-15)', 'Reception date: accepts 4-digit year only (e.g. 2024) or full date.'],
  ['status', 'YES', 'Active | Inactive | Dead | Static test | Potential Mortality', 'Operational status of the transmitter.'],
  ['deployed', 'No', 'Yes | No (or true / false)', 'Whether the device is currently deployed on a bird.'],
  ['site_location', 'No', 'Text (e.g. Al Ain Desert)', 'Deployment site location.'],
  ['program_region', 'No', 'Text (e.g. UAE East, Central Saudi Arabia)', 'Operational program region.'],
  ['satellite_time', 'No', 'Text (e.g. 10h ON / 24h OFF, Continuous)', 'Satellite transmission schedule/cycle.'],
  ['radio_time', 'No', 'Text (e.g. 12:00 - 18:00, None)', 'VHF radio beacon transmission time.'],
  ['duty_cycle', 'No', 'Text (e.g. 10h ON / 24h OFF)', 'Transmission schedule duty cycle.'],
  ['weight_g', 'No', 'Number (e.g. 22)', 'Weight of device in grams.'],
  ['bird_ring_number', 'No', 'Text (e.g. UA-9982)', 'Ring ID of existing bird to link, or new bird to register.'],
  ['darvic_number', 'No', 'Text (e.g. DV-104)', 'Colored darvic ring/band code.'],
  ['species', 'No', 'Text (e.g. Houbara Bustard)', 'Bird species (defaults to Houbara Bustard).'],
  ['sex', 'No', 'M | F', 'Bird gender/sex.'],
  ['origin', 'No', 'Wild | Breeding', 'Origin of the bird.'],
  ['hatch_date', 'No', 'YYYY-MM-DD (e.g. 2023-05-10)', 'Hatch date of bird.'],
  ['release_date', 'No', 'YYYY-MM-DD (e.g. 2024-03-15)', 'Release date of bird / deployment date.'],
  ['release_lat', 'No', 'Decimal (-90.0 to 90.0)', 'Release site latitude.'],
  ['release_lon', 'No', 'Decimal (-180.0 to 180.0)', 'Release site longitude.'],
  ['notes', 'No', 'Text', 'Comments and notes about the transmitter and bird.']
];

const wb = XLSX.utils.book_new();

// Transmitters Sheet
const wsTransmitters = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
wsTransmitters['!cols'] = [
  { wch: 14 }, // ptt_id *
  { wch: 12 }, // frequency
  { wch: 12 }, // hex_id
  { wch: 24 }, // transmitter_model *
  { wch: 22 }, // manufacturer
  { wch: 18 }, // reception_date *
  { wch: 14 }, // status *
  { wch: 12 }, // deployed
  { wch: 18 }, // site_location
  { wch: 18 }, // program_region
  { wch: 20 }, // satellite_time
  { wch: 16 }, // radio_time
  { wch: 18 }, // duty_cycle
  { wch: 12 }, // weight_g
  { wch: 18 }, // bird_ring_number
  { wch: 16 }, // darvic_number
  { wch: 20 }, // species
  { wch: 8 },  // sex
  { wch: 12 }, // origin
  { wch: 14 }, // hatch_date
  { wch: 14 }, // release_date
  { wch: 14 }, // release_lat
  { wch: 14 }, // release_lon
  { wch: 35 }, // notes
];

// Instructions Sheet
const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
wsInstructions['!cols'] = [
  { wch: 22 },
  { wch: 18 },
  { wch: 45 },
  { wch: 65 }
];

XLSX.utils.book_append_sheet(wb, wsTransmitters, 'Transmitters');
XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

const publicDest = path.join(__dirname, '../public/templates/HBTrack_Transmitters_Bulk_Upload_Template.xlsx');
const distDest = path.join(__dirname, '../dist/templates/HBTrack_Transmitters_Bulk_Upload_Template.xlsx');

fs.mkdirSync(path.dirname(publicDest), { recursive: true });
XLSX.writeFile(wb, publicDest);
console.log('Saved template to:', publicDest);

if (fs.existsSync(path.dirname(distDest))) {
  XLSX.writeFile(wb, distDest);
  console.log('Saved template to:', distDest);
}

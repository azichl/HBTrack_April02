const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Exact headers matching Image 3 with serial_number replaced by hex_id (optional) and reception_date * (obligatory)
const headers = [
  'ptt_id *',
  'transmitter_model *',
  'manufacturer',
  'hex_id',
  'reception_date *',
  'weight_g',
  'status *',
  'duty_cycle',
  'deployment_date',
  'bird_ring_number',
  'species',
  'sex',
  'origin',
  'release_lat',
  'release_lon',
  'notes'
];

const exampleRow = [
  '244289',
  'Solar Argos/GPS PTT',
  'Microwave Telemetry',
  '112A3F',
  '2024',
  22,
  'Active',
  '10h ON / 24h OFF',
  '2024-03-15',
  'UA-9982',
  'Houbara Bustard',
  'M',
  'Breeding',
  24.12345,
  54.54321,
  'Example row - replace with your data'
];

const instructionsData = [
  ['HBTrack — Transmitters Bulk Upload Instructions'],
  [''],
  ['Column Name', 'Required', 'Format / Allowed Values', 'Description'],
  ['ptt_id', 'YES', '3-10 digits (e.g. 244289)', 'Unique platform ID of the transmitter.'],
  ['transmitter_model', 'YES', 'Text (e.g. Solar Argos/GPS PTT)', 'Transmitter model.'],
  ['manufacturer', 'No', 'Text (e.g. Microwave Telemetry, North Star)', 'Manufacturer name.'],
  ['hex_id', 'No', 'Hexadecimal (e.g. 112A3F)', 'Argos Hex ID (optional, replaces serial number).'],
  ['reception_date', 'YES', 'Year (e.g. 2024) or YYYY-MM-DD', 'Date transmitter was received (obligatory, can accept only year).'],
  ['weight_g', 'No', 'Number (e.g. 22)', 'Weight in grams.'],
  ['status', 'YES', 'Active | Inactive | Dead | Static test', 'Device status.'],
  ['duty_cycle', 'No', 'Text (e.g. 10h ON / 24h OFF)', 'Transmission schedule.'],
  ['deployment_date', 'No', 'YYYY-MM-DD', 'Date deployed.'],
  ['bird_ring_number', 'No', 'Text', 'Ring number of existing bird to link with.'],
  ['species', 'No', 'Text', 'Default: Houbara Bustard.'],
  ['sex', 'No', 'M or F', 'Bird gender.'],
  ['origin', 'No', 'Wild or Breeding', 'Bird origin.'],
  ['release_lat', 'No', 'Decimal (-90.0 to 90.0)', 'Release latitude.'],
  ['release_lon', 'No', 'Decimal (-180.0 to 180.0)', 'Release longitude.'],
  ['notes', 'No', 'Text', 'Additional comments.']
];

const wb = XLSX.utils.book_new();

// Transmitters Sheet
const wsTransmitters = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
wsTransmitters['!cols'] = [
  { wch: 14 }, // ptt_id *
  { wch: 24 }, // transmitter_model *
  { wch: 22 }, // manufacturer
  { wch: 14 }, // hex_id
  { wch: 18 }, // reception_date *
  { wch: 12 }, // weight_g
  { wch: 14 }, // status *
  { wch: 18 }, // duty_cycle
  { wch: 16 }, // deployment_date
  { wch: 18 }, // bird_ring_number
  { wch: 20 }, // species
  { wch: 8 },  // sex
  { wch: 12 }, // origin
  { wch: 14 }, // release_lat
  { wch: 14 }, // release_lon
  { wch: 35 }, // notes
];

// Instructions Sheet
const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
wsInstructions['!cols'] = [
  { wch: 22 },
  { wch: 12 },
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

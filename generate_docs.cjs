const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const docs = [
  {
    filename: 'HoubaraTracker_User_Manual_v2.pdf',
    title: 'HoubaraTracker v2.1 - User Manual',
    sections: [
      { h: '1. Introduction', p: 'Welcome to HoubaraTracker v2.1. This platform provides real-time satellite tracking, GEE spatial analysis, and advanced management for the Asian Houbara Bustard.' },
      { h: '2. Dashboard & KPIs', p: 'The Dashboard displays real-time key performance indicators including Total Active Transmitters, Birds Tracked, Alerts in the last 24h, and Ingestion Latency from the Argos satellite system. Visual charts display fleet activity and anomaly breakdowns.' },
      { h: '3. Live Tracking Module', p: 'This module utilizes a Leaflet map integrated with ESRI satellite imagery. You can toggle map layers such as NDVI, SAVI, and LST. The map shows bird positions and generates popups with exact telemetry data.' },
      { h: '4. Alerts Management', p: 'Alerts are generated automatically for specific anomalies: Distance covered between fixes, geofence breaches, and border crossings. You can acknowledge or resolve these alerts directly.' }
    ]
  },
  {
    filename: 'Argos_Satellite_System_Guide_v2.pdf',
    title: 'Argos Satellite System - Technical Guide',
    sections: [
      { h: '1. Argos System Overview', p: 'The Argos system collects environmental data from autonomous platforms worldwide. In HoubaraTracker, it is used to track the geographic coordinates of deployed PTTs (Platform Transmitter Terminals).' },
      { h: '2. Data Ingestion Pipeline', p: 'Data is fetched via the Argos SOAP/REST API and pushed to the Firebase backend. Messages include GPS location, Doppler shift data, battery voltage, and activity counters.' },
      { h: '3. Location Classes (LC)', p: 'Argos assigns a Location Class to each fix indicating accuracy: LC 3 (< 250m), LC 2 (< 500m), LC 1 (< 1500m), LC 0 (> 1500m), and LC A, B, Z for no accuracy estimation.' }
    ]
  },
  {
    filename: 'Asian_Houbara_Field_Guide_v2.pdf',
    title: 'Asian Houbara (Chlamydotis macqueenii) - Field Guide',
    sections: [
      { h: '1. Species Overview', p: 'The Asian Houbara is a large bird in the bustard family. It breeds in deserts and semi-deserts across Asia, from the Sinai Peninsula east to Mongolia, and winters in the Arabian Peninsula and Southwest Asia.' },
      { h: '2. Habitat Requirements', p: 'They prefer arid regions with sparse vegetation. The HoubaraTracker uses Google Earth Engine to calculate SAVI (Soil Adjusted Vegetation Index) which is critical for identifying optimal habitats.' },
      { h: '3. Migration Patterns', p: 'Using satellite telemetry, we track three main migration corridors. The birds exhibit high site fidelity, often returning to the exact same breeding and wintering grounds annually.' }
    ]
  },
  {
    filename: 'GEE_Analysis_Technical_Reference_v2.pdf',
    title: 'Google Earth Engine (GEE) - Technical Reference',
    sections: [
      { h: '1. Integration Overview', p: 'HoubaraTracker integrates directly with the Google Earth Engine API to process satellite imagery (Sentinel-2, Landsat 8) in real-time to overlay environmental indices.' },
      { h: '2. NDVI (Normalized Difference Vegetation Index)', p: 'Calculated as (NIR - Red) / (NIR + Red). Used to assess the presence of live green vegetation.' },
      { h: '3. SAVI (Soil Adjusted Vegetation Index)', p: 'Calculated as ((NIR - Red) / (NIR + Red + L)) * (1 + L) where L = 0.5. SAVI is specifically used in our desert contexts to minimize the influence of soil brightness.' },
      { h: '4. LST (Land Surface Temperature)', p: 'Derived from Thermal Infrared sensor data, LST provides the temperature of the ground surface, helping to track the thermal stress on the birds.' }
    ]
  },
  {
    filename: 'Transmitter_Deployment_Protocol_v2.pdf',
    title: 'Transmitter Deployment Protocol',
    sections: [
      { h: '1. Pre-deployment Checklist', p: 'Ensure the PTT battery is fully charged (minimum 3.8V). Register the Transmitter ID and Hex Code in the HoubaraTracker database before field deployment.' },
      { h: '2. Harnessing Technique', p: 'Use a Teflon ribbon harness (backpack style). Ensure a snug fit that allows two fingers to pass under the ribbon at the breast. The total weight of the transmitter and harness must not exceed 3% of the bird\'s body weight.' },
      { h: '3. Activation', p: 'Remove the magnetic switch to activate the transmitter. Monitor the initial Argos passes on the HoubaraTracker "Live Tracking" view to confirm successful data transmission before release.' }
    ]
  },
  {
    filename: 'Conservation_Status_Report_2024_v2.pdf',
    title: 'Asian Houbara Conservation Status 2024',
    sections: [
      { h: '1. Executive Summary', p: 'The 2024 report highlights a stabilization in specific managed populations of the Asian Houbara, though the global trend remains vulnerable due to poaching and habitat loss.' },
      { h: '2. Tracking Outcomes', p: 'Data from HoubaraTracker shows that 85% of tracked birds successfully completed their spring migration. Survival rates in protected wintering zones increased by 12% compared to 2023.' },
      { h: '3. Threat Analysis', p: 'Illegal hunting and unregulated development in the wintering grounds continue to be the primary threats. Geofencing alerts in the platform have helped intercept 4 high-risk movements.' }
    ]
  },
  {
    filename: 'API_Documentation_v2.pdf',
    title: 'HoubaraTracker REST API Documentation',
    sections: [
      { h: '1. Authentication', p: 'All API requests require a Bearer token in the Authorization header. Tokens are generated via Firebase Auth and have a TTL of 1 hour.' },
      { h: '2. Endpoints: Transmitters', p: 'GET /api/v1/transmitters - Retrieves all active transmitters.\nPOST /api/v1/transmitters - Registers a new PTT.' },
      { h: '3. Endpoints: Positions', p: 'GET /api/v1/positions?birdId={id} - Retrieves the location history for a specific bird. Supports parameters: startDate, endDate, limit.' },
      { h: '4. Rate Limiting', p: 'The API is rate-limited to 100 requests per minute per IP address to prevent abuse and manage Argos API quotas.' }
    ]
  }
];

const outDir = path.join(__dirname, 'public', 'resources');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

docs.forEach(docData => {
  const doc = new PDFDocument({ margin: 50 });
  const outPath = path.join(outDir, docData.filename);
  doc.pipe(fs.createWriteStream(outPath));

  // Header
  doc.fontSize(24).fillColor('#c2410c').text(docData.title, { align: 'center' });
  doc.moveDown(2);

  // Content
  docData.sections.forEach(sec => {
    doc.fontSize(16).fillColor('#1e293b').text(sec.h);
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#475569').text(sec.p, { lineGap: 4, align: 'justify' });
    doc.moveDown(1.5);
  });

  // Footer
  doc.fontSize(10).fillColor('#94a3b8').text('Generated by HoubaraTracker System', 50, 700, { align: 'center', width: 500 });

  doc.end();
  console.log(`Generated ${docData.filename}`);
});

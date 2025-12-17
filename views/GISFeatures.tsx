
import React, { useState } from 'react';
import { FileUp, Download, FileCode, AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react';
import JSZip from 'jszip';
import readXlsxFile from 'read-excel-file';

interface GPSPoint {
  deviceId: string;
  lat: number;
  lon: number;
  timestamp: Date;
}

export const GISFeatures = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
    }
  };

  // Helper to read file safely using FileReader
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) resolve(e.target.result as string);
        else reject(new Error("File read failed: No result"));
      };
      reader.onerror = () => {
        reject(new Error("The requested file could not be read. Please ensure the file is not open in another application (like Excel) and try again."));
      };
      reader.readAsText(file);
    });
  };

  const parseCSV = (text: string): GPSPoint[] => {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    
    const idIndex = headers.findIndex(h => h.includes('Device ID'));
    const latIndex = headers.findIndex(h => h.includes('Latitude'));
    const lonIndex = headers.findIndex(h => h.includes('Longitude'));
    const dateIndex = headers.findIndex(h => h.includes('Location date'));

    if (idIndex === -1 || latIndex === -1 || lonIndex === -1 || dateIndex === -1) {
      throw new Error("Missing required columns in CSV: Device ID, Latitude, Longitude, Location date (UTC)");
    }

    const points: GPSPoint[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Simple CSV split handling quotes
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.replace(/^"|"$/g, '').trim());
      
      if (parts.length <= Math.max(idIndex, latIndex, lonIndex, dateIndex)) continue;

      const lat = parseFloat(parts[latIndex]);
      const lon = parseFloat(parts[lonIndex]);
      const dateStr = parts[dateIndex];

      if (!isNaN(lat) && !isNaN(lon) && dateStr) {
        points.push({
          deviceId: parts[idIndex],
          lat,
          lon,
          timestamp: new Date(dateStr)
        });
      }
    }
    return points;
  };

  const parseExcel = async (file: File): Promise<GPSPoint[]> => {
    try {
      const rows = await readXlsxFile(file);
      if (rows.length < 2) return [];

      const headers = rows[0].map((h: any) => String(h).trim());
      
      const idIndex = headers.findIndex(h => h.includes('Device ID'));
      const latIndex = headers.findIndex(h => h.includes('Latitude'));
      const lonIndex = headers.findIndex(h => h.includes('Longitude'));
      const dateIndex = headers.findIndex(h => h.includes('Location date'));

      if (idIndex === -1 || latIndex === -1 || lonIndex === -1 || dateIndex === -1) {
        throw new Error("Missing required columns in Excel: Device ID, Latitude, Longitude, Location date (UTC)");
      }

      const points: GPSPoint[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const idVal = row[idIndex];
        const latVal = row[latIndex];
        const lonVal = row[lonIndex];
        const dateVal = row[dateIndex];

        // Excel might return numbers directly
        const lat = typeof latVal === 'number' ? latVal : parseFloat(String(latVal));
        const lon = typeof lonVal === 'number' ? lonVal : parseFloat(String(lonVal));
        
        let timestamp: Date | null = null;
        if (dateVal instanceof Date) {
          timestamp = dateVal;
        } else if (typeof dateVal === 'string') {
          timestamp = new Date(dateVal);
        }

        if (idVal && !isNaN(lat) && !isNaN(lon) && timestamp && !isNaN(timestamp.getTime())) {
          points.push({
            deviceId: String(idVal),
            lat,
            lon,
            timestamp
          });
        }
      }
      return points;
    } catch (err: any) {
      // Catch read errors specific to Excel parsing or file access
      if (err.message && err.message.includes("read")) {
         throw new Error("Could not read the Excel file. Please close it in Excel and try again.");
      }
      throw err;
    }
  };

  const generateKMLContent = (deviceId: string, points: GPSPoint[]) => {
    // Sort by time (oldest to newest)
    const sortedPoints = points.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>GPS Track Export ${deviceId}</name>
`;
    
    const footer = `</Document>\n</kml>`;

    // Track LineString
    // KML coordinates are lon,lat
    const coords = sortedPoints.map(p => `    ${p.lon},${p.lat}`).join('\n');
    const track = `  <Placemark>
    <name>Track</name>
    <LineString>
      <coordinates>
${coords}
      </coordinates>
    </LineString>
  </Placemark>
`;

    // Points
    const placemarks = sortedPoints.map(p => `  <Placemark>
    <name>${p.timestamp.toISOString()}</name>
    <Point><coordinates>${p.lon},${p.lat}</coordinates></Point>
  </Placemark>`).join('\n');

    // Last Position Folder
    const last = sortedPoints[sortedPoints.length - 1];
    const lastFolder = `  <Folder>
    <name>Last Position</name>
    <Placemark>
      <name>Latest: ${last.timestamp.toISOString()}</name>
      <Point><coordinates>${last.lon},${last.lat}</coordinates></Point>
    </Placemark>
  </Folder>
`;

    return header + track + placemarks + lastFolder + footer;
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      let points: GPSPoint[] = [];

      if (file.name.endsWith('.csv')) {
        const text = await readFileAsText(file);
        points = parseCSV(text);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        points = await parseExcel(file);
      } else {
        throw new Error("Unsupported file type. Please upload .csv, .xlsx, or .xls");
      }

      if (points.length === 0) {
        throw new Error("No valid GPS data found in file. Check column names.");
      }

      // Group by Device ID
      const groups: Record<string, GPSPoint[]> = {};
      points.forEach(p => {
        if (!groups[p.deviceId]) groups[p.deviceId] = [];
        groups[p.deviceId].push(p);
      });

      // Create ZIP
      const zip = new JSZip();
      
      Object.entries(groups).forEach(([deviceId, devicePoints]) => {
        const kml = generateKMLContent(deviceId, devicePoints);
        zip.file(`${deviceId}_positions.kml`, kml);
      });

      const content = await zip.generateAsync({ type: "blob" });
      
      // Trigger download
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = "DeviceID_KMLs.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(`Success! Processed ${points.length} points for ${Object.keys(groups).length} devices.`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process file");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-900">GIS Features</h2>
          <p className="text-gray-500 text-[12px] mt-1">Geospatial data utilities and converters.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Converter Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="p-2 bg-brand-50 rounded-lg text-brand-600">
              <FileCode size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">GPS to KML Converter</h3>
              <p className="text-[12px] text-gray-500">Convert raw CSV/Excel logs to Google Earth KML tracks</p>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-[12px]">
              <p className="font-semibold text-gray-700 mb-2 text-[14px]">Required Columns:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 font-mono text-[12px]">
                <li>Device ID</li>
                <li>Latitude</li>
                <li>Longitude</li>
                <li>Location date (UTC)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label className="block text-[14px] font-medium text-gray-700">Upload File (CSV/Excel)</label>
              <div className="flex items-center gap-4">
                <label className="flex-1 cursor-pointer">
                  <div className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-brand-400 hover:bg-brand-50 transition-colors group">
                    {file && (file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) ? (
                        <FileSpreadsheet size={32} className="text-green-600 mb-2" />
                    ) : (
                        <FileUp size={32} className="text-gray-400 group-hover:text-brand-500 mb-2" />
                    )}
                    <span className="text-[12px] text-gray-500 group-hover:text-brand-600">
                      {file ? file.name : 'Click or Drag file here'}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-1">Supports .csv, .xlsx, .xls</span>
                  </div>
                  <input 
                    type="file" 
                    accept=".csv, .xlsx, .xls" 
                    className="hidden" 
                    onChange={handleFileChange} 
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 text-[12px] text-green-600 bg-green-50 p-3 rounded-lg border border-green-100">
                <CheckCircle size={16} /> {success}
              </div>
            )}

            <button 
              onClick={handleConvert}
              disabled={!file || isProcessing}
              className={`w-full py-3 rounded-lg text-[14px] font-bold text-white flex items-center justify-center gap-2 transition-colors ${
                !file || isProcessing 
                  ? 'bg-gray-300 cursor-not-allowed' 
                  : 'bg-brand-600 hover:bg-brand-700 shadow-md hover:shadow-lg'
              }`}
            >
              {isProcessing ? (
                <>Processing...</>
              ) : (
                <>
                  <Download size={18} /> Convert & Download ZIP
                </>
              )}
            </button>
          </div>
        </div>

        {/* Info / Future Tools */}
        <div className="flex flex-col gap-6">
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-6">
                <h3 className="text-blue-800 font-bold mb-2 text-[16px]">How it works</h3>
                <p className="text-[12px] text-blue-600 mb-4 leading-relaxed">
                    This tool processes your telemetry data locally in your browser. It groups data points by <strong>Device ID</strong>, sorts them chronologically, and generates a separate KML file for each device containing the movement track and waypoints.
                </p>
                <p className="text-[12px] text-blue-600 leading-relaxed">
                    Finally, all KML files are compressed into a single ZIP archive for easy download and use in Google Earth Pro.
                </p>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 border-dashed flex flex-col items-center justify-center p-12 text-center flex-1">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                    <FileCode size={24} className="text-gray-400" />
                </div>
                <h3 className="text-gray-500 font-semibold text-[14px]">More Tools Coming Soon</h3>
                <p className="text-[12px] text-gray-400 mt-1">Shapefile converter, GeoJSON utilities, etc.</p>
            </div>
        </div>
      </div>
    </div>
  );
};

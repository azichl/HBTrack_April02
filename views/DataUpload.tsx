import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle, Database, FileText, Server, Globe, Key, RefreshCw, ShieldCheck, Activity, User, Lock, Play, Table as TableIcon, Download, ToggleLeft, ToggleRight, Link as LinkIcon, List, Clock, BarChart3, Wifi, Layers, Globe2, AlertTriangle, Calendar, Link2, FileType, Radio, Info, HelpCircle, FileDown, ChevronDown, X } from 'lucide-react';
import { HoubaraIcon } from '../components/HoubaraIcon';
import { useAppStore } from '../store/appStore';
import { ArgosMessage, ArgosDevice, ArgosDoppler, ArgosCount, Transmitter, Bird as BirdType } from '../types';
import { exportToCSV } from '../utils/csvExport';
import readXlsxFile from 'read-excel-file';
import { formatDateTime, isValidCoordinate, safeParseTimestamp, normalizePttId, classifyLocationType, makeDeterministicFixDocId } from '../utils/formatting';
import { buildFixes, type RawFix, type Fix } from '../utils/positionsEngine';
import { mapArgosApiData, mapArgosDevices, extractLocationDate, fetchArgosPositions, fetchArgosBulkData } from '../services/argosService';
import { API_OPERATIONS, opById, ApiOperation as RegistryApiOperation, OpId } from '../src/data/api/apiOperations';
import { mapClsPositions } from '../src/data/positions/clsPositionsMapper';
import { maskSecrets, classifyResponse, ClsApiError } from '../utils/clsApiClient';
import { messagesToRawFixes } from '../utils/messagesToRawFixes';

// --- HELPERS ---

const maskSensitive = (str: string): string => {
    if (!str) return str;
    return maskSecrets(str);
};

const mapArgosDoppler = (apiData: any[]): ArgosDoppler[] => {
    if (!Array.isArray(apiData)) return [];
    return apiData.map((item: any) => ({
        id: `doppler-${Math.random().toString(36).substr(2,9)}`,
        platformId: item.deviceRef || item.platformId || 'Unknown',
        programId: item.programRef || item.programId || 'Unknown',
        timestamp: item.dopplerDatetime || item.date || new Date().toISOString(),
        satellite: item.kineisMetadata?.sat || 'UNK',
        frequency: item.kineisMetadata?.freq || 0,
        locationClass: item.dopplerLocClass || 'Z',
        lat: item.dopplerLocLat || 0,
        lon: item.dopplerLocLon || 0,
        errorRadius: item.dopplerLocErrorRadius || 0
    }));
};

export type ApiOperation = 'retrieve-positions' | 'retrieve-positions-fallback' | 'retrieve-bulk' | 'retrieve-realtime' | 'retrieve-device-list' | 'retrieve-doppler' | 'retrieve-bulk-count';
const opIdMap: Record<ApiOperation, OpId> = {
    'retrieve-positions': 'positions',
    'retrieve-positions-fallback': 'positionsFallback',
    'retrieve-bulk': 'bulkMessages',
    'retrieve-realtime': 'realtimeCheckpoint',
    'retrieve-device-list': 'deviceInventory',
    'retrieve-doppler': 'dopplerData',
    'retrieve-bulk-count': 'messageCountCheck',
};
type UploadType = 'transmitters' | 'birds' | 'argos_data';

const generateMockArgosData = (operation: ApiOperation): any[] => {
    if (operation === 'retrieve-positions' || operation === 'retrieve-positions-fallback') {
        return [
            { 'Device ID': '43571', 'Unit type': 'Houbara', 'Location class': null, 'Location type': 'GPS', 'Doppler Error radius (m)': 0, 'Location date': '2026-10-18 03:00:00', Longitude: 74.5123, Latitude: 43.1 },
            { 'Device ID': '43571', 'Unit type': 'Houbara', 'Location class': 'B', 'Location type': 'Doppler', 'Doppler Error radius (m)': 1970, 'Location date': '2026-10-18 03:41:42.003', Longitude: 74.52, Latitude: 43.11 }
        ];
    }
    if (operation === 'retrieve-device-list') {
        return [
            { deviceRef: '189021', programRef: 'PROG-01', manufacturer: 'Microwave', model: 'GeoTrack', active: true, transType: 'Argos', deployDate: new Date().toISOString() },
            { deviceRef: '189022', programRef: 'PROG-01', manufacturer: 'Microwave', model: 'GeoTrack', active: true, transType: 'Argos', deployDate: new Date().toISOString() }
        ] as ArgosDevice[];
    }
    if (operation === 'retrieve-bulk-count') {
         return [{
             id: 'cnt-sim',
             platformId: 'ALL',
             count: 42,
             periodStart: new Date().toISOString(),
             periodEnd: new Date().toISOString()
         }] as ArgosCount[];
    }
    if (operation === 'retrieve-doppler') {
        return [
             { id: 'dop-1', platformId: '189021', programId: 'PROG-01', timestamp: new Date().toISOString(), satellite: 'NOAA', frequency: 401.65, locationClass: '3', lat: 24.5, lon: 54.5, errorRadius: 150 }
        ] as ArgosDoppler[];
    }
    
    // Default: messages (bulk/realtime)
    return Array.from({ length: 5 }).map((_, i) => ({
        id: `sim-msg-${Date.now()}-${i}`,
        programId: 'SIM-PROG',
        platformId: '189021',
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        lat: (24.0 + Math.random()).toFixed(4),
        lon: (54.0 + Math.random()).toFixed(4),
        lc: '3',
        msgType: 'DS',
        satellite: 'SIMSAT',
        rawData: 'SIMULATED DATA',
        locationType: 'Doppler',
        dopplerError: '100'
    })) as ArgosMessage[];
};

export const DataUpload = () => {
  const { 
      syncArgosToFirebase, 
      importTransmitters, importBirds, assignTransmitterToBird, transmitters,
      refreshMonitoringData,
  } = useAppStore();

  const isMobileScreen = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

  const [activeTab, setActiveTab] = useState<'manual' | 'api'>(isMobileScreen ? 'api' : 'manual');

  // Manual Upload State
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadType, setUploadType] = useState<UploadType>('transmitters');
  const [uploadMessage, setUploadMessage] = useState<string>('');

  // API State
  const [apiConfig, setApiConfig] = useState({
    username: '',
    password: '',
    clientId: 'api-telemetry',
    authUrl: 'https://account.groupcls.com/auth/realms/cls/protocol/openid-connect/token',
    baseUrl: 'https://api.groupcls.com/telemetry/api/v1'
  });
  
  // Date State for Positions / Bulk (Default last 24 hours: From = now - 24h, To = now)
  const [dateRange, setDateRange] = useState({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
  });

  const [selectedOperation, setSelectedOperation] = useState<ApiOperation>('retrieve-positions-fallback');
  const [selectedLocationType, setSelectedLocationType] = useState<'ALL' | 'GPS' | 'DOPPLER'>('ALL');
  const [selectedDevicePtt, setSelectedDevicePtt] = useState<string>('ALL');
  const [overlapSafetyDays, setOverlapSafetyDays] = useState<number>(14);
  const [isPreviewDryRun, setIsPreviewDryRun] = useState<boolean>(false);
  const [showOpInfoPopover, setShowOpInfoPopover] = useState<boolean>(false);
  const [opInfoLang, setOpInfoLang] = useState<'en' | 'ar'>('en');

  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [authMode, setAuthMode] = useState<'user' | 'service_account'>('user');
  const [useCorsProxy, setUseCorsProxy] = useState(true);
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [rawResponse, setRawResponse] = useState<string>('');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [activeLogTab, setActiveLogTab] = useState<'logs' | 'raw'>('logs');
  
  const [syncStats, setSyncStats] = useState<{transmitters: number, positions: number} | null>(null);
  const [isOperationOpen, setIsOperationOpen] = useState(false);
  const [isManualOperationOpen, setIsManualOperationOpen] = useState(false);
  
  // Realtime State
  const [lastCheckpoint, setLastCheckpoint] = useState<string>('0');

  // iOS Specific Mobile UI State
  const [dateMode, setDateMode] = useState<'24h' | 'custom'>('24h');
  const [showLogModal, setShowLogModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const operations: { value: ApiOperation; label: string; badge?: string; badgeAr?: string; disabled?: boolean }[] = [
    { value: "retrieve-positions-fallback", label: "Positions (from messages) — Active", badge: "Active", badgeAr: "نشط" },
    { value: "retrieve-positions", label: "Positions (direct REST) — [Needs HAR config]", badge: "Needs HAR", badgeAr: "يتطلب HAR", disabled: true },
    { value: "retrieve-bulk", label: "Bulk Message Retrieval" },
    { value: "retrieve-realtime", label: "Realtime Stream (Checkpoint)" },
    { value: "retrieve-device-list", label: "Device Inventory List" },
    { value: "retrieve-doppler", label: "Doppler Data" },
    { value: "retrieve-bulk-count", label: "Message Count Check" }
  ];

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${maskSensitive(msg)}`, ...prev]);
  };

  const getUrl = (url: string) => {
      // Connect specifically to our secure proxy
      return `/proxy/argos?url=${encodeURIComponent(url)}`;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDownloadTemplate = () => {
      if (uploadType === 'transmitters') {
          exportToCSV([{
              platform_id: '123456',
              model: 'GeoTrack 20g',
              status: 'active',
              manufacturer: 'Microwave',
              frequency: '401.650',
              hex_id: '1A2B3C'
          }], 'template_transmitters');
      } else if (uploadType === 'birds') {
          exportToCSV([{
              ring_id: 'AE-2025-001',
              species: 'Houbara Bustard',
              sex: 'M',
              hatch_date: '2023-01-01',
              release_location: 'Al Reem',
              release_lat: '24.500',
              release_lon: '54.500',
              associated_ptt: '123456'
          }], 'template_birds');
      } else if (uploadType === 'argos_data') {
          exportToCSV([{
              'Device ID': '244289',
              'Unit type': 'Houbara',
              'Location class': '3',
              'Location type': 'GPS',
              'Doppler Error radius (m)': '0',
              'Location date (UTC)': '2026-07-07 10:01:00',
              'Longitude': '66.9021',
              'Latitude': '46.9450'
          }], 'template_argos_data');
      }
  };

  const parseCSV = async (file: File): Promise<any[]> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
              const text = e.target?.result as string;
              if (!text) { reject(new Error("Empty file")); return; }
              const lines = text.split('\n');
              const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
              const result = [];
              for (let i = 1; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (!line) continue;
                  const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                  if (values.length > 0) {
                      const obj: any = {};
                      headers.forEach((h, idx) => { obj[h] = values[idx]; });
                      result.push(obj);
                  }
              }
              resolve(result);
          };
          reader.onerror = () => reject(new Error("Read error"));
          reader.readAsText(file);
      });
  };

  const parseExcel = async (file: File): Promise<any[]> => {
    try {
      const rows = await readXlsxFile(file);
      if (rows.length < 2) return [];
      const headers = rows[0].map((h: any) => String(h).trim());
      const result = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0) continue;
        const obj: any = {};
        headers.forEach((header: string, index: number) => {
             let val = row[index];
             if (val === null || val === undefined) obj[header] = "";
             else if (val instanceof Date) obj[header] = val.toISOString();
             else obj[header] = String(val);
        });
        result.push(obj);
      }
      return result;
    } catch {
      throw new Error("Failed to parse Excel file.");
    }
  };

  const parseJSON = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsed = JSON.parse(text);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          reject(new Error("Failed to parse JSON file. Please ensure it is valid JSON."));
        }
      };
      reader.onerror = () => reject(new Error("Read error on JSON file."));
      reader.readAsText(file);
    });
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadStatus('uploading');
    setUploadMessage('');

    try {
        let rawData: any[] = [];
        if (file.name.toLowerCase().endsWith('.csv')) {
            rawData = await parseCSV(file);
        } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
            rawData = await parseExcel(file);
        } else if (file.name.toLowerCase().endsWith('.json')) {
            rawData = await parseJSON(file);
        } else {
            throw new Error("Unsupported file type. Please upload .csv, .xlsx, .xls, or .json");
        }
        
        if (rawData.length === 0) throw new Error("No data found in file");

        if (uploadType === 'transmitters') {
            const mappedTransmitters: Transmitter[] = rawData.map((row: any) => {
                const pid = String(row.platform_id || '').replace(/^trans-/, '').trim();
                return {
                    id: `trans-${pid}`,
                    platform_id: pid,
                    model: row.model || 'Unknown',
                    status: (row.status?.toLowerCase() === 'active' ? 'active' : row.status?.toLowerCase() === 'maintenance' ? 'maintenance' : 'inactive') as any,
                    bird_id: '',
                    battery_voltage: 4.0, 
                    last_fix: new Date().toISOString(),
                    duty_cycle: 'Unknown',
                    frequency: row.frequency,
                    hex_id: row.hex_id,
                    manufacturer: row.manufacturer,
                    deployed: row.status?.toLowerCase() === 'active'
                };
            }).filter((t: any) => t.platform_id && t.platform_id !== 'Unknown');

            importTransmitters(mappedTransmitters);
            setUploadMessage(`Successfully imported ${mappedTransmitters.length} transmitters.`);
        } 
        else if (uploadType === 'birds') {
             const mappedBirds: BirdType[] = rawData.map((row: any) => {
                const rid = String(row.ring_id || '').replace(/^bird-/, '').trim();
                return {
                    id: `bird-${rid}`,
                    ring_id: rid,
                    species: row.species || 'Houbara Bustard',
                    sex: (row.sex === 'F' ? 'F' : 'M') as any,
                    hatch_date: row.hatch_date || new Date().toISOString(),
                    release_location: row.release_location,
                    release_lat: row.release_lat,
                    release_lon: row.release_lon
                };
            }).filter((b: any) => b.ring_id && b.ring_id !== 'Unknown');
            
            importBirds(mappedBirds);
            
            let linkedCount = 0;
            rawData.forEach((row: any) => {
                if (row.associated_ptt && row.ring_id) {
                    const bird = mappedBirds.find(b => b.ring_id === row.ring_id);
                    if (bird && row.associated_ptt) {
                        const t = transmitters.find(tr => tr.platform_id === row.associated_ptt);
                        if (t) {
                            assignTransmitterToBird(t.id, bird.id);
                            linkedCount++;
                        }
                    }
                }
            });

            setUploadMessage(`Successfully imported ${mappedBirds.length} birds. ${linkedCount > 0 ? `Linked ${linkedCount} birds to PTTs.` : ''}`);
        }
        else if (uploadType === 'argos_data') {
            const rawFixes: RawFix[] = [];

            for (const row of rawData) {
                const rawPtt = row['PTT'] || row['Device ID'] || row['DeviceRef'] || row['Platform'] || row['Platform ID'] || row['platformId'] || row['platform_id'] || row['ptt'] || row['pttId'];
                const platformId = normalizePttId(String(rawPtt || ''));
                if (!platformId) continue;

                const unitType = String(row['Unit type'] || row['Unit Type'] || row['unitType'] || row.msgType || 'Houbara');
                const satellite = String(row.satellite || row['Satellite'] || 'UNK');

                const msgDateRaw = row['Message date (UTC)'] || row['Message date'] || row['Message Date (UTC)'] || row['Message Date'] || row['msgDatetime'] || row['messageDate'];
                const parsedMsgMs = safeParseTimestamp(msgDateRaw);
                const messageDateIso = !isNaN(parsedMsgMs) && parsedMsgMs > 0 ? new Date(parsedMsgMs).toISOString() : undefined;

                // 1. Check if row is from a CLS 'positions' export (clean, one fix per row)
                const locDateRaw = row['Location date (UTC)'] || row['Location date'] || row['Location Date (UTC)'] || row['Location Date'] || row.locationDate || row.location_date;
                if (locDateRaw) {
                    const locDateMs = safeParseTimestamp(locDateRaw);
                    if (!isNaN(locDateMs) && locDateMs > 0) {
                        const lat = parseFloat(String(row['Latitude'] !== undefined ? row['Latitude'] : (row['lat'] !== undefined ? row['lat'] : (row['Lat'] !== undefined ? row['Lat'] : row.latitude))));
                        let lon = parseFloat(String(row['Longitude'] !== undefined ? row['Longitude'] : (row['lon'] !== undefined ? row['lon'] : (row['Lon'] !== undefined ? row['Lon'] : row.longitude))));
                        if (isValidCoordinate(lat, lon)) {
                            if (platformId === '242086' && lon < 0) lon = Math.abs(lon);

                            const locTypeRaw = String(row['Location type'] || row['Location Type'] || row.locationType || '').trim().toUpperCase();
                            const rawLc = String(row['Location class'] || row['Location Class'] || row.locationClass || row.lc || '').trim().toUpperCase();
                            const isGps = locTypeRaw.includes('GPS') || (!locTypeRaw && (!rawLc || rawLc === 'GPS'));
                            const locType: 'GPS' | 'DOPPLER' = isGps ? 'GPS' : 'DOPPLER';

                            const locClass = locType === 'GPS' ? null : (rawLc !== 'GPS' && rawLc ? rawLc : 'Z');
                            const errRadiusM = locType === 'GPS' ? 0 : (parseFloat(String(row['Error radius (m)'] || row['Error radius'] || row['Doppler Error radius (m)'] || row.errorRadiusM || 0)) || 0);

                            rawFixes.push({
                                pttId: platformId,
                                unitType,
                                locationType: locType,
                                locationClass: locClass,
                                errorRadiusM: errRadiusM,
                                locationDate: locDateRaw,
                                lat,
                                lon,
                                messageDate: messageDateIso || null,
                                deliveries: Number(row.deliveries || row.deliveryCount || 1)
                            });
                            continue;
                        }
                    }
                }

                // 2. Check if row is from a CLS 'messages' export (may contain GPS fix, Doppler fix, or both)
                let extractedFixFromRow = false;

                // 2A. GPS fix in messages row
                const gpsDateRaw = row['GPS Date of position (UTC)'] || row['GPS Date of position'] || row['GPS Date of Position (UTC)'] || row['GPS Date of Position'] || row['Date of position (UTC)'] || row['Date of position'] || row['Date of Position'] || row['gpsLocDate'] || row['gpsDate'];
                const gpsLat = parseFloat(String(row['GPS Latitude'] || row['Latitude'] || row['lat'] || row['Lat']));
                let gpsLon = parseFloat(String(row['GPS Longitude'] || row['Longitude'] || row['lon'] || row['Lon']));

                if (gpsDateRaw && isValidCoordinate(gpsLat, gpsLon)) {
                    if (platformId === '242086' && gpsLon < 0) gpsLon = Math.abs(gpsLon);
                    const gpsDateMs = safeParseTimestamp(gpsDateRaw);
                    if (!isNaN(gpsDateMs) && gpsDateMs > 0) {
                        rawFixes.push({
                            pttId: platformId,
                            unitType,
                            locationType: 'GPS',
                            locationClass: null,
                            errorRadiusM: 0,
                            locationDate: gpsDateRaw,
                            lat: gpsLat,
                            lon: gpsLon,
                            messageDate: messageDateIso || null,
                            deliveries: Number(row.deliveries || row.deliveryCount || 1)
                        });
                        extractedFixFromRow = true;
                    }
                }

                // 2B. Doppler fix in messages row
                const dopDateRaw = row['Doppler Date (UTC)'] || row['Doppler Date'] || row['Doppler date'] || (!gpsDateRaw ? (row['Location date (UTC)'] || row['Location date']) : undefined);
                const dopLat = parseFloat(String(row['Doppler Latitude'] || (!gpsDateRaw ? (row['Latitude'] || row['lat'] || row['Lat']) : NaN)));
                let dopLon = parseFloat(String(row['Doppler Longitude'] || (!gpsDateRaw ? (row['Longitude'] || row['lon'] || row['Lon']) : NaN)));

                if (dopDateRaw && isValidCoordinate(dopLat, dopLon)) {
                    if (platformId === '242086' && dopLon < 0) dopLon = Math.abs(dopLon);
                    const dopDateMs = safeParseTimestamp(dopDateRaw);
                    if (!isNaN(dopDateMs) && dopDateMs > 0) {
                        const dopClass = String(row['Doppler Class'] || row['Location class'] || row['Location Class'] || 'Z');
                        const dopErr = parseFloat(String(row['Doppler Error radius (m)'] || row['Error radius (m)'] || row['Doppler Error'] || 0)) || 0;
                        rawFixes.push({
                            pttId: platformId,
                            unitType,
                            locationType: 'DOPPLER',
                            locationClass: dopClass,
                            errorRadiusM: dopErr,
                            locationDate: dopDateRaw,
                            lat: dopLat,
                            lon: dopLon,
                            messageDate: messageDateIso || null,
                            deliveries: Number(row.deliveries || row.deliveryCount || 1)
                        });
                        extractedFixFromRow = true;
                    }
                }

                // 2C. Fallback for generic/legacy rows
                if (!extractedFixFromRow) {
                    const fallbackLat = parseFloat(String(row['Latitude'] || row['lat'] || row['Lat']));
                    let fallbackLon = parseFloat(String(row['Longitude'] || row['lon'] || row['Lon']));
                    const locType = classifyLocationType(row.lc, row.locationType, satellite);
                    const isGps = locType === 'GPS';
                    const fallbackDateRaw = row['locationDate'] || row['fixTime'] || row['timestamp'] || row['date'] || (!isGps ? msgDateRaw : undefined);
                    if (fallbackDateRaw && isValidCoordinate(fallbackLat, fallbackLon)) {
                        if (platformId === '242086' && fallbackLon < 0) fallbackLon = Math.abs(fallbackLon);
                        const fbDateMs = safeParseTimestamp(fallbackDateRaw);
                        if (!isNaN(fbDateMs) && fbDateMs > 0) {
                            rawFixes.push({
                                pttId: platformId,
                                unitType,
                                locationType: locType,
                                locationClass: locType === 'GPS' ? null : String(row.lc || 'Z'),
                                errorRadiusM: locType === 'GPS' ? 0 : (parseFloat(String(row.dopplerError || 0)) || 0),
                                locationDate: fallbackDateRaw,
                                lat: fallbackLat,
                                lon: fallbackLon,
                                messageDate: messageDateIso || null,
                                deliveries: 1
                            });
                        }
                    }
                }
            }

            const { fixes: canonicalFixes } = buildFixes(rawFixes);

            const mappedArgos: ArgosMessage[] = canonicalFixes.map(fix => {
                const locDateIso = new Date(fix.t).toISOString();
                const validMsgDateMs = fix.firstMessageMs || fix.t;
                const msgDateIso = new Date(validMsgDateMs).toISOString();
                const lagMinutes = Math.max(0, Math.round((validMsgDateMs - fix.t) / 60000));

                return {
                    id: fix.id,
                    programId: 'Imported',
                    platformId: fix.pttId,
                    timestamp: locDateIso,
                    lat: String(fix.lat),
                    lon: String(fix.lon),
                    lc: fix.type === 'GPS' ? 'GPS' : String(fix.cls || 'Z'),
                    msgType: fix.unitTypes[0] || 'Houbara',
                    satellite: fix.type === 'GPS' ? 'GPS' : 'UNK',
                    rawData: '',
                    locationType: fix.type,
                    locationClass: fix.cls,
                    errorRadiusM: fix.errorRadiusM,
                    dopplerError: String(fix.errorRadiusM),
                    messageDate: msgDateIso,
                    locationDate: locDateIso,
                    deliveryCount: fix.deliveries,
                    lagMinutes
                };
            });

            await syncArgosToFirebase(mappedArgos, []);
            refreshMonitoringData().catch(console.warn);
            setUploadMessage(`Imported ${mappedArgos.length} position fixes sorted by Location Date. Data synchronized across all tables.`);
        }

        setUploadStatus('success');
    } catch (e: any) {
        setUploadStatus('error');
        setUploadMessage(`Error: ${e.message}`);
    }
  };

  const handleSyncManual = async () => {
      addLog('Synchronizing Argos data across Transmitters and Monitoring tables...');
      try {
        const res = await refreshMonitoringData();
        addLog(`✅ Complete: ${res.transmittersCount} transmitters and ${res.positionsCount} tracking fixes synchronized across all tables.`);
        setSyncStats({ transmitters: res.transmittersCount, positions: res.positionsCount });
      } catch (err: any) {
        addLog(`Sync error: ${err.message}`);
      }
  };

  // --- API INTEGRATION ---

  const authenticate = async () => {
    // ... (Same authentication logic as before)
    const { username, password, authUrl, clientId } = apiConfig;
    const targetUrl = getUrl(authUrl);

    addLog(`Authenticating... Mode: ${authMode}`);
    
    const params = new URLSearchParams();
    
    if (authMode === 'service_account') {
        params.append('grant_type', 'client_credentials');
        params.append('client_id', username); 
        params.append('client_secret', password);
    } else {
        params.append('grant_type', 'password');
        params.append('username', username);
        params.append('password', password);
        params.append('client_id', clientId || 'api-telemetry');
    }

    try {
        const authResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        const text = await authResponse.text();
        if (!authResponse.ok) {
            throw new Error(`Auth Failed (${authResponse.status}): ${text.substring(0, 100)}...`);
        }

        const authData = JSON.parse(text);
        if (!authData.access_token) throw new Error("No access_token in response.");
        return authData.access_token;
    } catch (error: any) {
        if (error.message === 'Failed to fetch') {
            throw new Error('Network Error (CORS). Please enable "CORS Proxy".');
        }
        throw error;
    }
  };

  const fetchBulkData = async (initialToken: string) => {
      // ... (Same bulk fetch logic)
      const { baseUrl } = apiConfig;
      let allData: any[] = [];
      let currentCursor: string | null = null;
      const limit = 100;
      let hasMore = true;
      let page = 1;
      const maxPages = 500; // Increased limit for larger datasets
      
      let token = initialToken; // Local token variable that can be refreshed

      const startStr = `${dateRange.start}T00:00:00.001Z`;
      const endStr = `${dateRange.end}T23:59:59.999Z`;

      addLog(`Starting Bulk Import for range: ${startStr} to ${endStr}`);

      while (hasMore && page <= maxPages) {
          const rawUrl = `${baseUrl}/retrieve-bulk`;
          const targetUrl = getUrl(rawUrl);
          
          addLog(`Fetching Page ${page} (Cursor: ${currentCursor ? '...'+currentCursor.slice(-10) : 'Start'})...`);
          
          const body: any = {
              pagination: { first: limit },
              retrieveMetadata: true,
              retrieveRawData: true,
              retrieveDoppler: true,
              retrieveGpsLoc: true,
              retrieveSensors: true,
              retrieveAdditionnalProperties: true,
              fromDatetime: startStr,
              toDatetime: endStr,
              datetimeFormat: "DATETIME"
          };
          
          if (currentCursor) {
              body.pagination.after = currentCursor;
          }

          let retries = 0;
          let response: Response | null = null;
          let json: any = null;

          while (retries < 3) {
              try {
                  const res = await fetch(targetUrl, {
                      method: 'POST',
                      headers: { 
                          'Authorization': `Bearer ${token}`, 
                          'Content-Type': 'application/json',
                          'Accept': 'application/json' 
                      },
                      body: JSON.stringify(body)
                  });
                  
                  if (res.status === 401) {
                      addLog(`Token expired (401) on page ${page}. Re-authenticating...`);
                      token = await authenticate();
                      retries++;
                      continue; // Retry with new token
                  }

                  const text = await res.text();
                  setRawResponse(text); 

                  if (!res.ok) throw new Error(`Bulk Fetch Failed (${res.status}): ${text.substring(0, 100)}`);
                  
                  json = JSON.parse(text);
                  response = res;
                  break; // Success, exit retry loop

              } catch (e: any) {
                  if (e.message.includes('Auth Failed') || e.message.includes('401')) {
                      // Already handled above or fatal auth error
                      throw e;
                  }
                  // Transient network error?
                  retries++;
                  if (retries >= 3) throw e;
                  addLog(`Network error on page ${page}, retrying (${retries}/3)...`);
                  await new Promise(r => setTimeout(r, 2000));
              }
          }

          if (json) {
              const items = json.contents || [];
              if (items.length > 0) {
                  allData = [...allData, ...items];
                  page++;
                  if (json.pageInfo && json.pageInfo.hasNextPage && json.pageInfo.endCursor) {
                      currentCursor = json.pageInfo.endCursor;
                  } else {
                      hasMore = false;
                  }
              } else {
                  hasMore = false;
              }
          } else {
              hasMore = false;
          }
      }
      return allData;
  };

  const fetchRealtimeData = async (token: string) => {
      // ... (Same realtime logic)
      const { baseUrl } = apiConfig;
      const rawUrl = `${baseUrl}/retrieve-realtime`;
      const targetUrl = getUrl(rawUrl);
      
      addLog(`Polling Realtime Data (Checkpoint: ${lastCheckpoint})...`);
      
      const body: any = {
          retrieveMetadata: true,
          retrieveRawData: true,
          retrieveDoppler: true,
          retrieveGpsLoc: true,
          retrieveSensors: true,
          retrieveAdditionnalProperties: true,
          datetimeFormat: "DATETIME",
          fromCheckpoint: String(lastCheckpoint)
      };
      
      const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 
              'Authorization': `Bearer ${token}`, 
              'Content-Type': 'application/json',
              'Accept': 'application/json' 
          },
          body: JSON.stringify(body)
      });

      const text = await res.text();
      setRawResponse(text);

      if (!res.ok) throw new Error(`Realtime Fetch Failed: ${res.statusText}`);

      const json = JSON.parse(text);
      
      if (json.checkpoint) {
          setLastCheckpoint(json.checkpoint);
          addLog(`New Checkpoint received: ${json.checkpoint}`);
      }

      return json.contents || []; 
  };

  const handleTestPositionsConnection = async () => {
    setApiStatus('testing');
    setActiveLogTab('logs');
    setLogs([]);
    setRawResponse('');
    if (isMobileScreen) {
      setShowLogModal(true);
    }

    if (selectedOperation === 'retrieve-positions') {
      addLog('[Test Connection] Operation "Positions (direct REST)" requires endpoint configuration.');
      addLog('⚠️ The direct REST /positions endpoint is not yet configured (returns 404 on current CLS server).');
      addLog('👉 Please provide capture.har from the CLS web app Positions tab to configure the REST URL.');
      addLog('💡 "Positions (from messages) — Active" is currently selected as the operational default route.');
      setApiStatus('error');
      return;
    }

    addLog('[Test Connection] Testing CLS Positions Fallback route (via retrieve-bulk messages)...');

    try {
        const token = await authenticate();
        addLog('Authentication Successful. Token acquired.');

        const testPtt = selectedDevicePtt && selectedDevicePtt !== 'ALL' 
            ? selectedDevicePtt.trim() 
            : (transmitters[0]?.platform_id || '43571');

        const now = Date.now();
        const from24h = new Date(now - 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
        const toNow = new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');
        
        const testBody = {
            pagination: { first: 5 },
            retrieveMetadata: true,
            retrieveRawData: true,
            retrieveDoppler: true,
            retrieveGpsLoc: true,
            retrieveSensors: true,
            retrieveAdditionnalProperties: true,
            fromDatetime: from24h,
            toDatetime: toNow,
            datetimeFormat: "DATETIME",
            deviceIds: [testPtt]
        };

        const targetUrl = getUrl(`${apiConfig.baseUrl}/retrieve-bulk`);
        addLog(`POST ${apiConfig.baseUrl}/retrieve-bulk (1 device: ${testPtt}, limit: 5, window: ${from24h} .. ${toNow})`);

        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(testBody)
        });

        const contentType = res.headers.get('content-type') || 'unknown';
        const bodyText = await res.text();
        setRawResponse(maskSecrets(bodyText));

        addLog(`HTTP Status: ${res.status} ${res.statusText}`);
        addLog(`Content-Type: ${contentType}`);

        const classified = classifyResponse(res.status, contentType, bodyText);
        if (classified) {
            addLog(`Classification: [${classified.kind}] ${classified.message}`);
            setApiStatus('error');
            return;
        }

        let parsed: any;
        try {
            parsed = JSON.parse(bodyText);
        } catch {
            addLog(`Error: Response body is not valid JSON.`);
            setApiStatus('error');
            return;
        }

        const items = parsed.contents || parsed.messages || (Array.isArray(parsed) ? parsed : []);
        addLog(`Message Count: ${items.length}`);
        if (items.length > 0) {
            addLog(`Sample Message Keys: ${Object.keys(items[0]).join(', ')}`);
            const conv = messagesToRawFixes(items);
            const gpsCount = conv.rows.filter(r => r.locationType === 'GPS').length;
            const dopplerCount = conv.rows.filter(r => r.locationType === 'DOPPLER').length;
            addLog(`Extracted Fixes: ${conv.rows.length} total (${gpsCount} GPS, ${dopplerCount} Doppler).`);
            addLog(`Skipped without position: ${conv.withoutPosition}, Skipped without date: ${conv.skippedNoDate}`);
            if (conv.rows.length > 0) {
                addLog(`First Fix Keys: ${Object.keys(conv.rows[0]).join(', ')}`);
            }
        } else {
            addLog(`No messages returned for device ${testPtt} in the last 24h.`);
        }
        setApiStatus('success');
    } catch (err: any) {
        addLog(`[Test Connection Error] ${err.message}`);
        setApiStatus('error');
    }
  };

  const handleExecuteApi = async () => {
    // ... (Same execute logic)
    setApiStatus('testing');
    setLogs([]);
    setRawResponse('');
    setSyncStats(null);
    if (isMobileScreen) {
      setShowLogModal(true);
    }
    addLog(`Initiating connection process [${isSimulationMode ? 'SIMULATION' : 'LIVE'}]...`);
    setPreviewData([]);

    const { username, password } = apiConfig;

    if (isSimulationMode) {
        setTimeout(async () => {
            setApiStatus('success');
            addLog(`Authenticated (Simulation).`);
            setRawResponse(maskSensitive(JSON.stringify({ success: true, simulated: true })));
            
            const newData = generateMockArgosData(selectedOperation);
            setPreviewData(newData);

            if (selectedOperation === 'retrieve-positions' || selectedOperation === 'retrieve-positions-fallback') {
                const mapRes = mapClsPositions(newData);
                const { fixes } = buildFixes(mapRes.rows);
                addLog(`[SIMULATION] Mapped ${fixes.length} fixes (${fixes.filter(f => f.type === 'GPS').length} GPS, ${fixes.filter(f => f.type === 'DOPPLER').length} Doppler).`);
                setSyncStats({ transmitters: 1, positions: fixes.length });
            } else if (selectedOperation === 'retrieve-device-list') {
                await syncArgosToFirebase([], newData as ArgosDevice[]);
                setSyncStats({ transmitters: newData.length, positions: 0 });
            } else {
                await syncArgosToFirebase(newData as ArgosMessage[], []);
                setSyncStats({ transmitters: 0, positions: newData.length });
            }
            
            addLog(`IMPORT SUCCESS: Retrieved ${newData.length} simulated items.`);
            if (isMobileScreen) {
              setShowSuccessToast(true);
              setTimeout(() => setShowLogModal(false), 2000);
              setTimeout(() => setShowSuccessToast(false), 5000);
            }
        }, 1000);
        return;
    }

    try {
        if (!username || !password) {
            throw new Error("Username and Password are required.");
        }

        const token = await authenticate();
        addLog('Authentication Successful. Token acquired.');

        let rawData: any[] = [];
        let stats = { transmittersUpdated: 0, positionsCreated: 0 };

        if (selectedOperation === 'retrieve-positions' || selectedOperation === 'retrieve-positions-fallback') {
            const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
            const startStr = `${dateRange.start}T00:00:00Z`;
            let endStr = `${dateRange.end}T23:59:59Z`;
            if (endStr > nowIso) endStr = nowIso;

            const startTime = Date.now();
            const deviceIds = selectedDevicePtt && selectedDevicePtt !== 'ALL' ? [selectedDevicePtt.trim()] : [];
            let targetRows: RawFix[] = [];

            if (selectedOperation === 'retrieve-positions') {
                addLog(`Executing Positions (GPS + Doppler) Fetch [Location Date: ${startStr} to ${endStr}, Type: ${selectedLocationType}]...`);
                try {
                    rawData = await fetchArgosPositions(token, apiConfig, startStr, endStr, selectedLocationType, deviceIds, (msg) => addLog(maskSensitive(msg)));
                    addLog(`Fetched ${rawData.length} rows from CLS Positions in ${Date.now() - startTime}ms.`);

                    // Map rows using tolerant mapper
                    const mapRes = mapClsPositions(rawData);
                    if (mapRes.missing.length > 0) {
                        const err = `Missing required fields from CLS Positions: ${mapRes.missing.join(', ')}`;
                        addLog(`ERROR: ${err}`);
                        throw new Error(err);
                    }

                    if (mapRes.unmappedKeys.length > 0) {
                        addLog(`Notice: Unmapped keys in response: ${mapRes.unmappedKeys.join(', ')}`);
                    }

                    if (mapRes.skipped.length > 0) {
                        addLog(`Skipped ${mapRes.skipped.length} invalid rows.`);
                    }

                    addLog(`Successfully mapped ${mapRes.rows.length} valid position records.`);
                    targetRows = mapRes.rows;
                } catch (e: any) {
                    if (e?.kind === 'ENDPOINT_NOT_FOUND' || e?.message?.includes('404')) {
                        addLog(`⚠️ [ENDPOINT_NOT_FOUND] The CLS Positions endpoint does not exist on this API route (404).`);
                        addLog(`Switching to Positions (from messages) [Fallback] to extract genuine GPS/Doppler fixes...`);
                        const bulkRaw = await fetchArgosBulkData(token, apiConfig, startStr, endStr, (msg) => addLog(maskSensitive(msg)), deviceIds);
                        const conv = messagesToRawFixes(bulkRaw);
                        if (conv.messages > 0 && conv.rows.length === 0) {
                            const sampleKeys = bulkRaw[0] ? Object.keys(bulkRaw[0]).join(', ') : 'none';
                            const errMsg = `Mapping Guard Error: ${conv.messages} messages retrieved, but 0 fixes extracted. Sample message keys: [${sampleKeys}]`;
                            addLog(`ERROR: ${errMsg}`);
                            throw new Error(errMsg);
                        }
                        addLog(`Fallback extracted ${conv.rows.length} fixes from ${conv.messages} messages (${conv.skippedNoDate} skipped without fix date, ${conv.withoutPosition} without coordinates).`);
                        targetRows = conv.rows;
                    } else {
                        throw e;
                    }
                }
            } else {
                addLog(`Executing Positions (from messages) [Fallback] [Window: ${startStr} to ${endStr}]...`);
                const bulkRaw = await fetchArgosBulkData(token, apiConfig, startStr, endStr, (msg) => addLog(maskSensitive(msg)), deviceIds);
                const conv = messagesToRawFixes(bulkRaw);
                if (conv.messages > 0 && conv.rows.length === 0) {
                    const sampleKeys = bulkRaw[0] ? Object.keys(bulkRaw[0]).join(', ') : 'none';
                    const errMsg = `Mapping Guard Error: ${conv.messages} messages retrieved, but 0 fixes extracted. Sample message keys: [${sampleKeys}]`;
                    addLog(`ERROR: ${errMsg}`);
                    throw new Error(errMsg);
                }
                addLog(`Fallback extracted ${conv.rows.length} fixes from ${conv.messages} messages (${conv.skippedNoDate} skipped without fix date, ${conv.withoutPosition} without coordinates).`);
                targetRows = conv.rows;
            }

            // Filter by location type if user selected GPS or DOPPLER
            if (selectedLocationType !== 'ALL') {
                targetRows = targetRows.filter(r =>
                    selectedLocationType === 'GPS' ? /gps/i.test(r.locationType) : !/gps/i.test(r.locationType)
                );
            }

            // Build fixes (deterministic deduplication)
            const { fixes: canonicalFixes } = buildFixes(targetRows);
            const durationMs = Date.now() - startTime;
            addLog(`Built ${canonicalFixes.length} canonical position fixes in ${durationMs}ms.`);

            // Compute newest GPS and Doppler per PTT
            const newestGps: Record<string, string> = {};
            const newestDoppler: Record<string, string> = {};
            canonicalFixes.forEach(f => {
                const dateStr = new Date(f.t).toISOString();
                if (f.type === 'GPS') {
                    if (!newestGps[f.pttId] || dateStr > newestGps[f.pttId]) newestGps[f.pttId] = dateStr;
                } else {
                    if (!newestDoppler[f.pttId] || dateStr > newestDoppler[f.pttId]) newestDoppler[f.pttId] = dateStr;
                }
            });

            const ptts = Array.from(new Set([...Object.keys(newestGps), ...Object.keys(newestDoppler)]));
            ptts.forEach(p => {
                addLog(`PTT ${p} summary: Newest GPS = ${newestGps[p] || 'None'}, Newest Doppler = ${newestDoppler[p] || 'None'}`);
            });

            if (isPreviewDryRun) {
                addLog(`[DRY RUN PREVIEW] Complete. No writes committed to database.`);
                addLog(`Preview: ${canonicalFixes.length} fixes (${canonicalFixes.filter(f => f.type === 'GPS').length} GPS, ${canonicalFixes.filter(f => f.type === 'DOPPLER').length} Doppler).`);
                setPreviewData(canonicalFixes);
                setSyncStats({ transmitters: ptts.length, positions: canonicalFixes.length });
                setApiStatus('success');
                return;
            }

            // Write canonical fixes to Firestore
            const mappedArgos: ArgosMessage[] = canonicalFixes.map(fix => {
                const locDateIso = new Date(fix.t).toISOString();
                const validMsgDateMs = fix.firstMessageMs || fix.t;
                const msgDateIso = new Date(validMsgDateMs).toISOString();
                const lagMinutes = Math.max(0, Math.round((validMsgDateMs - fix.t) / 60000));

                return {
                    id: fix.id,
                    programId: 'CLS-API',
                    platformId: fix.pttId,
                    timestamp: locDateIso,
                    lat: String(fix.lat),
                    lon: String(fix.lon),
                    lc: fix.type === 'GPS' ? 'GPS' : String(fix.cls || 'Z'),
                    msgType: fix.unitTypes[0] || 'Houbara',
                    satellite: fix.type === 'GPS' ? 'GPS' : 'UNK',
                    rawData: '',
                    locationType: fix.type,
                    locationClass: fix.cls,
                    errorRadiusM: fix.errorRadiusM,
                    dopplerError: String(fix.errorRadiusM),
                    messageDate: msgDateIso,
                    locationDate: locDateIso,
                    deliveryCount: fix.deliveries,
                    lagMinutes
                };
            });

            const syncResult = await syncArgosToFirebase(mappedArgos, [], (msg) => addLog(maskSensitive(msg)));
            stats = syncResult;
            addLog(`✅ Successfully synced ${canonicalFixes.length} positions to database. Duration: ${durationMs}ms.`);
        } else if (selectedOperation === 'retrieve-bulk') {
            rawData = await fetchBulkData(token);
        } else if (selectedOperation === 'retrieve-realtime') {
            rawData = await fetchRealtimeData(token);
        } else if (selectedOperation === 'retrieve-device-list') {
             addLog('Fetching Device List...');
             const res = await fetch(getUrl(`${apiConfig.baseUrl}/retrieve-device-list`), {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                 body: JSON.stringify({})
             });
             const text = await res.text();
             setRawResponse(maskSensitive(text));
             if(!res.ok) throw new Error(res.statusText);
             rawData = JSON.parse(text);
        } else if (selectedOperation === 'retrieve-doppler') {
             addLog('Fetching Doppler Data...');
             const body = { fromDatetime: `${dateRange.start}T00:00:00.001Z` };
             const res = await fetch(getUrl(`${apiConfig.baseUrl}/retrieve-doppler`), {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                 body: JSON.stringify(body)
             });
             const text = await res.text();
             setRawResponse(maskSensitive(text));
             if(!res.ok) throw new Error(res.statusText);
             const json = JSON.parse(text);
             rawData = json.contents || [];
        } else if (selectedOperation === 'retrieve-bulk-count') {
             addLog('Checking Message Count...');
             const body = { 
                 fromDatetime: `${dateRange.start}T00:00:00.001Z`,
                 toDatetime: `${dateRange.end}T23:59:59.999Z`
             };
             const res = await fetch(getUrl(`${apiConfig.baseUrl}/retrieve-bulk-count`), {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                 body: JSON.stringify(body)
             });
             const text = await res.text();
             setRawResponse(maskSensitive(text));
             if(!res.ok) throw new Error(res.statusText);
             const json = JSON.parse(text);
             const count = json.count || (json.contents ? json.contents.length : 0);
             addLog(`Message Count for window: ${count}`);
             stats = { transmittersUpdated: 0, positionsCreated: 0 };
             setPreviewData([{ operation: 'Message Count Check', count, start: dateRange.start, end: dateRange.end }]);
        } else {
             addLog('Operation not implemented for live fetch yet.');
             rawData = [];
        }

        if (selectedOperation !== 'retrieve-positions' && selectedOperation !== 'retrieve-bulk-count') {
            addLog(`Fetched ${rawData.length} items.`);
            setPreviewData(rawData);

            // Map and Store
            if (selectedOperation === 'retrieve-device-list') {
                 const devices = mapArgosDevices(rawData);
                 const syncResult = await syncArgosToFirebase([], devices);
                 stats = syncResult;
            } else if (selectedOperation === 'retrieve-doppler') {
                 const msgs = mapArgosApiData(rawData);
                 const syncResult = await syncArgosToFirebase(msgs, [], (msg) => addLog(maskSensitive(msg)));
                 stats = syncResult;
            } else if (selectedOperation === 'retrieve-bulk' || selectedOperation === 'retrieve-realtime') {
                 const msgs = mapArgosApiData(rawData);
                 const syncResult = await syncArgosToFirebase(msgs, [], (msg) => addLog(maskSensitive(msg)));
                 stats = syncResult;
                 addLog(`Synced ${msgs.length} messages to Firebase database.`);
            }
        }
        
        refreshMonitoringData().catch(console.warn);
        setSyncStats({transmitters: stats.transmittersUpdated, positions: stats.positionsCreated});
        setApiStatus('success');
        addLog(`Operation Complete. Store & Monitoring Updated.`);

        if (isMobileScreen) {
          setShowSuccessToast(true);
          setTimeout(() => setShowLogModal(false), 2000);
          setTimeout(() => setShowSuccessToast(false), 5000);
        }

    } catch (error: any) {
        setApiStatus('error');
        addLog(`ERROR: ${error.message}`);
        console.error(error);
    }
  };
  
  // Data guide content helper
  const getDataGuide = () => {
      switch(uploadType) {
          case 'transmitters':
              return {
                  title: 'Transmitter Requirements',
                  columns: ['platform_id (Required)', 'model', 'status', 'frequency', 'hex_id', 'manufacturer'],
                  desc: 'Upload a list of physical devices. The platform_id acts as the unique key.'
              };
          case 'birds':
              return {
                  title: 'Bird Database Requirements',
                  columns: ['ring_id (Required)', 'species', 'sex (M/F)', 'hatch_date', 'associated_ptt', 'release_location'],
                  desc: 'Upload bird registry. "associated_ptt" will automatically link to existing transmitters.'
              };
          case 'argos_data':
              return {
                  title: 'Argos Data Requirements',
                  columns: ['Device ID (Required)', 'Unit type', 'Location class', 'Location type', 'Doppler Error radius (m)', 'Location date (UTC)', 'Longitude', 'Latitude'],
                  desc: 'Upload raw tracking data. Supports standard Argos CLS CSV/Excel exports.'
              };
      }
  };

  const guide = getDataGuide();

  if (isMobileScreen) {
    return (
      <div className="space-y-4 p-2 max-w-md mx-auto animate-in fade-in duration-300">
        {/* Title Tile */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
              <UploadCloud size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">CLS Data Upload</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Field API Ingestion</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full border border-green-200 dark:border-green-800 text-[10px] font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>Ready</span>
          </div>
        </div>

        {/* Credentials & Options Form Card */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
          {/* Username Input */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Username</label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                value={apiConfig.username}
                onChange={(e) => setApiConfig({...apiConfig, username: e.target.value})}
                placeholder="username"
                className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-white font-medium"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="password" 
                value={apiConfig.password}
                onChange={(e) => setApiConfig({...apiConfig, password: e.target.value})}
                placeholder="••••••••"
                className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 dark:text-white font-medium"
              />
            </div>
          </div>

          {/* Time Horizon Selection */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Time Horizon</label>
            <div className="grid grid-cols-2 gap-2 bg-gray-100 dark:bg-slate-900 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setDateMode('24h');
                  const end = new Date().toISOString().split('T')[0];
                  const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  setDateRange({ start, end });
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${dateMode === '24h' ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm border border-gray-200 dark:border-slate-700' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Last 24 Hours
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateMode('custom');
                  const end = new Date().toISOString().split('T')[0];
                  const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  setDateRange({ start, end });
                }}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all ${dateMode === 'custom' ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm border border-gray-200 dark:border-slate-700' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Custom Date
              </button>
            </div>

            {dateMode === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-3 animate-in fade-in slide-in-from-top-1">
                <div className="bg-gray-100 dark:bg-slate-900/90 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700">
                  <label className="block text-[9px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5">START DATE</label>
                  <input 
                    type="date" 
                    value={dateRange.start}
                    onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                    className="w-full bg-transparent text-xs font-bold text-gray-800 dark:text-white outline-none border-none p-0 focus:ring-0"
                  />
                </div>

                <div className="bg-gray-100 dark:bg-slate-900/90 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700">
                  <label className="block text-[9px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5">END DATE</label>
                  <input 
                    type="date" 
                    value={dateRange.end}
                    onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                    className="w-full bg-transparent text-xs font-bold text-gray-800 dark:text-white outline-none border-none p-0 focus:ring-0"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Prominent Execute Request Button */}
          <button 
            type="button"
            onClick={handleExecuteApi}
            disabled={apiStatus === 'testing'}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {apiStatus === 'testing' ? <RefreshCw className="animate-spin" size={18} /> : <Play size={18} />}
            {apiStatus === 'testing' ? 'Connecting to CLS API...' : 'Execute Request'}
          </button>
        </div>

        {/* Success Toast */}
        {showSuccessToast && (
          <div className="bg-green-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} />
              <span>CLS Data Upload Completed Successfully ✓</span>
            </div>
          </div>
        )}

        {/* Execution Logs Modal Popup */}
        {showLogModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
            <div className="bg-gray-900 text-white rounded-2xl w-full max-w-sm border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-3 bg-gray-950 border-b border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${apiStatus === 'testing' ? 'bg-amber-400 animate-ping' : apiStatus === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">
                    {apiStatus === 'testing' ? 'Uploading CLS Data...' : apiStatus === 'success' ? 'Upload Complete!' : 'Execution Logs'}
                  </span>
                </div>
                <button onClick={() => setShowLogModal(false)} className="text-gray-400 hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="p-3 font-mono text-[11px] overflow-y-auto flex-1 max-h-[250px] space-y-1.5">
                {logs.length === 0 && <span className="text-gray-500 italic">Connecting to CLS API...</span>}
                {logs.map((log, i) => (
                  <div key={i} className="text-gray-300 border-b border-gray-800/40 pb-1">
                    <span className="text-blue-400 mr-1">{log.split(']')[0]}]</span>
                    <span>{log.split(']')[1]}</span>
                  </div>
                ))}
              </div>

              {syncStats && (
                <div className="p-3 bg-green-950/70 border-t border-green-800 text-green-400 font-mono text-xs">
                  <div>✔ Transmitters Updated: {syncStats.transmitters}</div>
                  <div>✔ New Positions Created: {syncStats.positions}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Data Ingestion</h2>
          <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
            {isMobileScreen ? "Import tracking data via Argos CLS API." : "Import tracking data via File Upload or Argos CLS API."}
          </p>
        </div>
        {!isMobileScreen && (
          <div className="flex bg-gray-100 dark:bg-slate-800 p-0.5 rounded-lg border border-gray-200 dark:border-slate-700">
              <button 
                  onClick={() => setActiveTab('manual')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'manual' ? 'bg-white dark:bg-slate-700 text-brand-900 dark:text-brand-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                  Manual Upload
              </button>
              <button 
                  onClick={() => setActiveTab('api')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'api' ? 'bg-white dark:bg-slate-700 text-brand-900 dark:text-brand-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                  API Integration
              </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden flex-1 p-4">
        
        {activeTab === 'manual' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                {/* LEFT COLUMN: UPLOAD ACTION */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    {/* Compact Type Selection */}
                    <div className="flex bg-gray-50 dark:bg-slate-900 p-1 rounded-lg border border-gray-100 dark:border-slate-700">
                        {[
                            { id: 'transmitters', label: 'Transmitters', icon: Radio },
                            { id: 'birds', label: 'Bird Database', icon: null },
                            { id: 'argos_data', label: 'Argos Data', icon: Database }
                        ].map((type) => {
                            const Icon = type.icon;
                            return (
                                <button
                                    key={type.id}
                                    onClick={() => { setUploadType(type.id as any); setUploadStatus('idle'); setUploadMessage(''); }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all text-xs font-bold ${
                                        uploadType === type.id 
                                        ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm border border-gray-200 dark:border-slate-600' 
                                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {type.id === 'birds' 
                                        ? <HoubaraIcon size={14} color="currentColor" />
                                        : Icon && <Icon size={14} />
                                    }
                                    <span>{type.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Compact Drag & Drop Zone */}
                    <div 
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors min-h-[160px] ${dragActive ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-slate-500 bg-gray-50/50 dark:bg-slate-900/50'}`}
                    >
                        <UploadCloud size={32} className={`mb-2 ${dragActive ? 'text-brand-500' : 'text-gray-400'}`} />
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Drag & Drop file here</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">CSV, Excel (.xlsx, .xls)</p>
                        <input 
                            type="file" 
                            id="file-upload" 
                            className="hidden" 
                            accept=".csv, .xlsx, .xls" 
                            onChange={handleChange}
                        />
                        <label 
                            htmlFor="file-upload" 
                            className="px-4 py-1.5 bg-brand-600 text-white rounded-md text-xs font-bold hover:bg-brand-700 cursor-pointer transition-colors shadow-sm"
                        >
                            Browse Files
                        </label>
                        {file && (
                            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-full border border-gray-200 dark:border-slate-700 shadow-sm">
                                <FileSpreadsheet size={14} className="text-green-600" />
                                {file.name}
                            </div>
                        )}
                    </div>

                    {/* Actions & Status */}
                    <div className="flex justify-between items-center bg-gray-50 dark:bg-slate-900 p-3 rounded-xl border border-gray-100 dark:border-slate-700">
                         {uploadType === 'argos_data' ? (
                                <button
                                    onClick={handleSyncManual}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-md text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 shadow-sm"
                                >
                                    <RefreshCw size={14} /> Re-Sync
                                </button>
                            ) : <div></div>}

                            <div className="font-sans min-w-[200px]">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">API Operation</label>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsManualOperationOpen(!isManualOperationOpen)}
                                        className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                                    >
                                        <span className="text-gray-700 dark:text-white truncate">
                                            {operations.find(op => op.value === selectedOperation)?.label}
                                        </span>
                                        <ChevronDown size={14} className="text-gray-500 flex-shrink-0 ml-2" />
                                    </button>
                                    
                                    {isManualOperationOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setIsManualOperationOpen(false)} />
                                            <div className="absolute bottom-full left-0 w-full mb-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                                                {operations.map(op => (
                                                    <button
                                                        key={op.value}
                                                        onClick={() => {
                                                            setSelectedOperation(op.value as any);
                                                            setIsManualOperationOpen(false);
                                                        }}
                                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                                                            selectedOperation === op.value 
                                                            ? 'bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-brand-400 font-bold' 
                                                            : 'text-gray-700 dark:text-gray-300'
                                                        }`}
                                                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                                                    >
                                                        <span className="flex items-center justify-between">
                                                            <span>{op.label}</span>
                                                            {op.badge && (
                                                                <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 rounded-full">
                                                                    {op.badge}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                             </div>

                        <button 
                            onClick={handleUpload}
                            disabled={!file || uploadStatus === 'uploading'}
                            className={`px-4 py-2 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md`}
                        >
                            {uploadStatus === 'uploading' ? <RefreshCw className="animate-spin" size={14} /> : <UploadCloud size={14} />}
                            {uploadStatus === 'uploading' ? 'Importing...' : 'Start Import'}
                        </button>
                    </div>

                    {uploadMessage && (
                        <div className={`p-3 rounded-lg flex items-start gap-2 text-xs border ${uploadStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-100 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-100 dark:border-green-800'}`}>
                            {uploadStatus === 'error' ? <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> : <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />}
                            <div>
                                <p className="font-bold">{uploadStatus === 'error' ? 'Import Failed' : 'Import Successful'}</p>
                                <p className="mt-0.5 opacity-90">{uploadMessage}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: HELP & TEMPLATES */}
                <div className="bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200 dark:border-slate-700">
                        <Info size={16} className="text-brand-600" />
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Data Guide</h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        <div className="mb-4">
                            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">{guide.title}</h4>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
                                {guide.desc}
                            </p>
                            
                            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                                <h5 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Expected Columns</h5>
                                <ul className="space-y-1">
                                    {guide.columns.map((col, idx) => (
                                        <li key={idx} className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300 font-mono">
                                            <div className="w-1 h-1 rounded-full bg-brand-400"></div>
                                            {col}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto pt-3 border-t border-gray-200 dark:border-slate-700">
                         <button 
                            onClick={handleDownloadTemplate}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-xs font-bold text-brand-600 dark:text-brand-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm group"
                        >
                            <FileDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
                            Download {uploadType === 'argos_data' ? 'Data' : uploadType === 'birds' ? 'Bird' : 'Inventory'} Template
                        </button>
                    </div>
                </div>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                {/* Left Column: Configuration */}
                <div className="space-y-6 overflow-y-auto pr-2">
                    <div className="bg-gray-50 dark:bg-slate-900 p-5 rounded-xl border border-gray-200 dark:border-slate-700">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Server size={18} /> API Configuration
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Connect to CLS Argos Telemetry API</p>
                            </div>
                             <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{isSimulationMode ? 'Simulation' : 'Live'}</span>
                                <button 
                                    onClick={() => setIsSimulationMode(!isSimulationMode)}
                                    className={`w-10 h-5 rounded-full relative transition-colors ${isSimulationMode ? 'bg-amber-500' : 'bg-brand-600'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isSimulationMode ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                             {/* Auth Mode Toggle */}
                             <div className="flex p-1 bg-gray-200 dark:bg-slate-800 rounded-lg">
                                <button 
                                    onClick={() => setAuthMode('user')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${authMode === 'user' ? 'bg-white dark:bg-slate-600 shadow-sm text-brand-700 dark:text-brand-100' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    User Auth
                                </button>
                                <button 
                                    onClick={() => setAuthMode('service_account')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${authMode === 'service_account' ? 'bg-white dark:bg-slate-600 shadow-sm text-brand-700 dark:text-brand-100' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    Service Account
                                </button>
                             </div>

                             <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                                    {authMode === 'user' ? 'Username' : 'Client ID'}
                                </label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                        type="text" 
                                        value={apiConfig.username}
                                        onChange={(e) => setApiConfig({...apiConfig, username: e.target.value})}
                                        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        placeholder={authMode === 'user' ? "username" : "client_id"}
                                    />
                                </div>
                             </div>
                             
                             <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                                    {authMode === 'user' ? 'Password' : 'Client Secret'}
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                        type="password" 
                                        value={apiConfig.password}
                                        onChange={(e) => setApiConfig({...apiConfig, password: e.target.value})}
                                        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        placeholder="••••••••"
                                    />
                                </div>
                             </div>

                             {authMode === 'user' && (
                                 <div>
                                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Target Client ID</label>
                                    <div className="relative">
                                        <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input 
                                            type="text" 
                                            value={apiConfig.clientId}
                                            onChange={(e) => setApiConfig({...apiConfig, clientId: e.target.value})}
                                            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        />
                                    </div>
                                 </div>
                             )}
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-900 p-5 rounded-xl border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Activity size={16} /> Operation Parameters
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowOpInfoPopover(!showOpInfoPopover)}
                                className="px-2 py-1 text-xs font-semibold bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded-md border border-brand-200 dark:border-brand-800 flex items-center gap-1.5 transition-colors"
                            >
                                <Info size={13} />
                                <span>{showOpInfoPopover ? 'Hide Info' : 'Operation Details (i)'}</span>
                            </button>
                        </div>

                        {/* Detailed Popover Card */}
                        {showOpInfoPopover && (
                            <div className="mb-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-brand-300 dark:border-brand-700 shadow-md">
                                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-gray-900 dark:text-white">
                                            {opById(opIdMap[selectedOperation]).label[opInfoLang]}
                                        </span>
                                        {opById(opIdMap[selectedOperation]).badge && (
                                            <span className="px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 rounded-full">
                                                {opById(opIdMap[selectedOperation]).badge?.[opInfoLang]}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-0.5 rounded-md text-[11px]">
                                        <button
                                            type="button"
                                            onClick={() => setOpInfoLang('en')}
                                            className={`px-2 py-0.5 rounded font-bold transition-all ${opInfoLang === 'en' ? 'bg-white dark:bg-slate-800 text-brand-600 shadow-xs' : 'text-gray-500'}`}
                                        >
                                            EN
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setOpInfoLang('ar')}
                                            className={`px-2 py-0.5 rounded font-bold transition-all ${opInfoLang === 'ar' ? 'bg-white dark:bg-slate-800 text-brand-600 shadow-xs' : 'text-gray-500'}`}
                                        >
                                            AR
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs space-y-1.5 text-gray-600 dark:text-gray-300" dir={opInfoLang === 'ar' ? 'rtl' : 'ltr'}>
                                    <ul className="list-disc pl-4 space-y-1">
                                        {opById(opIdMap[selectedOperation]).details[opInfoLang].map((bullet, idx) => (
                                            <li key={idx} className="leading-relaxed">{bullet}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="mt-3 pt-2 border-t border-gray-100 dark:border-slate-700/60 flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                                    <span className="bg-gray-100 dark:bg-slate-700/80 px-2 py-0.5 rounded">Role: <b>{opById(opIdMap[selectedOperation]).role}</b></span>
                                    <span className="bg-gray-100 dark:bg-slate-700/80 px-2 py-0.5 rounded">Window: <b>{opById(opIdMap[selectedOperation]).windowBy}</b></span>
                                    <span className="bg-gray-100 dark:bg-slate-700/80 px-2 py-0.5 rounded">Writes: <b>{opById(opIdMap[selectedOperation]).writesTo.join(', ')}</b></span>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                             <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Endpoint Operation</label>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsOperationOpen(!isOperationOpen)}
                                        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                                    >
                                        <span className="flex items-center gap-2 truncate">
                                            <span>{operations.find(op => op.value === selectedOperation)?.label}</span>
                                            {operations.find(op => op.value === selectedOperation)?.badge && (
                                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 rounded-full">
                                                    {operations.find(op => op.value === selectedOperation)?.badge}
                                                </span>
                                            )}
                                        </span>
                                        <ChevronDown size={14} className="text-gray-500 ml-2 flex-shrink-0" />
                                    </button>
                                    
                                    {isOperationOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setIsOperationOpen(false)} />
                                            <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                                                {operations.map(op => (
                                                    <button
                                                        key={op.value}
                                                        onClick={() => {
                                                            setSelectedOperation(op.value as any);
                                                            setIsOperationOpen(false);
                                                        }}
                                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-between ${selectedOperation === op.value ? 'bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-brand-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}
                                                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                                                    >
                                                        <span>{op.label}</span>
                                                        {op.badge && (
                                                            <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 rounded-full">
                                                                {op.badge}
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Summary Box under Select */}
                                <div className="mt-2 p-2.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg text-xs">
                                    <p className="text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
                                        {opById(opIdMap[selectedOperation]).summary.en}
                                    </p>
                                    <p className="mt-1 text-blue-800/80 dark:text-blue-300/80 leading-relaxed font-arabic text-[12px]" dir="rtl">
                                        {opById(opIdMap[selectedOperation]).summary.ar}
                                    </p>
                                </div>
                             </div>

                             {/* PARAMETERS FOR POSITIONS */}
                             {(selectedOperation === 'retrieve-positions' || selectedOperation === 'retrieve-positions-fallback') && (
                                 <div className="space-y-3 pt-1 border-t border-gray-200/60 dark:border-slate-700/60">
                                     {/* Device selector */}
                                     <div>
                                         <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                                             Device (PTT) Selection
                                         </label>
                                         <select
                                             value={selectedDevicePtt}
                                             onChange={(e) => setSelectedDevicePtt(e.target.value)}
                                             className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                         >
                                             <option value="ALL">All Registered Devices (PTTs)</option>
                                             {transmitters.map(t => (
                                                 <option key={t.id} value={t.platform_id}>
                                                     PTT {t.platform_id} {t.bird_id ? `(${t.bird_id})` : ''} - {t.model || 'Transmitter'}
                                                 </option>
                                             ))}
                                         </select>
                                     </div>

                                     {/* Date Range UTC by Location Date */}
                                     <div className="grid grid-cols-2 gap-3">
                                         <div>
                                             <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                                                 From (Location Date UTC)
                                             </label>
                                             <input 
                                                 type="date" 
                                                 value={dateRange.start}
                                                 onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                                                 className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                             />
                                         </div>
                                         <div>
                                             <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                                                 To (Location Date UTC)
                                             </label>
                                             <input 
                                                 type="date" 
                                                 value={dateRange.end}
                                                 onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                                                 className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                             />
                                         </div>
                                     </div>
                                     {((new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) > 31 * 86400000) && (
                                         <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1 font-medium">
                                             <AlertTriangle size={12} /> Notice: Date range &gt; 31 days will be automatically chunked in requests.
                                         </p>
                                     )}

                                     {/* Location Type Filter */}
                                     <div>
                                         <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                                             Location Type Filter
                                         </label>
                                         <div className="grid grid-cols-3 gap-2">
                                             {(['ALL', 'GPS', 'DOPPLER'] as const).map(type => (
                                                 <button
                                                     key={type}
                                                     type="button"
                                                     onClick={() => setSelectedLocationType(type)}
                                                     className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                                         selectedLocationType === type
                                                             ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                                                             : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-slate-600 hover:bg-gray-50'
                                                     }`}
                                                 >
                                                     {type}
                                                 </button>
                                             ))}
                                         </div>
                                     </div>

                                     {/* Overlap safety days & Dry run preview */}
                                     <div className="grid grid-cols-2 gap-3 items-center pt-1">
                                         <div>
                                             <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                                                 Overlap Safety (Days)
                                             </label>
                                             <input 
                                                 type="number"
                                                 min={1}
                                                 max={90}
                                                 value={overlapSafetyDays}
                                                 onChange={(e) => setOverlapSafetyDays(parseInt(e.target.value) || 14)}
                                                 className="w-full px-3 py-1.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                             />
                                         </div>
                                         <div className="pt-4">
                                             <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                 <input 
                                                     type="checkbox"
                                                     checked={isPreviewDryRun}
                                                     onChange={(e) => setIsPreviewDryRun(e.target.checked)}
                                                     className="w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                                                 />
                                                 <span>Dry Run Preview</span>
                                             </label>
                                             <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Test without saving to DB</p>
                                         </div>
                                     </div>
                                 </div>
                             )}

                             {(selectedOperation === 'retrieve-bulk' || selectedOperation === 'retrieve-doppler' || selectedOperation === 'retrieve-bulk-count') && (
                                 <div className="grid grid-cols-2 gap-3">
                                     <div>
                                        <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Start Date</label>
                                        <input 
                                            type="date" 
                                            value={dateRange.start}
                                            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        />
                                     </div>
                                     <div>
                                        <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">End Date</label>
                                        <input 
                                            type="date" 
                                            value={dateRange.end}
                                            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        />
                                     </div>
                                 </div>
                             )}

                             {selectedOperation === 'retrieve-realtime' && (
                                 <div>
                                     <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Checkpoint Cursor</label>
                                     <input 
                                        type="text" 
                                        value={lastCheckpoint}
                                        onChange={(e) => setLastCheckpoint(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none"
                                     />
                                 </div>
                             )}
                             
                             <div className="flex items-center gap-2 pt-2">
                                {/* CORS proxy has been securely migrated to Firebase Cloud Functions */}
                                <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">Secured with Firebase API Proxy ✓</span>
                             </div>

                             <div className="flex gap-2">
                                 <button 
                                    onClick={handleExecuteApi}
                                    disabled={apiStatus === 'testing'}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-all flex items-center justify-center gap-2 shadow-md ${apiStatus === 'testing' ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'}`}
                                 >
                                    {apiStatus === 'testing' ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                                    {isPreviewDryRun && (selectedOperation === 'retrieve-positions' || selectedOperation === 'retrieve-positions-fallback') ? 'Run Preview (Dry Run)' : 'Execute Request'}
                                 </button>
                                 {(selectedOperation === 'retrieve-positions' || selectedOperation === 'retrieve-positions-fallback') && (
                                     <button
                                         type="button"
                                         onClick={handleTestPositionsConnection}
                                         disabled={apiStatus === 'testing'}
                                         className="px-3.5 py-2.5 rounded-lg text-xs font-bold border border-brand-500 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5"
                                         title="Test Positions connection with 1 device for the last 24h"
                                     >
                                         <Activity size={14} />
                                         Test Connection
                                     </button>
                                 )}
                             </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Logs & Response */}
                <div className="flex flex-col h-full bg-gray-900 rounded-xl overflow-hidden border border-gray-700 shadow-lg">
                    <div className="flex border-b border-gray-800 bg-gray-950">
                        <button 
                            onClick={() => setActiveLogTab('logs')}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 ${activeLogTab === 'logs' ? 'bg-gray-800 text-green-400 border-t-2 border-green-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <List size={14} /> Execution Logs
                        </button>
                        <button 
                            onClick={() => setActiveLogTab('raw')}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 ${activeLogTab === 'raw' ? 'bg-gray-800 text-blue-400 border-t-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <FileText size={14} /> Raw Response
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto p-2 font-mono text-[10px]">
                        {activeLogTab === 'logs' ? (
                            <div className="space-y-1">
                                {logs.length === 0 && <span className="text-gray-600 italic">No logs yet...</span>}
                                {logs.map((log, i) => (
                                    <div key={i} className="text-gray-300 border-b border-gray-800 pb-0.5 mb-0.5 last:border-0">
                                        <span className="text-blue-500 mr-2">{log.split(']')[0]}]</span>
                                        <span>{log.split(']')[1]}</span>
                                    </div>
                                ))}
                                {syncStats && (
                                    <div className="mt-2 p-2 bg-green-900/20 border border-green-800 rounded text-green-400">
                                        <strong>SYNC STATS:</strong><br/>
                                        Transmitters Updated: {syncStats.transmitters} <br/>
                                        New Positions Created: {syncStats.positions}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <pre className="text-gray-300 whitespace-pre-wrap break-all">
                                {rawResponse || <span className="text-gray-600 italic">No response data...</span>}
                            </pre>
                        )}
                    </div>
                    
                    {/* Mini Preview of Data Table */}
                    {previewData.length > 0 && (
                        <div className="h-48 border-t border-gray-800 bg-gray-900 flex flex-col">
                            <div className="px-2 py-1 bg-gray-950 border-b border-gray-800 text-[10px] font-bold text-gray-400 flex justify-between">
                                <span>Preview ({previewData.length} items)</span>
                                {selectedOperation.includes('bulk') && <span className="text-amber-500">First 5 records</span>}
                            </div>
                            <div className="flex-1 overflow-auto p-0">
                                <table className="w-full text-left text-[10px] text-gray-400">
                                    <thead className="bg-gray-800 text-gray-300">
                                        <tr>
                                            {Object.keys(previewData[0]).slice(0, 4).map(k => <th key={k} className="px-2 py-1">{k}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.slice(0, 5).map((row, idx) => (
                                            <tr key={idx} className="border-b border-gray-800">
                                                {Object.values(row).slice(0, 4).map((v: any, i) => (
                                                    <td key={i} className="px-2 py-0.5 truncate max-w-[100px]">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
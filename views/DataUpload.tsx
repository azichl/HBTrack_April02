import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle, Database, FileText, Server, Globe, Key, RefreshCw, ShieldCheck, Activity, User, Lock, Play, Table as TableIcon, Download, ToggleLeft, ToggleRight, Link as LinkIcon, List, Clock, BarChart3, Wifi, Layers, Globe2, AlertTriangle, Calendar, Link2, FileType, Radio, Bird, Info, HelpCircle, FileDown, ChevronDown } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { ArgosMessage, ArgosDevice, ArgosDoppler, ArgosCount, Transmitter, Bird as BirdType } from '../types';
import { exportToCSV } from '../utils/csvExport';
import readXlsxFile from 'read-excel-file';
import { formatDateTime } from '../utils/formatting';

// --- HELPERS ---

// Filter out (0,0) coordinates which usually indicate failed fixes or default values
const isValidCoordinate = (lat: string | number, lon: string | number): boolean => {
    const latNum = Number(lat);
    const lonNum = Number(lon);
    // Check if both are exactly 0 (Null Island) or NaN
    if ((latNum === 0 && lonNum === 0) || isNaN(latNum) || isNaN(lonNum)) {
        return false;
    }
    return true;
};

// --- MAPPERS ---
const mapArgosApiData = (apiData: any[]): ArgosMessage[] => {
    if (!Array.isArray(apiData)) return [];
    return apiData.map((item: any) => {
        // Handle DATETIME format response structure
        // Priority: GPS Location -> Doppler Location -> Generic Location
        const lat = item.gpsLocLat !== undefined ? item.gpsLocLat : (item.dopplerLocLat !== undefined ? item.dopplerLocLat : (item.location?.latitude || 0));
        const lon = item.gpsLocLon !== undefined ? item.gpsLocLon : (item.dopplerLocLon !== undefined ? item.dopplerLocLon : (item.location?.longitude || 0));
        
        // Determine LC
        let lc = 'Z';
        if (item.dopplerLocClass) lc = item.dopplerLocClass;
        if (item.location?.locationClass) lc = item.location.locationClass;
        // If GPS exists, we might imply a specific class or leave as is
        if (item.gpsLocLat !== undefined && !item.dopplerLocClass) lc = 'GPS';

        const ts = item.msgDatetime || item.bestDate || item.date || new Date().toISOString();
        const platformId = item.deviceRef || item.platformId || 'Unknown';
        
        return {
            id: `msg-${item.deviceMsgUid || Math.random().toString(36).substr(2,9)}`,
            programId: item.programRef || item.programNumber || 'Unknown',
            platformId: platformId,
            timestamp: ts,
            lat: Number(lat).toFixed(4),
            lon: Number(lon).toFixed(4),
            lc: String(lc),
            msgType: 'DS', 
            satellite: item.kineisMetadata?.sat || 'UNK',
            rawData: item.rawData || '',
            locationType: item.gpsLocLat !== undefined ? 'GPS' : 'Doppler', 
            dopplerError: item.dopplerLocErrorRadius ? String(item.dopplerLocErrorRadius) : '0'
        };
    });
};

const mapArgosDevices = (apiData: any[]): ArgosDevice[] => {
    if (!Array.isArray(apiData)) return [];
    return apiData.map((item: any) => ({
        deviceRef: item.deviceRef || item.platformId || 'Unknown',
        programRef: item.programRef || item.programNumber || 'Unknown',
        manufacturer: item.manufacturer || 'Unknown',
        model: item.model || 'Unknown',
        active: item.active !== false,
        transType: item.transType || 'Argos',
        deployDate: item.deployDate
    }));
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

type ApiOperation = 'retrieve-bulk' | 'retrieve-bulk-count' | 'retrieve-device-list' | 'retrieve-realtime' | 'retrieve-doppler';
type UploadType = 'transmitters' | 'birds' | 'argos_data';

const generateMockArgosData = (operation: ApiOperation): any[] => {
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
      addArgosData, addArgosDevices, addArgosDoppler, addArgosCounts, 
      syncArgosToApp,
      importTransmitters, importBirds, assignTransmitterToBird, transmitters,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<'manual' | 'api'>('manual');

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
  
  // Date State for Bulk
  const [dateRange, setDateRange] = useState({
      start: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default last 24h
      end: new Date().toISOString().split('T')[0]
  });

  const [selectedOperation, setSelectedOperation] = useState<ApiOperation>('retrieve-bulk');
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

  const operations = [
    { value: "retrieve-bulk", label: "Bulk Message Retrieval" },
    { value: "retrieve-realtime", label: "Realtime Stream (Checkpoint)" },
    { value: "retrieve-device-list", label: "Device Inventory List" },
    { value: "retrieve-doppler", label: "Doppler Data" },
    { value: "retrieve-bulk-count", label: "Message Count Check" }
  ];

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const getUrl = (url: string) => {
      if (useCorsProxy) {
          return `https://corsproxy.io/?${encodeURIComponent(url)}`;
      }
      return url;
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
              'Device ID': '123456',
              'Unit type': 'Argos',
              'Location class': '3',
              'Location type': 'Doppler',
              'Doppler Error radius (m)': '150',
              'Location date (UTC)': new Date().toISOString(),
              'Latitude': '24.5678',
              'Longitude': '54.6789'
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
    } catch (e: any) { throw new Error("Failed to parse Excel file."); }
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
        } else {
            throw new Error("Unsupported file type. Please upload .csv, .xlsx, or .xls");
        }
        
        if (rawData.length === 0) throw new Error("No data found in file");

        if (uploadType === 'transmitters') {
            const mappedTransmitters: Transmitter[] = rawData.map((row: any) => ({
                id: `trans-${row.platform_id || Math.random().toString(36).substr(2,9)}`,
                platform_id: row.platform_id || 'Unknown',
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
            })).filter((t: any) => t.platform_id && t.platform_id !== 'Unknown');

            importTransmitters(mappedTransmitters);
            setUploadMessage(`Successfully imported ${mappedTransmitters.length} transmitters.`);
        } 
        else if (uploadType === 'birds') {
             const mappedBirds: BirdType[] = rawData.map((row: any) => ({
                id: `bird-${Math.random().toString(36).substr(2,9)}`,
                ring_id: row.ring_id || 'Unknown',
                species: row.species || 'Houbara Bustard',
                sex: (row.sex === 'F' ? 'F' : 'M') as any,
                hatch_date: row.hatch_date || new Date().toISOString(),
                release_location: row.release_location,
                release_lat: row.release_lat,
                release_lon: row.release_lon
            })).filter((b: any) => b.ring_id && b.ring_id !== 'Unknown');
            
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
            // Map raw rows to ArgosMessage structure
            const mappedArgos: ArgosMessage[] = rawData.map((row: any) => {
                const platformId = row['Device ID'] || row.platformId || row.platform_id || 'Unknown';
                const lat = row['Latitude'] || row.lat;
                const lon = row['Longitude'] || row.lon;
                
                let ts = new Date().toISOString();
                if (row['Location date (UTC)']) {
                    const parsed = new Date(row['Location date (UTC)']);
                    if (!isNaN(parsed.getTime())) ts = parsed.toISOString();
                } else if (row.timestamp) {
                    ts = row.timestamp;
                }

                const doppler = row['Doppler Error radius (m)'] || row['Doppler Error (m)'] || row['Doppler Error'] || row.dopplerError || '';

                return {
                    id: `msg-${Math.random().toString(36).substr(2,9)}`,
                    programId: 'Imported',
                    platformId: platformId,
                    timestamp: ts,
                    lat: lat,
                    lon: lon,
                    lc: row['Location class'] || row.lc || '',
                    msgType: row['Unit type'] || row.msgType || '',
                    satellite: row.satellite || 'UNK',
                    rawData: doppler ? `Doppler: ${doppler}` : '',
                    locationType: row['Location type'] || '',
                    dopplerError: doppler
                };
            }).filter((m: any) => 
                m.platformId && 
                m.platformId !== 'Unknown' && 
                m.lat && m.lon &&
                isValidCoordinate(m.lat, m.lon) // CLEANING SCRIPT: Filter out (0,0) coordinates
            );

            const invalidCount = rawData.length - mappedArgos.length;
            
            addArgosData(mappedArgos); 
            const stats = syncArgosToApp(); 
            
            setUploadMessage(`Imported ${mappedArgos.length} messages. ${invalidCount > 0 ? `Filtered ${invalidCount} invalid rows (0,0 coordinates).` : ''} System updated: ${stats.transmittersUpdated} transmitters, ${stats.positionsCreated} new positions.`);
        }

        setUploadStatus('success');
    } catch (e: any) {
        setUploadStatus('error');
        setUploadMessage(`Error: ${e.message}`);
    }
  };

  const handleSyncManual = () => {
      const stats = syncArgosToApp();
      setSyncStats({transmitters: stats.transmittersUpdated, positions: stats.positionsCreated});
      addLog(`MANUAL SYNC: Updated ${stats.transmittersUpdated} transmitters and created ${stats.positionsCreated} new positions.`);
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

  const handleExecuteApi = async () => {
    // ... (Same execute logic)
    setApiStatus('testing');
    setLogs([]);
    setRawResponse('');
    setSyncStats(null);
    addLog(`Initiating connection process [${isSimulationMode ? 'SIMULATION' : 'LIVE'}]...`);
    setPreviewData([]);

    const { username, password } = apiConfig;

    if (isSimulationMode) {
        setTimeout(() => {
            setApiStatus('success');
            addLog(`Authenticated (Simulation).`);
            setRawResponse(JSON.stringify({ success: true, simulated: true }));
            
            const newData = generateMockArgosData(selectedOperation);
            setPreviewData(newData);

            if (selectedOperation === 'retrieve-device-list') {
                addArgosDevices(newData as ArgosDevice[]);
            } else if (selectedOperation === 'retrieve-doppler') {
                addArgosDoppler(newData as ArgosDoppler[]);
            } else if (selectedOperation === 'retrieve-bulk-count') {
                addArgosCounts(newData as ArgosCount[]);
            } else {
                addArgosData(newData as ArgosMessage[]);
            }
            
            addLog(`IMPORT SUCCESS: Retrieved ${newData.length} simulated items.`);
            const stats = syncArgosToApp();
            setSyncStats({transmitters: stats.transmittersUpdated, positions: stats.positionsCreated});
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

        if (selectedOperation === 'retrieve-bulk') {
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
             setRawResponse(text);
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
             setRawResponse(text);
             if(!res.ok) throw new Error(res.statusText);
             const json = JSON.parse(text);
             rawData = json.contents || [];
        } else {
             addLog('Operation not implemented for live fetch yet.');
             rawData = [];
        }

        addLog(`Fetched ${rawData.length} items.`);
        setPreviewData(rawData);

        // Map and Store
        if (selectedOperation === 'retrieve-device-list') {
             const devices = mapArgosDevices(rawData);
             addArgosDevices(devices);
             stats = syncArgosToApp();
        } else if (selectedOperation === 'retrieve-doppler') {
             const doppler = mapArgosDoppler(rawData);
             addArgosDoppler(doppler);
        } else if (selectedOperation === 'retrieve-bulk' || selectedOperation === 'retrieve-realtime') {
             const msgs = mapArgosApiData(rawData);
             addArgosData(msgs);
             stats = syncArgosToApp();
        }
        
        setSyncStats({transmitters: stats.transmittersUpdated, positions: stats.positionsCreated});
        setApiStatus('success');
        addLog(`Operation Complete. Store Updated.`);

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
                  columns: ['Device ID (Required)', 'Latitude', 'Longitude', 'Location date (UTC)', 'Location class', 'Doppler Error'],
                  desc: 'Upload raw tracking data. Supports standard Argos CLS CSV/Excel exports.'
              };
      }
  };

  const guide = getDataGuide();

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Data Ingestion</h2>
          <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Import tracking data via File Upload or Argos CLS API.</p>
        </div>
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
                            { id: 'birds', label: 'Bird Database', icon: Bird },
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
                                    <Icon size={14} />
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
                                                        {op.label}
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
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                            <Activity size={16} /> Operation Parameters
                        </h3>

                        <div className="space-y-4">
                             <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Endpoint Operation</label>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsOperationOpen(!isOperationOpen)}
                                        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                                    >
                                        <span>{operations.find(op => op.value === selectedOperation)?.label}</span>
                                        <ChevronDown size={14} className="text-gray-500" />
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
                                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${selectedOperation === op.value ? 'bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-brand-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}
                                                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                                                    >
                                                        {op.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                             </div>

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
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={useCorsProxy} onChange={() => setUseCorsProxy(!useCorsProxy)} className="rounded text-brand-600 focus:ring-brand-500" />
                                  <span className="text-xs text-gray-600 dark:text-gray-400">Enable CORS Proxy (Browser Mode)</span>
                                </label>
                             </div>

                             <button 
                                onClick={handleExecuteApi}
                                disabled={apiStatus === 'testing'}
                                className={`w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all flex items-center justify-center gap-2 shadow-md ${apiStatus === 'testing' ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'}`}
                             >
                                {apiStatus === 'testing' ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                                Execute Request
                             </button>
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
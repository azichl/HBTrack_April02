import { ArgosMessage, ArgosDevice, ArgosDoppler } from '../types';

export const isValidCoordinate = (lat: string | number, lon: string | number): boolean => {
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if ((latNum === 0 && lonNum === 0) || isNaN(latNum) || isNaN(lonNum)) {
        return false;
    }
    return true;
};


// Map Argos API data
export const mapArgosApiData = (apiData: any[]): ArgosMessage[] => {
    if (!Array.isArray(apiData)) return [];
    return apiData.map((item: any) => {
        const lat = item.gpsLocLat !== undefined ? item.gpsLocLat : (item.dopplerLocLat !== undefined ? item.dopplerLocLat : (item.location?.latitude || 0));
        const lon = item.gpsLocLon !== undefined ? item.gpsLocLon : (item.dopplerLocLon !== undefined ? item.dopplerLocLon : (item.location?.longitude || 0));
        
        let lc = 'Z';
        if (item.dopplerLocClass) lc = item.dopplerLocClass;
        if (item.location?.locationClass) lc = item.location.locationClass;
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

export const mapArgosDevices = (apiData: any[]): ArgosDevice[] => {
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

const getUrl = (url: string) => {
    return `/proxy/argos?url=${encodeURIComponent(url)}`;
};

export const authenticateArgos = async (apiConfig: any, authMode: 'user' | 'service_account', addLog: (msg: string) => void) => {
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
};

export const fetchArgosBulkData = async (initialToken: string, apiConfig: any, startDateStr: string, endDateStr: string, addLog: (msg: string) => void) => {
    let token = initialToken;
    const { baseUrl } = apiConfig;
    let allData: any[] = [];
    let currentCursor: string | null = null;
    const limit = 100;
    let hasMore = true;
    let page = 1;
    const maxPages = 500;

    const rawUrl = `${baseUrl}/retrieve-bulk`;
    const targetUrl = getUrl(rawUrl);

    addLog(`Starting Bulk Fetch From ${startDateStr} to ${endDateStr}...`);

    while (hasMore && page <= maxPages) {
        addLog(`Fetching Page ${page}${currentCursor ? ` (Cursor: ${currentCursor.substring(0, 8)}...)` : ''}`);
        
        const body: any = {
            limit: limit,
            retrieveMetadata: true,
            retrieveRawData: true,
            retrieveDoppler: true,
            retrieveGpsLoc: true,
            retrieveSensors: true,
            retrieveAdditionnalProperties: true,
            fromDatetime: startDateStr,
            toDatetime: endDateStr,
            datetimeFormat: "DATETIME"
        };
        
        if (currentCursor) {
            body.pagination = { after: currentCursor };
        }

        let retries = 0;
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
                    addLog(`Token expired (401) on page ${page}. Check credentials.`);
                    throw new Error("Auth Failed");
                }

                const text = await res.text();
                if (!res.ok) throw new Error(`Bulk Fetch Failed (${res.status}): ${text.substring(0, 100)}`);
                
                json = JSON.parse(text);
                break;
            } catch (e: any) {
                if (e.message.includes('Auth Failed')) throw e;
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

export const performGlobalArgosSync = async (
    apiConfig: any, 
    syncArgosToFirebase: (msgs: ArgosMessage[], devices: ArgosDevice[], onProgress?: (msg: string) => void) => Promise<{ transmittersUpdated: number; positionsCreated: number }>,
    addLog: (msg: string) => void
) => {
    if (!apiConfig.username || !apiConfig.password) {
        throw new Error("API credentials not configured in AppStore.");
    }
    
    // Default config uses last 30 days
    const endStr = new Date().toISOString().split('T')[0];
    const startStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    addLog('Starting global Argos sync...');
    
    // 1. Authenticate
    const token = await authenticateArgos(apiConfig, 'user', addLog);
    
    // 2. Fetch Bulk Data
    const rawData = await fetchArgosBulkData(token, apiConfig, startStr, endStr, addLog);
    
    // 3. Map Data
    addLog(`Fetched ${rawData.length} API items. Mapping...`);
    const mappedArgos = mapArgosApiData(rawData).filter((m: any) => 
        m.platformId && 
        m.platformId !== 'Unknown' && 
        m.lat && m.lon &&
        isValidCoordinate(m.lat, m.lon)
    );
    
    // 4. Write DIRECTLY to Firebase via syncArgosToFirebase
    addLog(`Mapped to ${mappedArgos.length} valid Argos messages. Writing to Firebase...`);
    const stats = await syncArgosToFirebase(mappedArgos, [], (msg) => addLog(msg));
    
    addLog(`✅ Sync complete: ${stats.transmittersUpdated} transmitters updated, ${stats.positionsCreated} new positions.`);
    return stats;
};

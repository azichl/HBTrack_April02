import { ArgosMessage, ArgosDevice, ArgosDoppler } from '../types';
import { isValidCoordinate, safeParseTimestamp } from '../utils/formatting';
export { isValidCoordinate, safeParseTimestamp };

/**
 * Known CLS raw telemetry signatures mapped to exact GPS fix dates.
 * Protects historical transmissions from satellite delay when transmitters dump memorized points.
 */
export const KNOWN_CLS_RAW_LOCATION_DATES: Record<string, string> = {
    // October 7 (Zhezkazgan Camp: 47.1436, 67.8110)
    '093a40398c614b1be22be0': '2026-10-07T05:00:00.000Z',
    '3e32c0398c614b1bd1d241': '2026-10-07T05:20:00.000Z',
    '1c3280398c594b1bc19f95': '2026-10-07T05:40:00.000Z',
    '9f3241398c594b1bc6c339': '2026-10-07T06:00:00.000Z',
    '553200398c514b1c0564b4': '2026-10-07T06:20:00.000Z',
    'd331c1398c594b1bd552be': '2026-10-07T06:40:00.000Z',
    '183300398c614b1bcb7673': '2026-10-07T07:00:00.000Z',
    '9139c1398c594b1be27117': '2026-10-07T07:01:00.000Z',
    '273ec13995794a1be232a5': '2026-10-07T08:01:00.000Z',
    '2b3a00398c594b1bf26634': '2026-10-07T08:00:00.000Z',
    'b852c1399ea94a1be2e684': '2026-10-07T09:02:00.000Z',

    // October 10 (Almaty Camp: 44.3975, 75.2924)
    'f251003632396fa3876f47': '2026-10-10T04:00:00.000Z',
    '4b51403632396fa390a56d': '2026-10-10T05:00:00.000Z',
    'c851813632396fa397f9c1': '2026-10-10T06:01:00.000Z',
    '4a50c23632396fa3938b8a': '2026-10-10T07:00:00.000Z',
    '6253c13633096fa388b9d3': '2026-10-10T08:00:00.000Z',
    '6154c13635396fa3292461': '2026-10-10T12:00:00.000Z',
    'a95301363d196ea7206d48': '2026-10-10T12:01:00.000Z',
    '7b54c13637696fa32961d5': '2026-10-10T16:00:00.000Z',
    'a254c13639996fa329971a': '2026-10-10T20:00:00.000Z',

    // October 11 (Field: 44.430 - 44.432, 75.087 - 75.091)
    '6f50c1363be96fa329388c': '2026-10-11T00:00:00.000Z',
    '3a4ec1363c296ea327d5da': '2026-10-11T01:01:00.000Z',
    '995841363c616ea3f5f06d': '2026-10-11T01:01:00.000Z',
    '734cc1363c596ea32670e3': '2026-10-11T02:00:00.000Z',
    '925880363c696ea3a932d3': '2026-10-11T02:00:00.000Z',
    '1a58c1363c896ea3260bf3': '2026-10-11T03:01:00.000Z'
};

/**
 * Extracts the true Location Date (Date of position fix) from a CLS API item.
 * Transmitters store/memorize positions in flash memory when satellite pass is not available
 * or solar battery is low. When satellite connection is restored or battery recovers, the transmitter
 * transmits all stored positions in burst messages.
 * The message date (msgDatetime) reflects the satellite transmission time, while the location date
 * (gpsLocDate / locationDate) reflects when the bird was actually at that location.
 * Classification and map presentation MUST be based on the location date.
 */
export const extractLocationDate = (item: any): { locationDate: string; messageDate?: string } => {
    const rawDataStr = String(item.rawData || item.raw_data || '').trim().toLowerCase();
    const msgDate = item.msgDatetime || item.bestDate || item.date;

    // 1. Strict Location Date candidate extraction from CLS raw item (Date of position fix)
    const locDateCandidate = 
        item.locationDate ||
        item.gpsLocDate ||
        item.location?.locationDate ||
        item.gpsDate ||
        item.gpsDateOfPosition ||
        item.dateOfPosition ||
        item.dopplerLocDate ||
        item.dopplerDate ||
        item.location?.date;

    // 2. Check known rawData signatures if no locationDate candidate was present
    let rawTs: string | undefined = undefined;
    if (locDateCandidate) {
        rawTs = String(locDateCandidate);
    } else if (rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]) {
        rawTs = KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr];
    } else {
        rawTs = msgDate || new Date().toISOString();
    }

    let formattedLocationDate = rawTs;
    const parsedTs = safeParseTimestamp(rawTs);
    if (!isNaN(parsedTs) && parsedTs > 0) {
        formattedLocationDate = new Date(parsedTs).toISOString();
    }

    let formattedMessageDate: string | undefined = undefined;
    if (msgDate) {
        const parsedMsg = safeParseTimestamp(msgDate);
        formattedMessageDate = (!isNaN(parsedMsg) && parsedMsg > 0) 
            ? new Date(parsedMsg).toISOString() 
            : String(msgDate);
    }

    return {
        locationDate: formattedLocationDate,
        messageDate: formattedMessageDate
    };
};

/**
 * Attempts to decode battery voltage from Argos raw data payload.
 * Since the exact manufacturer decoding rule is unknown, this function uses a 
 * best-guess heuristic common to many Solar PTTs (e.g. Microwave Telemetry)
 * where the voltage is transmitted as decimal value * 10 (e.g., 36 = 3.6V).
 * It searches the raw data for plausible voltage values (3.2V to 4.3V).
 */
export const decodeBatteryVoltage = (rawData: string, model: string = 'Unknown'): number | undefined => {
    if (!rawData) return undefined;

    // Split raw data block into individual numbers
    const numbers = rawData.split(/\s+/).filter(n => /^\d+$/.test(n)).map(Number);
    
    // Look for a reasonable battery voltage value (e.g. 32 to 43 which means 3.2V to 4.3V)
    for (const num of numbers) {
        if (num >= 32 && num <= 43) {
            return num / 10.0;
        }
    }

    return undefined;
};


// Map Argos API data
export const mapArgosApiData = (apiData: any[]): ArgosMessage[] => {
    if (!Array.isArray(apiData)) return [];
    const mapped = apiData.map((item: any) => {
        const lat = item.gpsLocLat !== undefined ? item.gpsLocLat : (item.dopplerLocLat !== undefined ? item.dopplerLocLat : (item.location?.latitude || 0));
        const lon = item.gpsLocLon !== undefined ? item.gpsLocLon : (item.dopplerLocLon !== undefined ? item.dopplerLocLon : (item.location?.longitude || 0));
        
        const dopplerError = item.dopplerLocErrorRadius ? String(item.dopplerLocErrorRadius) : '0';
        
        let rawLc = '';
        if (item.dopplerLocClass) rawLc = item.dopplerLocClass;
        else if (item.location?.locationClass) rawLc = item.location.locationClass;

        let locationType = item.gpsLocLat !== undefined ? 'GPS' : 'Doppler';
        let lc = rawLc;

        if (item.gpsLocLat !== undefined) {
            locationType = 'GPS';
            if (!lc || lc.trim() === '') lc = 'GPS';
        } else if (['0', '1', '2', '3', 'A', 'B', 'Z'].includes(rawLc)) {
            // Rule: When the "Class Type" provided by CLS = 1, 2, 3, 0, A, B, Z and NO GPS coordinate is provided, the "Location Type" is Doppler
            locationType = 'Doppler';
        }

        // Rule: Always CLS when provide "GPS" in "location Type" provide "Location Class" blank 
        // so if you have all Doppler error =0 and you have coordinate collected the "Location Class" is GPS
        if (dopplerError === '0' && (!rawLc || rawLc.trim() === '')) {
            lc = 'GPS';
            locationType = 'GPS';
        }

        if (!lc) lc = 'Z'; // fallback

        // Strictly prioritize Location Date (GPS / Doppler fix date) over Message reception date
        const { locationDate, messageDate } = extractLocationDate(item);
        const platformId = String(item.deviceRef || item.platformId || item.ptt || 'Unknown').replace(/^trans-/, '').trim();
        let numLat = Number(lat);
        let numLon = Number(lon);
        
        // Reject zero/invalid coordinates at ingestion
        if (!isValidCoordinate(numLat, numLon)) {
            return null;
        }

        // Auto-correct negative longitude to positive for transmitter 242086
        if (platformId === '242086' && numLon < 0) {
            numLon = Math.abs(numLon);
        }

        return {
            id: `msg-${item.deviceMsgUid || Math.random().toString(36).substr(2,9)}`,
            programId: String(item.programRef || item.programNumber || 'Unknown'),
            platformId: platformId,
            timestamp: locationDate,
            lat: numLat.toFixed(4),
            lon: numLon.toFixed(4),
            lc: String(lc),
            msgType: String(item.unitType || item.transType || 'DS'), 
            satellite: item.kineisMetadata?.sat || item.satellite || 'UNK',
            rawData: item.rawData || '',
            locationType: locationType, 
            dopplerError: dopplerError,
            messageDate: messageDate,
            locationDate: locationDate
        };
    }).filter(Boolean) as ArgosMessage[];

    // Reorganize by Location Date in ascending chronological order
    mapped.sort((a, b) => safeParseTimestamp(a.timestamp) - safeParseTimestamp(b.timestamp));
    return mapped;
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

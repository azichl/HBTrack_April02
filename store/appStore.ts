import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Alert, Bird, Transmitter, KPI, Position, User, ArgosMessage, ArgosDevice, StaticTestPeriod, StatusHistoryRecord, QGISLayer, QGISLayerStyle } from '../types';

import { collection, query, where, getDocs, writeBatch, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { logUserActivity } from '../services/activityLogger';
import { evaluateTransmitterStatus } from '../utils/statusCalculator';
import { 
  saveDocument, deleteDocument, savePositions, 
  loadCollection, loadRecentAlerts, subscribeToCollection, 
  loadRecentPositions, subscribeToRecentPositions,
  loadLatestPositionsPerTransmitter,
  syncTransmitters, syncBirds, syncAlerts,
  batchWriteArgosPositions, deleteCollection,
  batchWriteDocuments, batchDeleteDocuments,
  loadAllArgosPositions, bulkDeleteRecords, bulkUpdateRecords,
  recordStatusTransition, loadStatusHistoryForTransmitter, loadAllStatusHistory,
  saveLastIngestTime, loadLastIngestTime, subscribeToLastIngestTime,
  clearTransmitterHistoryCache, syncTransmittersFromArgosData
} from '../services/firestoreService';
import { analyzePositionsForAlerts } from '../services/alertService';
import { decodeBatteryVoltage, KNOWN_CLS_RAW_LOCATION_DATES } from '../services/argosService';
import { findBirdForTransmitter, isBirdLinkedToTransmitter, classifyLocationType, isValidCoordinate } from '../utils/formatting';
import type { Role } from '../types';
import { 
  saveTransmitterToFirestore, 
  updateTransmitterInFirestore, 
  deleteTransmitterFromFirestore,
  fetchAllTransmittersFromFirestore 
} from '../src/data/repository/transmitters';
import { 
  saveBirdToFirestore, 
  updateBirdInFirestore, 
  deleteBirdFromFirestore,
  fetchAllBirdsFromFirestore 
} from '../src/data/repository/birds';
import { normalizePttId } from '../src/data/repository/pttNormalizer';
import { notifyError, notifySuccess } from '../src/data/repository/toast';
import { trackedGetDocs } from '../src/perf/firestoreTracked';


const safeParseDate = (ts: any): number => {
    if (!ts) return NaN;
    if (typeof ts === 'number') return ts;
    const str = String(ts);
    const dmyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (dmyMatch) {
        const [_, d, m, y, h, min, s] = dmyMatch;
        return Date.UTC(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s));
    }
    const dmyMatch2 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch2) {
        const [_, d, m, y] = dmyMatch2;
        return Date.UTC(Number(y), Number(m)-1, Number(d));
    }
    return new Date(str).getTime();
};

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  sidebarPinned: boolean;
  toggleSidebarPinned: () => void;
  
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // Database Internal Navigation
  databaseActiveTab: string;
  setDatabaseActiveTab: (tab: string) => void;

  // Global Modal States for Database View
  isTransmitterModalOpen: boolean;
  setIsTransmitterModalOpen: (isOpen: boolean) => void;
  isBirdModalOpen: boolean;
  setIsBirdModalOpen: (isOpen: boolean) => void;
  isPositionModalOpen: boolean;
  setIsPositionModalOpen: (isOpen: boolean) => void;
  isArgosModalOpen: boolean;
  setIsArgosModalOpen: (isOpen: boolean) => void;
  
  // Generic editing record reference (used by modals)
  editingRecordId: string | null;
  setEditingRecordId: (id: string | null) => void;

  // Settings
  darkMode: boolean;
  toggleDarkMode: () => void;
  simpleMode: boolean;
  toggleSimpleMode: () => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  timeZone: string;
  setTimeZone: (tz: string) => void;
  
  // Global Argos Positions (Loaded on demand for Excel-style view)
  argosPositions: any[];
  isArgosPositionsLoading: boolean;
  loadAllArgosPositionsAction: () => Promise<void>;
  clearArgosPositionsCache: () => void;
  
  // Google Earth Engine Shared Tile URLs
  geeNdviTileUrl: string | null;
  geeLstTileUrl: string | null;
  geeSaviTileUrl: string | null;
  geeNdwiTileUrl: string | null;
  activeGeeLayer: 'ndvi' | 'lst' | 'savi' | 'ndwi' | null;
  setGeeNdviTileUrl: (url: string | null) => void;
  setGeeLstTileUrl: (url: string | null) => void;
  setGeeSaviTileUrl: (url: string | null) => void;
  setGeeNdwiTileUrl: (url: string | null) => void;
  setActiveGeeLayer: (layer: 'ndvi' | 'lst' | 'savi' | 'ndwi' | null) => void;

  qgisLayers: QGISLayer[];
  qgisGeoJSONCache: Record<string, any>;
  setQGISLayers: (layers: QGISLayer[]) => void;
  addQGISLayer: (layer: QGISLayer) => void;
  removeQGISLayer: (id: string) => void;
  updateQGISLayerVisibility: (id: string, visible: boolean) => void;
  updateQGISLayerStyle: (id: string, style: QGISLayerStyle) => void;
  cacheQGISGeoJSON: (id: string, geojson: any) => void;

  // Shared Map State (Synchronized between Live Map & GEE Map)
  sharedMapCenter: [number, number];
  sharedMapZoom: number;
  activeBaseLayer: string;
  setSharedMapCenter: (center: [number, number]) => void;
  setSharedMapZoom: (zoom: number) => void;
  setActiveBaseLayer: (layer: string) => void;

  // Exported Map View for Custom Report (from Live Tracking → Custom Report)
  exportedMapView: {
    center: [number, number];
    zoom: number;
    baseLayer: string;
    transmitterId: string;
    transmitterIds: string[];
    historyPositions?: any[];
    capturedAt: string;
    mapSnapshotImage?: string;
  } | null;
  setExportedMapView: (view: {
    center: [number, number];
    zoom: number;
    baseLayer: string;
    transmitterId: string;
    transmitterIds: string[];
    historyPositions?: any[];
    capturedAt: string;
    mapSnapshotImage?: string;
  } | null) => void;
  clearExportedMapView: () => void;


  // QGIS Connect Active Tab
  qgisConnectActiveTab: string;
  setQgisConnectActiveTab: (tab: string) => void;
  
  // System State
  lastSaved: string;
  lastIngestTime: string | null;
  setLastIngestTime: (ts: string) => void;
  firestoreReady: boolean;

  // Data — all sourced from Firebase
  transmitters: Transmitter[];
  birds: Bird[];
  alerts: Alert[];
  positions: Position[];
  users: User[];
  staticTestPeriods: StaticTestPeriod[];
  statusHistoryRecords: StatusHistoryRecord[];
  loadStatusHistory: (platform_id?: string) => Promise<void>;
  
  // Authentication State
  currentUser: any | null;
  setCurrentUser: (user: any | null) => void;
  authLoading: boolean;
  setAuthLoading: (loading: boolean) => void;

  // Role-Based Access Control
  currentUserRole: Role;
  currentUserPermissions: string[];
  currentUserAppAccess: string[];
  currentUserIosDataUpload: boolean;
  currentUserIosPttVisibility: 'all' | 'custom';
  currentUserIosVisiblePtts: string[];
  setCurrentUserProfile: (role: Role, permissions: string[], appAccess?: string[], iosDataUpload?: boolean, iosPttVisibility?: 'all' | 'custom', iosVisiblePtts?: string[]) => void;

  kpi: KPI;
  
  // Map Selection State
  selectedTransmitterIds: string[];
  setSelectedTransmitterIds: (ids: string[]) => void;
  
  // API Config for Argos
  apiConfig: {
    username: string;
    password: string;
    clientId: string;
    authUrl: string;
    baseUrl: string;
  };
  setApiConfig: (config: any) => void;
  
  // Legacy helper for compatibility
  setSelectedMapBirdId: (id: string) => void; 

  // Actions
  addAlert: (alert: Alert) => void;
  resolveAlert: (id: string) => void;
  resolveAllAlerts: () => void;
  cleanupOldAlerts: () => void;
  
  // Bird Actions
  addBird: (bird: Bird) => Promise<void>;
  updateBird: (id: string, updates: Partial<Bird>) => Promise<void>;
  deleteBird: (id: string) => Promise<void>;
  bulkDeleteBirds: (ids: string[]) => Promise<void>;
  bulkUpdateBirds: (ids: string[], updates: Partial<Bird>) => Promise<void>;
  importBirds: (birds: Bird[]) => void;

  // Transmitter Actions
  addTransmitter: (transmitter: Transmitter) => Promise<void>;
  updateTransmitter: (id: string, updates: Partial<Transmitter>) => Promise<void>;
  deleteTransmitter: (id: string) => Promise<void>;
  bulkDeleteTransmitters: (ids: string[]) => Promise<void>;
  bulkUpdateTransmitters: (ids: string[], updates: Partial<Transmitter>) => Promise<void>;
  importTransmitters: (transmitters: Transmitter[]) => void;
  markTransmitterDead: (transmitterId: string, user: User) => Promise<void>;
  unmarkTransmitterDead: (transmitterId: string) => Promise<void>;
  setTransmitterStatus: (
    transmitterId: string, 
    status: 'Active' | 'Potential Mortality' | 'Inactive' | 'Static test' | 'Dead' | 'Auto', 
    user?: User
  ) => Promise<void>;
  loadStaticTestArchive: () => Promise<void>;
  
  // User Actions
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;

  // Linking Action
  assignTransmitterToBird: (transmitterId: string, birdId: string) => void;
  
  /**
   * Process incoming Argos messages:
   * 1. Write raw positions to argos_positions in Firebase (duplicate-safe)
   * 2. Create/update transmitters in Firebase
   * 3. Create position records in Firebase
   * 4. Run alert analysis
   */
  syncArgosToFirebase: (messages: ArgosMessage[], devices?: ArgosDevice[], onProgress?: (msg: string) => void) => Promise<{ transmittersUpdated: number; positionsCreated: number }>;

  // Firestore Actions
  initializeFromFirestore: () => Promise<void>;
  purgeZeroCoordinates: () => Promise<void>;
  recalculateTransmitterStatuses: (onProgress?: (msg: string) => void) => Promise<void>;
  refreshMonitoringData: (onProgress?: (msg: string) => void) => Promise<{ transmittersCount: number; birdsCount: number; positionsCount: number }>;
  subscribeToLivePositions: () => () => void;

  // Danger Zone — Collection Clearing
  clearTable: (table: 'transmitters' | 'birds' | 'positions' | 'argos_positions' | 'alerts' | 'user_activity_logs' | 'all', onProgress?: (msg: string) => void) => Promise<void>;

  // Simulation Actions
  generateLivePositions: () => void;
}

// Helpers for RBAC & User PTT Visibility Filtering
export const filterTransmittersForUser = (
  transmitters: Transmitter[],
  visibility: 'all' | 'custom' | undefined,
  visiblePtts: string[] | undefined,
  role?: Role
): Transmitter[] => {
  // Administrators and Managers always have full access to all transmitters on the Web management platform
  if (role === 'Administrator' || role === 'Manager') {
    return transmitters;
  }
  if (visibility === 'custom' && Array.isArray(visiblePtts) && visiblePtts.length > 0) {
    const visibleSet = new Set(visiblePtts.map(id => String(id)));
    return transmitters.filter(t => visibleSet.has(String(t.platform_id)));
  }
  return transmitters;
};

export const filterPositionsForUser = (
  positions: Position[],
  transmitters: Transmitter[],
  visibility: 'all' | 'custom' | undefined,
  visiblePtts: string[] | undefined,
  role?: Role
): Position[] => {
  if (role === 'Administrator' || role === 'Manager') {
    return positions;
  }
  if (visibility === 'custom' && Array.isArray(visiblePtts) && visiblePtts.length > 0) {
    const visibleSet = new Set(visiblePtts.map(id => String(id)));
    return positions.filter(p => {
      const t = transmitters.find(tx => String(tx.platform_id) === String(p.transmitter_id) || tx.id === p.transmitter_id);
      return (t && visibleSet.has(String(t.platform_id))) || visibleSet.has(String(p.transmitter_id));
    });
  }
  return positions;
};

export const filterAlertsForUser = (
  alerts: Alert[],
  transmitters: Transmitter[],
  visibility: 'all' | 'custom' | undefined,
  visiblePtts: string[] | undefined,
  role?: Role
): Alert[] => {
  if (role === 'Administrator' || role === 'Manager') {
    return alerts;
  }
  if (visibility === 'custom' && Array.isArray(visiblePtts) && visiblePtts.length > 0) {
    const visibleSet = new Set(visiblePtts.map(id => String(id)));
    return alerts.filter(a => {
      const t = transmitters.find(tx => String(tx.platform_id) === String(a.transmitter_id) || tx.id === a.transmitter_id);
      return (t && visibleSet.has(String(t.platform_id))) || visibleSet.has(String(a.transmitter_id));
    });
  }
  return alerts;
};

// ─── Deduplication & Strict Uniqueness Helpers ──────────────────────────────
export const deduplicateTransmitters = (transmitters: Transmitter[]): {
  deduplicated: Transmitter[];
  deletedDocIds: string[];
  updatedCanonicalDocs: Transmitter[];
} => {
  const byPid = new Map<string, Transmitter[]>();
  transmitters.forEach(t => {
    const pid = String(t.platform_id || t.id || '').replace(/^trans-/, '').trim();
    if (!pid) return;
    if (!byPid.has(pid)) byPid.set(pid, []);
    byPid.get(pid)!.push(t);
  });

  const deduplicated: Transmitter[] = [];
  const deletedDocIds: string[] = [];
  const updatedCanonicalDocs: Transmitter[] = [];

  for (const [pid, group] of byPid.entries()) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      continue;
    }

    // Multiple documents found for the same platform_id!
    // Pick the best primary document: prefer one with assigned bird, known model, etc.
    const withBird = group.find(t => t.bird_id && t.bird_id.trim() !== '');
    const withKnownModel = group.find(t => t.model && !t.model.includes('Unknown') && !t.model.includes('Auto-detected'));
    const base = withBird || withKnownModel || group[0];
    const canonicalId = pid;

    // Merge attributes from all records
    let mergedBirdId = base.bird_id || '';
    let mergedModel = base.model || 'Unknown';
    let mergedManufacturer = base.manufacturer;
    let mergedFrequency = base.frequency;
    let mergedHexId = base.hex_id;
    let mergedProgramRegion = base.program_region;
    let mergedSiteLocation = base.site_location;
    let mergedDutyCycle = base.duty_cycle || 'Unknown';
    let mergedDeployed = base.deployed;
    let mergedManualOverride = base.manual_status_override;
    let mergedBattery = base.battery_voltage;
    let latestLastFix = base.last_fix || '';
    let derivedStatus = base.derived_status;
    let status = base.status || 'active';

    for (const t of group) {
      if (!mergedBirdId && t.bird_id) mergedBirdId = t.bird_id;
      if ((mergedModel === 'Unknown' || mergedModel.includes('Auto-detected')) && t.model && !t.model.includes('Auto-detected')) {
        mergedModel = t.model;
      }
      if (!mergedManufacturer && t.manufacturer) mergedManufacturer = t.manufacturer;
      if (!mergedFrequency && t.frequency) mergedFrequency = t.frequency;
      if (!mergedHexId && t.hex_id) mergedHexId = t.hex_id;
      if (!mergedProgramRegion && t.program_region) mergedProgramRegion = t.program_region;
      if (!mergedSiteLocation && t.site_location) mergedSiteLocation = t.site_location;
      if ((mergedDutyCycle === 'Unknown' || !mergedDutyCycle) && t.duty_cycle) mergedDutyCycle = t.duty_cycle;
      if (t.deployed !== undefined) mergedDeployed = t.deployed;
      if (t.manual_status_override) mergedManualOverride = t.manual_status_override;
      if (t.battery_voltage !== undefined && (mergedBattery === undefined || t.battery_voltage > mergedBattery)) {
        mergedBattery = t.battery_voltage;
      }
      if (t.last_fix) {
        const tTs = safeParseDate(t.last_fix);
        const currTs = safeParseDate(latestLastFix);
        if (!isNaN(tTs) && (isNaN(currTs) || tTs > currTs)) {
          latestLastFix = t.last_fix;
        }
      }
      // If one status is 'Active' or 'Potential Mortality' and another is 'Static test', prefer the active status if bird is assigned
      if (t.derived_status && t.derived_status !== 'Static test' && (derivedStatus === 'Static test' || !derivedStatus)) {
        derivedStatus = t.derived_status;
      }
      if (t.status === 'active') status = 'active';
    }

    const mergedRecord: Transmitter = {
      ...base,
      id: canonicalId,
      platform_id: pid,
      bird_id: mergedBirdId,
      model: mergedModel,
      manufacturer: mergedManufacturer,
      frequency: mergedFrequency,
      hex_id: mergedHexId,
      program_region: mergedProgramRegion,
      site_location: mergedSiteLocation,
      duty_cycle: mergedDutyCycle,
      deployed: mergedDeployed,
      manual_status_override: mergedManualOverride,
      battery_voltage: mergedBattery,
      last_fix: latestLastFix,
      derived_status: derivedStatus,
      status: status
    };

    deduplicated.push(mergedRecord);
    updatedCanonicalDocs.push(mergedRecord);

    // Any document whose id != canonicalId must be deleted from Firestore
    group.forEach(t => {
      if (t.id !== canonicalId) {
        deletedDocIds.push(t.id);
      }
    });
  }

  return { deduplicated, deletedDocIds, updatedCanonicalDocs };
};

export const deduplicateBirds = (birds: Bird[]): {
  deduplicated: Bird[];
  deletedDocIds: string[];
  updatedCanonicalDocs: Bird[];
} => {
  const byRid = new Map<string, Bird[]>();
  birds.forEach(b => {
    const rawRid = String(b.ring_id || '').trim();
    const isNA = !rawRid || rawRid.toUpperCase() === 'NA' || rawRid.toUpperCase() === 'N/A';
    // If ring is NA or empty, treat each bird document independently by id so they don't merge
    const key = isNA ? (b.id || `na-${Math.random()}`) : rawRid.replace(/^bird-/, '').trim();
    if (!key) return;
    if (!byRid.has(key)) byRid.set(key, []);
    byRid.get(key)!.push(b);
  });

  const deduplicated: Bird[] = [];
  const deletedDocIds: string[] = [];
  const updatedCanonicalDocs: Bird[] = [];

  for (const [rid, group] of byRid.entries()) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      continue;
    }

    const base = group[0];
    const canonicalId = base.id;
    let ringId = base.ring_id || 'NA';
    let species = base.species || 'Houbara Bustard';
    let sex = base.sex || 'M';
    let origin = base.origin || 'Breeding';
    let darvicNumber = base.darvic_number || '';
    let hatchDate = base.hatch_date || '';
    let releaseDate = base.release_date || '';
    let releaseLocation = base.release_location || '';
    let releaseLat = base.release_lat || '';
    let releaseLon = base.release_lon || '';

    for (const b of group) {
      if (b.ring_id && b.ring_id !== 'NA') ringId = b.ring_id;
      if (b.species) species = b.species;
      if (b.sex) sex = b.sex;
      if (b.origin) origin = b.origin;
      if (b.darvic_number) darvicNumber = b.darvic_number;
      if (b.hatch_date) hatchDate = b.hatch_date;
      if (b.release_date) releaseDate = b.release_date;
      if (b.release_location) releaseLocation = b.release_location;
      if (b.release_lat) releaseLat = b.release_lat;
      if (b.release_lon) releaseLon = b.release_lon;
    }

    const mergedRecord: Bird = {
      ...base,
      id: canonicalId,
      ring_id: ringId,
      species,
      sex,
      origin,
      darvic_number: darvicNumber,
      hatch_date: hatchDate,
      release_date: releaseDate,
      release_location: releaseLocation,
      release_lat: releaseLat,
      release_lon: releaseLon
    };

    deduplicated.push(mergedRecord);
    updatedCanonicalDocs.push(mergedRecord);

    group.forEach(b => {
      if (b.id !== canonicalId) {
        deletedDocIds.push(b.id);
      }
    });
  }

  return { deduplicated, deletedDocIds, updatedCanonicalDocs };
};

// Helper: fire-and-forget Firestore write (non-blocking)
const fireAndForget = (fn: () => Promise<any>) => {
  fn().catch(err => console.error('[Firestore Sync]', err));
};

const logDbAction = (get: any, type: 'DATA_CREATE' | 'DATA_UPDATE' | 'DATA_DELETE', details: string) => {
  const user = get().currentUser;
  if (user) {
    logUserActivity(user.uid, user.email || '', type, details);
  }
};

const processTransmitterStatusUpdates = async (
  t: Transmitter,
  derived: 'Active' | 'Potential Mortality' | 'Inactive' | 'Static test' | 'Dead',
  isNesting: boolean,
  allPositions: any[],
  addAlert: (alert: Alert) => void,
  getBirds: () => Bird[]
): Promise<Partial<Transmitter>> => {
  const updates: Partial<Transmitter> = {};

  if (t.manual_status_override) {
    if (t.derived_status !== t.manual_status_override) {
      updates.derived_status = t.manual_status_override;
    }
    return updates;
  }

  if (t.derived_status !== derived) {
    if (t.derived_status === 'Active' && (derived === 'Potential Mortality' || derived === 'Inactive')) {
      const bird = findBirdForTransmitter(getBirds(), t.bird_id);
      addAlert({
        id: `status-alert-${t.platform_id}-${Date.now()}`,
        type: derived === 'Inactive' ? 'no_fix' : 'speed_anomaly',
        severity: 'critical',
        transmitter_id: t.platform_id,
        bird_name: bird?.ring_id || 'Unknown',
        message: `CRITICAL: Transmitter ${t.platform_id} status changed from Active to ${derived}`,
        timestamp: new Date().toISOString(),
        status: 'active'
      });
    }
    updates.derived_status = derived;

    // Archive status transition by date in Firebase Firestore
    await recordStatusTransition(String(t.platform_id), derived, t.bird_id, 'system', `System evaluated status: ${derived}`);
  }

  // Battery Low Alert Check (Threshold < 3.5V)
  const v = Number(t.battery_voltage);
  if (!isNaN(v) && v > 0 && v < 3.5) {
    const bird = findBirdForTransmitter(getBirds(), t.bird_id);
    addAlert({
      id: `alert-battery-${t.platform_id}-${Date.now()}`,
      type: 'battery_low',
      severity: v < 3.2 ? 'critical' : 'warning',
      transmitter_id: String(t.platform_id),
      bird_name: bird?.ring_id || 'Unknown',
      message: `CRITICAL: Transmitter ${t.platform_id} battery level dropped to ${v.toFixed(2)}V (below 3.5V threshold)`,
      timestamp: new Date().toISOString(),
      status: 'active'
    });
  }

  // Track inactive_since timestamp
  if (derived === 'Inactive') {
    if (!t.inactive_since) {
      const iso = new Date().toISOString();
      updates.inactive_since = iso;
    }
  } else if (derived !== 'Dead' && t.inactive_since) {
    updates.inactive_since = null as any;
  }

  // Handle Static Test Period auto-archival and expiry alerts
  try {
    const qStatic = query(collection(db, 'static_test_periods'), where('platform_id', '==', String(t.platform_id)));
    const snapStatic = await getDocs(qStatic);
    const staticPeriods = snapStatic.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as StaticTestPeriod));
    const activePeriod = staticPeriods.find(p => p.active);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    if (derived === 'Static test') {
      const validTimestamps = allPositions
        .map(p => safeParseDate(p.timestamp || p.locationDate))
        .filter(ts => !isNaN(ts) && ts > 0);
      const latestFixTs = validTimestamps.length > 0 ? Math.max(...validTimestamps) : Date.now();
      const latestFixDate = new Date(latestFixTs);
      const latestFixIso = latestFixDate.toISOString();
      const fixMonthKey = `${latestFixDate.getFullYear()}-${String(latestFixDate.getMonth() + 1).padStart(2, '0')}`;

      if (!activePeriod) {
        const newPeriodId = `stp_${t.platform_id}_${Date.now()}`;
        const newPeriod: StaticTestPeriod = {
          id: newPeriodId,
          transmitter_id: String(t.platform_id),
          platform_id: String(t.platform_id),
          start_date: latestFixIso,
          end_date: latestFixIso,
          fix_count: validTimestamps.length,
          days_on_test: 1,
          active: true,
          expiry_alert_sent: false
        };
        await saveDocument('static_test_periods', newPeriodId, newPeriod);
      } else {
        const activeStartDate = new Date(activePeriod.start_date);
        const activeMonthKey = `${activeStartDate.getFullYear()}-${String(activeStartDate.getMonth() + 1).padStart(2, '0')}`;

        if (activeMonthKey !== fixMonthKey && currentMonthKey > activeMonthKey) {
          // Boundary crossed! Archive month M period at 00:00 on 1st of month M+1
          const yearM = activeStartDate.getFullYear();
          const monthM = activeStartDate.getMonth();
          const archivedAt = new Date(Date.UTC(yearM, monthM + 1, 1, 0, 0, 0)).toISOString();
          const lastDayOfM = new Date(Date.UTC(yearM, monthM + 1, 0, 23, 59, 59)).toISOString();

          await saveDocument('static_test_periods', activePeriod.id, {
            active: false,
            end_date: activePeriod.end_date || lastDayOfM,
            archived_at: archivedAt
          });

          // Open distinct new period for the new month M+1
          const newPeriodId = `stp_${t.platform_id}_${Date.now()}`;
          const newPeriod: StaticTestPeriod = {
            id: newPeriodId,
            transmitter_id: String(t.platform_id),
            platform_id: String(t.platform_id),
            start_date: latestFixIso,
            end_date: latestFixIso,
            fix_count: validTimestamps.filter(ts => {
              const d = new Date(ts);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === fixMonthKey;
            }).length,
            days_on_test: 1,
            active: true,
            expiry_alert_sent: false
          };
          await saveDocument('static_test_periods', newPeriodId, newPeriod);
        } else {
          // Same month: update end_date, fix_count, days_on_test
          const startMs = safeParseDate(activePeriod.start_date);
          const daysOnTest = Math.max(1, Math.ceil((latestFixTs - startMs) / (1000 * 60 * 60 * 24)));
          await saveDocument('static_test_periods', activePeriod.id, {
            end_date: latestFixIso,
            fix_count: validTimestamps.length,
            days_on_test: daysOnTest
          });

          // Pre-month-end alert check (3 days lead time)
          const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
          const daysRemaining = lastDayOfCurrentMonth - now.getDate();
          if (daysRemaining <= 3 && !activePeriod.expiry_alert_sent) {
            const lastSafeDateStr = `${lastDayOfCurrentMonth}/${String(currentMonth + 1).padStart(2, '0')}/${currentYear}`;
            const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
            const nextMonthStr = nextMonthStart.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const bird = findBirdForTransmitter(getBirds(), t.bird_id);

            addAlert({
              id: `static-alert-${t.platform_id}-${currentMonthKey}`,
              type: 'static_test_expiring',
              severity: 'critical',
              transmitter_id: t.platform_id,
              bird_name: bird?.ring_id || 'Unknown',
              message: `Transmitter ${t.platform_id} is on Static Test and will roll into a new Argos billing month on ${nextMonthStr} if still transmitting. Power off before ${lastSafeDateStr} to avoid an extra month's subscription.`,
              timestamp: new Date().toISOString(),
              status: 'active'
            });

            await saveDocument('static_test_periods', activePeriod.id, { expiry_alert_sent: true });
          }
        }
      }
    } else if (activePeriod) {
      // Exit Static test -> archive active static test period
      await saveDocument('static_test_periods', activePeriod.id, {
        active: false,
        archived_at: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn(`[AppStore] Static test period processing error for PTT ${t.platform_id}:`, err);
  }

  // Handle Nesting behavior alert
  if (isNesting) {
    const bird = findBirdForTransmitter(getBirds(), t.bird_id);
    addAlert({
      id: `nesting-alert-${t.platform_id}-${Date.now()}`,
      type: 'nesting',
      severity: 'info',
      transmitter_id: t.platform_id,
      bird_name: bird?.ring_id || 'Unknown',
      message: `Nesting Behavior Detected for bird ${bird?.ring_id || t.platform_id}`,
      timestamp: new Date().toISOString(),
      status: 'active'
    });
  }

  return updates;
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      sidebarPinned: true,
      toggleSidebarPinned: () => set((state) => ({ sidebarPinned: !state.sidebarPinned })),

      theme: 'light',
      setTheme: (theme) => set({ theme }),

      activeTab: 'Dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),

      databaseActiveTab: 'Monitoring',
      setDatabaseActiveTab: (tab) => set({ databaseActiveTab: tab }),

      isTransmitterModalOpen: false,
      setIsTransmitterModalOpen: (isOpen) => set({ isTransmitterModalOpen: isOpen }),
      isBirdModalOpen: false,
      setIsBirdModalOpen: (isOpen) => set({ isBirdModalOpen: isOpen }),
      isPositionModalOpen: false,
      setIsPositionModalOpen: (isOpen) => set({ isPositionModalOpen: isOpen }),
      isArgosModalOpen: false,
      setIsArgosModalOpen: (isOpen) => set({ isArgosModalOpen: isOpen }),

      editingRecordId: null,
      setEditingRecordId: (id) => set({ editingRecordId: id }),

      darkMode: false,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      simpleMode: false,
      toggleSimpleMode: () => set((state) => ({ simpleMode: !state.simpleMode })),
      
      notificationsEnabled: true,
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),

      timeZone: 'system',
      setTimeZone: (tz) => set({ timeZone: tz }),
      
      argosPositions: [],
      isArgosPositionsLoading: false,
      loadAllArgosPositionsAction: async () => {
        if (get().argosPositions.length > 0) return;
        set({ isArgosPositionsLoading: true });
        const data = await loadAllArgosPositions();
        set({ argosPositions: data, isArgosPositionsLoading: false });
      },
      clearArgosPositionsCache: () => set({ argosPositions: [] }),

      geeNdviTileUrl: null,
      geeLstTileUrl: null,
      geeSaviTileUrl: null,
      geeNdwiTileUrl: null,
      activeGeeLayer: null,
      setGeeNdviTileUrl: (url) => set({ geeNdviTileUrl: url }),
      setGeeLstTileUrl: (url) => set({ geeLstTileUrl: url }),
      setGeeSaviTileUrl: (url) => set({ geeSaviTileUrl: url }),
      setGeeNdwiTileUrl: (url) => set({ geeNdwiTileUrl: url }),
      setActiveGeeLayer: (layer) => set({ activeGeeLayer: layer }),

      sharedMapCenter: [36.0, 42.0],
      sharedMapZoom: 3,
      activeBaseLayer: 'google_roadmap',
      setSharedMapCenter: (center) => set({ sharedMapCenter: center }),
      setSharedMapZoom: (zoom) => set({ sharedMapZoom: zoom }),
      setActiveBaseLayer: (layer) => set({ activeBaseLayer: layer }),

      exportedMapView: null,
      setExportedMapView: (view) => set({ exportedMapView: view }),
      clearExportedMapView: () => set({ exportedMapView: null }),

      qgisConnectActiveTab: 'map-production',
      setQgisConnectActiveTab: (tab) => set({ qgisConnectActiveTab: tab }),
      
      qgisLayers: [],
      qgisGeoJSONCache: {},
      setQGISLayers: (layers) => set({ qgisLayers: layers }),
      addQGISLayer: (layer) => set((state) => ({ qgisLayers: [...state.qgisLayers, layer] })),
      removeQGISLayer: (id) => set((state) => ({ 
        qgisLayers: state.qgisLayers.filter(l => l.id !== id),
        qgisGeoJSONCache: Object.fromEntries(Object.entries(state.qgisGeoJSONCache).filter(([k]) => k !== id))
      })),
      updateQGISLayerVisibility: (id, visible) => set((state) => ({
        qgisLayers: state.qgisLayers.map(l => l.id === id ? { ...l, visible } : l)
      })),
      updateQGISLayerStyle: (id, style) => set((state) => ({
        qgisLayers: state.qgisLayers.map(l => l.id === id ? { ...l, style } : l)
      })),
      cacheQGISGeoJSON: (id, geojson) => set((state) => ({
        qgisGeoJSONCache: { ...state.qgisGeoJSONCache, [id]: geojson }
      })),

      lastSaved: new Date().toISOString(),
      lastIngestTime: null,
      setLastIngestTime: (ts) => set({ lastIngestTime: ts }),
      firestoreReady: false,

      // All data arrays start empty — loaded from Firebase on auth
      transmitters: [],
      birds: [],
      alerts: [],
      positions: [],
      users: [],
      staticTestPeriods: [],
      statusHistoryRecords: [],
      
      // Auth Default State
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      authLoading: true,
      setAuthLoading: (loading) => set({ authLoading: loading }),

      // RBAC
      currentUserRole: 'Viewer' as Role,
      currentUserPermissions: ['View Data'],
      currentUserAppAccess: ['web', 'ios'],
      currentUserIosDataUpload: false,
      currentUserIosPttVisibility: 'all',
      currentUserIosVisiblePtts: [],
      setCurrentUserProfile: (role, permissions, appAccess, iosDataUpload, iosPttVisibility, iosVisiblePtts) => set({ 
        currentUserRole: role, 
        currentUserPermissions: permissions,
        currentUserAppAccess: appAccess || ['web', 'ios'],
        currentUserIosDataUpload: iosDataUpload !== undefined ? iosDataUpload : (appAccess ? appAccess.includes('ios_data_upload') : false),
        currentUserIosPttVisibility: iosPttVisibility || 'all',
        currentUserIosVisiblePtts: iosVisiblePtts || []
      }),

      kpi: {
        activeTransmitters: 0,
        birdsTracked: 0,
        alerts24h: 0,
        ingestionLatency: '-'
      },
      
      selectedTransmitterIds: [],
      setSelectedTransmitterIds: (ids) => set({ selectedTransmitterIds: ids }),
      
      apiConfig: {
        username: '',
        password: '',
        clientId: 'api-telemetry',
        authUrl: 'https://account.groupcls.com/auth/realms/cls/protocol/openid-connect/token',
        baseUrl: 'https://api.groupcls.com/telemetry/api/v1'
      },
      setApiConfig: (config) => set((state) => ({ apiConfig: { ...state.apiConfig, ...config }, lastSaved: new Date().toISOString() })),

      setSelectedMapBirdId: (id) => {
        if (id === 'all') {
          set({ selectedTransmitterIds: [] });
        } else {
          const t = get().transmitters.find(t => t.bird_id === id);
          set({ selectedTransmitterIds: t ? [t.platform_id] : [] });
        }
      },

      // ─── Alerts ─────────────────────────────────────────────────────────────
      addAlert: (alert) => {
        set((state) => ({ alerts: [alert, ...state.alerts], lastSaved: new Date().toISOString() }));
        fireAndForget(() => saveDocument('alerts', alert.id, alert));
      },
      resolveAlert: (id) => {
        set((state) => {
          const updated = state.alerts.map(a => a.id === id ? { ...a, status: 'resolved' as const } : a);
          const resolved = updated.find(a => a.id === id);
          if (resolved) fireAndForget(() => saveDocument('alerts', id, resolved));
          return { alerts: updated, lastSaved: new Date().toISOString() };
        });
      },
      resolveAllAlerts: () => {
        set((state) => {
          const activeAlerts = state.alerts.filter(a => a.status !== 'resolved');
          if (activeAlerts.length === 0) return state;
          
          const updated = state.alerts.map(a => ({ ...a, status: 'resolved' as const }));
          const resolvedDocs = activeAlerts.map(a => ({ id: a.id, data: { ...a, status: 'resolved' as const } }));
          
          fireAndForget(() => batchWriteDocuments('alerts', resolvedDocs));
          return { alerts: updated, lastSaved: new Date().toISOString() };
        });
      },
      cleanupOldAlerts: () => {
        set((state) => {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          const oldResolvedAlerts = state.alerts.filter(a => {
            if (a.status !== 'resolved') return false;
            const alertDate = new Date(a.timestamp);
            return alertDate < sevenDaysAgo;
          });
          
          if (oldResolvedAlerts.length === 0) return state;
          
          const idsToDelete = oldResolvedAlerts.map(a => a.id);
          const keptAlerts = state.alerts.filter(a => !idsToDelete.includes(a.id));
          
          console.log(`[AppStore] Cleaning up ${idsToDelete.length} old resolved alerts (>7 days)`);
          fireAndForget(() => batchDeleteDocuments('alerts', idsToDelete));
          return { alerts: keptAlerts, lastSaved: new Date().toISOString() };
        });
      },

      // ─── Bird CRUD ──────────────────────────────────────────────────────────
      addBird: async (bird) => {
        logDbAction(get, 'DATA_CREATE', `Adding Bird ${bird.ring_id || 'NA'}`);
        try {
          const savedBird = await saveBirdToFirestore(bird);
          set((state) => {
            const isNA = !savedBird.ring_id || savedBird.ring_id === 'NA' || savedBird.ring_id === 'N/A';
            const existingIndex = isNA 
              ? state.birds.findIndex(b => b.id === savedBird.id)
              : state.birds.findIndex(b => b.id === savedBird.id || b.ring_id === savedBird.ring_id);
            let updatedList: Bird[];
            if (existingIndex >= 0) {
              updatedList = [...state.birds];
              updatedList[existingIndex] = savedBird;
            } else {
              updatedList = [savedBird, ...state.birds];
            }
            return { birds: updatedList, lastSaved: new Date().toISOString() };
          });
          notifySuccess(`Bird ${savedBird.ring_id || savedBird.id} saved to Firebase`);
        } catch (err: any) {
          notifyError(err, 'Failed to save bird to Firebase');
          throw err;
        }
      },
      updateBird: async (id, updates) => {
        logDbAction(get, 'DATA_UPDATE', `Updating Bird ID: ${id}`);
        try {
          await updateBirdInFirestore(id, updates);
          set((state) => {
            const updatedBirds = state.birds.map(b => b.id === id ? { ...b, ...updates } : b);
            return { birds: updatedBirds, lastSaved: new Date().toISOString() };
          });
          notifySuccess('Bird updated successfully');
        } catch (err: any) {
          notifyError(err, 'Failed to update bird');
          throw err;
        }
      },
      deleteBird: async (id) => {
        logDbAction(get, 'DATA_DELETE', `Deleting Bird ID: ${id}`);
        try {
          await deleteBirdFromFirestore(id);
          set((state) => ({
            birds: state.birds.filter(b => b.id !== id),
            transmitters: state.transmitters.map(t => t.bird_id === id ? { ...t, bird_id: '' } : t),
            lastSaved: new Date().toISOString()
          }));
          notifySuccess('Bird deleted successfully');
        } catch (err: any) {
          notifyError(err, 'Failed to delete bird');
          throw err;
        }
      },
      bulkDeleteBirds: async (ids) => {
        set((state) => {
          const idsSet = new Set(ids);
          return {
            birds: state.birds.filter(b => !idsSet.has(b.id)),
            transmitters: state.transmitters.map(t => t.bird_id && idsSet.has(t.bird_id) ? { ...t, bird_id: '' } : t),
            lastSaved: new Date().toISOString()
          };
        });
        await bulkDeleteRecords('birds', ids);
      },
      bulkUpdateBirds: async (ids, updates) => {
        set((state) => {
          const idsSet = new Set(ids);
          return {
            birds: state.birds.map(b => idsSet.has(b.id) ? { ...b, ...updates } : b),
            lastSaved: new Date().toISOString()
          };
        });
        await bulkUpdateRecords('birds', ids, updates);
      },
      importBirds: (newBirds) => {
         set((state) => {
            const birdMap = new Map<string, Bird>();
            const naBirds: Bird[] = [];

            state.birds.forEach(b => {
              const r = String(b.ring_id || '').trim();
              if (r && r.toUpperCase() !== 'NA' && r.toUpperCase() !== 'N/A') {
                birdMap.set(r, b);
              } else {
                naBirds.push(b);
              }
            });
            
            newBirds.forEach(bird => {
                const rawRid = String(bird.ring_id || '').trim();
                const isNA = !rawRid || rawRid.toUpperCase() === 'NA' || rawRid.toUpperCase() === 'N/A';
                if (isNA) {
                  const docId = bird.id || `bird-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                  const normalized: Bird = { ...bird, id: docId, ring_id: 'NA' };
                  naBirds.push(normalized);
                  fireAndForget(() => saveDocument('birds', docId, normalized));
                } else {
                  const rid = rawRid.replace(/^bird-/, '').trim();
                  const canonicalId = `bird-${rid}`;
                  const existing = birdMap.get(rid);
                  const normalized: Bird = existing 
                    ? { ...existing, ...bird, id: canonicalId, ring_id: rid } 
                    : { ...bird, id: canonicalId, ring_id: rid };
                  birdMap.set(rid, normalized);
                  fireAndForget(() => saveDocument('birds', canonicalId, normalized));
                }
            });
            
            const allBirds = [...Array.from(birdMap.values()), ...naBirds];
            return { birds: allBirds, lastSaved: new Date().toISOString() };
         });
      },

      // ─── Transmitter CRUD ───────────────────────────────────────────────────
      addTransmitter: async (transmitter) => {
        const pid = normalizePttId(transmitter.platform_id || transmitter.id);
        logDbAction(get, 'DATA_CREATE', `Adding Transmitter ${pid}`);
        try {
          const savedTx = await saveTransmitterToFirestore({ ...transmitter, platform_id: pid });
          set((state) => {
            const existingIndex = state.transmitters.findIndex(t => normalizePttId(t.platform_id) === pid);
            let updatedList: Transmitter[];
            if (existingIndex >= 0) {
              updatedList = [...state.transmitters];
              updatedList[existingIndex] = savedTx;
            } else {
              updatedList = [savedTx, ...state.transmitters];
            }
            return { 
              transmitters: updatedList,
              lastSaved: new Date().toISOString()
            };
          });
          notifySuccess(`Transmitter ${pid} saved to Firebase`);
        } catch (err: any) {
          notifyError(err, 'Failed to save transmitter to Firebase');
          throw err;
        }
      },
      updateTransmitter: async (id, updates) => {
        const pid = normalizePttId(id);
        logDbAction(get, 'DATA_UPDATE', `Updating Transmitter ID: ${pid}`);
        try {
          await updateTransmitterInFirestore(pid, updates);
          set((state) => {
            const updated = state.transmitters.map(t => (normalizePttId(t.id) === pid || normalizePttId(t.platform_id) === pid) ? { ...t, ...updates } : t);
            return { transmitters: updated, lastSaved: new Date().toISOString() };
          });
          notifySuccess(`Transmitter ${pid} updated successfully`);
        } catch (err: any) {
          notifyError(err, 'Failed to update transmitter');
          throw err;
        }
      },
      deleteTransmitter: async (id) => {
        const pid = normalizePttId(id);
        logDbAction(get, 'DATA_DELETE', `Deleting Transmitter ID: ${pid}`);
        try {
          await deleteTransmitterFromFirestore(pid);
          set((state) => {
            return {
              transmitters: state.transmitters.filter(t => normalizePttId(t.id) !== pid && normalizePttId(t.platform_id) !== pid),
              positions: state.positions.filter(p => normalizePttId(p.transmitter_id) !== pid),
              lastSaved: new Date().toISOString()
            };
          });
          notifySuccess(`Transmitter ${pid} deleted successfully`);
        } catch (err: any) {
          notifyError(err, 'Failed to delete transmitter');
          throw err;
        }
      },
      bulkDeleteTransmitters: async (ids: string[]) => {
          set((state) => {
            const idsSet = new Set(ids);
            const deletedTransmitters = state.transmitters.filter(t => idsSet.has(t.id));
            const deletedPlatformIds = new Set(deletedTransmitters.map(t => t.platform_id));
            return {
              transmitters: state.transmitters.filter(t => !idsSet.has(t.id)),
              positions: state.positions.filter(p => !deletedPlatformIds.has(p.transmitter_id)),
              lastSaved: new Date().toISOString()
            };
          });
          await bulkDeleteRecords('transmitters', ids);
      },
      bulkUpdateTransmitters: async (ids: string[], updates: Partial<Transmitter>) => {
          set((state) => {
            const idsSet = new Set(ids);
            const updated = state.transmitters.map(t => idsSet.has(t.id) ? { ...t, ...updates } : t);
            return { transmitters: updated, lastSaved: new Date().toISOString() };
          });
          await bulkUpdateRecords('transmitters', ids, updates);
      },
      importTransmitters: (newTransmitters) => {
          set((state) => {
              const transMap = new Map<string, Transmitter>(state.transmitters.map(t => [String(t.platform_id).trim(), t] as [string, Transmitter]));
              
              newTransmitters.forEach(t => {
                  const pid = String(t.platform_id || t.id || '').replace(/^trans-/, '').trim();
                  if (!pid) return;
                  const canonicalId = pid;
                  const existing = transMap.get(pid);
                  if (existing) {
                      transMap.set(pid, { ...existing, ...t, id: canonicalId, platform_id: pid });
                  } else {
                      transMap.set(pid, { ...t, id: canonicalId, platform_id: pid });
                  }
              });
              
              const allTransmitters = Array.from(transMap.values());
              fireAndForget(() => syncTransmitters(allTransmitters));
              const filtered = filterTransmittersForUser(allTransmitters, state.currentUserIosPttVisibility, state.currentUserIosVisiblePtts, state.currentUserRole);
              return { transmitters: filtered, lastSaved: new Date().toISOString() };
          });
      },

      // ─── User CRUD (local store + Firestore doc) ───────────────────────────
      addUser: (user) => {
        set((state) => ({ users: [user, ...state.users], lastSaved: new Date().toISOString() }));
        fireAndForget(() => saveDocument('users', user.id, user));
      },
      updateUser: (id, updates) => {
        set((state) => {
          const updated = state.users.map(u => u.id === id ? { ...u, ...updates } : u);
          const u = updated.find(u => u.id === id);
          if (u) fireAndForget(() => saveDocument('users', id, u));
          return { users: updated, lastSaved: new Date().toISOString() };
        });
      },
      deleteUser: (id) => {
        set((state) => ({ users: state.users.filter(u => u.id !== id), lastSaved: new Date().toISOString() }));
        fireAndForget(() => deleteDocument('users', id));
      },

      // ─── Linking ────────────────────────────────────────────────────────────
      assignTransmitterToBird: (transmitterId, birdId) => {
        set((state) => {
          const updated = state.transmitters.map(t => {
              if (t.id === transmitterId) return { ...t, bird_id: birdId };
              if (birdId && t.bird_id === birdId && t.id !== transmitterId) return { ...t, bird_id: '' };
              return t;
          });
          const changed = updated.filter((t, i) => t !== state.transmitters[i]);
          changed.forEach(t => fireAndForget(() => saveDocument('transmitters', t.id, t)));
          return { transmitters: updated, lastSaved: new Date().toISOString() };
        });
      },

      // ─── Manual Dead Override & Static Test Archive Actions ───────────────
      markTransmitterDead: async (transmitterId: string, user: User) => {
        const role = user?.role || get().currentUserRole;
        if (role !== 'Administrator' && role !== 'Researcher' && role !== 'Field Coordinator') {
          throw new Error('Unauthorized: Only Administrators, Researchers, and Field Coordinators can mark transmitters as Dead.');
        }

        const transmitter = get().transmitters.find(t => t.id === transmitterId || t.platform_id === transmitterId);
        if (!transmitter) return;

        const nowIso = new Date().toISOString();
        const updates = {
          manual_status_override: 'Dead' as const,
          manual_status_set_by: user.name || user.email || 'User',
          manual_status_set_at: nowIso,
          derived_status: 'Dead' as const
        };

        const updatedTransmitters = get().transmitters.map(t => 
          (t.id === transmitter.id ? { ...t, ...updates } : t)
        );

        set({ transmitters: updatedTransmitters, lastSaved: nowIso });
        await saveDocument('transmitters', transmitter.id, updates);
        await recordStatusTransition(String(transmitter.platform_id), 'Dead', transmitter.bird_id, user.name || user.email || 'User', 'Manually marked as Dead');
        logUserActivity(user.id || user.email, user.email || '', 'DATA_UPDATE', `Marked PTT ${transmitter.platform_id} as Dead`);
      },

      unmarkTransmitterDead: async (transmitterId: string) => {
        const role = get().currentUserRole;
        if (role !== 'Administrator') {
          throw new Error('Unauthorized: Only Administrators can unmark transmitters as Dead.');
        }

        const transmitter = get().transmitters.find(t => t.id === transmitterId || t.platform_id === transmitterId);
        if (!transmitter) return;

        const updates = {
          manual_status_override: null,
          manual_status_set_by: null,
          manual_status_set_at: null
        };

        const updatedTransmitters = get().transmitters.map(t => 
          (t.id === transmitter.id ? { ...t, manual_status_override: undefined, manual_status_set_by: undefined, manual_status_set_at: undefined } : t)
        );
        set({ transmitters: updatedTransmitters, lastSaved: new Date().toISOString() });

        await saveDocument('transmitters', transmitter.id, updates);
        await get().recalculateTransmitterStatuses();
      },

      setTransmitterStatus: async (transmitterId, newStatus, user) => {
        const currentUser = user || get().currentUser;
        const nowIso = new Date().toISOString();
        const userName = currentUser?.name || currentUser?.email || 'User';

        const t = get().transmitters.find(x => x.id === transmitterId || x.platform_id === transmitterId);
        if (!t) return;
        const pid = String(t.platform_id || t.id).replace(/^trans-/, '').trim();

        if (newStatus === 'Auto') {
          const updates = {
            manual_status_override: null,
            manual_status_set_by: null,
            manual_status_set_at: null
          };
          await saveDocument('transmitters', t.id, updates);
          set(state => ({
            transmitters: state.transmitters.map(item => 
              (item.id === t.id || item.platform_id === t.platform_id) 
                ? { ...item, manual_status_override: undefined, manual_status_set_by: undefined, manual_status_set_at: undefined } 
                : item
            ),
            lastSaved: nowIso
          }));
          await get().recalculateTransmitterStatuses();
          notifySuccess(`PTT ${pid} reset to automatic status calculation`);
        } else {
          const updates: Partial<Transmitter> = {
            manual_status_override: newStatus,
            derived_status: newStatus,
            status: newStatus.toLowerCase(),
            manual_status_set_by: userName,
            manual_status_set_at: nowIso
          };
          if (newStatus === 'Inactive') {
            updates.inactive_since = nowIso;
          } else if (newStatus !== 'Dead') {
            updates.inactive_since = null as any;
          }

          set(state => ({
            transmitters: state.transmitters.map(item => 
              (item.id === t.id || item.platform_id === t.platform_id) 
                ? { ...item, ...updates } 
                : item
            ),
            lastSaved: nowIso
          }));

          await saveDocument('transmitters', t.id, updates);
          await recordStatusTransition(pid, newStatus, t.bird_id, userName, `Manually set status to ${newStatus}`);
          logUserActivity(currentUser?.id || currentUser?.email || 'system', currentUser?.email || '', 'DATA_UPDATE', `Set PTT ${pid} status to ${newStatus}`);
          notifySuccess(`PTT ${pid} status updated to ${newStatus}`);
        }
      },

      loadStaticTestArchive: async () => {
        const periods = await loadCollection<StaticTestPeriod>('static_test_periods');
        set({ staticTestPeriods: periods });
      },

      loadStatusHistory: async (platform_id?: string) => {
        if (platform_id) {
          const history = await loadStatusHistoryForTransmitter(platform_id);
          set(state => ({
            statusHistoryRecords: [
              ...state.statusHistoryRecords.filter(r => String(r.platform_id) !== String(platform_id)),
              ...history
            ]
          }));
        } else {
          const history = await loadAllStatusHistory();
          set({ statusHistoryRecords: history });
        }
      },

      // ─── Argos → Firebase Direct Sync ───────────────────────────────────────
      // This is the CORE ingestion pipeline. Data flows:
      // Argos API → mapArgosApiData() → syncArgosToFirebase() → Firebase
      // NO data is stored in zustand state arrays. NO LocalStorage.
      syncArgosToFirebase: async (incomingMessages, incomingDevices = [], onProgress) => {
          const { transmitters, positions, addAlert, currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole } = get();
          let existingDbTransmitters: Transmitter[] = [];
          try {
            existingDbTransmitters = await loadCollection<Transmitter>('transmitters');
          } catch (e) {
            console.warn('[AppStore] Could not load DB transmitters before sync, using store cache:', e);
          }
          const rawBaseList = existingDbTransmitters.length > 0 ? existingDbTransmitters : transmitters;
          const { deduplicated: baseTransmitters } = deduplicateTransmitters(rawBaseList);
          let newTransmitters = [...baseTransmitters];
          let tUpdated = 0;
          let pCreated = 0;
          const newPositionDocs: Position[] = [];

          onProgress?.('Processing device list...');

          // 1. Sync Devices List → Transmitters
          incomingDevices.forEach(device => {
              const pid = String(device.deviceRef || '').replace(/^trans-/, '').trim();
              if (!pid) return;
              const index = newTransmitters.findIndex(t => String(t.platform_id || t.id).replace(/^trans-/, '').trim() === pid);
              if (index >= 0) {
                  const t = newTransmitters[index];
                  newTransmitters[index] = {
                      ...t,
                      id: pid,
                      platform_id: pid,
                      model: (t.model && !t.model.includes('Unknown') && !t.model.includes('Auto-detected')) ? t.model : (device.model || t.model),
                      manufacturer: t.manufacturer || device.manufacturer,
                      program_region: t.program_region || device.programRef,
                      status: t.status || (device.active ? 'active' : 'inactive'),
                      deployed: t.deployed !== undefined ? t.deployed : device.active
                  };
                  tUpdated++;
              } else {
                  newTransmitters.push({
                      id: pid,
                      platform_id: pid,
                      model: device.model || 'Unknown',
                      status: device.active ? 'active' : 'inactive',
                      bird_id: '',
                      battery_voltage: undefined,
                      last_fix: '',
                      duty_cycle: 'Unknown',
                      manufacturer: device.manufacturer,
                      program_region: device.programRef,
                      deployed: device.active
                  });
                  tUpdated++;
              }
          });

          onProgress?.(`Processing ${incomingMessages.length} messages...`);

          // 2. Process Messages → Create Transmitters + Positions
          const existingPosKeys = new Set(positions.map(p => `${p.transmitter_id}|${p.timestamp}|${p.lat}|${p.lon}`));

          // Sort incoming messages chronologically by Location Date (Date of position fix)
          const sortedIncomingMessages = [...incomingMessages].sort((a, b) => {
              const isGpsA = a.locationType === 'GPS' || !a.locationType || a.lc === 'GPS';
              const rawA = (isGpsA && a.rawData && KNOWN_CLS_RAW_LOCATION_DATES[a.rawData]) ? KNOWN_CLS_RAW_LOCATION_DATES[a.rawData] : (a.timestamp || (a as any).locationDate);
              const isGpsB = b.locationType === 'GPS' || !b.locationType || b.lc === 'GPS';
              const rawB = (isGpsB && b.rawData && KNOWN_CLS_RAW_LOCATION_DATES[b.rawData]) ? KNOWN_CLS_RAW_LOCATION_DATES[b.rawData] : (b.timestamp || (b as any).locationDate);
              return safeParseDate(rawA) - safeParseDate(rawB);
          });

          sortedIncomingMessages.forEach(msg => {
              const lat = parseFloat(msg.lat);
              const lon = parseFloat(msg.lon);
              const pid = String(msg.platformId || '').replace(/^trans-/, '').trim();
              if (!pid) return;
              
              // Attempt to decode battery voltage from rawData
              const decodedBattery = msg.rawData ? decodeBatteryVoltage(msg.rawData) : undefined;

              let tIndex = newTransmitters.findIndex(t => String(t.platform_id || t.id).replace(/^trans-/, '').trim() === pid);
              
              const rawDataStr = String(msg.rawData || '').trim();
              const isGps = msg.locationType === 'GPS' || !msg.locationType || msg.lc === 'GPS';
              const trueMsgTs = (isGps && rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr])
                  ? KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]
                  : ((msg as any).locationDate || msg.locationDate || msg.timestamp);
              const parsedMsgTs = safeParseDate(trueMsgTs);
              const msgIsoTimestamp = !isNaN(parsedMsgTs) ? new Date(parsedMsgTs).toISOString() : trueMsgTs;

              if (tIndex === -1) {
                  newTransmitters.push({
                      id: pid,
                      platform_id: pid,
                      model: 'Unknown (Auto-detected)',
                      status: 'active',
                      bird_id: '',
                      battery_voltage: decodedBattery,
                      last_fix: msgIsoTimestamp,
                      duty_cycle: 'Unknown',
                      deployed: true,
                      lat: lat,
                      lon: lon,
                      latitude: lat,
                      longitude: lon,
                      last_latitude: lat,
                      last_longitude: lon
                  } as any);
                  tIndex = newTransmitters.length - 1;
                  tUpdated++;
              } else {
                  // Update existing transmitter with new battery / last_fix / coords if message is as new as current last_fix
                  const t = newTransmitters[tIndex];
                  const parsedLastFix = safeParseDate(t.last_fix);
                  const isNewer = isNaN(parsedLastFix) || (!isNaN(parsedMsgTs) && parsedMsgTs >= parsedLastFix);
                  const newBattery = (decodedBattery !== undefined && isNewer) ? decodedBattery : t.battery_voltage;
                  const newLastFix = isNewer ? msgIsoTimestamp : t.last_fix;
                  const newLat = (isNewer && isValidCoordinate(lat, lon)) ? lat : (t.lat ?? (t as any).latitude);
                  const newLon = (isNewer && isValidCoordinate(lat, lon)) ? lon : (t.lon ?? (t as any).longitude);
                  
                  if (newBattery !== t.battery_voltage || newLastFix !== t.last_fix || t.id !== pid || isNewer) {
                      newTransmitters[tIndex] = {
                          ...t,
                          id: pid,
                          platform_id: pid,
                          battery_voltage: newBattery,
                          last_fix: newLastFix,
                          lat: newLat,
                          lon: newLon,
                          latitude: newLat,
                          longitude: newLon,
                          last_latitude: newLat,
                          last_longitude: newLon
                      };
                      tUpdated++;
                  }
              }

              if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) > 1 && Math.abs(lon) > 1 && isValidCoordinate(lat, lon)) {
                  const key = `${pid}|${msgIsoTimestamp}|${lat}|${lon}`;
                  if (!existingPosKeys.has(key)) {
                      existingPosKeys.add(key);
                      const newPos: Position = {
                          id: `pos-${msg.id}`,
                          transmitter_id: pid,
                          timestamp: msgIsoTimestamp,
                          lat: lat,
                          lon: lon,
                          lc: msg.lc as any,
                          is_kalman: false,
                          speed_kmh: 0, 
                          course: 0,
                          satellite: msg.satellite,
                          locationType: classifyLocationType(msg.lc, msg.locationType, msg.satellite),
                          messageDate: msg.messageDate,
                          locationDate: msgIsoTimestamp
                      };
                      newPositionDocs.push(newPos);
                      pCreated++;
                  }
              }
          });

          // 3. Recalculate true max timestamp (last_fix) for each transmitter from position messages
          const nowMs = Date.now();
          newTransmitters.forEach((t, i) => {
              const pid = String(t.platform_id);
              const pttPositions = [
                  ...positions.filter(p => String(p.transmitter_id || (p as any).platform_id) === pid),
                  ...newPositionDocs.filter(p => String(p.transmitter_id) === pid),
                  ...incomingMessages.filter(m => String(m.platformId) === pid)
              ];

              if (pttPositions.length > 0) {
                  let maxTs = -Infinity;
                  let latestPos: any = null;

                  pttPositions.forEach(p => {
                      const rawDataStr = String((p as any).rawData || (p as any).raw_data || '').trim().toLowerCase();
                      const rawTs = ((p as any).locationDate || (p as any).gpsLocDate || (p as any).location?.locationDate || (p as any).dateOfPosition)
                          ? ((p as any).locationDate || (p as any).gpsLocDate || (p as any).location?.locationDate || (p as any).dateOfPosition)
                          : ((rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]) 
                              ? KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]
                              : ((p as any).timestamp || (p as any).date || (p as any).msgDatetime));

                      let pTs = safeParseDate(rawTs);
                      const pLat = Number((p as any).lat ?? (p as any).latitude);
                      const pLon = Number((p as any).lon ?? (p as any).longitude);

                      if (!isNaN(pTs) && pTs > maxTs && isValidCoordinate(pLat, pLon)) {
                          maxTs = pTs;
                          latestPos = { ...p, lat: pLat, lon: pLon, ts: pTs };
                      }
                  });

                  if (latestPos && maxTs > 0) {
                      const maxIso = new Date(maxTs).toISOString();
                      newTransmitters[i].last_fix = maxIso;
                      newTransmitters[i].lat = latestPos.lat;
                      newTransmitters[i].lon = latestPos.lon;
                      (newTransmitters[i] as any).latitude = latestPos.lat;
                      (newTransmitters[i] as any).longitude = latestPos.lon;
                      (newTransmitters[i] as any).last_latitude = latestPos.lat;
                      (newTransmitters[i] as any).last_longitude = latestPos.lon;
                      tUpdated++;
                  }
              }
          });

          // 3. Write EVERYTHING to Firebase
          if (tUpdated > 0) {
              onProgress?.(`Writing ${newTransmitters.length} transmitters to Firebase...`);
              await syncTransmitters(newTransmitters);
          }

          if (pCreated > 0) {
              onProgress?.(`Writing ${newPositionDocs.length} positions to Firebase...`);
              await savePositions(newPositionDocs);
              // Analyze for border crossing alerts
              analyzePositionsForAlerts(newPositionDocs, positions, addAlert);
          }

          // 4. Write raw Argos data to argos_positions collection
          if (incomingMessages.length > 0) {
              onProgress?.(`Writing ${incomingMessages.length} raw Argos records to Firebase...`);
              await batchWriteArgosPositions(incomingMessages, (written, total) => {
                  onProgress?.(`Firebase: ${written}/${total} records written...`);
              });
          }

          // 4.5 Defer heavy status evaluation to run in the background AFTER import completes.
          // Each affected transmitter requires 4+ Firestore queries (argos_positions, positions,
          // static_test_periods, status_history) which causes the UI to appear stuck.
          const affectedPids = new Set<string>();
          incomingMessages.forEach(m => { if (m.platformId) affectedPids.add(String(m.platformId).replace(/^trans-/, '').trim()); });
          incomingDevices.forEach(d => { if (d.deviceRef) affectedPids.add(String(d.deviceRef).replace(/^trans-/, '').trim()); });

          // 5. Update in-memory state: always retain the latest position for every transmitter + recent fixes
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const posByTx = new Map<string, Position>();
          // Seed with existing positions
          positions.forEach(p => {
            const pid = String(p.transmitter_id || (p as any).platformId);
            const curr = posByTx.get(pid);
            if (!curr || safeParseDate(p.timestamp) >= safeParseDate(curr.timestamp)) {
              posByTx.set(pid, p);
            }
          });
          // Update with incoming positions (both latest per tx AND recent within 7 days)
          const recentPositions: Position[] = [];
          newPositionDocs.forEach(p => {
            const pid = String(p.transmitter_id || (p as any).platformId);
            const curr = posByTx.get(pid);
            if (!curr || safeParseDate(p.timestamp) >= safeParseDate(curr.timestamp)) {
              posByTx.set(pid, p);
            }
            const t = safeParseDate(p.timestamp);
            if (!isNaN(t) && t >= sevenDaysAgo) {
              recentPositions.push(p);
            }
          });
          const mergedPositions = Array.from(new Set([...posByTx.values(), ...recentPositions]));
          const cappedPositions = mergedPositions.length > 5000 
              ? mergedPositions.slice(mergedPositions.length - 5000) 
              : mergedPositions;

          const nowIso = new Date().toISOString();
          await saveLastIngestTime(nowIso);

          const filteredTransmitters = filterTransmittersForUser(newTransmitters, currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole);
          const filteredPositions = filterPositionsForUser(cappedPositions, newTransmitters, currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole);

          set({ 
              transmitters: filteredTransmitters, 
              positions: filteredPositions,
              lastIngestTime: nowIso,
              lastSaved: nowIso 
          });

          onProgress?.(`✅ Done: ${tUpdated} transmitters, ${pCreated} positions, ${incomingMessages.length} raw records`);

          // Invalidate history cache for affected transmitters so any reports show fresh data
          affectedPids.forEach(pid => clearTransmitterHistoryCache(pid));

          // 6. Run status evaluation asynchronously (non-blocking)
          const bgTransmitters = [...newTransmitters];
          setTimeout(async () => {
            try {
              console.log(`[AppStore] Background: evaluating status for ${affectedPids.size} affected transmitters...`);
              const affectedIndices = bgTransmitters
                  .map((t, i) => ({ t, i }))
                  .filter(({ t }) => affectedPids.has(String(t.platform_id || t.id).replace(/^trans-/, '').trim()));

              let statusUpdated = false;
              for (const { t, i } of affectedIndices) {
                try {
                  // Fetch recent argos_positions and positions (ordered by timestamp desc)
                  const targetPid = String(t.platform_id || t.id).replace(/^trans-/, '').trim();
                  const qArgos = query(collection(db, 'argos_positions'), where('platformId', '==', targetPid), orderBy('timestamp', 'desc'), limit(300));
                  const snapArgos = await getDocs(qArgos);
                  const argosPositions = snapArgos.docs.map(doc => doc.data());

                  const qPos = query(collection(db, 'positions'), where('transmitter_id', '==', targetPid), orderBy('timestamp', 'desc'), limit(300));
                  const snapPos = await getDocs(qPos);
                  const manualPositions = snapPos.docs.map(doc => doc.data());

                  let allPositions = [...argosPositions, ...manualPositions];
                  if (targetPid === '242086') {
                    allPositions = allPositions.map(p => {
                      const lon = Number(p.lon !== undefined ? p.lon : p.longitude);
                      if (!isNaN(lon) && lon < 0) {
                        return { ...p, lon: Math.abs(lon), longitude: Math.abs(lon) };
                      }
                      return p;
                    });

                    // Fix negative lon docs in Firebase argos_positions
                    snapArgos.docs.forEach(async (docSnap) => {
                      const data = docSnap.data();
                      if (Number(data.lon) < 0) {
                        await saveDocument('argos_positions', docSnap.id, { lon: Math.abs(Number(data.lon)) });
                      }
                    });
                  }
                  
                  // Recalculate last_fix from the full Firebase database (argos_positions + positions).
                  let correctedLastFix = t.last_fix;
                  if (allPositions.length > 0) {
                    let maxTs = -Infinity;
                    let latestPos: any = null;

                    allPositions.forEach(p => {
                      const rawDataStr = String((p as any).rawData || (p as any).raw_data || '').trim();
                      const rawTs = (rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]) 
                          ? KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]
                          : ((p as any).timestamp || (p as any).locationDate);
                      const ts = safeParseDate(rawTs);
                      const pLat = Number((p as any).lat ?? (p as any).latitude);
                      const pLon = Number((p as any).lon ?? (p as any).longitude);
                      if (!isNaN(ts) && ts > maxTs && isValidCoordinate(pLat, pLon)) {
                        maxTs = ts;
                        latestPos = { ...p, lat: pLat, lon: pLon, ts };
                      }
                    });

                    if (latestPos && maxTs > 0) {
                      const maxIso = new Date(maxTs).toISOString();
                      const currentTs = safeParseDate(t.last_fix);
                      if (isNaN(currentTs) || maxTs > currentTs || t.lat !== latestPos.lat || t.lon !== latestPos.lon) {
                        correctedLastFix = maxIso;
                        bgTransmitters[i].last_fix = maxIso;
                        bgTransmitters[i].lat = latestPos.lat;
                        bgTransmitters[i].lon = latestPos.lon;
                        (bgTransmitters[i] as any).latitude = latestPos.lat;
                        (bgTransmitters[i] as any).longitude = latestPos.lon;
                        (bgTransmitters[i] as any).last_latitude = latestPos.lat;
                        (bgTransmitters[i] as any).last_longitude = latestPos.lon;
                        await saveDocument('transmitters', targetPid, { 
                          id: targetPid,
                          platform_id: targetPid,
                          last_fix: maxIso,
                          lat: latestPos.lat,
                          lon: latestPos.lon,
                          latitude: latestPos.lat,
                          longitude: latestPos.lon,
                          last_latitude: latestPos.lat,
                          last_longitude: latestPos.lon
                        });
                        statusUpdated = true;
                      }
                    }
                  }

                  const { status: derived, isNesting } = evaluateTransmitterStatus({ ...t, last_fix: correctedLastFix }, allPositions);
                  
                  const statusUpdatesResult = await processTransmitterStatusUpdates(
                      { ...t, last_fix: correctedLastFix },
                      derived,
                      isNesting,
                      allPositions,
                      addAlert,
                      () => get().birds
                  );

                  if (Object.keys(statusUpdatesResult).length > 0) {
                    bgTransmitters[i] = { ...bgTransmitters[i], ...statusUpdatesResult };
                    statusUpdated = true;
                    await saveDocument('transmitters', targetPid, statusUpdatesResult);
                  }
                } catch (err) {
                  console.error(`Error evaluating status for ${t.platform_id}:`, err);
                }
              }

              // Update in-memory state with final status results
              if (statusUpdated) {
                const { currentUserIosPttVisibility: vis, currentUserIosVisiblePtts: visPtts, currentUserRole: userRole } = get();
                const updatedFiltered = filterTransmittersForUser(bgTransmitters, vis, visPtts, userRole);
                set({ transmitters: updatedFiltered });
                console.log('[AppStore] Background: status evaluation complete, UI updated.');
              }
            } catch (err) {
              console.error('[AppStore] Background status evaluation error:', err);
            }
          }, 100);

          return { transmittersUpdated: tUpdated, positionsCreated: pCreated };
      },

      // ─── Danger Zone: Clear Collections ────────────────────────────────────
      clearTable: async (table, onProgress) => {
        const tables = table === 'all'
          ? ['transmitters', 'birds', 'positions', 'argos_positions', 'alerts', 'user_activity_logs']
          : [table];

        for (const t of tables) {
          onProgress?.(`Deleting ${t}...`);
          await deleteCollection(t, (n) => onProgress?.(`${t}: ${n} deleted...`));
        }

        // Reset local state
        const resetState: any = {};
        if (table === 'all' || table === 'transmitters') resetState.transmitters = [];
        if (table === 'all' || table === 'birds')        resetState.birds = [];
        if (table === 'all' || table === 'positions')    resetState.positions = [];
        if (table === 'all' || table === 'alerts')       resetState.alerts = [];
        resetState.lastSaved = new Date().toISOString();
        set(resetState);
        onProgress?.('✅ Done.');
      },

      purgeZeroCoordinates: async () => {
        // Zero-coordinate purge already completed and ingestion now filters them.
        // This is a no-op to avoid thousands of reads on every app refresh.
        // To re-run manually, use the Database > Purge Invalid Coordinates button.
        console.log('[AppStore] purgeZeroCoordinates skipped (already completed, ingestion filters active)');
      },

      // ─── Firestore Initialization ──────────────────────────────────────────
      initializeFromFirestore: async () => {

        try {
          console.log('[AppStore] Loading data from Firestore...');
          // purgeZeroCoordinates disabled on init — zero coords are now filtered at ingestion time
          // get().purgeZeroCoordinates().catch(err => console.warn('[AppStore] Zero purge error:', err));
          
          const [fsTransmittersRaw, fsBirdsRaw, fsAlerts, fsUsers, fsLastIngest] = await Promise.all([
            fetchAllTransmittersFromFirestore(),
            fetchAllBirdsFromFirestore(),
            loadRecentAlerts<Alert>(),
            loadCollection<User>('users'),
            loadLastIngestTime()
          ]);

          // Deduplicate transmitters & birds to guarantee strict uniqueness
          const { deduplicated: fsTransmitters, deletedDocIds: txDupIds, updatedCanonicalDocs: txUpdatedDocs } = deduplicateTransmitters(fsTransmittersRaw);
          const { deduplicated: fsBirds, deletedDocIds: birdDupIds, updatedCanonicalDocs: birdUpdatedDocs } = deduplicateBirds(fsBirdsRaw);

          // Clean up duplicate Firestore documents in background (non-blocking)
          if (txDupIds.length > 0 || txUpdatedDocs.length > 0) {
            fireAndForget(async () => {
              for (const doc of txUpdatedDocs) {
                await saveDocument('transmitters', doc.id, doc);
              }
              for (const id of txDupIds) {
                await deleteDocument('transmitters', id);
              }
              console.log(`[AppStore] Cleaned up ${txDupIds.length} duplicate transmitter documents from Firestore.`);
            });
          }

          if (birdDupIds.length > 0 || birdUpdatedDocs.length > 0) {
            fireAndForget(async () => {
              for (const doc of birdUpdatedDocs) {
                await saveDocument('birds', doc.id, doc);
              }
              for (const id of birdDupIds) {
                await deleteDocument('birds', id);
              }
              console.log(`[AppStore] Cleaned up ${birdDupIds.length} duplicate bird documents from Firestore.`);
            });
          }

          // FAST BOOT: Derive initial live positions directly from transmitter summary docs (0 network reads, 0 ms)
          const fsPositions: Position[] = fsTransmitters
            .filter(t => {
              const liveFix = t.live?.lastFix || t.live?.lastGps || t.live?.lastDoppler;
              const rawLat = liveFix?.lat ?? t.lat ?? t.latitude ?? t.last_latitude;
              const rawLon = liveFix?.lon ?? t.lon ?? t.longitude ?? t.last_longitude;
              return isValidCoordinate(rawLat, rawLon);
            })
            .map(t => {
              const liveFix = t.live?.lastFix || t.live?.lastGps || t.live?.lastDoppler;
              const rawLat = liveFix?.lat ?? t.lat ?? t.latitude ?? t.last_latitude;
              const rawLon = liveFix?.lon ?? t.lon ?? t.longitude ?? t.last_longitude;
              const pLat = Number(rawLat);
              let pLon = Number(rawLon);
              if (String(t.platform_id) === '242086' && pLon < 0) pLon = Math.abs(pLon);

              const txAny = t as any;
              const locType = ((liveFix as any)?.type || 'GPS') as 'GPS' | 'DOPPLER';
              const locClass = locType === 'GPS' ? null : ((liveFix as any)?.class || '3');
              const errRadius = locType === 'GPS' ? 0 : ((liveFix as any)?.errorRadiusM || 0);
              const fixDate = liveFix?.date || t.last_fix || txAny.lastFixAt || txAny.updatedAt || new Date().toISOString();

              return {
                id: `pos-${t.platform_id}-latest`,
                transmitter_id: String(t.platform_id),
                timestamp: fixDate,
                locationDate: fixDate,
                lat: pLat,
                lon: pLon,
                lc: (locType === 'GPS' ? 'GPS' : (locClass || '3')) as any,
                locationClass: locClass,
                errorRadiusM: errRadius,
                is_kalman: false,
                speed_kmh: Number(txAny.speed_kmh || 0),
                course: Number(txAny.course || 0),
                altitude: Number(txAny.altitude || 0),
                battery_voltage: t.battery_voltage,
                satellite: locType === 'GPS' ? 'GPS' : 'Argos',
                locationType: locType
              };
            });

          // Ensure bidirectional ID linking between transmitters and birds
          fsTransmitters.forEach(t => {
            const matched = findBirdForTransmitter(fsBirds, t);
            if (matched) {
              t.bird_id = matched.id;
              if (!t.assigned_bird_ring) {
                t.assigned_bird_ring = matched.ring_id;
              }
            }
          });

          // Firestore is the source of truth — use directly
          const mergedTransmitters = fsTransmitters;
          const mergedBirds = fsBirds;
          const mergedAlerts = fsAlerts;
          const mergedUsers = fsUsers;
          const recentPositions = fsPositions as Position[];

          // Try to load user profile for RBAC
          const currentUser = get().currentUser;
          let role: Role = 'Viewer';
          let permissions: string[] = ['View Data'];
          let iosPttVisibility = 'all';
          let iosVisiblePtts: string[] = [];
          let appAccess = ['web', 'ios'];
          let userProfile: User | undefined;
          
          if (currentUser) {
            userProfile = mergedUsers.find(u => u.id === currentUser.uid || u.email === currentUser.email);
            if (userProfile) {
              role = userProfile.role || 'Viewer';
              permissions = userProfile.permissions || ['View Data'];
              iosPttVisibility = userProfile.iosPttVisibility || 'all';
              iosVisiblePtts = userProfile.iosVisiblePtts || [];
              appAccess = userProfile.appAccess || ['web', 'ios'];
            } else {
              // check if it's the first user or the super admin
              const isFirstUser = mergedUsers.length === 0 || currentUser.email === 'achlih21@gmail.com';
              if (isFirstUser) {
                role = 'Manager';
                permissions = ['View Data', 'Live Tracking', 'Generate Reports', 'Manage Alerts', 'Manage Transmitters', 'Upload Data', 'API Integration', 'Manage Database', 'Manage Users', 'System Settings'];
              }
              
              // Automatically register the user in the database so they don't lose access later
              const newUserProfile = {
                id: currentUser.uid,
                name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown User',
                email: currentUser.email || '',
                role: role,
                status: 'active' as const,
                permissions: permissions,
                appAccess: ['web', 'ios'] as ('web' | 'ios')[],
                iosPttVisibility: 'all' as const,
                iosVisiblePtts: []
              };
              mergedUsers.push(newUserProfile);
              fireAndForget(() => saveDocument('users', currentUser.uid, newUserProfile));
            }

            // GUARANTEE SUPER ADMIN ROLE
            if (currentUser.email === 'achlih21@gmail.com') {
              role = 'Manager';
              permissions = ['View Data', 'Live Tracking', 'Generate Reports', 'Manage Alerts', 'Manage Transmitters', 'Upload Data', 'API Integration', 'Manage Database', 'Manage Users', 'System Settings'];
              
              // Also update the database document just in case it had Viewer loaded
              if (userProfile && userProfile.role !== 'Manager') {
                const updatedProfile = { ...userProfile, role, permissions };
                const index = mergedUsers.findIndex(u => u.id === userProfile.id);
                if (index !== -1) mergedUsers[index] = updatedProfile;
                fireAndForget(() => saveDocument('users', currentUser.uid, updatedProfile));
              }
            }
          }

          const finalTransmitters = filterTransmittersForUser(mergedTransmitters, iosPttVisibility as any, iosVisiblePtts, role);
          const finalPositions = filterPositionsForUser(recentPositions, mergedTransmitters, iosPttVisibility as any, iosVisiblePtts, role);
          const finalAlerts = filterAlertsForUser(mergedAlerts, mergedTransmitters, iosPttVisibility as any, iosVisiblePtts, role);

          set({
            transmitters: finalTransmitters,
            birds: mergedBirds,
            positions: finalPositions,
            alerts: finalAlerts,
            users: mergedUsers,
            staticTestPeriods: get().staticTestPeriods || [],
            statusHistoryRecords: get().statusHistoryRecords || [],
            lastIngestTime: fsLastIngest || null,
            firestoreReady: true,
            currentUserRole: role,
            currentUserPermissions: permissions,
            currentUserAppAccess: appAccess,
            currentUserIosDataUpload: userProfile?.iosDataUpload === true || (appAccess && appAccess.includes('ios_data_upload')),
            currentUserIosPttVisibility: iosPttVisibility as 'all' | 'custom',
            currentUserIosVisiblePtts: iosVisiblePtts,
            lastSaved: new Date().toISOString()
          });
          
          // Cleanup old resolved alerts (older than 7 days) from in-memory state
          get().cleanupOldAlerts();

          // One-time background Firestore cleanup: delete archived resolved alerts >7 days old
          // This cleans up the ~800+ old alerts that loadRecentAlerts no longer loads
          fireAndForget(async () => {
            try {
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              const cutoffISO = sevenDaysAgo.toISOString();

              const oldResolvedQuery = query(
                collection(db, 'alerts'),
                where('status', '==', 'resolved'),
                where('timestamp', '<', cutoffISO)
              );
              const oldSnap = await trackedGetDocs('alerts (cleanup old)', oldResolvedQuery);
              if (oldSnap.size > 0) {

                console.log(`[AppStore] Deleting ${oldSnap.size} old archived alerts from Firestore...`);
                const batch = writeBatch(db);
                let ops = 0;
                const batches = [batch];
                oldSnap.forEach(docSnap => {
                  batches[batches.length - 1].delete(docSnap.ref);
                  ops++;
                  if (ops % 400 === 0) {
                    batches.push(writeBatch(db));
                  }
                });
                for (const b of batches) {
                  await b.commit();
                }
                console.log(`[AppStore] Deleted ${oldSnap.size} old archived alerts from Firestore.`);
              }
            } catch (err) {
              console.warn('[AppStore] Error cleaning up old Firestore alerts:', err);
            }
          });

          console.log(`[AppStore] Firestore init complete: ${mergedTransmitters.length} transmitters, ${mergedBirds.length} birds, ${recentPositions.length} positions, role: ${role}`);

        } catch (error) {
          console.error('[AppStore] Firestore init error:', error);
          set({ firestoreReady: true });
        }
      },

      recalculateTransmitterStatuses: async (onProgress?: (msg: string) => void) => {
        try {
          onProgress?.('Calculating derived statuses for all transmitters...');
          const currentTransmitters = [...get().transmitters];
          let updated = 0;

          for (let i = 0; i < currentTransmitters.length; i++) {
            const t = currentTransmitters[i];
            try {
              const pidStr = String(t.platform_id || t.id).replace(/^trans-/, '').trim();
              
              const qArgos = query(collection(db, 'argos_positions'), where('platformId', '==', pidStr), orderBy('timestamp', 'desc'), limit(300));
              const snapArgos = await getDocs(qArgos);
              const argosPositions = snapArgos.docs.map(doc => doc.data());

              const qPos = query(collection(db, 'positions'), where('transmitter_id', '==', pidStr), orderBy('timestamp', 'desc'), limit(300));
              const snapPos = await getDocs(qPos);
              const manualPositions = snapPos.docs.map(doc => doc.data());

              let allPositions = [...argosPositions, ...manualPositions];
              if (pidStr === '242086') {
                allPositions = allPositions.map(p => {
                  const lon = Number(p.lon !== undefined ? p.lon : p.longitude);
                  if (!isNaN(lon) && lon < 0) {
                    return { ...p, lon: Math.abs(lon), longitude: Math.abs(lon) };
                  }
                  return p;
                });

                // Fix negative lon docs in Firebase argos_positions
                snapArgos.docs.forEach(async (docSnap) => {
                  const data = docSnap.data();
                  if (Number(data.lon) < 0) {
                    await saveDocument('argos_positions', docSnap.id, { lon: Math.abs(Number(data.lon)) });
                  }
                });
              }

              let correctedLastFix = t.last_fix;
              if (allPositions.length > 0) {
                  const allTimestamps = allPositions
                      .map(p => safeParseDate(p.timestamp || p.locationDate))
                      .filter(ts => !isNaN(ts) && ts > 0);
                  if (allTimestamps.length > 0) {
                      const maxTs = Math.max(...allTimestamps);
                      const maxIso = new Date(maxTs).toISOString();
                      const currentTs = safeParseDate(t.last_fix);
                      if (isNaN(currentTs) || maxTs > currentTs) {
                          correctedLastFix = maxIso;
                          currentTransmitters[i].last_fix = maxIso;
                          await saveDocument('transmitters', pidStr, { id: pidStr, platform_id: pidStr, last_fix: maxIso });
                          updated++;
                      }
                  }
              }

              const { status: newStatus, isNesting } = evaluateTransmitterStatus({ ...t, last_fix: correctedLastFix }, allPositions);

              const statusUpdates = await processTransmitterStatusUpdates(
                { ...t, last_fix: correctedLastFix },
                newStatus,
                isNesting,
                allPositions,
                get().addAlert,
                () => get().birds
              );

              if (Object.keys(statusUpdates).length > 0) {
                currentTransmitters[i] = { ...currentTransmitters[i], ...statusUpdates, id: pidStr, platform_id: pidStr };
                await saveDocument('transmitters', pidStr, { ...statusUpdates, id: pidStr, platform_id: pidStr });
                updated++;
              }
            } catch (err) {
              console.warn(`[AppStore] Failed to evaluate status for ${t.platform_id}:`, err);
            }
          }

          if (updated > 0) {
            const freshTransmitters = await loadCollection<Transmitter>('transmitters');
            const { deduplicated: deduplicatedFresh } = deduplicateTransmitters(freshTransmitters);
            const { currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole } = get();
            const filteredTransmitters = filterTransmittersForUser(deduplicatedFresh, currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole);
            set({ transmitters: filteredTransmitters });
            onProgress?.(`Updated derived_status for ${updated} transmitters.`);
          } else {
            onProgress?.('All transmitter statuses are up to date.');
          }
        } catch (err) {
          console.error('[AppStore] Error in recalculateTransmitterStatuses:', err);
        }
      },

      refreshMonitoringData: async (onProgress) => {
        try {
          onProgress?.('Synchronizing transmitters and fixes from Argos database...');
          // 1. Sync transmitters & positions directly from Argos data (argos_positions + positions)
          // Discovers any missing transmitters (like 244289) and writes them to Firestore transmitters collection!
          const { transmitters: syncedTransmitters, positions: syncedPositions, createdCount, updatedCount } = await syncTransmittersFromArgosData();

          // 2. Load fresh birds
          const freshBirdsRaw = await loadCollection<Bird>('birds');
          const { deduplicated: dedupBirds } = deduplicateBirds(freshBirdsRaw);

          // 3. Deduplicate transmitters
          const { deduplicated: dedupTransmitters } = deduplicateTransmitters(syncedTransmitters);

          // 4. Re-link birds to transmitters
          dedupTransmitters.forEach(t => {
            const matched = findBirdForTransmitter(dedupBirds, t);
            if (matched) {
              t.bird_id = matched.id;
              if (!t.assigned_bird_ring) {
                t.assigned_bird_ring = matched.ring_id;
              }
            }
          });

          // 5. Apply user visibility filtering
          const { currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole } = get();
          const filteredTransmitters = filterTransmittersForUser(dedupTransmitters, currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole);
          const filteredPositions = filterPositionsForUser(syncedPositions, dedupTransmitters, currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole);

          set({
            transmitters: filteredTransmitters,
            birds: dedupBirds,
            positions: filteredPositions,
            lastSaved: new Date().toISOString()
          });

          clearTransmitterHistoryCache();

          onProgress?.(`Synchronized ${filteredTransmitters.length} transmitters (${createdCount} new from Argos data) and ${filteredPositions.length} fixes.`);
          return {
            transmittersCount: filteredTransmitters.length,
            birdsCount: dedupBirds.length,
            positionsCount: filteredPositions.length
          };
        } catch (error) {
          console.error('[AppStore] Error in refreshMonitoringData:', error);
          throw error;
        }
      },

      // ─── Real-Time Position, Ingestion, Transmitter & Bird Listeners ─────────────
      subscribeToLivePositions: () => {
        // Real-time listener for last data update / ingestion timestamp
        let isAutoRefreshing = false;
        let initialIngestSeen = false;
        const unsubIngest = subscribeToLastIngestTime((ts) => {
          if (ts) {
            set({ lastIngestTime: ts });
            if (!initialIngestSeen) {
              initialIngestSeen = true;
              return; // Prevent duplicate heavy re-sync on initial boot snapshot
            }
            if (!isAutoRefreshing) {
              isAutoRefreshing = true;
              get().refreshMonitoringData().finally(() => {
                isAutoRefreshing = false;
              });
            }
          }
        });

        // Real-time listener for transmitters collection updates (status, metadata, new transmitters, etc.)
        const unsubTransmitters = subscribeToCollection<Transmitter>('transmitters', (rawTransmitters) => {
          if (!rawTransmitters || rawTransmitters.length === 0) return;
          const { deduplicated } = deduplicateTransmitters(rawTransmitters);
          const { currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole, birds } = get();

          deduplicated.forEach(t => {
            const matched = findBirdForTransmitter(birds, t);
            if (matched) {
              t.bird_id = matched.id;
              if (!t.assigned_bird_ring) {
                t.assigned_bird_ring = matched.ring_id;
              }
            }
          });

          const filteredTransmitters = filterTransmittersForUser(deduplicated, currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole);
          
          // Keep positions synchronized in real-time from transmitter updates without extra collection reads
          const syncPositions: Position[] = filteredTransmitters
            .filter(t => {
              const liveFix = t.live?.lastFix || t.live?.lastGps || t.live?.lastDoppler;
              const rawLat = liveFix?.lat ?? t.lat ?? t.latitude ?? t.last_latitude;
              const rawLon = liveFix?.lon ?? t.lon ?? t.longitude ?? t.last_longitude;
              return isValidCoordinate(rawLat, rawLon);
            })
            .map(t => {
              const liveFix = t.live?.lastFix || t.live?.lastGps || t.live?.lastDoppler;
              const rawLat = liveFix?.lat ?? t.lat ?? t.latitude ?? t.last_latitude;
              const rawLon = liveFix?.lon ?? t.lon ?? t.longitude ?? t.last_longitude;
              const pLat = Number(rawLat);
              let pLon = Number(rawLon);
              if (String(t.platform_id) === '242086' && pLon < 0) pLon = Math.abs(pLon);

              const txAny = t as any;
              const locType = ((liveFix as any)?.type || 'GPS') as 'GPS' | 'DOPPLER';
              const locClass = locType === 'GPS' ? null : ((liveFix as any)?.class || '3');
              const errRadius = locType === 'GPS' ? 0 : ((liveFix as any)?.errorRadiusM || 0);
              const fixDate = liveFix?.date || t.last_fix || txAny.lastFixAt || txAny.updatedAt || new Date().toISOString();

              return {
                id: `pos-${t.platform_id}-latest`,
                transmitter_id: String(t.platform_id),
                timestamp: fixDate,
                locationDate: fixDate,
                lat: pLat,
                lon: pLon,
                lc: (locType === 'GPS' ? 'GPS' : (locClass || '3')) as any,
                locationClass: locClass,
                errorRadiusM: errRadius,
                is_kalman: false,
                speed_kmh: Number(txAny.speed_kmh || 0),
                course: Number(txAny.course || 0),
                altitude: Number(txAny.altitude || 0),
                battery_voltage: t.battery_voltage,
                satellite: locType === 'GPS' ? 'GPS' : 'Argos',
                locationType: locType
              };
            });

          set({ transmitters: filteredTransmitters, positions: syncPositions, lastSaved: new Date().toISOString() });
        });

        // Real-time listener for birds collection updates (ring IDs, names, status)
        const unsubBirds = subscribeToCollection<Bird>('birds', (rawBirds) => {
          if (!rawBirds || rawBirds.length === 0) return;
          const { deduplicated } = deduplicateBirds(rawBirds);
          const currentTransmitters = [...get().transmitters];
          let txChanged = false;

          currentTransmitters.forEach(t => {
            const matched = findBirdForTransmitter(deduplicated, t);
            if (matched && (t.bird_id !== matched.id || t.assigned_bird_ring !== matched.ring_id)) {
              t.bird_id = matched.id;
              if (!t.assigned_bird_ring) {
                t.assigned_bird_ring = matched.ring_id;
              }
              txChanged = true;
            }
          });

          set({
            birds: deduplicated,
            ...(txChanged ? { transmitters: currentTransmitters } : {}),
            lastSaved: new Date().toISOString()
          });
        });

        // Listen only for new positions generated within the last 24 hours to avoid huge reads
        const unsubPositions = subscribeToRecentPositions(1, (firestorePositions) => {
          // Merge incoming new positions into the store (retaining older ones loaded initially)
          set((state) => {
            const currentPositions = [...state.positions];
            let changed = false;

            const { currentUserIosPttVisibility, currentUserIosVisiblePtts, currentUserRole } = get();
            
            // Filter incoming live positions based on user visibility settings (Administrators and Managers see all)
            let visibleIds: Set<string> | null = null;
            if (currentUserRole !== 'Administrator' && currentUserRole !== 'Manager' && currentUserIosPttVisibility === 'custom') {
               visibleIds = new Set((currentUserIosVisiblePtts || []).map(id => String(id)));
            }

            firestorePositions.forEach(p => {
               // User visibility restriction check
               if (visibleIds && !visibleIds.has(String(p.transmitter_id))) {
                  return;
               }

               const latNum = Number(p.lat);
               const lonNum = Number(p.lon);
               const validCoords = !(latNum === 0 && lonNum === 0) && !isNaN(latNum) && !isNaN(lonNum);
               
               if (validCoords) {
                 // Check if it exists or is newer
                 const existingIndex = currentPositions.findIndex(cp => cp.id === p.id);
                 if (existingIndex === -1) {
                   currentPositions.push(p as Position);
                   changed = true;
                 } else if (new Date(p.timestamp).getTime() > new Date(currentPositions[existingIndex].timestamp).getTime()) {
                   currentPositions[existingIndex] = p as Position;
                   changed = true;
                 }
               }
            });

            return changed ? { positions: currentPositions } : {};
          });
        });

        return () => {
          unsubIngest();
          unsubTransmitters();
          unsubBirds();
          unsubPositions();
        };
      },

      // ─── Simulation ─────────────────────────────────────────────────────────
      generateLivePositions: () => {
         const { transmitters, positions } = get();
         
         let hasChanges = false;
         let newSimulatedPositions: typeof positions = [];
         
         transmitters.forEach((t, index) => {
             const existingSimulated = positions.find(p => p.transmitter_id === t.platform_id && p.satellite === 'Simulated');
             
             if (existingSimulated) {
                 hasChanges = true;
                 newSimulatedPositions.push({
                    ...existingSimulated,
                    lat: existingSimulated.lat + (Math.random() - 0.5) * 0.01,
                    lon: existingSimulated.lon + (Math.random() - 0.5) * 0.01,
                    timestamp: new Date().toISOString(),
                 });
                 return;
             }
             
             const hasAnyPosition = positions.some(p => p.transmitter_id === t.platform_id);
             if (!hasAnyPosition) {
                 // Removed simulated UAE positions
             }
         });
         
         if (hasChanges) {
             const updatedPositions = [...positions];
             newSimulatedPositions.forEach(np => {
                 const idx = updatedPositions.findIndex(p => p.id === np.id);
                 if (idx >= 0) {
                     updatedPositions[idx] = np;
                 } else {
                     updatedPositions.push(np);
                 }
             });
            set({ positions: updatedPositions });
         }
      }
    }),
    {
      name: 'houbara-tracker-v7',  // CLEAN BREAK — no old data
      storage: createJSONStorage(() => localStorage), 
      partialize: (state) => ({ 
        // ONLY persist lightweight UI settings.
        // ALL data lives in Firebase. Zero data in LocalStorage.
        darkMode: state.darkMode,
        notificationsEnabled: state.notificationsEnabled,
        simpleMode: state.simpleMode,
        timeZone: state.timeZone,
        sidebarPinned: state.sidebarPinned,
        apiConfig: state.apiConfig
      })
    }
  )
);

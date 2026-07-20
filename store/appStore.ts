import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Alert, Bird, Transmitter, KPI, Position, User, ArgosMessage, ArgosDevice } from '../types';
import { logUserActivity } from '../services/activityLogger';
import { evaluateTransmitterStatus } from '../utils/statusCalculator';
import { 
  saveDocument, deleteDocument, savePositions, 
  loadCollection, subscribeToCollection, 
  loadRecentPositions, subscribeToRecentPositions,
  loadLatestPositionsPerTransmitter,
  syncTransmitters, syncBirds, syncAlerts,
  batchWriteArgosPositions, deleteCollection,
  batchWriteDocuments, batchDeleteDocuments,
  loadAllArgosPositions, bulkDeleteRecords, bulkUpdateRecords
} from '../services/firestoreService';
import { analyzePositionsForAlerts } from '../services/alertService';
import { decodeBatteryVoltage } from '../services/argosService';
import type { Role } from '../types';

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
  activeGeeLayer: 'ndvi' | 'lst' | 'savi' | null;
  setGeeNdviTileUrl: (url: string | null) => void;
  setGeeLstTileUrl: (url: string | null) => void;
  setGeeSaviTileUrl: (url: string | null) => void;
  setActiveGeeLayer: (layer: 'ndvi' | 'lst' | 'savi' | null) => void;
  
  // System State
  lastSaved: string;
  firestoreReady: boolean;

  // Data — all sourced from Firebase
  transmitters: Transmitter[];
  birds: Bird[];
  alerts: Alert[];
  positions: Position[];
  users: User[];
  
  // Authentication State
  currentUser: any | null;
  setCurrentUser: (user: any | null) => void;
  authLoading: boolean;
  setAuthLoading: (loading: boolean) => void;

  // Role-Based Access Control
  currentUserRole: Role;
  currentUserPermissions: string[];
  setCurrentUserProfile: (role: Role, permissions: string[]) => void;

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
  addBird: (bird: Bird) => void;
  updateBird: (id: string, updates: Partial<Bird>) => void;
  deleteBird: (id: string) => void;
  bulkDeleteBirds: (ids: string[]) => Promise<void>;
  bulkUpdateBirds: (ids: string[], updates: Partial<Bird>) => Promise<void>;
  importBirds: (birds: Bird[]) => void;

  // Transmitter Actions
  addTransmitter: (transmitter: Transmitter) => void;
  updateTransmitter: (id: string, updates: Partial<Transmitter>) => void;
  deleteTransmitter: (id: string) => void;
  bulkDeleteTransmitters: (ids: string[]) => Promise<void>;
  bulkUpdateTransmitters: (ids: string[], updates: Partial<Transmitter>) => Promise<void>;
  importTransmitters: (transmitters: Transmitter[]) => void;
  
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
  recalculateTransmitterStatuses: (onProgress?: (msg: string) => void) => Promise<void>;
  subscribeToLivePositions: () => () => void;

  // Danger Zone — Collection Clearing
  clearTable: (table: 'transmitters' | 'birds' | 'positions' | 'argos_positions' | 'alerts' | 'all', onProgress?: (msg: string) => void) => Promise<void>;

  // Simulation Actions
  generateLivePositions: () => void;
}

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

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      sidebarPinned: true,
      toggleSidebarPinned: () => set((state) => ({ sidebarPinned: !state.sidebarPinned })),

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

      timeZone: 'UTC',
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
      activeGeeLayer: null,
      setGeeNdviTileUrl: (url) => set({ geeNdviTileUrl: url }),
      setGeeLstTileUrl: (url) => set({ geeLstTileUrl: url }),
      setGeeSaviTileUrl: (url) => set({ geeSaviTileUrl: url }),
      setActiveGeeLayer: (layer) => set({ activeGeeLayer: layer }),
      
      lastSaved: new Date().toISOString(),
      firestoreReady: false,

      // All data arrays start empty — loaded from Firebase on auth
      transmitters: [],
      birds: [],
      alerts: [],
      positions: [],
      users: [],
      
      // Auth Default State
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      authLoading: true,
      setAuthLoading: (loading) => set({ authLoading: loading }),

      // RBAC
      currentUserRole: 'Viewer' as Role,
      currentUserPermissions: ['View Data'],
      setCurrentUserProfile: (role, permissions) => set({ currentUserRole: role, currentUserPermissions: permissions }),

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
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          const oldResolvedAlerts = state.alerts.filter(a => {
            if (a.status !== 'resolved') return false;
            const alertDate = new Date(a.timestamp);
            return alertDate < thirtyDaysAgo;
          });
          
          if (oldResolvedAlerts.length === 0) return state;
          
          const idsToDelete = oldResolvedAlerts.map(a => a.id);
          const keptAlerts = state.alerts.filter(a => !idsToDelete.includes(a.id));
          
          fireAndForget(() => batchDeleteDocuments('alerts', idsToDelete));
          return { alerts: keptAlerts, lastSaved: new Date().toISOString() };
        });
      },

      // ─── Bird CRUD ──────────────────────────────────────────────────────────
      addBird: (bird) => {
        logDbAction(get, 'DATA_CREATE', `Added Bird ${bird.ring_id}`);
        set((state) => ({ birds: [bird, ...state.birds], lastSaved: new Date().toISOString() }));
        fireAndForget(() => saveDocument('birds', bird.id, bird));
      },
      updateBird: (id, updates) => {
        logDbAction(get, 'DATA_UPDATE', `Updated Bird ID: ${id}`);
        set((state) => {
          const updatedBirds = state.birds.map(b => b.id === id ? { ...b, ...updates } : b);
          const updated = updatedBirds.find(b => b.id === id);
          if (updated) fireAndForget(() => saveDocument('birds', id, updated));
          return { birds: updatedBirds, lastSaved: new Date().toISOString() };
        });
      },
      deleteBird: (id) => {
        logDbAction(get, 'DATA_DELETE', `Deleted Bird ID: ${id}`);
        set((state) => ({
          birds: state.birds.filter(b => b.id !== id),
          transmitters: state.transmitters.map(t => t.bird_id === id ? { ...t, bird_id: '' } : t),
          lastSaved: new Date().toISOString()
        }));
        fireAndForget(() => deleteDocument('birds', id));
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
            const birdMap = new Map<string, Bird>(state.birds.map(b => [b.ring_id, b] as [string, Bird]));
            
            newBirds.forEach(bird => {
                const existing = birdMap.get(bird.ring_id);
                if (existing) {
                    birdMap.set(bird.ring_id, { ...existing, ...bird, id: existing.id });
                } else {
                    birdMap.set(bird.ring_id, bird);
                }
            });
            
            const allBirds = Array.from(birdMap.values());
            fireAndForget(() => syncBirds(allBirds));
            return { birds: allBirds, lastSaved: new Date().toISOString() };
         });
      },

      // ─── Transmitter CRUD ───────────────────────────────────────────────────
      addTransmitter: (transmitter) => {
          logDbAction(get, 'DATA_CREATE', `Added Transmitter ${transmitter.platform_id}`);
          set((state) => ({ 
              transmitters: [transmitter, ...state.transmitters],
              lastSaved: new Date().toISOString()
          }));
          fireAndForget(() => saveDocument('transmitters', transmitter.id, transmitter));
      },
      updateTransmitter: (id, updates) => {
        logDbAction(get, 'DATA_UPDATE', `Updated Transmitter ID: ${id}`);
        set((state) => {
          const updated = state.transmitters.map(t => t.id === id ? { ...t, ...updates } : t);
          const t = updated.find(t => t.id === id);
          if (t) fireAndForget(() => saveDocument('transmitters', id, t));
          return { transmitters: updated, lastSaved: new Date().toISOString() };
        });
      },
      deleteTransmitter: (id) => {
          logDbAction(get, 'DATA_DELETE', `Deleted Transmitter ID: ${id}`);
          set((state) => {
            const t = state.transmitters.find(tr => tr.id === id);
            return {
              transmitters: state.transmitters.filter(t => t.id !== id),
              positions: state.positions.filter(p => p.transmitter_id !== t?.platform_id),
              lastSaved: new Date().toISOString()
            };
          });
          fireAndForget(() => deleteDocument('transmitters', id));
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
              const transMap = new Map<string, Transmitter>(state.transmitters.map(t => [t.platform_id, t] as [string, Transmitter]));
              
              newTransmitters.forEach(t => {
                  const existing = transMap.get(t.platform_id);
                  if (existing) {
                      transMap.set(t.platform_id, { ...existing, ...t, id: existing.id });
                  } else {
                      transMap.set(t.platform_id, t);
                  }
              });
              
              const allTransmitters = Array.from(transMap.values());
              fireAndForget(() => syncTransmitters(allTransmitters));
              return { transmitters: allTransmitters, lastSaved: new Date().toISOString() };
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

      // ─── Argos → Firebase Direct Sync ───────────────────────────────────────
      // This is the CORE ingestion pipeline. Data flows:
      // Argos API → mapArgosApiData() → syncArgosToFirebase() → Firebase
      // NO data is stored in zustand state arrays. NO LocalStorage.
      syncArgosToFirebase: async (incomingMessages, incomingDevices = [], onProgress) => {
          const { transmitters, positions, addAlert } = get();
          let newTransmitters = [...transmitters];
          let tUpdated = 0;
          let pCreated = 0;
          const newPositionDocs: Position[] = [];

          onProgress?.('Processing device list...');

          // 1. Sync Devices List → Transmitters
          incomingDevices.forEach(device => {
              const pid = String(device.deviceRef);
              const index = newTransmitters.findIndex(t => String(t.platform_id) === pid);
              if (index >= 0) {
                  const t = newTransmitters[index];
                  newTransmitters[index] = {
                      ...t,
                      model: device.model || t.model,
                      manufacturer: device.manufacturer || t.manufacturer,
                      program_region: device.programRef || t.program_region,
                      status: device.active ? 'active' : 'inactive',
                      deployed: device.active
                  };
                  tUpdated++;
              } else {
                  newTransmitters.push({
                      id: `trans-${pid}`,
                      platform_id: pid,
                      model: device.model || 'Unknown',
                      status: device.active ? 'active' : 'inactive',
                      bird_id: '',
                      battery_voltage: undefined,
                      last_fix: new Date().toISOString(),
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

          incomingMessages.forEach(msg => {
              const lat = parseFloat(msg.lat);
              const lon = parseFloat(msg.lon);
              const pid = String(msg.platformId);
              
              // Attempt to decode battery voltage from rawData
              const decodedBattery = msg.rawData ? decodeBatteryVoltage(msg.rawData) : undefined;

              let tIndex = newTransmitters.findIndex(t => String(t.platform_id) === pid);
              
              if (tIndex === -1) {
                  newTransmitters.push({
                      id: `trans-${pid}`,
                      platform_id: pid,
                      model: 'Unknown (Auto-detected)',
                      status: 'active',
                      bird_id: '',
                      battery_voltage: decodedBattery,
                      last_fix: msg.timestamp,
                      duty_cycle: 'Unknown',
                      deployed: true
                  });
                  tIndex = newTransmitters.length - 1;
                  tUpdated++;
              } else {
                  // Update existing transmitter with new battery and last_fix if this message is newer
                  const t = newTransmitters[tIndex];
                  // If we found a battery voltage, and this message is at least as new as the last_fix (or there is no last_fix), update it.
                  if (decodedBattery !== undefined && (!t.last_fix || new Date(msg.timestamp) >= new Date(t.last_fix))) {
                      newTransmitters[tIndex] = {
                          ...t,
                          battery_voltage: decodedBattery
                      };
                      tUpdated++;
                  }
                  // Update last_fix if it's strictly newer
                  if (!t.last_fix || new Date(msg.timestamp) > new Date(t.last_fix)) {
                      newTransmitters[tIndex].last_fix = msg.timestamp;
                      tUpdated++;
                  }
              }

              if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) > 1 && Math.abs(lon) > 1) {
                  const key = `${pid}|${msg.timestamp}|${lat}|${lon}`;
                  if (!existingPosKeys.has(key)) {
                      existingPosKeys.add(key);
                      const newPos: Position = {
                          id: `pos-${msg.id}`,
                          transmitter_id: pid,
                          timestamp: msg.timestamp,
                          lat: lat,
                          lon: lon,
                          lc: msg.lc as any,
                          is_kalman: false,
                          speed_kmh: 0, 
                          course: 0,
                          satellite: msg.satellite,
                          locationType: msg.locationType as 'GPS' | 'Doppler' || 'Doppler'
                      };
                      newPositionDocs.push(newPos);
                      pCreated++;
                  }
              }

              if (tIndex >= 0) {
                  const currentLastFix = new Date(newTransmitters[tIndex].last_fix).getTime();
                  const msgTime = new Date(msg.timestamp).getTime();
                  if (msgTime > currentLastFix) {
                      newTransmitters[tIndex] = {
                          ...newTransmitters[tIndex],
                          last_fix: msg.timestamp,
                          status: 'active'
                      };
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

          // 4.5 Evaluate and update derived_status for modified transmitters
          const modifiedTransmitterIds = new Set(newPositionDocs.map(p => p.transmitter_id));
          if (modifiedTransmitterIds.size > 0) {
              onProgress?.(`Evaluating status for ${modifiedTransmitterIds.size} active transmitters...`);
              let statusUpdated = false;
              for (let i = 0; i < newTransmitters.length; i++) {
                  const t = newTransmitters[i];
                  if (modifiedTransmitterIds.has(t.platform_id)) {
                      try {
                          // Fetch all argos_positions for this transmitter to calculate accurate barycenters
                          const q = query(collection(db, 'argos_positions'), where('platformId', '==', t.platform_id));
                          const snapshot = await getDocs(q);
                          const allPositions = snapshot.docs.map(doc => doc.data());
                          const derived = evaluateTransmitterStatus(t, allPositions);
                          
                          if (t.derived_status !== derived) {
                              newTransmitters[i].derived_status = derived;
                              statusUpdated = true;
                              // Also update in DB
                              await saveDocument('transmitters', t.id, { derived_status: derived });
                          }
                      } catch (err) {
                          console.error(`Error evaluating status for ${t.platform_id}:`, err);
                      }
                  }
              }
              if (statusUpdated) {
                  onProgress?.(`Updated derived statuses.`);
              }
          }

          // 5. Update in-memory state with recent data only (for live map)
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const recentNewPositions = newPositionDocs.filter(p => {
              const t = new Date(p.timestamp).getTime();
              return !isNaN(t) && t >= sevenDaysAgo;
          });
          const mergedPositions = [...positions, ...recentNewPositions];
          const cappedPositions = mergedPositions.length > 2000 
              ? mergedPositions.slice(mergedPositions.length - 2000) 
              : mergedPositions;

          set({ 
              transmitters: newTransmitters, 
              positions: cappedPositions,
              lastSaved: new Date().toISOString() 
          });

          onProgress?.(`✅ Done: ${tUpdated} transmitters, ${pCreated} positions, ${incomingMessages.length} raw records`);
          return { transmittersUpdated: tUpdated, positionsCreated: pCreated };
      },

      // ─── Danger Zone: Clear Collections ────────────────────────────────────
      clearTable: async (table, onProgress) => {
        const tables = table === 'all'
          ? ['transmitters', 'birds', 'positions', 'argos_positions', 'alerts']
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

      // ─── Firestore Initialization ──────────────────────────────────────────
      initializeFromFirestore: async () => {

        try {
          console.log('[AppStore] Loading data from Firestore...');
          
          const [fsTransmitters, fsBirds, fsAlerts, fsUsers] = await Promise.all([
            loadCollection<Transmitter>('transmitters'),
            loadCollection<Bird>('birds'),
            loadCollection<Alert>('alerts'),
            loadCollection<User>('users'),
          ]);

          // Load only the latest GPS and Doppler position for each transmitter
          const fsPositions = await loadLatestPositionsPerTransmitter(fsTransmitters.map(t => t.platform_id));

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
          if (currentUser) {
            const userProfile = mergedUsers.find(u => u.id === currentUser.uid || u.email === currentUser.email);
            if (userProfile) {
              role = userProfile.role || 'Viewer';
              permissions = userProfile.permissions || ['View Data'];
            } else {
              // check if it's the first user or the super admin
              const isFirstUser = mergedUsers.length === 0 || currentUser.email === 'achlih21@gmail.com';
              if (isFirstUser) {
                role = 'Administrator';
                permissions = ['View Data', 'Live Tracking', 'Generate Reports', 'Manage Alerts', 'Manage Transmitters', 'Upload Data', 'API Integration', 'Manage Database', 'Manage Users', 'System Settings'];
              }
              
              // Automatically register the user in the database so they don't lose access later
              const newUserProfile = {
                id: currentUser.uid,
                name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown User',
                email: currentUser.email || '',
                role: role,
                status: 'active' as const,
                permissions: permissions
              };
              mergedUsers.push(newUserProfile);
              fireAndForget(() => saveDocument('users', currentUser.uid, newUserProfile));
            }

            // GUARANTEE SUPER ADMIN ROLE
            if (currentUser.email === 'achlih21@gmail.com') {
              role = 'Administrator';
              permissions = ['View Data', 'Live Tracking', 'Generate Reports', 'Manage Alerts', 'Manage Transmitters', 'Upload Data', 'API Integration', 'Manage Database', 'Manage Users', 'System Settings'];
              
              // Also update the database document just in case it had Viewer loaded
              if (userProfile && userProfile.role !== 'Administrator') {
                const updatedProfile = { ...userProfile, role, permissions };
                const index = mergedUsers.findIndex(u => u.id === userProfile.id);
                if (index !== -1) mergedUsers[index] = updatedProfile;
                fireAndForget(() => saveDocument('users', currentUser.uid, updatedProfile));
              }
            }
          }

          set({
            transmitters: mergedTransmitters,
            birds: mergedBirds,
            positions: recentPositions,
            alerts: mergedAlerts,
            users: mergedUsers,
            firestoreReady: true,
            currentUserRole: role,
            currentUserPermissions: permissions,
            lastSaved: new Date().toISOString()
          });
          
          // Cleanup old resolved alerts (older than 30 days)
          get().cleanupOldAlerts();

          console.log(`[AppStore] Firestore init complete: ${mergedTransmitters.length} transmitters, ${mergedBirds.length} birds, ${recentPositions.length} positions, role: ${role}`);

          // ── Background: Calculate derived_status for all transmitters ──────
          // This runs asynchronously so the app loads instantly.
          // It checks ALL transmitters and recalculates their derived_status.
          fireAndForget(async () => {
            try {
              console.log('[AppStore] Background: Calculating derived statuses...');
              const currentTransmitters = [...get().transmitters];
              let updated = 0;

              for (const t of currentTransmitters) {
                try {
                  // Fetch all argos_positions for this transmitter
                  const q = query(
                    collection(db, 'argos_positions'),
                    where('platformId', '==', t.platform_id)
                  );
                  const snapshot = await getDocs(q);
                  const allPositions = snapshot.docs.map(d => d.data());
                  const newStatus = evaluateTransmitterStatus(t, allPositions);

                  if (t.derived_status !== newStatus) {
                    // Update in Firestore
                    await saveDocument('transmitters', t.id, { derived_status: newStatus });
                    updated++;
                  }
                } catch (err) {
                  console.warn(`[AppStore] Failed to evaluate status for ${t.platform_id}:`, err);
                }
              }

              if (updated > 0) {
                // Re-load transmitters to pick up the new derived_status values
                const freshTransmitters = await loadCollection<Transmitter>('transmitters');
                set({ transmitters: freshTransmitters });
                console.log(`[AppStore] Background: Updated derived_status for ${updated} transmitters.`);
              } else {
                console.log('[AppStore] Background: All transmitter statuses are up to date.');
              }
            } catch (err) {
              console.error('[AppStore] Background status calc error:', err);
            }
          });

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

          for (const t of currentTransmitters) {
            try {
              let allPositions: any[] = [];
              const qStr = query(
                collection(db, 'argos_positions'),
                where('platformId', '==', String(t.platform_id))
              );
              const snapshotStr = await getDocs(qStr);
              allPositions.push(...snapshotStr.docs.map(d => d.data()));

              if (!isNaN(Number(t.platform_id))) {
                const qNum = query(
                  collection(db, 'argos_positions'),
                  where('platformId', '==', Number(t.platform_id))
                );
                const snapshotNum = await getDocs(qNum);
                allPositions.push(...snapshotNum.docs.map(d => d.data()));
              }

              const newStatus = evaluateTransmitterStatus(t, allPositions);

              if (t.derived_status !== newStatus) {
                await saveDocument('transmitters', t.id, { derived_status: newStatus });
                updated++;
              }
            } catch (err) {
              console.warn(`[AppStore] Failed to evaluate status for ${t.platform_id}:`, err);
            }
          }

          if (updated > 0) {
            const freshTransmitters = await loadCollection<Transmitter>('transmitters');
            set({ transmitters: freshTransmitters });
            onProgress?.(`Updated derived_status for ${updated} transmitters.`);
          } else {
            onProgress?.('All transmitter statuses are up to date.');
          }
        } catch (err) {
          console.error('[AppStore] Background status calc error:', err);
          onProgress?.('Error calculating statuses.');
        }
      },

      // ─── Real-Time Position Listener ────────────────────────────────────────
      subscribeToLivePositions: () => {
        // Only listen for new positions generated from today onwards to avoid huge reads
        return subscribeToRecentPositions(1, (firestorePositions) => {
          // Merge incoming new positions into the store (retaining older ones loaded initially)
          set((state) => {
            const currentPositions = [...state.positions];
            let changed = false;

            firestorePositions.forEach(p => {
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

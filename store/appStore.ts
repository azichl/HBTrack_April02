import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Alert, Bird, Transmitter, KPI, Position, User, ArgosMessage, ArgosDevice } from '../types';
import { 
  saveDocument, deleteDocument, savePositions, 
  loadCollection, subscribeToCollection, 
  syncTransmitters, syncBirds, syncAlerts,
  batchWriteArgosPositions
} from '../services/firestoreService';
import { analyzePositionsForAlerts } from '../services/alertService';
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

  // Settings
  darkMode: boolean;
  toggleDarkMode: () => void;
  simpleMode: boolean;
  toggleSimpleMode: () => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  timeZone: string;
  setTimeZone: (tz: string) => void;
  
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
  
  // Bird Actions
  addBird: (bird: Bird) => void;
  updateBird: (id: string, updates: Partial<Bird>) => void;
  deleteBird: (id: string) => void;
  importBirds: (birds: Bird[]) => void;

  // Transmitter Actions
  addTransmitter: (transmitter: Transmitter) => void;
  updateTransmitter: (id: string, updates: Partial<Transmitter>) => void;
  deleteTransmitter: (id: string) => void;
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
  subscribeToLivePositions: () => () => void;

  // Simulation Actions
  generateLivePositions: () => void;
}

// Helper: fire-and-forget Firestore write (non-blocking)
const fireAndForget = (fn: () => Promise<any>) => {
  fn().catch(err => console.error('[Firestore Sync]', err));
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

      darkMode: false,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      simpleMode: false,
      toggleSimpleMode: () => set((state) => ({ simpleMode: !state.simpleMode })),
      
      notificationsEnabled: true,
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),

      timeZone: 'UTC',
      setTimeZone: (tz) => set({ timeZone: tz }),
      
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

      // ─── Bird CRUD ──────────────────────────────────────────────────────────
      addBird: (bird) => {
        set((state) => ({ birds: [bird, ...state.birds], lastSaved: new Date().toISOString() }));
        fireAndForget(() => saveDocument('birds', bird.id, bird));
      },
      updateBird: (id, updates) => {
        set((state) => {
          const updatedBirds = state.birds.map(b => b.id === id ? { ...b, ...updates } : b);
          const updated = updatedBirds.find(b => b.id === id);
          if (updated) fireAndForget(() => saveDocument('birds', id, updated));
          return { birds: updatedBirds, lastSaved: new Date().toISOString() };
        });
      },
      deleteBird: (id) => {
        set((state) => ({
          birds: state.birds.filter(b => b.id !== id),
          transmitters: state.transmitters.map(t => t.bird_id === id ? { ...t, bird_id: '' } : t),
          lastSaved: new Date().toISOString()
        }));
        fireAndForget(() => deleteDocument('birds', id));
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
          set((state) => ({ 
              transmitters: [transmitter, ...state.transmitters],
              lastSaved: new Date().toISOString()
          }));
          fireAndForget(() => saveDocument('transmitters', transmitter.id, transmitter));
      },
      updateTransmitter: (id, updates) => {
        set((state) => {
          const updated = state.transmitters.map(t => t.id === id ? { ...t, ...updates } : t);
          const t = updated.find(t => t.id === id);
          if (t) fireAndForget(() => saveDocument('transmitters', id, t));
          return { transmitters: updated, lastSaved: new Date().toISOString() };
        });
      },
      deleteTransmitter: (id) => {
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

              let tIndex = newTransmitters.findIndex(t => String(t.platform_id) === pid);
              
              if (tIndex === -1) {
                  newTransmitters.push({
                      id: `trans-${pid}`,
                      platform_id: pid,
                      model: 'Unknown (Auto-detected)',
                      status: 'active',
                      bird_id: '',
                      battery_voltage: undefined,
                      last_fix: msg.timestamp,
                      duty_cycle: 'Unknown',
                      deployed: true
                  });
                  tIndex = newTransmitters.length - 1;
                  tUpdated++;
              }

              if (!isNaN(lat) && !isNaN(lon)) {
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

      // ─── Firestore Initialization ──────────────────────────────────────────
      initializeFromFirestore: async () => {
        try {
          console.log('[AppStore] Loading data from Firestore...');
          
          const [fsTransmitters, fsBirds, fsPositions, fsAlerts, fsUsers] = await Promise.all([
            loadCollection<Transmitter>('transmitters'),
            loadCollection<Bird>('birds'),
            loadCollection<Position>('positions'),
            loadCollection<Alert>('alerts'),
            loadCollection<User>('users'),
          ]);

          // Firestore is the source of truth — use directly
          const mergedTransmitters = fsTransmitters;
          const mergedBirds = fsBirds;
          const mergedAlerts = fsAlerts;
          const mergedUsers = fsUsers;

          // For positions: load last 30 days only for the live map
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const cutoff = thirtyDaysAgo.getTime();
          const recentPositions = fsPositions.filter(p => {
            const t = new Date(p.timestamp).getTime();
            return !isNaN(t) && t >= cutoff;
          });

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
              // First user or admin — check if it's the first user
              if (mergedUsers.length === 0) {
                role = 'Administrator';
                permissions = ['View Data', 'Live Tracking', 'Generate Reports', 'Manage Alerts', 'Manage Transmitters', 'Upload Data', 'API Integration', 'Manage Database', 'Manage Users', 'System Settings'];
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

          console.log(`[AppStore] Firestore init complete: ${mergedTransmitters.length} transmitters, ${mergedBirds.length} birds, ${recentPositions.length} positions, role: ${role}`);
        } catch (error) {
          console.error('[AppStore] Firestore init error:', error);
          set({ firestoreReady: true });
        }
      },

      // ─── Real-Time Position Listener ────────────────────────────────────────
      subscribeToLivePositions: () => {
        return subscribeToCollection<Position>('positions', (firestorePositions) => {
          // Filter to last 30 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const cutoff = thirtyDaysAgo.getTime();
          const positions = firestorePositions.filter(p => {
            const t = new Date(p.timestamp).getTime();
            return !isNaN(t) && t >= cutoff;
          });
          set({ positions });
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
                 hasChanges = true;
                 let baseLat = 24.5, baseLon = 54.5;
                 if (index === 1) { baseLat = 32.0; baseLon = 54.0; }
                 
                 newSimulatedPositions.push({
                    id: `pos-${t.id}-sim`,
                    transmitter_id: t.platform_id,
                    timestamp: new Date().toISOString(),
                    lat: baseLat + (Math.random() * 0.1),
                    lon: baseLon + (Math.random() * 0.1),
                    lc: '3' as const,
                    is_kalman: true,
                    speed_kmh: 0,
                    course: 0,
                    satellite: 'Simulated',
                    locationType: 'GPS' as const
                 });
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

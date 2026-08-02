import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Alert, Bird, Transmitter, KPI, Position, User, ArgosMessage, ArgosDevice, StaticTestPeriod, StatusHistoryRecord } from '../types';
import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
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
  recordStatusTransition, loadStatusHistoryForTransmitter, loadAllStatusHistory
} from '../services/firestoreService';
import { analyzePositionsForAlerts } from '../services/alertService';
import { decodeBatteryVoltage } from '../services/argosService';
import type { Role } from '../types';

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
  markTransmitterDead: (transmitterId: string, user: User) => Promise<void>;
  unmarkTransmitterDead: (transmitterId: string) => Promise<void>;
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
  subscribeToLivePositions: () => () => void;

  // Danger Zone — Collection Clearing
  clearTable: (table: 'transmitters' | 'birds' | 'positions' | 'argos_positions' | 'alerts' | 'user_activity_logs' | 'all', onProgress?: (msg: string) => void) => Promise<void>;

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

const processTransmitterStatusUpdates = async (
  t: Transmitter,
  derived: 'Active' | 'Potential Mortality' | 'Inactive' | 'Static test' | 'Dead',
  isNesting: boolean,
  allPositions: any[],
  addAlert: (alert: Alert) => void,
  getBirds: () => Bird[]
): Promise<Partial<Transmitter>> => {
  const updates: Partial<Transmitter> = {};

  if (t.derived_status !== derived) {
    if (t.derived_status === 'Active' && (derived === 'Potential Mortality' || derived === 'Inactive')) {
      const bird = getBirds().find(b => b.id === t.bird_id);
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
    const bird = getBirds().find(b => b.id === t.bird_id);
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
            const bird = getBirds().find(b => b.id === t.bird_id);

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
    const bird = getBirds().find(b => b.id === t.bird_id);
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

          incomingMessages.forEach(msg => {
              const lat = parseFloat(msg.lat);
              const lon = parseFloat(msg.lon);
              const pid = String(msg.platformId);
              
              // Attempt to decode battery voltage from rawData
              const decodedBattery = msg.rawData ? decodeBatteryVoltage(msg.rawData) : undefined;

              let tIndex = newTransmitters.findIndex(t => String(t.platform_id) === pid);
              
              const parsedMsgTs = safeParseDate(msg.timestamp);
              const msgIsoTimestamp = !isNaN(parsedMsgTs) ? new Date(parsedMsgTs).toISOString() : msg.timestamp;

              if (tIndex === -1) {
                  newTransmitters.push({
                      id: `trans-${pid}`,
                      platform_id: pid,
                      model: 'Unknown (Auto-detected)',
                      status: 'active',
                      bird_id: '',
                      battery_voltage: decodedBattery,
                      last_fix: msgIsoTimestamp,
                      duty_cycle: 'Unknown',
                      deployed: true
                  });
                  tIndex = newTransmitters.length - 1;
                  tUpdated++;
              } else {
                  // Update existing transmitter with new battery if message is as new as current last_fix
                  const t = newTransmitters[tIndex];
                  const parsedLastFix = safeParseDate(t.last_fix);
                  if (decodedBattery !== undefined && (isNaN(parsedLastFix) || parsedMsgTs >= parsedLastFix)) {
                      newTransmitters[tIndex] = {
                          ...t,
                          battery_voltage: decodedBattery
                      };
                      tUpdated++;
                  }
              }

              if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) > 1 && Math.abs(lon) > 1) {
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
                          locationType: msg.locationType as 'GPS' | 'Doppler' || 'Doppler'
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
                  const timestamps = pttPositions
                      .map(p => safeParseDate((p as any).timestamp))
                      .filter(ts => !isNaN(ts));

                  if (timestamps.length > 0) {
                      const maxTs = Math.max(...timestamps);
                      const maxIso = new Date(maxTs).toISOString();
                      newTransmitters[i].last_fix = maxIso;

                      // Biological rules are handled by evaluateTransmitterStatus
                      // We removed the hardcoded >10 days 'inactive' rule here so that biological rules always apply.
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

          // 4.5 Evaluate and update derived_status for ALL transmitters
          // This ensures that all transmitters, even those without new positions, are evaluated correctly (e.g. for pattern dead or inactive rules).
          onProgress?.(`Evaluating status for ${newTransmitters.length} transmitters...`);
          let statusUpdated = false;
          for (let i = 0; i < newTransmitters.length; i++) {
              const t = newTransmitters[i];
              try {
                          // Fetch both argos_positions and positions for this transmitter to calculate accurate barycenters & status
                          const qArgos = query(collection(db, 'argos_positions'), where('platformId', '==', String(t.platform_id)));
                          const snapArgos = await getDocs(qArgos);
                          const argosPositions = snapArgos.docs.map(doc => doc.data());

                          const qPos = query(collection(db, 'positions'), where('transmitter_id', '==', String(t.platform_id)));
                          const snapPos = await getDocs(qPos);
                          const manualPositions = snapPos.docs.map(doc => doc.data());

                          let allPositions = [...argosPositions, ...manualPositions];
                          if (String(t.platform_id) === '242086') {
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
                          
                          // ALWAYS recalculate last_fix from the full Firebase database (argos_positions + positions).
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
                                      t.last_fix = maxIso;
                                      newTransmitters[i].last_fix = maxIso;
                                      await saveDocument('transmitters', t.id, { last_fix: maxIso });
                                      statusUpdated = true;
                                  }
                              }
                          }

                          const { status: derived, isNesting } = evaluateTransmitterStatus({ ...t, last_fix: correctedLastFix }, allPositions);
                          
                          const statusUpdates = await processTransmitterStatusUpdates(
                              { ...t, last_fix: correctedLastFix },
                              derived,
                              isNesting,
                              allPositions,
                              addAlert,
                              () => get().birds
                          );

                          if (Object.keys(statusUpdates).length > 0) {
                              newTransmitters[i] = { ...newTransmitters[i], ...statusUpdates };
                              statusUpdated = true;
                              await saveDocument('transmitters', t.id, statusUpdates);
                          }
                      } catch (err) {
                          console.error(`Error evaluating status for ${t.platform_id}:`, err);
                      }
              }
              if (statusUpdated) {
                  onProgress?.(`Updated derived statuses.`);
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
          
          const [fsTransmitters, fsBirds, fsAlerts, fsUsers, fsStaticPeriods, fsStatusHistory] = await Promise.all([
            loadCollection<Transmitter>('transmitters'),
            loadCollection<Bird>('birds'),
            loadRecentAlerts<Alert>(),
            loadCollection<User>('users'),
            loadCollection<StaticTestPeriod>('static_test_periods'),
            loadAllStatusHistory()
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
            staticTestPeriods: fsStaticPeriods || [],
            statusHistoryRecords: fsStatusHistory || [],
            firestoreReady: true,
            currentUserRole: role,
            currentUserPermissions: permissions,
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
              const oldSnap = await getDocs(oldResolvedQuery);
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
              const pidStr = String(t.platform_id);
              
              const qArgos = query(collection(db, 'argos_positions'), where('platformId', '==', pidStr));
              const snapArgos = await getDocs(qArgos);
              const argosPositions = snapArgos.docs.map(doc => doc.data());

              const qPos = query(collection(db, 'positions'), where('transmitter_id', '==', pidStr));
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
                          await saveDocument('transmitters', t.id, { last_fix: maxIso });
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
                currentTransmitters[i] = { ...currentTransmitters[i], ...statusUpdates };
                await saveDocument('transmitters', t.id, statusUpdates);
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
          console.error('[AppStore] Error in recalculateTransmitterStatuses:', err);
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

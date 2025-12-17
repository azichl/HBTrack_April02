
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Alert, Bird, Transmitter, KPI, Position, User, ArgosMessage, ArgosDevice, ArgosDoppler, ArgosCount } from '../types';
import { MOCK_USERS } from '../constants';

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

  // Data
  transmitters: Transmitter[];
  birds: Bird[];
  alerts: Alert[];
  positions: Position[]; // Live positions shared between Map and Monitoring
  users: User[];
  
  // Argos API Data Buckets
  argosData: ArgosMessage[]; // Messages (Bulk/Realtime)
  argosDevices: ArgosDevice[]; // Device List
  argosDoppler: ArgosDoppler[]; // Doppler Data
  argosCounts: ArgosCount[]; // Statistics

  kpi: KPI;
  
  // Map Selection State
  selectedTransmitterIds: string[]; // Replaces selectedMapBirdId
  setSelectedTransmitterIds: (ids: string[]) => void;
  
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

  // Argos Data Actions
  addArgosData: (data: ArgosMessage[]) => void;
  addArgosDevices: (data: ArgosDevice[]) => void;
  addArgosDoppler: (data: ArgosDoppler[]) => void;
  addArgosCounts: (data: ArgosCount[]) => void;

  clearArgosData: () => void;
  clearArgosDevices: () => void;
  clearArgosDoppler: () => void;
  clearArgosCounts: () => void;

  // Linking Action
  assignTransmitterToBird: (transmitterId: string, birdId: string) => void;
  syncArgosToApp: () => { transmittersUpdated: number, positionsCreated: number };

  // Simulation Actions
  generateLivePositions: () => void;
}

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

      // Initialize with empty arrays to clear experimental data
      transmitters: [],
      birds: [],
      alerts: [],
      positions: [],
      users: MOCK_USERS, // Keep users for login access
      
      // Data Buckets
      argosData: [],
      argosDevices: [],
      argosDoppler: [],
      argosCounts: [],

      kpi: {
        activeTransmitters: 0,
        birdsTracked: 0,
        alerts24h: 0,
        ingestionLatency: '-'
      },
      
      selectedTransmitterIds: [],
      setSelectedTransmitterIds: (ids) => set({ selectedTransmitterIds: ids }),
      
      setSelectedMapBirdId: (id) => {
        if (id === 'all') {
          set({ selectedTransmitterIds: [] });
        } else {
          const t = get().transmitters.find(t => t.bird_id === id);
          set({ selectedTransmitterIds: t ? [t.platform_id] : [] });
        }
      },

      addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts], lastSaved: new Date().toISOString() })),
      resolveAlert: (id) => set((state) => ({
        alerts: state.alerts.map(a => a.id === id ? { ...a, status: 'resolved' } : a),
        lastSaved: new Date().toISOString()
      })),

      // Bird CRUD
      addBird: (bird) => {
        set((state) => ({ birds: [bird, ...state.birds], lastSaved: new Date().toISOString() }));
      },
      updateBird: (id, updates) => {
        set((state) => {
          const updatedBirds = state.birds.map(b => b.id === id ? { ...b, ...updates } : b);
          // Sync logic for position updates if needed
          return {
            birds: updatedBirds,
            lastSaved: new Date().toISOString()
          };
        });
      },
      deleteBird: (id) => {
        set((state) => ({
          birds: state.birds.filter(b => b.id !== id),
          transmitters: state.transmitters.map(t => t.bird_id === id ? { ...t, bird_id: '' } : t),
          lastSaved: new Date().toISOString()
        }));
      },
      importBirds: (newBirds) => {
         set((state) => {
            // Map existing birds by ring_id for quick lookup
            const birdMap = new Map<string, Bird>(state.birds.map(b => [b.ring_id, b] as [string, Bird]));
            
            newBirds.forEach(bird => {
                const existing = birdMap.get(bird.ring_id);
                if (existing) {
                    // Update existing record, keeping internal ID but updating fields
                    birdMap.set(bird.ring_id, { ...existing, ...bird, id: existing.id });
                } else {
                    // Add new record
                    birdMap.set(bird.ring_id, bird);
                }
            });
            
            return {
                birds: Array.from(birdMap.values()),
                lastSaved: new Date().toISOString()
            };
         });
      },

      // Transmitter CRUD
      addTransmitter: (transmitter) => {
          set((state) => ({ 
              transmitters: [transmitter, ...state.transmitters],
              lastSaved: new Date().toISOString()
          }));
      },
      updateTransmitter: (id, updates) => {
        set((state) => ({
          transmitters: state.transmitters.map(t => t.id === id ? { ...t, ...updates } : t),
          lastSaved: new Date().toISOString()
        }));
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
      },
      importTransmitters: (newTransmitters) => {
          set((state) => {
              // Map existing transmitters by platform_id
              const transMap = new Map<string, Transmitter>(state.transmitters.map(t => [t.platform_id, t] as [string, Transmitter]));
              
              newTransmitters.forEach(t => {
                  const existing = transMap.get(t.platform_id);
                  if (existing) {
                      // Update existing record
                      transMap.set(t.platform_id, { ...existing, ...t, id: existing.id });
                  } else {
                      // Add new record
                      transMap.set(t.platform_id, t);
                  }
              });
              
              return {
                  transmitters: Array.from(transMap.values()),
                  lastSaved: new Date().toISOString()
              };
          });
      },

      // User CRUD
      addUser: (user) => set((state) => ({ 
          users: [user, ...state.users],
          lastSaved: new Date().toISOString()
      })),
      updateUser: (id, updates) => set((state) => ({
        users: state.users.map(u => u.id === id ? { ...u, ...updates } : u),
        lastSaved: new Date().toISOString()
      })),
      deleteUser: (id) => set((state) => ({
        users: state.users.filter(u => u.id !== id),
        lastSaved: new Date().toISOString()
      })),

      // Argos Data Actions
      addArgosData: (newData) => {
        set((state) => {
            // Deduplicate based on composite key (platformId + timestamp)
            const existingKeys = new Set(state.argosData.map(d => `${d.platformId}|${d.timestamp}`));
            const uniqueData = newData.filter(d => !existingKeys.has(`${d.platformId}|${d.timestamp}`));

            if (uniqueData.length === 0) return {}; // No state change needed

            return {
                argosData: [...uniqueData, ...state.argosData],
                lastSaved: new Date().toISOString()
            };
        });
        // Auto Sync immediately after adding data
        get().syncArgosToApp();
      },
      addArgosDevices: (data) => {
        set((state) => ({
            argosDevices: [...data, ...state.argosDevices],
            lastSaved: new Date().toISOString()
        }));
        // Auto Sync
        get().syncArgosToApp();
      },
      addArgosDoppler: (newData) => {
        set((state) => {
             // Deduplicate
            const existingKeys = new Set(state.argosDoppler.map(d => `${d.platformId}|${d.timestamp}`));
            const uniqueData = newData.filter(d => !existingKeys.has(`${d.platformId}|${d.timestamp}`));

            if (uniqueData.length === 0) return {};

            return {
                argosDoppler: [...uniqueData, ...state.argosDoppler],
                lastSaved: new Date().toISOString()
            };
        });
      },
      addArgosCounts: (data) => set((state) => ({
        argosCounts: [...data, ...state.argosCounts],
        lastSaved: new Date().toISOString()
      })),

      clearArgosData: () => set((state) => ({ argosData: [], lastSaved: new Date().toISOString() })),
      clearArgosDevices: () => set((state) => ({ argosDevices: [], lastSaved: new Date().toISOString() })),
      clearArgosDoppler: () => set((state) => ({ argosDoppler: [], lastSaved: new Date().toISOString() })),
      clearArgosCounts: () => set((state) => ({ argosCounts: [], lastSaved: new Date().toISOString() })),

      assignTransmitterToBird: (transmitterId, birdId) => {
        set((state) => ({
          transmitters: state.transmitters.map(t => {
              // If we are assigning t to birdId
              if (t.id === transmitterId) return { ...t, bird_id: birdId };
              
              // Ensure uniqueness: If this bird was assigned to another transmitter, clear it
              // (Assuming 1-to-1 relationship for simplicity, though biology allows 1 bird 1 tag usually)
              if (birdId && t.bird_id === birdId && t.id !== transmitterId) return { ...t, bird_id: '' };
              
              // Ensure uniqueness: If this transmitter was assigned to another bird, that's handled by line 1 automatically (overwriting bird_id)
              return t;
          }),
          lastSaved: new Date().toISOString()
        }));
      },

      syncArgosToApp: () => {
          const { argosData, argosDevices, transmitters, positions } = get();
          let newTransmitters = [...transmitters];
          let newPositions = [...positions];
          let tUpdated = 0;
          let pCreated = 0;

          // 1. Sync Devices List (Metadata) -> Transmitters
          argosDevices.forEach(device => {
              const index = newTransmitters.findIndex(t => t.platform_id === device.deviceRef);
              if (index >= 0) {
                  const t = newTransmitters[index];
                  // Update existing metadata
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
                  // Create new from Device List
                  newTransmitters.push({
                      id: `trans-${device.deviceRef}`,
                      platform_id: device.deviceRef,
                      model: device.model || 'Unknown',
                      status: device.active ? 'active' : 'inactive',
                      bird_id: '',
                      battery_voltage: undefined, // Initialize as undefined (will show -- V)
                      last_fix: new Date().toISOString(),
                      duty_cycle: 'Unknown',
                      manufacturer: device.manufacturer,
                      program_region: device.programRef,
                      deployed: device.active
                  });
                  tUpdated++;
              }
          });

          // 2. Sync Messages (Raw Data) -> Positions & Create Transmitters if missing
          // Sort messages by time to ensure Last Fix is accurate
          const sortedMessages = [...argosData].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          sortedMessages.forEach(msg => {
              const lat = parseFloat(msg.lat);
              const lon = parseFloat(msg.lon);

              // 2a. Auto-create Transmitter if data exists but transmitter record doesn't
              // This is crucial for "Argos Data" CSV uploads where we might not have a Device List
              let tIndex = newTransmitters.findIndex(t => t.platform_id === msg.platformId);
              
              if (tIndex === -1) {
                  // Create new Transmitter placeholder
                  newTransmitters.push({
                      id: `trans-${msg.platformId}`,
                      platform_id: msg.platformId,
                      model: 'Unknown (Auto-detected)',
                      status: 'active', // Assume active if sending data
                      bird_id: '',
                      battery_voltage: undefined, // Initialize as undefined
                      last_fix: msg.timestamp,
                      duty_cycle: 'Unknown',
                      deployed: true
                  });
                  tIndex = newTransmitters.length - 1;
                  tUpdated++;
              }

              // 2b. Create Position
              if (!isNaN(lat) && !isNaN(lon)) {
                  // Check if position exists
                  const exists = newPositions.some(p => p.transmitter_id === msg.platformId && p.timestamp === msg.timestamp);
                  if (!exists) {
                      newPositions.push({
                          id: `pos-${msg.id}`,
                          transmitter_id: msg.platformId,
                          bird_id: newTransmitters[tIndex].bird_id, // Link to bird if assigned
                          timestamp: msg.timestamp,
                          lat: lat,
                          lon: lon,
                          lc: msg.lc as any,
                          is_kalman: false,
                          speed_kmh: 0, 
                          course: 0,
                          satellite: msg.satellite,
                          locationType: msg.locationType as 'GPS' | 'Doppler' || 'Doppler'
                      });
                      pCreated++;
                  }
              }

              // 2c. Update Transmitter Last Fix & Status
              if (tIndex >= 0) {
                  const currentLastFix = new Date(newTransmitters[tIndex].last_fix).getTime();
                  const msgTime = new Date(msg.timestamp).getTime();
                  // Update if this message is newer than what we have recorded
                  if (msgTime > currentLastFix) {
                      newTransmitters[tIndex] = {
                          ...newTransmitters[tIndex],
                          last_fix: msg.timestamp, // Set Last Fix to Message Timestamp (Position Date)
                          status: 'active'
                      };
                      tUpdated++;
                  }
              }
          });
          
          if (tUpdated > 0 || pCreated > 0) {
              set({
                  transmitters: newTransmitters,
                  positions: newPositions,
                  lastSaved: new Date().toISOString()
              });
          }

          return { transmittersUpdated: tUpdated, positionsCreated: pCreated };
      },

      generateLivePositions: () => {
         // Simulation Logic
         const { transmitters, positions } = get();
         const activePttIds = transmitters.map(t => t.platform_id);
         
         // Keep existing valid positions
         let currentPositions = positions.filter(p => activePttIds.includes(p.transmitter_id));
         
         let hasChanges = false;
         
         const newPositions = transmitters.map((t, index) => {
             const existing = currentPositions.find(p => p.transmitter_id === t.platform_id);
             
             if (existing) {
                 // Check if it's a simulated one, update it. If real (from API), keep it.
                 if (existing.satellite === 'Simulated') {
                      hasChanges = true;
                      return {
                        ...existing,
                        lat: existing.lat + (Math.random() - 0.5) * 0.01,
                        lon: existing.lon + (Math.random() - 0.5) * 0.01,
                        timestamp: new Date().toISOString(),
                        locationType: 'GPS' as const
                      };
                 }
                 return existing; 
             }

             // Only add simulation if we have NO data for this transmitter
             hasChanges = true;
             let baseLat = 24.5, baseLon = 54.5;
             if (index === 1) { baseLat = 32.0; baseLon = 54.0; }
             
             return {
                id: `pos-${t.id}-sim`,
                transmitter_id: t.platform_id,
                bird_id: t.bird_id,
                timestamp: new Date().toISOString(),
                lat: baseLat + (Math.random() * 0.1),
                lon: baseLon + (Math.random() * 0.1),
                lc: '3' as const,
                is_kalman: true,
                speed_kmh: 0,
                course: 0,
                satellite: 'Simulated',
                locationType: 'GPS' as const
             };
         });
         
         if (hasChanges) {
            set({ positions: newPositions });
         }
      }
    }),
    {
      name: 'houbara-tracker-storage-v5-prod', 
      storage: createJSONStorage(() => localStorage), 
      partialize: (state) => ({ 
        transmitters: state.transmitters,
        birds: state.birds,
        alerts: state.alerts,
        users: state.users,
        positions: state.positions,
        argosData: state.argosData,
        argosDevices: state.argosDevices,
        argosDoppler: state.argosDoppler,
        argosCounts: state.argosCounts,
        darkMode: state.darkMode,
        notificationsEnabled: state.notificationsEnabled,
        simpleMode: state.simpleMode,
        lastSaved: state.lastSaved,
        timeZone: state.timeZone,
        sidebarPinned: state.sidebarPinned // Persist sidebar state
      })
    }
  )
);

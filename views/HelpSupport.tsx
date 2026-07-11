
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, Book, PlayCircle, MessageSquare, Mail, 
  FileText, ExternalLink, ChevronDown, ChevronUp, 
  LifeBuoy, Ticket, Phone, MapPin, Compass, Database, 
  BarChart3, Bell, Settings, Shield, Clock, CheckCircle,
  AlertTriangle, Download, Globe, Layers, Cpu, Satellite,
  Send, Eye, Map, Radio, TrendingUp, Leaf, ThermometerSun,
  ArrowRight, Star, Info, Zap, Users, Lock, Filter,
  Pause, SkipForward, RotateCcw, ChevronLeft, ChevronRight,
  Edit3, Loader2
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { createTicket, updateTicket, subscribeToTickets, type SupportTicket } from '../services/firestoreService';

// ─── ANIMATED VIDEO PLAYER COMPONENT ────────────────────────
const StepVideoPlayer = ({ video, onBack }: { video: typeof VIDEO_TUTORIALS[0]; onBack: () => void }) => {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = intro screen
  const [isPlaying, setIsPlaying] = useState(false);
  const [textReveal, setTextReveal] = useState(0); // characters revealed
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalSteps = video.steps.length;

  const currentText = currentStep >= 0 && currentStep < totalSteps ? video.steps[currentStep] : '';

  // Text reveal animation
  useEffect(() => {
    if (isPlaying && currentStep >= 0 && currentStep < totalSteps) {
      setTextReveal(0);
      const text = video.steps[currentStep];
      let charIdx = 0;
      textIntervalRef.current = setInterval(() => {
        charIdx++;
        setTextReveal(charIdx);
        if (charIdx >= text.length) {
          if (textIntervalRef.current) clearInterval(textIntervalRef.current);
        }
      }, 30);
      return () => { if (textIntervalRef.current) clearInterval(textIntervalRef.current); };
    } else if (!isPlaying && currentStep >= 0) {
      setTextReveal(video.steps[currentStep]?.length || 0);
    }
  }, [currentStep, isPlaying, totalSteps, video.steps]);

  // Auto-advance steps
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev < totalSteps - 1) return prev + 1;
          setIsPlaying(false);
          return prev;
        });
      }, 4000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [isPlaying, totalSteps]);

  const handlePlay = () => {
    if (currentStep === -1 || currentStep >= totalSteps - 1) {
      setCurrentStep(0);
    }
    setIsPlaying(true);
  };

  const handlePause = () => setIsPlaying(false);

  const handleRestart = () => {
    setCurrentStep(-1);
    setIsPlaying(false);
    setTextReveal(0);
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
    else if (currentStep === 0) { setCurrentStep(-1); setIsPlaying(false); }
  };

  const progress = currentStep === -1 ? 0 : ((currentStep + 1) / totalSteps) * 100;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-brand-600 hover:text-brand-700 font-medium mb-6 flex items-center gap-1">
        ← Back to all tutorials
      </button>

      <div className="grid md:grid-cols-5 gap-8">
        {/* Video Player */}
        <div className="md:col-span-3">
          <div className={`relative aspect-video bg-gradient-to-br ${video.color} rounded-2xl overflow-hidden shadow-lg`}>
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-black/20 z-10">
              <div className="h-full bg-white/80 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>

            {/* Category badge */}
            <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white z-10">
              {video.category}
            </div>

            {/* Step counter */}
            {currentStep >= 0 && (
              <div className="absolute top-4 left-4 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white z-10">
                Step {currentStep + 1} / {totalSteps}
              </div>
            )}

            {/* Content area */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-white">
              {currentStep === -1 ? (
                /* Intro Screen */
                <div className="text-center">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
                    <video.icon size={32} />
                  </div>
                  <h4 className="text-xl font-bold mb-2">{video.title}</h4>
                  <p className="text-white/70 text-sm mb-6 max-w-md">{video.description}</p>
                  <button
                    onClick={handlePlay}
                    className="px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full text-sm font-bold flex items-center gap-2 mx-auto transition-colors"
                  >
                    <PlayCircle size={20} /> Play Tutorial
                  </button>
                </div>
              ) : currentStep >= totalSteps ? (
                /* End Screen */
                <div className="text-center">
                  <CheckCircle size={48} className="mx-auto mb-4" />
                  <h4 className="text-xl font-bold mb-2">Tutorial Complete!</h4>
                  <button onClick={handleRestart} className="mt-4 px-5 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full text-sm font-bold flex items-center gap-2 mx-auto transition-colors">
                    <RotateCcw size={16} /> Watch Again
                  </button>
                </div>
              ) : (
                /* Step Content */
                <div className="text-center w-full max-w-lg">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-5 text-2xl font-bold">
                    {currentStep + 1}
                  </div>
                  <p className="text-lg font-semibold leading-relaxed min-h-[3.5rem]">
                    {currentText.substring(0, textReveal)}
                    {textReveal < currentText.length && <span className="animate-pulse">|</span>}
                  </p>
                </div>
              )}
            </div>

            {/* Controls bar */}
            {currentStep >= 0 && (
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/40 to-transparent flex items-center justify-center gap-3 z-10">
                <button onClick={handlePrev} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors" title="Previous">
                  <ChevronLeft size={18} />
                </button>
                {isPlaying ? (
                  <button onClick={handlePause} className="p-2.5 bg-white/30 hover:bg-white/40 rounded-full transition-colors" title="Pause">
                    <Pause size={20} />
                  </button>
                ) : (
                  <button onClick={handlePlay} className="p-2.5 bg-white/30 hover:bg-white/40 rounded-full transition-colors" title="Play">
                    <PlayCircle size={20} />
                  </button>
                )}
                <button onClick={handleNext} disabled={currentStep >= totalSteps - 1} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors disabled:opacity-30" title="Next">
                  <ChevronRight size={18} />
                </button>
                <button onClick={handleRestart} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors" title="Restart">
                  <RotateCcw size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Clock size={14} className="text-gray-400" />
            <span className="text-sm text-gray-500">{video.duration}</span>
          </div>
        </div>

        {/* Step-by-step Breakdown */}
        <div className="md:col-span-2">
          <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-4 flex items-center gap-2">
            <Star size={16} className="text-amber-500" /> Step-by-Step Guide
          </h4>
          <div className="space-y-2">
            {video.steps.map((step, idx) => (
              <button
                key={idx}
                onClick={() => { setCurrentStep(idx); setIsPlaying(false); }}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  idx === currentStep
                    ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-700 shadow-sm'
                    : idx < currentStep
                    ? 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30'
                    : 'bg-gray-50 dark:bg-slate-900 border-gray-100 dark:border-slate-700 hover:border-brand-200'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                  idx === currentStep
                    ? 'bg-brand-600 text-white'
                    : idx < currentStep
                    ? 'bg-green-500 text-white'
                    : 'bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300'
                }`}>
                  {idx < currentStep ? '✓' : idx + 1}
                </div>
                <p className={`text-sm ${
                  idx === currentStep ? 'text-brand-700 dark:text-brand-300 font-semibold' : 'text-gray-700 dark:text-gray-300'
                }`}>{step}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── FAQ DATA ───────────────────────────────────────────────
const FAQS = [
  {
    question: "How do I add a new transmitter?",
    answer: "Go to the Database module, select 'Transmitters', and click the 'Add Transmitter' button. Fill in the required Platform ID, manufacturer details, and configuration settings."
  },
  {
    question: "Why is my bird's location not updating?",
    answer: "Check the transmitter's battery voltage in the Monitoring view. If the battery is healthy (>3.6V), ensure the duty cycle is currently in an 'ON' period. Cloud cover or physical obstructions can also delay satellite uplinks."
  },
  {
    question: "How can I export migration data?",
    answer: "Navigate to the 'Reports' section. Select the 'Migration Tracking' template, configure your date range and specific birds, then click 'Export CSV' or 'Export PDF'."
  },
  {
    question: "What does the 'Geofence Alert' mean?",
    answer: "This alert triggers when a bird crosses a virtual boundary (like a national border) or moves a significant distance (>50km) between two consecutive fixes, indicating potential migration start."
  },
  {
    question: "How do I reset my password?",
    answer: "Go to Settings > Security. You will need your current password to set a new one. If you have lost access entirely, please contact your system administrator."
  },
  {
    question: "How do I use the GEE Satellite Analysis (NDVI, LST, SAVI)?",
    answer: "Navigate to 'Geo Spatial Analysis' in the sidebar. Select the analysis type (NDVI for vegetation, SAVI for desert vegetation, or LST for land surface temperature), choose the region, date range, and cloud cover threshold, then click 'Run Analysis'. The results will be overlaid on the map. You can also toggle these layers on the Live Tracking map."
  },
  {
    question: "What is the difference between NDVI and SAVI?",
    answer: "NDVI (Normalized Difference Vegetation Index) measures general vegetation greenness. SAVI (Soil Adjusted Vegetation Index) is specifically designed for arid and semi-arid environments like the Houbara's desert habitat, as it compensates for the high reflectance of bare soil. SAVI is generally more accurate for sparse vegetation monitoring in desert regions."
  },
  {
    question: "How do the AI Predictions work?",
    answer: "The AI Predictions module uses machine learning models to analyze historical movement patterns, environmental data, and migration corridors. It generates predictions for future movements, seasonal patterns, and habitat usage, helping with conservation planning for the Asian Houbara Bustard."
  },
  {
    question: "How do I set up Real-Time Alerts?",
    answer: "Go to 'Alerts' in the sidebar. You can configure alert rules in the 'Settings' modal. Set thresholds for battery voltage, fix intervals, speed anomalies, and geofence violations. Use the 'Filter' button to view alerts by severity (Critical, Warning, Info) and status (Active, Resolved)."
  },
  {
    question: "Can I track multiple birds simultaneously on the map?",
    answer: "Yes! The Live Tracking map displays all active transmitters by default. You can use the search/filter panel on the left to filter by specific PTT IDs, species, or status. Each bird is marked with a unique icon showing its PTT ID label."
  }
];

// ─── USER GUIDE SECTIONS ────────────────────────────────────
const USER_GUIDE_SECTIONS = [
  {
    id: 'getting-started',
    icon: Zap,
    title: 'Getting Started',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    subsections: [
      {
        title: 'Logging In',
        content: 'Navigate to the HoubaraTracker application URL. Enter your credentials (email and password) provided by your administrator. If you are a first-time user, contact your admin to create an account via the User Management module.'
      },
      {
        title: 'Dashboard Overview',
        content: 'After login, you land on the Dashboard. Here you see a summary of all tracked birds, active transmitters, recent alerts, and key statistics. Use the sidebar navigation to access different modules.'
      },
      {
        title: 'Navigation',
        content: 'The left sidebar contains all modules organized into sections: OVERVIEW (Dashboard, Live Tracking), ANALYSIS (Reports, Geo Spatial Analysis, Alerts), ADVANCED (AI Predictions), and DATABASE (Birds, Transmitters, Data Upload, User Management, Settings). Click any item to navigate.'
      }
    ]
  },
  {
    id: 'live-tracking',
    icon: MapPin,
    title: 'Live Tracking',
    color: 'text-green-600 bg-green-50 border-green-200',
    subsections: [
      {
        title: 'Map Interface',
        content: 'The Live Tracking view displays an interactive Leaflet map with real-time transmitter positions. Each transmitter is shown with a labeled marker displaying its PTT ID. Click any marker to see detailed location info, battery status, and last fix time.'
      },
      {
        title: 'Map Layers',
        content: 'Click the layers button (top-left stack icon) to switch between base maps: Google Maps, Google Satellite, MapTiler Outdoor, OpenStreetMap, and Satellite Imagery. You can also toggle Google Labels overlay and GEE satellite layers (NDVI, SAVI, LST).'
      },
      {
        title: 'Search & Filter',
        content: 'Use the PTT ID search box in the layers panel to quickly find a specific transmitter. The map will automatically center on and highlight the selected bird.'
      },
      {
        title: 'Weather Overlays',
        content: 'Switch between Live Tracking, Weather Map (Windy), and Weather Map 2 (Meteoblue) tabs to view real-time weather data overlaid on your tracking map.'
      }
    ]
  },
  {
    id: 'gee-analysis',
    icon: Satellite,
    title: 'Geo Spatial Analysis (GEE)',
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    subsections: [
      {
        title: 'Running NDVI Analysis',
        content: 'Select "NDVI (Vegetation)" as the observation mode. Choose a region (Central Asia, Middle East, etc.), set a date range, and adjust the cloud cover threshold. Click "Run GEE Analysis" to generate a vegetation index overlay using Google Earth Engine and Sentinel-2 imagery.'
      },
      {
        title: 'Running SAVI Analysis (Desert)',
        content: 'Select "SAVI (Desert)" mode — specifically designed for the Asian Houbara\'s arid habitat. SAVI uses the formula ((NIR - RED) / (NIR + RED + L)) × (1 + L) with L=0.5 to account for bare soil reflectance. This is ideal for monitoring sparse desert vegetation in breeding and wintering grounds.'
      },
      {
        title: 'Running LST Analysis',
        content: 'Select "LST (Temperature)" to generate Land Surface Temperature maps. This helps identify thermal conditions in Houbara habitats, especially important for understanding heat stress and microclimate preferences.'
      },
      {
        title: 'Viewing Results on Live Tracking',
        content: 'After running a GEE analysis, the generated tile layers become available in the Live Tracking map\'s layer menu under "GEE Satellite Layers". Toggle NDVI, SAVI, or LST buttons to overlay the analysis results on your live tracking view.'
      }
    ]
  },
  {
    id: 'alerts',
    icon: Bell,
    title: 'Alerts & Monitoring',
    color: 'text-red-600 bg-red-50 border-red-200',
    subsections: [
      {
        title: 'Real-Time Alerts',
        content: 'The Alerts module monitors all active transmitters and automatically generates alerts for: long gaps between fixes, low battery warnings, excessive speed movements, and geofence violations. Alerts are categorized as Critical, Warning, or Info.'
      },
      {
        title: 'Filter & Settings',
        content: 'Use the "Filter" button to narrow alerts by severity and status (Active/Resolved). Click "Settings" to configure alert thresholds: maximum fix intervals, battery warning levels, and speed anomaly thresholds.'
      },
      {
        title: 'Monitoring Dashboard',
        content: 'The Monitoring view provides a real-time overview of all transmitter health: battery voltage, signal strength, duty cycle status, and last communication timestamps. Color-coded indicators highlight any equipment needing attention.'
      }
    ]
  },
  {
    id: 'ai-predictions',
    icon: Cpu,
    title: 'AI Predictions',
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    subsections: [
      {
        title: 'Migration Corridor Analysis',
        content: 'The AI module displays three known migration corridors for the Asian Houbara Bustard: the Western Corridor (Iran–Pakistan), the Central Corridor (Turkmenistan–Afghanistan), and the Eastern Corridor (Kazakhstan–China). Select individual transmitters to see their predicted movement paths.'
      },
      {
        title: 'Predictive Models',
        content: 'AI-powered analysis provides habitat suitability scoring, seasonal movement predictions, and population trend estimation. Results are displayed in a sidebar panel with detailed analysis text generated from environmental and behavioral data.'
      }
    ]
  },
  {
    id: 'reports',
    icon: BarChart3,
    title: 'Reports',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    subsections: [
      {
        title: 'Generating Reports',
        content: 'Navigate to Reports and choose a template: Transmitter Summary, Migration Tracking, or Battery Health. Configure your date range, select specific birds, and click Generate. Reports can be exported as CSV or PDF.'
      },
      {
        title: 'Scheduled Reports',
        content: 'Set up automated report generation on daily, weekly, or monthly schedules. Reports are generated and stored for download in the Reports archive.'
      }
    ]
  },
  {
    id: 'database',
    icon: Database,
    title: 'Database Management',
    color: 'text-cyan-600 bg-cyan-50 border-cyan-200',
    subsections: [
      {
        title: 'Birds Database',
        content: 'Manage your bird inventory with species, ring numbers, sex, age, and status. Link birds to their active transmitters and view complete tracking histories.'
      },
      {
        title: 'Transmitters Database',
        content: 'Add, edit, and decommission transmitters. Track PTT IDs, manufacturers, models, frequencies, duty cycles, and deployment dates. Each transmitter shows its current battery status and last known position.'
      },
      {
        title: 'Data Upload',
        content: 'Import bulk data via CSV/Excel files. The system validates data format, checks for duplicates, and provides an import preview before committing changes.'
      }
    ]
  },
  {
    id: 'admin',
    icon: Shield,
    title: 'Administration',
    color: 'text-gray-600 bg-gray-50 border-gray-200',
    subsections: [
      {
        title: 'User Management',
        content: 'Administrators can create, edit, and deactivate user accounts. Assign roles (Admin, Manager, Viewer) to control access levels across the application.'
      },
      {
        title: 'Settings',
        content: 'Configure application-wide settings: map defaults, timezone, notification preferences, Argos API credentials, and display options.'
      }
    ]
  }
];

// ─── VIDEO TUTORIALS DATA ───────────────────────────────────
const VIDEO_TUTORIALS = [
  {
    id: 'intro',
    title: 'Introduction to HoubaraTracker',
    description: 'Overview of the application, logging in, dashboard navigation, and understanding the interface layout.',
    duration: '5:30',
    category: 'Getting Started',
    icon: Zap,
    color: 'from-blue-500 to-blue-700',
    steps: [
      'Open the HoubaraTracker URL in your web browser',
      'Enter your credentials and log in',
      'Explore the Dashboard with real-time statistics',
      'Navigate through the sidebar modules',
      'Customize your display preferences in Settings'
    ]
  },
  {
    id: 'live-tracking',
    title: 'Live Tracking & Map Navigation',
    description: 'Learn how to use the interactive map, switch layers, search transmitters, and read location data.',
    duration: '8:15',
    category: 'Core Features',
    icon: Map,
    color: 'from-green-500 to-green-700',
    steps: [
      'Open the Live Tracking view from the sidebar',
      'Pan and zoom the map to navigate',
      'Click a transmitter marker to view its details',
      'Use the layers panel to switch base maps (Satellite, Outdoor, etc.)',
      'Toggle Google Labels and GEE satellite overlays',
      'Search for a specific PTT ID using the search box',
      'View weather overlays via the Weather Map tabs'
    ]
  },
  {
    id: 'gee-analysis',
    title: 'GEE Satellite Analysis (NDVI, SAVI, LST)',
    description: 'Run vegetation, desert soil, and temperature analyses using Google Earth Engine on Sentinel-2 imagery.',
    duration: '10:45',
    category: 'Advanced Analysis',
    icon: Satellite,
    color: 'from-purple-500 to-purple-700',
    steps: [
      'Navigate to "Geo Spatial Analysis" in the sidebar',
      'Select the observation mode: NDVI, SAVI (Desert), or LST',
      'Choose a region from the dropdown (e.g., Central Asia, Middle East)',
      'Set the date range for the analysis period',
      'Adjust the cloud cover threshold slider',
      'Click "Run GEE Analysis" and wait for processing',
      'View the color-coded overlay on the map',
      'Read the generated analysis text below the map',
      'Switch to Live Tracking and toggle the GEE layer to overlay results'
    ]
  },
  {
    id: 'alerts',
    title: 'Configuring Alerts & Monitoring',
    description: 'Set up alert thresholds, filter by severity, and monitor transmitter health in real-time.',
    duration: '6:20',
    category: 'Core Features',
    icon: Bell,
    color: 'from-red-500 to-red-700',
    steps: [
      'Open the "Alerts" module from the sidebar',
      'Click the "Filter" button to filter by severity (Critical, Warning, Info)',
      'Toggle between Active and Resolved alert statuses',
      'Click "Clear Filters" to reset and view all alerts',
      'Click "Settings" to open the threshold configuration modal',
      'Adjust Max Distance Between Fixes, Battery Warning, and Speed thresholds',
      'Save settings — alerts will automatically update based on new thresholds'
    ]
  },
  {
    id: 'ai-predictions',
    title: 'AI-Powered Migration Predictions',
    description: 'Explore migration corridors, select transmitters for focused analysis, and interpret AI predictions.',
    duration: '7:00',
    category: 'Advanced Analysis',
    icon: Cpu,
    color: 'from-indigo-500 to-indigo-700',
    steps: [
      'Navigate to "AI Predictions" in the Advanced section',
      'View the 3 known Asian Houbara migration corridors on the map',
      'Select a specific transmitter from the dropdown',
      'Read the AI-generated analysis in the panel below the map',
      'Review habitat suitability, movement predictions, and conservation insights'
    ]
  },
  {
    id: 'reports',
    title: 'Generating & Exporting Reports',
    description: 'Create transmitter summaries, migration tracking reports, and battery health analyses.',
    duration: '4:50',
    category: 'Core Features',
    icon: BarChart3,
    color: 'from-amber-500 to-amber-700',
    steps: [
      'Open the "Reports" module from the sidebar',
      'Select a report template (Transmitter Summary, Migration, Battery Health)',
      'Set the date range and select specific birds or "All"',
      'Click "Generate" to build the report',
      'Preview the results in tables and charts',
      'Click "Export CSV" or "Export PDF" to download'
    ]
  },
  {
    id: 'database',
    title: 'Managing Birds & Transmitters',
    description: 'Add, edit, and organize your bird inventory and transmitter fleet in the database.',
    duration: '6:10',
    category: 'Database',
    icon: Database,
    color: 'from-cyan-500 to-cyan-700',
    steps: [
      'Navigate to "Birds" or "Transmitters" in the Database section',
      'Click "Add Bird" or "Add Transmitter" to create a new record',
      'Fill in required fields (PTT ID, species, manufacturer, etc.)',
      'Save the record and link birds to their transmitters',
      'Use the search and filter options to find specific records',
      'Click "Edit" to modify existing entries or "Decommission" for retired units'
    ]
  },
  {
    id: 'user-management',
    title: 'User Administration',
    description: 'Create user accounts, assign roles, and manage access permissions.',
    duration: '3:45',
    category: 'Administration',
    icon: Users,
    color: 'from-gray-500 to-gray-700',
    steps: [
      'Go to "User Management" in the Database section (Admin only)',
      'Click "Add User" to create a new account',
      'Enter user details: name, email, and password',
      'Assign a role: Admin (full access), Manager (edit access), or Viewer (read-only)',
      'The user receives credentials to log in immediately',
      'Edit or deactivate users as needed from the user list'
    ]
  }
];

// ─── TICKET DATA (SAMPLE REMOVED - USING FIRESTORE) ──────────

// ─── RESOURCES DATA ─────────────────────────────────────────
const RESOURCES = [
  {
    title: 'HoubaraTracker User Manual (PDF)',
    description: 'Complete user manual covering all features of HoubaraTracker v2.1',
    icon: Book,
    type: 'PDF',
    size: '4.2 MB',
    color: 'text-red-600 bg-red-50',
    url: '/resources/HoubaraTracker_User_Manual_v2.pdf'
  },
  {
    title: 'Argos Satellite System Guide',
    description: 'Technical documentation for the Argos satellite tracking system used by our transmitters',
    icon: Satellite,
    type: 'PDF',
    size: '2.8 MB',
    color: 'text-blue-600 bg-blue-50',
    url: '/resources/Argos_Satellite_System_Guide_v2.pdf'
  },
  {
    title: 'Asian Houbara Field Guide',
    description: 'Species identification, habitat characteristics, and behavioral patterns of Chlamydotis macqueenii',
    icon: Eye,
    type: 'PDF',
    size: '8.5 MB',
    color: 'text-green-600 bg-green-50',
    url: '/resources/Asian_Houbara_Field_Guide_v2.pdf'
  },
  {
    title: 'GEE Analysis Technical Reference',
    description: 'Detailed guide on NDVI, SAVI, and LST calculations using Google Earth Engine & Sentinel-2',
    icon: Layers,
    type: 'PDF',
    size: '1.9 MB',
    color: 'text-purple-600 bg-purple-50',
    url: '/resources/GEE_Analysis_Technical_Reference_v2.pdf'
  },
  {
    title: 'Transmitter Deployment Protocol',
    description: 'Step-by-step field guide for deploying and activating satellite transmitters on Houbara',
    icon: Radio,
    type: 'PDF',
    size: '3.1 MB',
    color: 'text-amber-600 bg-amber-50',
    url: '/resources/Transmitter_Deployment_Protocol_v2.pdf'
  },
  {
    title: 'Migration Corridor Maps (GIS Shapefiles)',
    description: 'GIS shapefiles for the 3 Asian Houbara migration corridors with historical waypoints',
    icon: Globe,
    type: 'ZIP',
    size: '12.4 MB',
    color: 'text-cyan-600 bg-cyan-50',
    url: '/resources/Migration_Corridor_Maps_v2.zip'
  },
  {
    title: 'Conservation Status Report 2024',
    description: 'Annual conservation status report for the Asian Houbara Bustard across breeding and wintering ranges',
    icon: TrendingUp,
    type: 'PDF',
    size: '5.7 MB',
    color: 'text-indigo-600 bg-indigo-50',
    url: '/resources/Conservation_Status_Report_2024_v2.pdf'
  },
  {
    title: 'API Documentation (REST)',
    description: 'REST API documentation for integrating HoubaraTracker data with external systems',
    icon: FileText,
    type: 'HTML',
    size: 'Online',
    color: 'text-gray-600 bg-gray-50',
    url: '/resources/API_Documentation_v2.pdf'
  }
];

// ─── COMPONENT ──────────────────────────────────────────────
export const HelpSupport = () => {
  const { currentUserRole, currentUser } = useAppStore();
  const canManageTickets = currentUserRole === 'Administrator' || currentUserRole === 'Researcher';
  const currentUid = currentUser?.uid || '';
  const currentName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Unknown';
  const currentEmail = currentUser?.email || '';

  const [activeTab, setActiveTab] = useState('faq');
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [expandedGuideSection, setExpandedGuideSection] = useState<string | null>('getting-started');
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'in-progress' | 'resolved'>('all');
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketDescription, setNewTicketDescription] = useState('');
  const [newTicketPriority, setNewTicketPriority] = useState('medium');
  const [allTickets, setAllTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [contactSent, setContactSent] = useState(false);

  // Real-time Firestore subscription for tickets
  useEffect(() => {
    setTicketsLoading(true);
    const unsubscribe = subscribeToTickets((firestoreTickets) => {
      setAllTickets(firestoreTickets);
      setTicketsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Visibility: Admins/Researchers see ALL tickets, others see only their own
  const visibleTickets = canManageTickets
    ? allTickets
    : allTickets.filter(t => t.createdBy === currentUid);

  const handleChangeTicketStatus = async (ticketId: string, newStatus: string) => {
    try {
      await updateTicket(ticketId, {
        status: newStatus as SupportTicket['status'],
        resolvedBy: newStatus === 'resolved' ? currentName : null
      });
    } catch (error) {
      console.error('Failed to update ticket status:', error);
      alert('Failed to update ticket status. Please try again.');
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const filteredFaqs = FAQS.filter(f => 
    f.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTickets = visibleTickets.filter(t => ticketFilter === 'all' || t.status === ticketFilter);

  const handleSubmitTicket = async () => {
    if (!newTicketSubject.trim()) return;
    setTicketSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await createTicket({
        subject: newTicketSubject,
        description: newTicketDescription,
        status: 'open',
        priority: newTicketPriority as SupportTicket['priority'],
        createdBy: currentUid,
        createdByName: currentName,
        createdByEmail: currentEmail,
        created: today,
        lastUpdate: today
      });
      
      // Notify admins and researchers
      const { addAlert } = useAppStore.getState();
      addAlert({
        id: `AL-TK-${Date.now()}`,
        type: 'ticket_created',
        severity: 'info',
        message: `New support ticket: "${newTicketSubject}" by ${currentName}`,
        timestamp: new Date().toISOString(),
        status: 'active'
      });

      setNewTicketSubject('');
      setNewTicketDescription('');
      setNewTicketPriority('medium');
      setShowNewTicketForm(false);
    } catch (error) {
      console.error('Failed to create ticket:', error);
      alert('Failed to submit ticket. Please try again.');
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleSendContact = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSent(true);
    setContactForm({ name: '', email: '', subject: '', message: '' });
    setTimeout(() => setContactSent(false), 4000);
  };

  const selectedVideoData = VIDEO_TUTORIALS.find(v => v.id === selectedVideo);
  const _noop = selectedVideoData; // suppress lint – used only in conditional rendering below

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Help & Support</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Get help with HoubaraTracker and submit support requests</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2 border rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors ${
              activeTab === 'guide' 
                ? 'bg-brand-600 text-white border-brand-600' 
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200'
            }`}
          >
            <Book size={16} /> User Guide
          </button>
          <button 
            onClick={() => setActiveTab('videos')}
            className={`px-4 py-2 border rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors ${
              activeTab === 'videos' 
                ? 'bg-brand-600 text-white border-brand-600' 
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200'
            }`}
          >
            <PlayCircle size={16} /> Video Tutorials
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-full overflow-x-auto">
        {[
          { id: 'faq', label: 'FAQ', icon: LifeBuoy },
          { id: 'guide', label: 'User Guide', icon: Book },
          { id: 'videos', label: 'Video Tutorials', icon: PlayCircle },
          { id: 'contact', label: 'Contact Us', icon: MessageSquare },
          { id: 'tickets', label: 'My Tickets', icon: Ticket },
          { id: 'resources', label: 'Resources', icon: FileText }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-white dark:bg-slate-600 text-brand-700 dark:text-white shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <tab.icon size={15} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden min-h-[500px]">
        
        {/* ═══ FAQ TAB ═══ */}
        {activeTab === 'faq' && (
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <LifeBuoy className="text-brand-500" size={20} /> Frequently Asked Questions
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Find answers to common questions about HoubaraTracker</p>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search FAQ..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              />
            </div>

            <div className="space-y-3">
              {filteredFaqs.map((faq, index) => (
                <div key={index} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <button 
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                  >
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm pr-4">{faq.question}</span>
                    {openFaqIndex === index ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                  </button>
                  {openFaqIndex === index && (
                    <div className="p-4 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-200 dark:border-slate-700 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
              {filteredFaqs.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No results found for "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ USER GUIDE TAB ═══ */}
        {activeTab === 'guide' && (
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Book className="text-brand-500" size={20} /> HoubaraTracker User Guide
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Complete documentation for all features and modules — version 2.1</p>
            </div>

            {/* Table of Contents */}
            <div className="mb-8 p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Table of Contents</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {USER_GUIDE_SECTIONS.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setExpandedGuideSection(expandedGuideSection === section.id ? null : section.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition-colors border ${
                      expandedGuideSection === section.id
                        ? section.color
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <section.icon size={14} />
                    {section.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Guide Sections */}
            <div className="space-y-4">
              {USER_GUIDE_SECTIONS.map(section => (
                <div key={section.id} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedGuideSection(expandedGuideSection === section.id ? null : section.id)}
                    className={`w-full flex items-center justify-between p-4 transition-colors text-left ${
                      expandedGuideSection === section.id 
                        ? 'bg-brand-50 dark:bg-brand-900/20' 
                        : 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${section.color.split(' ').slice(1).join(' ')}`}>
                        <section.icon size={18} className={section.color.split(' ')[0]} />
                      </div>
                      <span className="font-bold text-gray-800 dark:text-gray-200">{section.title}</span>
                    </div>
                    {expandedGuideSection === section.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>
                  {expandedGuideSection === section.id && (
                    <div className="border-t border-gray-200 dark:border-slate-700">
                      {section.subsections.map((sub, idx) => (
                        <div key={idx} className="p-5 border-b last:border-b-0 border-gray-100 dark:border-slate-700/50">
                          <h5 className="font-bold text-sm text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <ArrowRight size={14} className="text-brand-500" />
                            {sub.title}
                          </h5>
                          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-6">
                            {sub.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ VIDEO TUTORIALS TAB ═══ */}
        {activeTab === 'videos' && (
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PlayCircle className="text-brand-500" size={20} /> Video Tutorials
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Step-by-step walkthroughs for every feature of HoubaraTracker</p>
            </div>

            {selectedVideo && selectedVideoData ? (
              <StepVideoPlayer video={selectedVideoData} onBack={() => setSelectedVideo(null)} />
            ) : (
              /* Video Grid */
              <div className="grid md:grid-cols-2 gap-4">
                {VIDEO_TUTORIALS.map(video => (
                  <button
                    key={video.id}
                    onClick={() => setSelectedVideo(video.id)}
                    className="group text-left p-4 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-600 hover:shadow-md transition-all bg-white dark:bg-slate-800"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${video.color} text-white shadow-md flex-shrink-0`}>
                        <video.icon size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-brand-600 transition-colors">
                          {video.title}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {video.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                            {video.category}
                          </span>
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Clock size={10} /> {video.duration}
                          </span>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-gray-300 group-hover:text-brand-500 transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ CONTACT TAB ═══ */}
        {activeTab === 'contact' && (
          <div className="p-6 md:p-8">
             <div className="grid md:grid-cols-2 gap-12">
                <div className="space-y-6">
                   <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Get in Touch</h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">We are here to help. Send us a message and we will respond as soon as possible.</p>
                   </div>
                   
                   <div className="space-y-4">
                      <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                         <div className="p-2 bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200 rounded-lg">
                            <Mail size={20} />
                         </div>
                         <div>
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">Email Support</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">support@houbaratracker.com</p>
                            <p className="text-xs text-gray-400 mt-1">Response time: &lt; 24 hours</p>
                         </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
                         <div className="p-2 bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-200 rounded-lg">
                            <Phone size={20} />
                         </div>
                         <div>
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">Technical Hotline</h4>
                            <a href="tel:+97433035210" className="text-sm text-green-700 dark:text-green-300 font-semibold mt-0.5 hover:underline block">+974 3303 5210</a>
                            <p className="text-xs text-gray-400 mt-1">Sun-Thu, 8am - 5pm (Qatar Time, GMT+3)</p>
                         </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
                         <div className="p-2 bg-purple-100 dark:bg-purple-800 text-purple-600 dark:text-purple-200 rounded-lg">
                            <Globe size={20} />
                         </div>
                         <div>
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">Application URL</h4>
                            <a href="https://trackapp-v2.web.app" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 dark:text-purple-300 hover:underline mt-0.5 block">
                              https://trackapp-v2.web.app
                            </a>
                            <p className="text-xs text-gray-400 mt-1">Available 24/7</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-900 p-6 rounded-xl border border-gray-200 dark:border-slate-700">
                   <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-4">Send us a message</h4>
                   {contactSent && (
                     <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                       <CheckCircle size={16} /> Message sent successfully! We'll get back to you soon.
                     </div>
                   )}
                   <form onSubmit={handleSendContact} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Name</label>
                            <input 
                              type="text" 
                              value={contactForm.name}
                              onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" 
                            />
                         </div>
                         <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Email</label>
                            <input 
                              type="email" 
                              value={contactForm.email}
                              onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" 
                            />
                         </div>
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Subject</label>
                          <input 
                            type="text" 
                            value={contactForm.subject}
                            onChange={(e) => setContactForm({...contactForm, subject: e.target.value})}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" 
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Message</label>
                          <textarea 
                            value={contactForm.message}
                            onChange={(e) => setContactForm({...contactForm, message: e.target.value})}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 h-32 resize-none" 
                          />
                      </div>
                      <button 
                        type="submit"
                        className="w-full py-2.5 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 transition-colors shadow-md flex items-center justify-center gap-2"
                      >
                         <Send size={16} /> Send Message
                      </button>
                   </form>
                </div>
             </div>
          </div>
        )}

        {/* ═══ TICKETS TAB ═══ */}
        {activeTab === 'tickets' && (
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Ticket className="text-brand-500" size={20} /> {canManageTickets ? 'All Support Tickets' : 'My Support Tickets'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {canManageTickets 
                    ? 'View and manage all support tickets from users' 
                    : 'Track the status of your support requests'}
                </p>
              </div>
              <div className="flex gap-2">
                <div className="flex bg-gray-100 dark:bg-slate-700 p-1 rounded-lg">
                  {(['all', 'open', 'in-progress', 'resolved'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => setTicketFilter(status)}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-colors capitalize ${
                        ticketFilter === status 
                          ? 'bg-white dark:bg-slate-600 text-brand-700 dark:text-white shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {status === 'in-progress' ? 'In Progress' : status}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setShowNewTicketForm(!showNewTicketForm)}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  + New Ticket
                </button>
              </div>
            </div>

            {/* New Ticket Form */}
            {showNewTicketForm && (
              <div className="mb-6 p-5 bg-brand-50 dark:bg-brand-900/20 rounded-xl border border-brand-200 dark:border-brand-800">
                <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-4">Submit New Ticket</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Subject</label>
                      <input 
                        type="text" 
                        value={newTicketSubject}
                        onChange={(e) => setNewTicketSubject(e.target.value)}
                        placeholder="Brief description of the issue..."
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Priority</label>
                      <select 
                        value={newTicketPriority}
                        onChange={(e) => setNewTicketPriority(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Description</label>
                    <textarea 
                      value={newTicketDescription}
                      onChange={(e) => setNewTicketDescription(e.target.value)}
                      placeholder="Provide detailed information about the issue..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 h-24 resize-none" 
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={() => setShowNewTicketForm(false)}
                      className="px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSubmitTicket}
                      disabled={ticketSubmitting}
                      className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700 transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {ticketSubmitting ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : 'Submit Ticket'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tickets List */}
            {ticketsLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-brand-500 mb-3" />
                <p className="text-sm text-gray-500">Loading tickets...</p>
              </div>
            ) : (
            <div className="space-y-3">
              {filteredTickets.map(ticket => (
                <div key={ticket.id} className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl hover:border-brand-200 dark:hover:border-brand-700 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[11px] font-mono text-gray-400">{ticket.id.substring(0, 12)}...</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          ticket.status === 'open' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                          ticket.status === 'in-progress' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        }`}>
                          {ticket.status === 'in-progress' ? 'In Progress' : ticket.status}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          ticket.priority === 'high' ? 'bg-red-100 text-red-700' :
                          ticket.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {ticket.priority}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">{ticket.subject}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{ticket.description}</p>
                      {/* Show creator info for admins/researchers */}
                      {canManageTickets && ticket.createdByName && (
                        <p className="text-[11px] text-brand-600 dark:text-brand-400 mt-1.5 flex items-center gap-1">
                          <Users size={11} /> Submitted by: <span className="font-semibold">{ticket.createdByName}</span>
                          {ticket.createdByEmail && <span className="text-gray-400">({ticket.createdByEmail})</span>}
                        </p>
                      )}
                      {/* Show resolved by info */}
                      {ticket.status === 'resolved' && ticket.resolvedBy && (
                        <p className="text-[11px] text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                          <CheckCircle size={11} /> Resolved by: <span className="font-semibold">{ticket.resolvedBy}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                      <p className="text-[10px] text-gray-400">Created</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">{ticket.created}</p>
                      <p className="text-[10px] text-gray-400 mt-1">Last update</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">{ticket.lastUpdate}</p>
                      {canManageTickets && (
                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
                          <label className="block text-[10px] text-gray-400 mb-1">Change Status</label>
                          <select
                            value={ticket.status}
                            onChange={(e) => handleChangeTicketStatus(ticket.id, e.target.value)}
                            className="w-full px-2 py-1 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-md text-[11px] font-bold outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                          >
                            <option value="open">Open</option>
                            <option value="in-progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredTickets.length === 0 && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Ticket size={32} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No tickets found</p>
                  <p className="text-sm mt-1">
                    {ticketFilter !== 'all' ? `No ${ticketFilter} tickets. Try changing the filter.` : "Click 'New Ticket' to submit a support request."}
                  </p>
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {/* ═══ RESOURCES TAB ═══ */}
        {activeTab === 'resources' && (
          <div className="p-6 md:p-8">
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="text-brand-500" size={20} /> Resource Library
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Download manuals, field guides, technical documentation, and GIS data</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {RESOURCES.map((resource, idx) => (
                <a 
                  key={idx} 
                  href={resource.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-brand-200 dark:hover:border-brand-700 hover:shadow-md transition-all bg-white dark:bg-slate-800 cursor-pointer no-underline"
                >
                  <div className={`p-3 rounded-xl ${resource.color} flex-shrink-0`}>
                    <resource.icon size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-brand-600 transition-colors">
                      {resource.title}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{resource.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                        {resource.type}
                      </span>
                      <span className="text-[10px] text-gray-400">{resource.size}</span>
                    </div>
                  </div>
                  <Download size={16} className="text-gray-300 group-hover:text-brand-500 transition-colors flex-shrink-0 mt-1" />
                </a>
              ))}
            </div>

            {/* Quick Links */}
            <div className="mt-8 p-5 bg-gradient-to-r from-brand-50 to-blue-50 dark:from-brand-900/20 dark:to-blue-900/20 rounded-xl border border-brand-200 dark:border-brand-800">
              <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-2">
                <ExternalLink size={16} className="text-brand-500" /> Quick Links
              </h4>
              <div className="grid md:grid-cols-3 gap-3">
                <a href="https://environmental-monitoring.groupcls.com/home/env" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600 hover:border-brand-300 transition-colors">
                  <Globe size={14} /> CLS Environmental
                </a>
                <a href="https://argos-system.cls.fr/argos-cwi2/login.html" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600 hover:border-brand-300 transition-colors">
                  <Satellite size={14} /> Argos Portal
                </a>
                <a href="https://earthengine.google.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-sm text-gray-700 dark:text-gray-300 hover:text-brand-600 hover:border-brand-300 transition-colors">
                  <Layers size={14} /> Google Earth Engine
                </a>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

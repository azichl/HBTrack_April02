
import React, { useState, useEffect } from 'react';
import { RealTimeAlerts } from './RealTimeAlerts';
import { GeofenceAlerts } from './GeofenceAlerts';
import { useAppStore } from '../store/appStore';

export const Alerts = () => {
  const { activeTab } = useAppStore();
  const [currentView, setCurrentView] = useState<'realtime' | 'geofence'>('realtime');

  // Sync local state with global navigation
  useEffect(() => {
    if (activeTab === 'Geofence Alerts') {
      setCurrentView('geofence');
    } else if (activeTab === 'Real-Time Alerts') {
      setCurrentView('realtime');
    }
    // If 'Alerts', keep default or last state
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center mb-6">
        <div className="bg-gray-100 p-1 rounded-lg inline-flex shadow-inner">
          <button
            onClick={() => setCurrentView('realtime')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${
              currentView === 'realtime'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
            }`}
          >
            Real-Time Alerts
          </button>
          <button
            onClick={() => setCurrentView('geofence')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${
              currentView === 'geofence'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
            }`}
          >
            Geofence Alerts
          </button>
        </div>
      </div>

      <div className="animate-in fade-in duration-300">
        {currentView === 'realtime' ? <RealTimeAlerts /> : <GeofenceAlerts />}
      </div>
    </div>
  );
};

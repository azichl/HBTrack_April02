
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { 
  User, Bell, Moon, Globe, Shield, Save, RotateCcw, 
  Mail, Smartphone, Monitor, Lock, Check, Languages, CheckCircle2, Loader2 
} from 'lucide-react';
import { getAuth, updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { saveDocument } from '../services/firestoreService';

export const Settings = () => {
  const { 
    darkMode, toggleDarkMode, 
    notificationsEnabled, setNotificationsEnabled,
    timeZone, setTimeZone,
    simpleMode, toggleSimpleMode
  } = useAppStore();

  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const firebaseUser = getAuth().currentUser;

  // Local state for form fields
  const [profile, setProfile] = useState({
    fullName: firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || '',
    email: firebaseUser?.email || '',
    language: 'English'
  });

  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactor: true
  });

  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false,
    weeklyDigest: true
  });

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Not authenticated');

      // Update Firebase Auth display name
      if (profile.fullName && profile.fullName !== user.displayName) {
        await updateProfile(user, { displayName: profile.fullName });
      }

      // Save profile to Firestore
      await saveDocument('users', user.uid, {
        name: profile.fullName,
        email: user.email,
        language: profile.language,
        timeZone,
        notificationsEnabled,
        darkMode,
        simpleMode,
        notifications,
        updatedAt: new Date().toISOString()
      });

      // Handle password change if filled
      if (security.newPassword && security.currentPassword) {
        if (security.newPassword !== security.confirmPassword) {
          throw new Error('New passwords do not match');
        }
        if (security.newPassword.length < 6) {
          throw new Error('New password must be at least 6 characters');
        }
        // Re-authenticate before password change
        const credential = EmailAuthProvider.credential(user.email!, security.currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, security.newPassword);
        setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '', twoFactor: security.twoFactor });
      }

      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: any) {
      setSaveMessage(`Error: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'preferences', label: 'Preferences', icon: Monitor },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account preferences and system settings</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors">
            <RotateCcw size={16} /> Reset to Default
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 flex items-center gap-2 shadow-sm transition-colors disabled:opacity-70"
          >
            {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Save size={16} />}
            Save Changes
          </button>
        </div>
        {saveMessage && (
          <div className={`text-sm font-medium px-4 py-2 rounded-lg ${saveMessage.startsWith('Error') ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'}`}>
            {saveMessage}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto pb-1 md:pb-0 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                isActive 
                  ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        
        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="p-6 md:p-8 space-y-8">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <User className="text-brand-500" size={20} /> Profile Information
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update your personal information and account details</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
                <input 
                  type="text" 
                  value={profile.fullName}
                  onChange={e => setProfile({...profile, fullName: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Email Address</label>
                <input 
                  type="email" 
                  value={profile.email}
                  onChange={e => setProfile({...profile, email: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Timezone</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select 
                    value={timeZone}
                    onChange={e => setTimeZone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 appearance-none transition-shadow cursor-pointer"
                  >
                     <option value="UTC">UTC (Coordinated Universal Time)</option>
                     <option value="Asia/Qatar">Asia/Qatar (GMT+3)</option>
                     <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                     <option value="Asia/Almaty">Asia/Almaty (GMT+5)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Language</label>
                <div className="relative">
                  <Languages className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select 
                    value={profile.language}
                    onChange={e => setProfile({...profile, language: e.target.value})}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 appearance-none transition-shadow cursor-pointer"
                  >
                     <option value="English">English</option>
                     <option value="Arabic">Arabic</option>
                     <option value="French">French</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Role</label>
              <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-sm font-medium border border-brand-100 dark:border-brand-800">
                Administrator
              </div>
              <p className="text-xs text-gray-500 mt-1">Contact system support to change your role.</p>
            </div>
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
           <div className="p-6 md:p-8 space-y-8">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Bell className="text-brand-500" size={20} /> Notification Preferences
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose how you want to be notified about important alerts</p>
              </div>

              <div className="space-y-4">
                 <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-4">
                       <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                          <Bell size={20} />
                       </div>
                       <div>
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">System Notifications</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">In-app alerts for critical events</p>
                       </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={notificationsEnabled} onChange={() => setNotificationsEnabled(!notificationsEnabled)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                    </label>
                 </div>

                 <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-4">
                       <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                          <Mail size={20} />
                       </div>
                       <div>
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">Email Reports</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Receive weekly summaries via email</p>
                       </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={notifications.email} onChange={() => setNotifications({...notifications, email: !notifications.email})} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                    </label>
                 </div>

                 <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-4">
                       <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                          <Smartphone size={20} />
                       </div>
                       <div>
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">SMS Alerts</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Immediate text messages for Geofence breaches</p>
                       </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={notifications.sms} onChange={() => setNotifications({...notifications, sms: !notifications.sms})} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                    </label>
                 </div>
              </div>
           </div>
        )}

        {/* PREFERENCES TAB */}
        {activeTab === 'preferences' && (
           <div className="p-6 md:p-8 space-y-8">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Monitor className="text-brand-500" size={20} /> System Preferences
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Customize your interface and experience</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <button 
                  onClick={() => !darkMode && toggleDarkMode()}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    darkMode 
                      ? 'border-brand-500 bg-brand-50 dark:bg-slate-700 ring-1 ring-brand-500' 
                      : 'border-gray-200 dark:border-slate-700 hover:border-brand-300'
                  }`}
                >
                   <div className="flex items-center justify-between mb-2">
                      <div className="p-2 bg-gray-900 text-white rounded-lg"><Moon size={20} /></div>
                      {darkMode && <CheckCircle2 size={20} className="text-brand-600 dark:text-brand-400" />}
                   </div>
                   <h4 className="font-bold text-gray-900 dark:text-white text-sm">Dark Mode</h4>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Easy on the eyes, suitable for low-light environments.</p>
                </button>

                <button 
                   onClick={() => darkMode && toggleDarkMode()}
                   className={`p-4 rounded-xl border text-left transition-all ${
                    !darkMode 
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' 
                      : 'border-gray-200 dark:border-slate-700 dark:hover:border-slate-500'
                  }`}
                >
                   <div className="flex items-center justify-between mb-2">
                      <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Monitor size={20} /></div>
                      {!darkMode && <CheckCircle2 size={20} className="text-brand-600" />}
                   </div>
                   <h4 className="font-bold text-gray-900 dark:text-white text-sm">Light Mode</h4>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Standard display, ideal for bright environments.</p>
                </button>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                     <div>
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">Simple UI Mode</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Hide advanced features like AI Analysis and GIS Tools</p>
                     </div>
                     <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={simpleMode} onChange={toggleSimpleMode} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                    </label>
                  </div>
              </div>
           </div>
        )}

        {/* SECURITY TAB */}
        {activeTab === 'security' && (
           <div className="p-6 md:p-8 space-y-8">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Shield className="text-brand-500" size={20} /> Security Settings
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Protect your account and data</p>
              </div>

              <div className="max-w-md space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Current Password</label>
                    <div className="relative">
                       <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                       <input 
                         type="password" 
                         className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
                         placeholder="••••••••"
                       />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">New Password</label>
                    <div className="relative">
                       <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                       <input 
                         type="password" 
                         className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
                         placeholder="••••••••"
                       />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Confirm New Password</label>
                    <div className="relative">
                       <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                       <input 
                         type="password" 
                         className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
                         placeholder="••••••••"
                       />
                    </div>
                  </div>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-slate-700">
                 <div className="flex items-center justify-between">
                    <div>
                       <h4 className="font-bold text-gray-900 dark:text-white text-sm">Two-Factor Authentication</h4>
                       <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add an extra layer of security to your account</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={security.twoFactor} onChange={() => setSecurity({...security, twoFactor: !security.twoFactor})} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 dark:peer-focus:ring-brand-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                    </label>
                 </div>
              </div>
           </div>
        )}

      </div>
    </div>
  );
};


import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Users, UserPlus, Shield, CheckCircle2, User, Key, X, Search, Mail, Filter, Database, Lock, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { User as UserType, Role } from '../types';
import { listUsers, createUser, updateUserProfile, deleteUserAccount, AppUser } from '../services/authService';
import { clearAllUserActivityLogs } from '../services/activityLogger';
import { getAuth } from 'firebase/auth';
import { CustomSelect } from '../components/CustomSelect';

const SYSTEM_PERMISSIONS = [
  'View Data',
  'Live Tracking', 
  'Generate Reports', 
  'Manage Alerts',
  'Manage Transmitters', 
  'Upload Data',
  'API Integration',
  'Manage Database',
  'Manage Users',
  'System Settings'
];

const ROLE_DEFAULTS: Record<Role, string[]> = {
  'Administrator': SYSTEM_PERMISSIONS, // All permissions including API Integration
  'Researcher': ['View Data', 'Generate Reports', 'Live Tracking', 'Manage Alerts', 'Manage Database'],
  'Field Coordinator': ['Live Tracking', 'Manage Transmitters', 'Upload Data'],
  'Data Entry': ['View Data', 'Upload Data', 'Manage Database'],
  'Viewer': ['View Data'],
};

const RoleBadge = ({ role }: { role: Role }) => {
  switch (role) {
    case 'Administrator':
      return <span className="px-3 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">Administrator</span>;
    case 'Researcher':
      return <span className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">Researcher</span>;
    case 'Field Coordinator':
      return <span className="px-3 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">Field Coordinator</span>;
    case 'Data Entry':
      return <span className="px-3 py-1 text-xs font-medium bg-teal-100 text-teal-800 rounded-full">Data Entry</span>;
    case 'Viewer':
      return <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Viewer</span>;
    default:
      return <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{role}</span>;
  }
};

export const UserManagement = () => {
  const { users, addUser, updateUser, deleteUser: deleteUserFromStore } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All Roles');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  const handleClearActivityLogs = async () => {
    if (!window.confirm("Are you sure you want to clear ALL user activity logs from Firebase ('user_activity_logs')? This action cannot be undone.")) {
      return;
    }

    setIsClearingLogs(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const deletedCount = await clearAllUserActivityLogs();
      setSuccessMsg(`Successfully cleared ${deletedCount} user activity log records from Firebase!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Failed to clear user activity logs:', err);
      setError(err.message || 'Failed to clear activity logs from Firebase.');
    } finally {
      setIsClearingLogs(false);
    }
  };

  // Load users from Firebase Auth on mount
  useEffect(() => {
    loadFirebaseUsers();
  }, []);

  const loadFirebaseUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const firebaseUsers = await listUsers();
      // Sync to local store
      firebaseUsers.forEach((u: AppUser) => {
        const existing = users.find(eu => eu.id === u.id);
        if (!existing) {
          addUser({
            id: u.id,
            name: u.name,
            email: u.email,
            role: mapFirebaseRole(u.role) as Role,
            status: u.status === 'active' ? 'active' : 'inactive',
            permissions: mapPermissions(u.role),
            lastLogin: u.lastActive || undefined
          });
        } else {
          updateUser(u.id, {
            name: u.name,
            email: u.email,
            role: mapFirebaseRole(u.role) as Role,
            status: u.status === 'active' ? 'active' : 'inactive',
            lastLogin: u.lastActive || undefined
          });
        }
      });
    } catch (err: any) {
      console.error('Failed to load users from Firebase:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  // Map Cloud Function roles to app roles
  const mapFirebaseRole = (role: string): Role => {
    const map: Record<string, Role> = {
      'admin': 'Administrator',
      'researcher': 'Researcher',
      'field_operator': 'Field Coordinator',
      'data_entry': 'Data Entry',
      'viewer': 'Viewer'
    };
    return map[role] || role as Role;
  };

  const mapRoleToFirebase = (role: Role): string => {
    const map: Record<Role, string> = {
      'Administrator': 'admin',
      'Researcher': 'researcher',
      'Field Coordinator': 'field_operator',
      'Data Entry': 'data_entry',
      'Viewer': 'viewer'
    };
    return map[role] || 'viewer';
  };

  const mapPermissions = (role: string): string[] => {
    const r = mapFirebaseRole(role);
    return ROLE_DEFAULTS[r] || ROLE_DEFAULTS['Viewer'];
  };

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'active').length;
  const adminUsers = users.filter(u => u.role === 'Administrator').length;
  const dataUsers = users.filter(u => u.role === 'Researcher' || u.role === 'Data Entry').length;

  // Filtered Users
  const filteredUsers = users.filter(u => 
    (u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (roleFilter === 'All Roles' || u.role === roleFilter)
  );

  // Form State
  const [formData, setFormData] = useState<Partial<UserType>>({
    name: '',
    email: '',
    role: 'Viewer',
    status: 'active',
    permissions: ROLE_DEFAULTS['Viewer']
  });

  const handleOpenModal = (user?: UserType) => {
    setError(null);
    setPassword('');
    if (user) {
      setEditingUser(user);
      setFormData(user);
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        role: 'Viewer',
        status: 'active',
        permissions: ROLE_DEFAULTS['Viewer']
      });
    }
    setIsModalOpen(true);
  };

  const handleRoleChange = (role: Role) => {
    setFormData({
      ...formData,
      role,
      permissions: ROLE_DEFAULTS[role]
    });
  };

  const togglePermission = (perm: string) => {
    const currentPerms = formData.permissions || [];
    let newPerms;
    if (currentPerms.includes(perm)) {
      newPerms = currentPerms.filter(p => p !== perm);
    } else {
      newPerms = [...currentPerms, perm];
    }
    setFormData({ ...formData, permissions: newPerms });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    
    try {
      if (editingUser) {
        // Update existing user via Cloud Function
        await updateUserProfile(editingUser.id, {
          role: mapRoleToFirebase(formData.role as Role),
          status: formData.status,
          name: formData.name,
        });
        updateUser(editingUser.id, formData);
      } else {
        // Create new user via Cloud Function
        if (!password || password.length < 6) {
          setError('Password must be at least 6 characters');
          setIsSaving(false);
          return;
        }
        const result = await createUser(
          formData.email!,
          password,
          formData.name!,
          mapRoleToFirebase(formData.role as Role)
        );
        addUser({
          id: result.id,
          name: formData.name!,
          email: formData.email!,
          role: formData.role as Role,
          status: 'active',
          permissions: formData.permissions || ROLE_DEFAULTS['Viewer'],
          lastLogin: undefined
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const currentUid = getAuth().currentUser?.uid;
    if (id === currentUid) {
      setError('Cannot delete your own account');
      return;
    }
    if (window.confirm('Are you sure you want to delete this user? This will also remove their Firebase Auth account.')) {
      try {
        await deleteUserAccount(id);
        deleteUserFromStore(id);
      } catch (err: any) {
        setError(err.message || 'Delete failed');
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}
      {/* Success Banner */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-sm animate-fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage user accounts, roles, and granular permissions</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button 
            onClick={handleClearActivityLogs}
            disabled={isClearingLogs}
            className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            title="Clear all user activity logs in Firebase ('user_activity_logs')"
          >
            {isClearingLogs ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
            <span>{isClearingLogs ? 'Clearing Logs...' : 'Clear Activity Logs'}</span>
          </button>

          <button 
            onClick={() => handleOpenModal()}
            className="px-6 py-2.5 bg-brand-700 text-white rounded-lg text-sm font-semibold hover:bg-brand-800 flex items-center gap-2 shadow-sm transition-colors"
          >
            <UserPlus size={18} /> Add User
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 font-medium">Total Users</h3>
            <Users className="text-gray-400" size={20} />
          </div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">{totalUsers}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Registered accounts</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 font-medium">Active Users</h3>
            <Users className="text-green-500" size={20} />
          </div>
          <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-1">{activeUsers}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Currently active</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 font-medium">Administrators</h3>
            <Shield className="text-purple-500" size={20} />
          </div>
          <div className="text-4xl font-bold text-purple-600 dark:text-purple-400 mb-1">{adminUsers}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Full access</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-gray-500 dark:text-gray-400 font-medium">Data Staff</h3>
            <Database className="text-teal-500" size={20} />
          </div>
          <div className="text-4xl font-bold text-teal-600 dark:text-teal-400 mb-1">{dataUsers}</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Research & Data Entry</p>
        </div>
      </div>

      {/* User Accounts Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">User Accounts</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage all user accounts and their permissions</p>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1 bg-gray-100 dark:bg-slate-900 rounded-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent pl-10 pr-4 py-2.5 text-sm outline-none text-gray-900 dark:text-white"
            />
          </div>
          <div className="relative w-48">
             <CustomSelect 
                value={roleFilter}
                onChange={(val) => setRoleFilter(val)}
                className="w-full"
                buttonClassName="px-4 py-2.5 bg-gray-100 dark:bg-slate-900"
                options={[
                  { value: 'All Roles', label: 'All Roles' },
                  { value: 'Administrator', label: 'Administrator' },
                  { value: 'Researcher', label: 'Researcher' },
                  { value: 'Field Coordinator', label: 'Field Coordinator' },
                  { value: 'Data Entry', label: 'Data Entry' },
                  { value: 'Viewer', label: 'Viewer' }
                ]}
             />
          </div>
        </div>

        {filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700">
                  <th className="pb-3 text-sm font-semibold text-gray-900 dark:text-white">User</th>
                  <th className="pb-3 text-sm font-semibold text-gray-900 dark:text-white">Role</th>
                  <th className="pb-3 text-sm font-semibold text-gray-900 dark:text-white">Status</th>
                  <th className="pb-3 text-sm font-semibold text-gray-900 dark:text-white">Last Login</th>
                  <th className="pb-3 text-sm font-semibold text-gray-900 dark:text-white">Active Permissions</th>
                  <th className="pb-3 text-sm font-semibold text-gray-900 dark:text-white text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="group">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.status === 'active' 
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {user.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 text-sm text-gray-500 dark:text-gray-400">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                         {user.permissions?.length === SYSTEM_PERMISSIONS.length ? (
                            <span className="text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded border border-purple-100 dark:border-purple-800">
                               Full System Access
                            </span>
                         ) : (
                             <>
                                {user.permissions?.slice(0, 2).map((perm, idx) => (
                                    <span key={idx} className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-600">
                                    {perm}
                                    </span>
                                ))}
                                {(user.permissions?.length || 0) > 2 && (
                                    <span className="text-[10px] text-gray-400 px-1 self-center">
                                    +{user.permissions!.length - 2} more
                                    </span>
                                )}
                             </>
                         )}
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenModal(user)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors" title="Edit Access">
                          <Key size={16} />
                        </button>
                        <button onClick={() => handleDelete(user.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Delete User">
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
              <Users size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No users found</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Add your first user to get started</p>
            <button 
              onClick={() => handleOpenModal()}
              className="text-brand-600 dark:text-brand-400 font-medium text-sm hover:underline"
            >
              Add User
            </button>
          </div>
        )}
      </div>

      {/* Role Permissions Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <div className="mb-6 flex items-start gap-3">
           <Shield className="mt-1" size={24} />
           <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Role Defaults</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Default permissions assigned to each role (Customizable per user)</p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {/* Administrator */}
           <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                 <h4 className="font-bold text-gray-900 dark:text-white">Administrator</h4>
                 <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-800 rounded-full">Admin</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Full system access including API Integration, user management, and security.</p>
              <div className="flex flex-wrap gap-1">
                 <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-[10px] rounded">All Permissions</span>
              </div>
           </div>

           {/* Researcher */}
           <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                 <h4 className="font-bold text-gray-900 dark:text-white">Researcher</h4>
                 <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 rounded-full">Research</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Access to data analysis, reporting, and tracking features.</p>
              <div className="flex flex-wrap gap-1">
                 {ROLE_DEFAULTS['Researcher'].slice(0,4).map((p,i) => <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-[10px] rounded">{p}</span>)}
                 <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-[10px] rounded">+1 more</span>
              </div>
           </div>

           {/* Field Coordinator */}
           <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                 <h4 className="font-bold text-gray-900 dark:text-white">Field Coordinator</h4>
                 <span className="px-2 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-800 rounded-full">Field</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Manage deployments, transmitters, and manual field data uploads.</p>
              <div className="flex flex-wrap gap-1">
                 {ROLE_DEFAULTS['Field Coordinator'].map((p,i) => <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-[10px] rounded">{p}</span>)}
              </div>
           </div>

           {/* Data Entry */}
           <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                 <h4 className="font-bold text-gray-900 dark:text-white">Data Entry</h4>
                 <span className="px-2 py-0.5 text-[10px] font-medium bg-teal-100 text-teal-800 rounded-full">Data</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Dedicated role for manual data import (CSV/Excel). API Access restricted.</p>
              <div className="flex flex-wrap gap-1">
                 {ROLE_DEFAULTS['Data Entry'].map((p,i) => <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-[10px] rounded">{p}</span>)}
              </div>
           </div>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users size={20} className="text-brand-600" />
                {editingUser ? 'Edit User Access' : 'Create New User'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 flex-1">
              <form id="userForm" onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                    <input 
                      type="text" required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                    <input 
                      type="email" required
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="john@houbaratracker.com"
                    />
                  </div>
                </div>

                {/* Password (only for new users) */}
                {!editingUser && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                    <input 
                      type="password" required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="Minimum 6 characters"
                      minLength={6}
                    />
                  </div>
                )}

                {/* Modal Error */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-xs">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Role Selection */}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Role Assignment</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(['Administrator', 'Researcher', 'Field Coordinator', 'Data Entry', 'Viewer'] as Role[]).map(role => (
                      <label 
                        key={role}
                        className={`cursor-pointer relative flex flex-col p-3 rounded-lg border transition-all ${
                          formData.role === role 
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-sm ring-1 ring-brand-500' 
                            : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-500'
                        }`}
                      >
                        <input 
                          type="radio" 
                          name="role" 
                          value={role}
                          checked={formData.role === role}
                          onChange={() => handleRoleChange(role)}
                          className="sr-only" 
                        />
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold ${formData.role === role ? 'text-brand-700 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>{role}</span>
                          {formData.role === role && <CheckCircle2 size={14} className="text-brand-500" />}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Granular Permissions */}
                <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700">
                   <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                         <Lock size={14} className="text-gray-500" />
                         Custom Permissions
                      </h4>
                      <span className="text-[10px] text-gray-500 uppercase font-medium">
                         {formData.permissions?.length || 0} Selected
                      </span>
                   </div>
                   
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {SYSTEM_PERMISSIONS.map(perm => {
                         const isSelected = formData.permissions?.includes(perm);
                         return (
                            <label key={perm} className="flex items-center gap-2 cursor-pointer select-none">
                               <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-brand-600 border-brand-600' : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600'}`}>
                                  {isSelected && <CheckCircle2 size={12} className="text-white" />}
                                  <input 
                                    type="checkbox" 
                                    className="hidden" 
                                    checked={isSelected}
                                    onChange={() => togglePermission(perm)}
                                  />
                               </div>
                               <span className={`text-xs ${isSelected ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-gray-400'}`}>{perm}</span>
                            </label>
                         );
                      })}
                   </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-gray-100 dark:border-slate-700 mt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${formData.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <input 
                        type="checkbox" 
                        className="sr-only"
                        checked={formData.status === 'active'}
                        onChange={(e) => setFormData({...formData, status: e.target.checked ? 'active' : 'inactive'})}
                      />
                      <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${formData.status === 'active' ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Account Active</span>
                  </label>
                </div>
              </form>
            </div>

            <div className="p-6 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700 shrink-0 flex justify-end gap-3">
               <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
               <button type="submit" form="userForm" disabled={isSaving} className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors shadow-sm disabled:opacity-70 flex items-center gap-2">
                  {isSaving && <Loader2 size={16} className="animate-spin" />}
                  {isSaving ? 'Saving...' : 'Save User'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

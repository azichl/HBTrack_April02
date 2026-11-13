import { describe, it, expect } from 'vitest';

describe('User Management Custom Permissions', () => {
  const SYSTEM_PERMISSIONS = [
    'View Data',
    'Live Tracking',
    'Generate Reports',
    'Manage Alerts',
    'Manage Transmitters',
    'Upload Data',
    'API Integration',
    'Manage Database',
    'User Management',
    'System Settings'
  ];

  const normalizePermissions = (raw: any): string[] => {
    let list: string[] = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === 'object') {
      list = Object.keys(raw).filter(k => raw[k]);
    }
    return list.map(p => (p === 'Manage Users' ? 'User Management' : p));
  };

  const isUserManagementPermission = (perm: string) =>
    perm === 'User Management' || perm === 'Manage Users';

  const togglePermission = (
    currentPerms: string[],
    perm: string,
    currentUserRole: string
  ): string[] => {
    // Only Manager can toggle User Management
    if (isUserManagementPermission(perm) && currentUserRole !== 'Manager') {
      return currentPerms;
    }

    const normalized = normalizePermissions(currentPerms);
    const isUM = isUserManagementPermission(perm);
    const isSelected = isUM
      ? normalized.some(p => isUserManagementPermission(p))
      : normalized.includes(perm);

    if (isSelected) {
      return normalized.filter(p => (isUM ? !isUserManagementPermission(p) : p !== perm));
    } else {
      return [...normalized, isUM ? 'User Management' : perm];
    }
  };

  const canAccessUserManagement = (currentUserRole: string, userPermissions: string[]): boolean => {
    if (currentUserRole === 'Manager') return true;
    const perms = normalizePermissions(userPermissions);
    return perms.includes('User Management');
  };

  it('normalizes legacy "Manage Users" to "User Management"', () => {
    const legacy = ['View Data', 'Manage Users'];
    const normalized = normalizePermissions(legacy);
    expect(normalized).toContain('User Management');
    expect(normalized).not.toContain('Manage Users');
  });

  it('allows Manager to remove User Management from an Administrator', () => {
    const adminPerms = [...SYSTEM_PERMISSIONS];
    expect(adminPerms).toContain('User Management');

    // Manager toggles (removes) User Management
    const updated = togglePermission(adminPerms, 'User Management', 'Manager');
    expect(updated).not.toContain('User Management');
    expect(updated.length).toBe(SYSTEM_PERMISSIONS.length - 1);
  });

  it('allows Manager to grant User Management to a user', () => {
    const userPerms = ['View Data', 'Live Tracking'];

    // Manager toggles (adds) User Management
    const updated = togglePermission(userPerms, 'User Management', 'Manager');
    expect(updated).toContain('User Management');
  });

  it('prevents non-Manager (e.g. Administrator) from modifying User Management permission', () => {
    const adminPerms = [...SYSTEM_PERMISSIONS];

    // Administrator attempts to remove User Management -> blocked
    const unchanged = togglePermission(adminPerms, 'User Management', 'Administrator');
    expect(unchanged).toEqual(adminPerms);

    const viewerPerms = ['View Data'];
    // Administrator attempts to grant User Management -> blocked
    const unchangedViewer = togglePermission(viewerPerms, 'User Management', 'Administrator');
    expect(unchangedViewer).toEqual(viewerPerms);
  });

  it('restricts Sidebar / View access when User Management permission is removed from an Administrator', () => {
    // Manager always has access
    expect(canAccessUserManagement('Manager', [])).toBe(true);

    // Administrator with User Management has access
    expect(canAccessUserManagement('Administrator', ['User Management'])).toBe(true);
    expect(canAccessUserManagement('Administrator', ['Manage Users'])).toBe(true);

    // Administrator whose User Management permission was removed does NOT have access
    const permsWithoutUM = SYSTEM_PERMISSIONS.filter(p => p !== 'User Management');
    expect(canAccessUserManagement('Administrator', permsWithoutUM)).toBe(false);

    // Standard viewer does not have access
    expect(canAccessUserManagement('Viewer', ['View Data'])).toBe(false);
  });
});

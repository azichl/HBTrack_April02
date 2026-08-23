import { getAuth } from 'firebase/auth';

const FUNCTIONS_BASE_URL = 'https://us-central1-trackapp-v2.cloudfunctions.net';

/** Get the current user's ID token for authenticating Cloud Function calls */
async function getIdToken(): Promise<string> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

/** Generic authenticated fetch wrapper for Cloud Functions */
async function callFunction(
  endpoint: string, 
  method: string, 
  body?: any
): Promise<any> {
  const token = await getIdToken();
  
  const res = await fetch(`${FUNCTIONS_BASE_URL}/${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ─── User Management API ──────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  role: string;
  status: string;
  lastActive: string;
  createdAt: string;
  emailVerified?: boolean;
  permissions: Record<string, boolean>;
  appAccess?: ('web' | 'ios' | 'ios_data_upload')[];
  iosDataUpload?: boolean;
  iosPttVisibility?: 'all' | 'custom';
  iosVisiblePtts?: string[];
}

/** Resolve a username/pseudonym, phone number, or email to the target login email */
export async function resolveIdentifierToEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (!trimmed) throw new Error('Username, email, or phone number is required.');

  const res = await fetch(`${FUNCTIONS_BASE_URL}/resolveAuthEmail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: trimmed })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.error || 'No account found matching this username, email, or phone number.');
  }

  const data = await res.json();
  if (data && data.email) {
    return data.email;
  }
  throw new Error('Could not resolve account email.');
}

/** List all application users (Firebase Auth + Firestore profiles) */
export async function listUsers(): Promise<AppUser[]> {
  const data = await callFunction('listAppUsers', 'GET');
  return data.users || [];
}

/** Create a new application user */
export async function createUser(
  email: string, 
  password: string, 
  displayName: string, 
  role: string,
  username?: string,
  phone?: string,
  appAccess?: ('web' | 'ios' | 'ios_data_upload')[],
  iosDataUpload?: boolean,
  iosPttVisibility?: 'all' | 'custom',
  iosVisiblePtts?: string[]
): Promise<AppUser> {
  return callFunction('createAppUser', 'POST', { 
    email, 
    password, 
    displayName, 
    role, 
    username, 
    phone,
    appAccess,
    iosDataUpload,
    iosPttVisibility,
    iosVisiblePtts
  });
}

/** Update an existing user's profile */
export async function updateUserProfile(
  uid: string, 
  updates: { 
    role?: string; 
    status?: string; 
    name?: string; 
    username?: string;
    phone?: string;
    permissions?: Record<string, boolean>;
    appAccess?: ('web' | 'ios' | 'ios_data_upload')[];
    iosDataUpload?: boolean;
    iosPttVisibility?: 'all' | 'custom';
    iosVisiblePtts?: string[];
  }
): Promise<void> {
  await callFunction('updateAppUser', 'PUT', { uid, ...updates });
}

/** Delete a user */
export async function deleteUserAccount(uid: string): Promise<void> {
  await callFunction('deleteAppUser', 'DELETE', { uid });
}

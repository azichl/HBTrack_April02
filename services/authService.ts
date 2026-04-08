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
  role: string;
  status: string;
  lastActive: string;
  createdAt: string;
  emailVerified?: boolean;
  permissions: Record<string, boolean>;
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
  role: string
): Promise<AppUser> {
  return callFunction('createAppUser', 'POST', { email, password, displayName, role });
}

/** Update an existing user's profile */
export async function updateUserProfile(
  uid: string, 
  updates: { role?: string; status?: string; name?: string; permissions?: Record<string, boolean> }
): Promise<void> {
  await callFunction('updateAppUser', 'PUT', { uid, ...updates });
}

/** Delete a user */
export async function deleteUserAccount(uid: string): Promise<void> {
  await callFunction('deleteAppUser', 'DELETE', { uid });
}

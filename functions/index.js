const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialize Admin SDK
admin.initializeApp();
const db = admin.firestore();

// ─── Existing: Argos API Proxy ────────────────────────────────────────────────

exports.proxyArgosApi = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  try {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
      return res.status(400).send("Missing 'url' query parameter");
    }

    const headers = {};
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    if (req.headers.accept) headers.accept = req.headers.accept;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.rawBody
    });

    const responseBody = await response.text();
    const responseContentType = response.headers.get('content-type');
    if (responseContentType) {
      res.setHeader('Content-Type', responseContentType);
    }

    res.status(response.status).send(responseBody);
  } catch (error) {
    console.error("Firebase Proxy Error:", error);
    res.status(500).send(`Firebase Proxy Error: ${error.message}`);
  }
});

// ─── Helper: Verify caller is authenticated ──────────────────────────────────

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  try {
    const token = authHeader.split("Bearer ")[1];
    return await admin.auth().verifyIdToken(token);
  } catch {
    return null;
  }
}

// ─── User Management Functions ────────────────────────────────────────────────

/**
 * Create a new Firebase Auth user + Firestore profile document
 * POST body: { email, password, displayName, role }
 */
exports.createAppUser = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { email, password, displayName, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email.split("@")[0],
    });

    // Create Firestore profile document
    const userDoc = {
      id: userRecord.uid,
      name: displayName || email.split("@")[0],
      email: email,
      role: role || "viewer",
      status: "active",
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      permissions: getDefaultPermissions(role || "viewer"),
    };

    await db.collection("users").doc(userRecord.uid).set(userDoc);

    res.status(201).json({
      uid: userRecord.uid,
      ...userDoc,
    });
  } catch (error) {
    console.error("createAppUser error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List all Firebase Auth users with their Firestore profiles
 * GET
 */
exports.listAppUsers = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    // List Auth users
    const listResult = await admin.auth().listUsers(100);
    
    // Load Firestore profiles for metadata
    const profilesSnap = await db.collection("users").get();
    const profiles = {};
    profilesSnap.forEach((doc) => {
      profiles[doc.id] = doc.data();
    });

    const users = listResult.users.map((u) => ({
      id: u.uid,
      name: u.displayName || profiles[u.uid]?.name || u.email.split("@")[0],
      email: u.email,
      role: profiles[u.uid]?.role || "viewer",
      status: u.disabled ? "inactive" : (profiles[u.uid]?.status || "active"),
      lastActive: profiles[u.uid]?.lastActive || u.metadata.lastSignInTime || "",
      createdAt: profiles[u.uid]?.createdAt || u.metadata.creationTime || "",
      emailVerified: u.emailVerified,
      permissions: profiles[u.uid]?.permissions || getDefaultPermissions("viewer"),
    }));

    res.json({ users });
  } catch (error) {
    console.error("listAppUsers error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update a user's role/status in Firestore
 * PUT body: { uid, role?, status?, name? }
 */
exports.updateAppUser = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "PUT") return res.status(405).send("Method not allowed");

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { uid, role, status, name, permissions } = req.body;
    if (!uid) return res.status(400).json({ error: "uid is required" });

    const updates = {};
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;
    if (name !== undefined) updates.name = name;
    if (permissions !== undefined) updates.permissions = permissions;

    // Update Firestore doc
    await db.collection("users").doc(uid).set(updates, { merge: true });

    // If disabling/enabling, also update Firebase Auth
    if (status === "inactive") {
      await admin.auth().updateUser(uid, { disabled: true });
    } else if (status === "active") {
      await admin.auth().updateUser(uid, { disabled: false });
    }

    // Update display name if provided
    if (name) {
      await admin.auth().updateUser(uid, { displayName: name });
    }

    res.json({ success: true, uid, ...updates });
  } catch (error) {
    console.error("updateAppUser error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete a Firebase Auth user + Firestore profile
 * DELETE body: { uid }
 */
exports.deleteAppUser = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "DELETE") return res.status(405).send("Method not allowed");

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "uid is required" });

    // Prevent self-deletion
    if (uid === caller.uid) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Delete from Firebase Auth
    await admin.auth().deleteUser(uid);

    // Delete Firestore profile
    await db.collection("users").doc(uid).delete();

    res.json({ success: true, uid });
  } catch (error) {
    console.error("deleteAppUser error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Helper: Default permissions per role ─────────────────────────────────────

function getDefaultPermissions(role) {
  switch (role) {
    case "admin":
      return {
        viewTracking: true, editBirds: true, manageUsers: true,
        uploadData: true, configureAlerts: true, exportData: true,
        configureGeofences: true, deleteRecords: true,
      };
    case "researcher":
      return {
        viewTracking: true, editBirds: true, manageUsers: false,
        uploadData: true, configureAlerts: true, exportData: true,
        configureGeofences: false, deleteRecords: false,
      };
    case "field_operator":
      return {
        viewTracking: true, editBirds: false, manageUsers: false,
        uploadData: true, configureAlerts: false, exportData: true,
        configureGeofences: false, deleteRecords: false,
      };
    default: // viewer
      return {
        viewTracking: true, editBirds: false, manageUsers: false,
        uploadData: false, configureAlerts: false, exportData: false,
        configureGeofences: false, deleteRecords: false,
      };
  }
}

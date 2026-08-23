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
 * Resolve identifier (email, username/pseudonym, or phone) to user's registered email
 * POST body: { identifier }
 */
exports.resolveAuthEmail = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const { identifier } = req.body || {};
    if (!identifier || typeof identifier !== "string") {
      return res.status(400).json({ error: "identifier is required" });
    }

    const clean = identifier.trim();
    if (!clean) {
      return res.status(400).json({ error: "identifier cannot be empty" });
    }

    const cleanLower = clean.toLowerCase();
    const cleanPhone = clean.replace(/[\s\-\(\)]/g, "");

    // 1. Search Firestore profiles collection
    const usersSnap = await db.collection("users").get();
    let foundEmail = null;

    usersSnap.forEach((doc) => {
      if (foundEmail) return;
      const data = doc.data();
      const uEmail = (data.email || "").toLowerCase().trim();
      const uUsername = (data.username || "").toLowerCase().trim();
      const uPhone = (data.phone || "").replace(/[\s\-\(\)]/g, "").trim();

      // Match explicit username, email, or phone
      if (uEmail === cleanLower || uUsername === cleanLower || (cleanPhone && uPhone && uPhone === cleanPhone)) {
        foundEmail = data.email;
        return;
      }

      // Fallback: Match email prefix (e.g. 'john' for 'john@domain.com') if user has no explicit username or if it matches
      if (uEmail && uEmail.includes("@")) {
        const emailPrefix = uEmail.split("@")[0].toLowerCase().trim();
        if (emailPrefix === cleanLower) {
          foundEmail = data.email;
        }
      }
    });

    if (foundEmail) {
      return res.json({ email: foundEmail });
    }

    // 2. If clean identifier is formatted as an email, try direct Firebase Auth lookup
    if (clean.includes("@")) {
      try {
        const userRecord = await admin.auth().getUserByEmail(clean);
        if (userRecord && userRecord.email) {
          return res.json({ email: userRecord.email });
        }
      } catch (authErr) {
        // Not found in Auth
      }
      return res.json({ email: clean });
    }

    // 3. Try Firebase Auth lookup by phone number
    if (cleanPhone) {
      try {
        const phoneArg = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
        const userRecord = await admin.auth().getUserByPhoneNumber(phoneArg);
        if (userRecord && userRecord.email) {
          return res.json({ email: userRecord.email });
        }
      } catch (authErr) {
        // Not found in Auth
      }
    }

    return res.status(404).json({ error: "No account found matching this username, email, or phone number." });
  } catch (error) {
    console.error("resolveAuthEmail error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a new Firebase Auth user + Firestore profile document
 * POST body: { email, password, displayName, role, username, phone }
 */
exports.createAppUser = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { email, password, displayName, role, username, phone } = req.body;

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
      username: username ? username.trim() : "",
      phone: phone ? phone.trim() : "",
      role: role || "viewer",
      status: "active",
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      permissions: getDefaultPermissions(role || "viewer"),
      appAccess: ["web", "ios"], // Default to both
      iosPttVisibility: "all",
      iosVisiblePtts: [],
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
      username: profiles[u.uid]?.username || (u.email ? u.email.split("@")[0] : ""),
      phone: profiles[u.uid]?.phone || u.phoneNumber || "",
      role: profiles[u.uid]?.role || "viewer",
      status: u.disabled ? "inactive" : (profiles[u.uid]?.status || "active"),
      lastActive: profiles[u.uid]?.lastActive || u.metadata.lastSignInTime || "",
      createdAt: profiles[u.uid]?.createdAt || u.metadata.creationTime || "",
      emailVerified: u.emailVerified,
      permissions: profiles[u.uid]?.permissions || getDefaultPermissions("viewer"),
      appAccess: profiles[u.uid]?.appAccess || ["web", "ios"],
      iosPttVisibility: profiles[u.uid]?.iosPttVisibility || "all",
      iosVisiblePtts: profiles[u.uid]?.iosVisiblePtts || [],
    }));

    res.json({ users });
  } catch (error) {
    console.error("listAppUsers error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update a user's role/status in Firestore
 * PUT body: { uid, role?, status?, name?, username?, phone? }
 */
exports.updateAppUser = onRequest({ cors: true, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "PUT") return res.status(405).send("Method not allowed");

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { uid, role, status, name, username, phone, permissions, appAccess, iosPttVisibility, iosVisiblePtts } = req.body;
    if (!uid) return res.status(400).json({ error: "uid is required" });

    const updates = {};
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;
    if (name !== undefined) updates.name = name;
    if (username !== undefined) updates.username = username;
    if (phone !== undefined) updates.phone = phone;
    if (permissions !== undefined) updates.permissions = permissions;
    if (appAccess !== undefined) updates.appAccess = appAccess;
    if (iosPttVisibility !== undefined) updates.iosPttVisibility = iosPttVisibility;
    if (iosVisiblePtts !== undefined) updates.iosVisiblePtts = iosVisiblePtts;

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

// ─── Google Earth Engine Geospatial Cloud Function ──────────────────────────

const ee = require('@google/earthengine');

const initEarthEngine = (privateKey) => {
  return new Promise((resolve, reject) => {
    try {
      ee.data.authenticateViaPrivateKey(
        privateKey,
        () => {
          ee.initialize(
            null,
            null,
            () => resolve(),
            (err) => reject(new Error(`GEE Initialization error: ${err}`))
          );
        },
        (err) => reject(new Error(`GEE Authentication error: ${err}`))
      );
    } catch (e) {
      reject(e);
    }
  });
};

const maskS2Clouds = (image) => {
  const qa = image.select('QA60');
  const cloudBitMask = 1 << 10;
  const cirrusBitMask = 1 << 11;
  const mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
               qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
};

exports.getGEETileUrl = onRequest({ cors: true, maxInstances: 5, timeoutSeconds: 120 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { startDate, endDate, type, bbox } = req.body;

    if (!startDate || !endDate || !type || !bbox || bbox.length !== 4) {
      return res.status(400).json({ error: "missing_parameters", message: "startDate, endDate, type, and bbox [minLon, minLat, maxLon, maxLat] are required." });
    }

    // Load GEE key from Firestore
    const keyDoc = await db.collection("keys").doc("gee").get();
    if (!keyDoc.exists) {
      return res.status(400).json({ error: "missing_gee_key", message: "Google Earth Engine service account key is not configured. Please paste your service account JSON key in the Settings page." });
    }

    const privateKey = keyDoc.data();
    
    // Initialize GEE
    await initEarthEngine(privateKey);

    const roi = ee.Geometry.Rectangle(bbox);
    let image;
    let visParams;

    if (type === 'ndvi') {
      const s2Col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .map(maskS2Clouds);

      const s2Composite = s2Col.median();
      image = s2Composite.normalizedDifference(['B8', 'B4']).rename('NDVI');
      visParams = {
        min: 0.0,
        max: 0.6,
        palette: [
          '#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901',
          '#66A200', '#228B22', '#012E01'
        ]
      };
    } else if (type === 'savi') {
      const s2Col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .map(maskS2Clouds);

      const s2Composite = s2Col.median();
      // SAVI Formula: ((NIR - RED) / (NIR + RED + L)) * (1 + L)
      image = s2Composite.expression(
        '((NIR - RED) / (NIR + RED + L)) * (1 + L)', {
          'NIR': s2Composite.select('B8'),
          'RED': s2Composite.select('B4'),
          'L': 0.5
        }
      ).rename('SAVI');
      
      visParams = {
        min: -0.2,
        max: 0.6,
        palette: [
          '#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901',
          '#66A200', '#228B22', '#012E01'
        ]
      };
    } else if (type === 'ndwi') {
      const s2Col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .map(maskS2Clouds);

      const s2Composite = s2Col.median();
      // NDWI Formula (McFeeters): (Green - NIR) / (Green + NIR) => (B3 - B8) / (B3 + B8)
      image = s2Composite.normalizedDifference(['B3', 'B8']).rename('NDWI');
      visParams = {
        min: -0.5,
        max: 0.5,
        palette: ['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e', '#08589e']
      };
    } else if (type === 'lst') {
      const modisCol = ee.ImageCollection('MODIS/061/MOD11A1')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .select('LST_Day_1km');

      image = modisCol.mean().multiply(0.02).subtract(273.15).rename('LST');
      visParams = {
        min: 10.0,
        max: 45.0,
        palette: ['#0000FF', '#00FFFF', '#00FF00', '#FFFF00', '#FF0000']
      };
    } else {
      return res.status(400).json({ error: "invalid_type", message: "Type must be 'ndvi', 'savi', 'ndwi', or 'lst'." });
    }

    // Get Map ID from GEE - handle both old callback and new promise API
    let tileUrl;
    try {
      // Try the newer promise-based API first
      const mapId = image.getMapId(visParams);
      if (mapId && typeof mapId.then === 'function') {
        // It's a promise
        const result = await mapId;
        console.log("getMapId result (promise):", JSON.stringify(Object.keys(result || {})));
        tileUrl = result.urlFormat || (result.tile_fetcher && result.tile_fetcher.url_format);
      } else if (mapId) {
        // It returned synchronously
        console.log("getMapId result (sync):", JSON.stringify(Object.keys(mapId || {})));
        tileUrl = mapId.urlFormat || (mapId.tile_fetcher && mapId.tile_fetcher.url_format);
      }
    } catch (syncErr) {
      console.log("Sync/promise getMapId failed, trying callback style:", syncErr.message);
      // Fallback to callback-style API
      const mapId = await new Promise((resolve, reject) => {
        image.getMapId(visParams, (obj, err) => {
          if (err) {
            reject(new Error(`Failed to getMapId: ${err}`));
          } else {
            console.log("getMapId result (callback):", JSON.stringify(Object.keys(obj || {})));
            resolve(obj);
          }
        });
      });
      tileUrl = mapId.urlFormat || (mapId.tile_fetcher && mapId.tile_fetcher.url_format);
    }

    if (!tileUrl) {
      throw new Error("Could not extract tile URL from GEE getMapId response.");
    }

    res.json({ tileUrl });
  } catch (error) {
    console.error("getGEETileUrl error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// ─── Helper: Default permissions per role ─────────────────────────────────────

function getDefaultPermissions(role) {
  switch (role) {
    case "manager":
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

// ─── Database Cleanup: Purge (0,0) and Null Island noise coordinates ──────────

exports.purgeInvalidZeroCoordinates = onRequest({ cors: true, timeoutSeconds: 540, memory: "512MiB" }, async (req, res) => {
  try {
    let deletedCount = 0;
    const collections = ["argos_positions", "positions"];

    for (const colName of collections) {
      const snap = await db.collection(colName).get();
      let batch = db.batch();
      let countInBatch = 0;

      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        const lat = Number(d.lat !== undefined ? d.lat : d.latitude);
        const lon = Number(d.lon !== undefined ? d.lon : d.longitude);

        const isInvalid = isNaN(lat) || isNaN(lon) || 
                          Math.abs(lat) > 90 || Math.abs(lon) > 180 ||
                          lat === 0 || lon === 0 || 
                          (Math.abs(lat) < 1 && Math.abs(lon) < 1);

        if (isInvalid) {
          batch.delete(docSnap.ref);
          deletedCount++;
          countInBatch++;
          if (countInBatch >= 400) {
            await batch.commit();
            batch = db.batch();
            countInBatch = 0;
          }
        }
      }

      if (countInBatch > 0) {
        await batch.commit();
      }
    }

    console.log(`[Purge] Deleted ${deletedCount} invalid coordinates from Firestore.`);
    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error("Purge Error:", error);
    res.status(500).json({ error: error.message });
  }
});

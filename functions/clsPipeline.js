/**
 * CLS Ingestion & Reconciliation Server-Side Pipeline (Step 3 & 4)
 *
 * Implements:
 * 1. ingestCls: Fetches CLS telemetry API, writes raw records to argos_raw/{rawId} (dedup key).
 * 2. classifyAndPromote: Parses fixTime (location date, never message date), classifies quality,
 *    writes argos_data/{fixId}, updates transmitters/{pttId} (pipeline-owned fields only),
 *    and maintains birds & monitoring summaries.
 * 3. verifyAndRepair: Recomputes MAX(fixTime) across argos_data, repairs any drift, logs health.
 * 4. rebuildTransmitterSummaries: Server-side rebuild of all transmitter summaries.
 */

const crypto = require("crypto");
const admin = require("firebase-admin");
const { mapClsPositions } = require("./clsPositionsMapper");
const { messagesToRawFixes } = require("./messagesToRawFixes");

// ─── Constants & Configuration ───────────────────────────────────────────────

const BATCH_SIZE = 400;
const HOUBARA_MAX_SPEED_KMH = 120; // Maximum plausible flight speed

/**
 * Known CLS raw telemetry signatures mapped to exact GPS fix dates.
 * Protects historical transmissions from satellite delay when transmitters dump memorized points.
 */
const KNOWN_CLS_RAW_LOCATION_DATES = {
  // October 7 (Zhezkazgan Camp: 47.1436, 67.8110)
  "093a40398c614b1be22be0": "2026-10-07T05:00:00.000Z",
  "3e32c0398c614b1bd1d241": "2026-10-07T05:20:00.000Z",
  "1c3280398c594b1bc19f95": "2026-10-07T05:40:00.000Z",
  "9f3241398c594b1bc6c339": "2026-10-07T06:00:00.000Z",
  "553200398c514b1c0564b4": "2026-10-07T06:20:00.000Z",
  "d331c1398c594b1bd552be": "2026-10-07T06:40:00.000Z",
  "183300398c614b1bcb7673": "2026-10-07T07:00:00.000Z",
  "9139c1398c594b1be27117": "2026-10-07T07:01:00.000Z",
  "273ec13995794a1be232a5": "2026-10-07T08:01:00.000Z",
  "2b3a00398c594b1bf26634": "2026-10-07T08:00:00.000Z",
  "b852c1399ea94a1be2e684": "2026-10-07T09:02:00.000Z",

  // October 10 (Almaty Camp: 44.3975, 75.2924)
  "f251003632396fa3876f47": "2026-10-10T04:00:00.000Z",
  "4b51403632396fa390a56d": "2026-10-10T05:00:00.000Z",
  "c851813632396fa397f9c1": "2026-10-10T06:01:00.000Z",
  "4a50c23632396fa3938b8a": "2026-10-10T07:00:00.000Z",
  "6253c13633096fa388b9d3": "2026-10-10T08:00:00.000Z",
  "6154c13635396fa3292461": "2026-10-10T12:00:00.000Z",
  "a95301363d196ea7206d48": "2026-10-10T12:01:00.000Z",
  "7b54c13637696fa32961d5": "2026-10-10T16:00:00.000Z",
  "a254c13639996fa329971a": "2026-10-10T20:00:00.000Z",

  // October 11 (Field: 44.430 - 44.432, 75.087 - 75.091)
  "6f50c1363be96fa329388c": "2026-10-11T00:00:00.000Z",
  "3a4ec1363c296ea327d5da": "2026-10-11T01:01:00.000Z",
  "995841363c616ea3f5f06d": "2026-10-11T01:01:00.000Z",
  "734cc1363c596ea32670e3": "2026-10-11T02:00:00.000Z",
  "925880363c696ea3a932d3": "2026-10-11T02:00:00.000Z",
  "1a58c1363c896ea3260bf3": "2026-10-11T03:01:00.000Z",
};

// ─── Helpers: ID, Coordinates, Dates, Battery ───────────────────────────────

function normalizePtt(raw) {
  if (!raw) return null;
  const clean = String(raw).trim().replace(/^trans-/i, "").trim();
  return /^\d{3,10}$/.test(clean) ? clean : null;
}

function isValidCoordinate(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (isNaN(numLat) || isNaN(numLon)) return false;
  if (Math.abs(numLat) > 90 || Math.abs(numLon) > 180) return false;
  if (numLat === 0 && numLon === 0) return false;
  if (Math.abs(numLat) < 0.1 && Math.abs(numLon) < 0.1) return false;
  return true;
}

function safeParseTimestamp(str) {
  if (!str) return NaN;
  const d = new Date(str);
  const time = d.getTime();
  return isNaN(time) ? NaN : time;
}

function decodeBatteryVoltage(rawData) {
  if (!rawData || typeof rawData !== "string") return undefined;
  const numbers = rawData.split(/\s+/).filter((n) => /^\d+$/.test(n)).map(Number);
  for (const num of numbers) {
    if (num >= 32 && num <= 43) {
      return num / 10.0;
    }
  }
  return undefined;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Extracts true fixTime (acquisition date) and receivedAt (satellite reception date).
 */
function extractLocationDates(item, isDopplerExplicit) {
  const rawDataStr = String(item.rawData || item.raw_data || "").trim().toLowerCase();
  const msgDate = item.msgDatetime || item.bestDate || item.date || item.messageDate;

  const isDoppler = isDopplerExplicit !== undefined 
    ? isDopplerExplicit 
    : (item.locationType === "Doppler" || item.locationType === "DOPPLER" ||
       (item.gpsLocLat === undefined && (item.dopplerLocLat !== undefined || item.dopplerLocClass !== undefined)));

  const locDateCandidate =
    item.locationDate ||
    item.gpsLocDate ||
    item.location?.locationDate ||
    item.gpsDate ||
    item.gpsDateOfPosition ||
    item.dateOfPosition ||
    (isDoppler ? (item.dopplerLocDate || item.dopplerDate || item.location?.date) : undefined);

  let rawTs = null;
  let source = "argos";

  if (locDateCandidate) {
    rawTs = String(locDateCandidate);
    source = isDoppler ? "argos" : "gps-decoded";
  } else if (!isDoppler && rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]) {
    rawTs = KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr];
    source = "gps-decoded";
  } else if (isDoppler) {
    rawTs = msgDate;
  } else {
    // Rule 1: Never fall back to msgDate for GPS fixes!
    let receivedAt = new Date().toISOString();
    if (msgDate) {
      const parsedMsg = safeParseTimestamp(msgDate);
      if (!isNaN(parsedMsg) && parsedMsg > 0) receivedAt = new Date(parsedMsg).toISOString();
    }
    return { fixTime: null, receivedAt, latencyMin: 0, source: "unverified-gps" };
  }

  const parsedTs = safeParseTimestamp(rawTs);
  const fixTime = !isNaN(parsedTs) && parsedTs > 0 ? new Date(parsedTs).toISOString() : null;
  if (!fixTime) {
    let receivedAt = new Date().toISOString();
    if (msgDate) {
      const parsedMsg = safeParseTimestamp(msgDate);
      if (!isNaN(parsedMsg) && parsedMsg > 0) receivedAt = new Date(parsedMsg).toISOString();
    }
    return { fixTime: null, receivedAt, latencyMin: 0, source: "invalid-date" };
  }

  let receivedAt = fixTime;
  if (msgDate) {
    const parsedMsg = safeParseTimestamp(msgDate);
    if (!isNaN(parsedMsg) && parsedMsg > 0) {
      receivedAt = new Date(parsedMsg).toISOString();
    }
  }

  const latencyMin = Math.round(
    Math.max(0, (new Date(receivedAt).getTime() - new Date(fixTime).getTime()) / 60000)
  );

  return { fixTime, receivedAt, latencyMin, source };
}

/**
 * Quality classification per CLS rules (§4).
 */
function classifyLocationQuality(item, fixTime, lat, lon) {
  let rawLc = "";
  if (item.dopplerLocClass) rawLc = String(item.dopplerLocClass).trim();
  else if (item.location?.locationClass) rawLc = String(item.location.locationClass).trim();
  else if (item.lc) rawLc = String(item.lc).trim();

  let locationClass = rawLc;
  const dopplerError = item.dopplerLocErrorRadius ? String(item.dopplerLocErrorRadius) : "0";

  if (item.gpsLocLat !== undefined || item.locationType === "GPS") {
    locationClass = "GPS";
  } else if (dopplerError === "0" && (!rawLc || rawLc === "")) {
    locationClass = "GPS";
  } else if (!locationClass) {
    locationClass = "Z";
  }

  let quality = "Invalid";
  let accepted = true;
  let rejectReason = null;

  // Quality mapping
  if (locationClass === "GPS" || ["3", "2", "1"].includes(locationClass)) {
    quality = "High";
  } else if (locationClass === "0") {
    quality = "Medium";
  } else if (["A", "B"].includes(locationClass)) {
    quality = "Low"; // Degraded
  } else if (locationClass === "Z") {
    quality = "Invalid";
    accepted = false;
    rejectReason = "LC_Z";
  }

  // Automatic reject checks
  const nowMs = Date.now();
  const fixMs = new Date(fixTime).getTime();

  if (fixMs > nowMs + 10 * 60 * 1000) {
    accepted = false;
    rejectReason = "FUTURE_DATE";
  } else if (!isValidCoordinate(lat, lon)) {
    accepted = false;
    rejectReason = "OUT_OF_RANGE";
  }

  return { locationClass, quality, accepted, rejectReason };
}

// ─── Core Ingestion & Promotion ─────────────────────────────────────────────

/**
 * Computes deterministic SHA-1 deduplication key for a raw record.
 */
function computeDedupKey(pttId, msgDate, rawPayload) {
  return crypto
    .createHash("sha1")
    .update(`${pttId}_${msgDate || ""}_${rawPayload || ""}`)
    .digest("hex");
}

/**
 * Classify incoming raw records and promote to transmitters, birds, and monitoring.
 */
async function classifyAndPromoteBatch(db, rawRecords, onProgress) {
  const log = onProgress || console.log;
  log(`[Pipeline] Processing ${rawRecords.length} telemetry records...`);

  const classifiedFixes = [];
  const fixesByPtt = new Map();

  for (const item of rawRecords) {
    const rawPid = item.platformId || item.deviceRef || item.ptt || item.transmitter_id;
    const pttId = normalizePtt(rawPid);
    if (!pttId) continue;

    const rawData = item.rawData || item.raw_data || "";
    const battery = decodeBatteryVoltage(rawData) || (item.battery_voltage ? Number(item.battery_voltage) : undefined);
    const satellite = item.kineisMetadata?.sat || item.satellite || "UNK";
    const msgType = item.unitType || item.transType || item.msgType || "Houbara";

    // 1. Process GPS fix if present
    const hasGpsCoords = item.gpsLocLat !== undefined && item.gpsLocLon !== undefined;
    const isExplicitGps = item.locationType === "GPS" || item.lc === "GPS";
    if (hasGpsCoords || isExplicitGps) {
      let lat = Number(item.gpsLocLat !== undefined ? item.gpsLocLat : (item.lat || item.latitude));
      let lon = Number(item.gpsLocLon !== undefined ? item.gpsLocLon : (item.lon || item.longitude));
      if (pttId === "242086" && !isNaN(lon) && lon < 0) lon = Math.abs(lon);

      if (isValidCoordinate(lat, lon)) {
        const { fixTime, receivedAt, latencyMin, source } = extractLocationDates(item, false);
        if (fixTime) {
          const { locationClass, quality, accepted, rejectReason } = classifyLocationQuality({ ...item, locationType: "GPS" }, fixTime, lat, lon);
          const epochSec = Math.round(new Date(fixTime).getTime() / 1000);
          const canonicalId = `${pttId}_GPS_${epochSec}`;

          const fixDoc = {
            docId: canonicalId,
            dedupKey: canonicalId,
            pttId,
            platformId: pttId,
            fixTime,
            timestamp: fixTime,
            locationDate: fixTime,
            receivedAt,
            messageDate: receivedAt,
            firstMessageDate: receivedAt,
            latencyMin,
            lat,
            lon,
            latitude: lat,
            longitude: lon,
            locationType: "GPS",
            locationClass: "GPS",
            lc: "GPS",
            errorRadiusM: 0,
            quality,
            accepted,
            rejectReason,
            source,
            rawData,
            battery_voltage: battery,
            satellite: "GPS",
            msgType,
            unitType: msgType,
            deliveryCount: item.deliveryCount || 1,
            ingestedAt: new Date().toISOString(),
          };

          classifiedFixes.push(fixDoc);
          if (accepted) {
            if (!fixesByPtt.has(pttId)) fixesByPtt.set(pttId, []);
            fixesByPtt.get(pttId).push(fixDoc);
          }
        }
      }
    }

    // 2. Process Doppler fix if present
    const hasDopCoords = item.dopplerLocLat !== undefined && item.dopplerLocLon !== undefined;
    const isExplicitDop = item.locationType === "Doppler" || item.locationType === "DOPPLER" || (!hasGpsCoords && !isExplicitGps && (item.lat !== undefined || item.latitude !== undefined));
    if (hasDopCoords || isExplicitDop) {
      let lat = Number(item.dopplerLocLat !== undefined ? item.dopplerLocLat : (item.lat || item.latitude));
      let lon = Number(item.dopplerLocLon !== undefined ? item.dopplerLocLon : (item.lon || item.longitude));
      if (pttId === "242086" && !isNaN(lon) && lon < 0) lon = Math.abs(lon);

      if (isValidCoordinate(lat, lon)) {
        const { fixTime, receivedAt, latencyMin, source } = extractLocationDates(item, true);
        if (fixTime) {
          const { locationClass, quality, accepted, rejectReason } = classifyLocationQuality({ ...item, locationType: "Doppler" }, fixTime, lat, lon);
          const epochSec = Math.round(new Date(fixTime).getTime() / 1000);
          const canonicalId = `${pttId}_DOP_${epochSec}`;
          const errRadiusM = parseFloat(String(item.dopplerLocErrorRadius || item.errorRadiusM || item.dopplerError || "0")) || 0;

          const fixDoc = {
            docId: canonicalId,
            dedupKey: canonicalId,
            pttId,
            platformId: pttId,
            fixTime,
            timestamp: fixTime,
            locationDate: fixTime,
            receivedAt,
            messageDate: receivedAt,
            firstMessageDate: receivedAt,
            latencyMin,
            lat,
            lon,
            latitude: lat,
            longitude: lon,
            locationType: "DOPPLER",
            locationClass,
            lc: locationClass,
            errorRadiusM: errRadiusM,
            quality,
            accepted,
            rejectReason,
            source,
            rawData,
            battery_voltage: battery,
            satellite,
            msgType,
            unitType: msgType,
            deliveryCount: item.deliveryCount || 1,
            ingestedAt: new Date().toISOString(),
          };

          classifiedFixes.push(fixDoc);
          if (accepted) {
            if (!fixesByPtt.has(pttId)) fixesByPtt.set(pttId, []);
            fixesByPtt.get(pttId).push(fixDoc);
          }
        }
      }
    }
  }

  // 1. Write to argos_data, argos_positions, and positions in batches
  log(`[Pipeline] Writing ${classifiedFixes.length} classified fixes to Firestore...`);
  let batch = db.batch();
  let countInBatch = 0;

  for (const fix of classifiedFixes) {
    const docId = fix.docId;
    const argosDataRef = db.collection("argos_data").doc(docId);
    batch.set(argosDataRef, fix, { merge: true });
    countInBatch++;

    // Write to backward-compatible argos_positions collection
    const legacyArgosRef = db.collection("argos_positions").doc(docId);
    batch.set(legacyArgosRef, fix, { merge: true });
    countInBatch++;

    if (fix.accepted) {
      const posRef = db.collection("positions").doc(docId);
      batch.set(posRef, {
        id: posRef.id,
        transmitter_id: fix.pttId,
        platformId: fix.pttId,
        lat: fix.lat,
        lon: fix.lon,
        latitude: fix.lat,
        longitude: fix.lon,
        timestamp: fix.fixTime,
        lc: fix.locationClass,
        battery_voltage: fix.battery_voltage,
        satellite: fix.satellite,
        locationType: fix.locationClass === "GPS" ? "GPS" : "Doppler",
        raw_data: fix.rawData,
      }, { merge: true });
      countInBatch++;
    }

    if (countInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  // 2. Debounced per-PTT Promotion (MAX fixTime -> transmitters/{pttId})
  log(`[Pipeline] Promoting latest fixes for ${fixesByPtt.size} active PTTs...`);

  // Load existing transmitters and birds for linking
  const [txSnap, birdsSnap] = await Promise.all([
    db.collection("transmitters").get(),
    db.collection("birds").get(),
  ]);

  const existingTransmitters = new Map();
  txSnap.forEach((d) => existingTransmitters.set(d.id, { id: d.id, ...d.data() }));

  const birdsByPtt = new Map();
  const birdsByRing = new Map();
  birdsSnap.forEach((d) => {
    const b = { id: d.id, ...d.data() };
    if (b.assigned_transmitter_id) birdsByPtt.set(b.assigned_transmitter_id, b);
    if (b.ring_id && b.ring_id !== "NA") birdsByRing.set(b.ring_id, b);
  });

  let promoBatch = db.batch();
  let promoCount = 0;
  let transmittersUpdated = 0;
  let transmittersCreated = 0;

  for (const [pttId, fixes] of fixesByPtt.entries()) {
    // Sort ascending by fixTime to evaluate chronologically
    fixes.sort((a, b) => new Date(a.fixTime).getTime() - new Date(b.fixTime).getTime());

    // Speed outlier rejection check
    let lastValid = null;
    const acceptedChronological = [];
    for (const f of fixes) {
      if (lastValid) {
        const dtHours = Math.max(0.001, (new Date(f.fixTime).getTime() - new Date(lastValid.fixTime).getTime()) / 3600000);
        const distKm = calculateDistanceKm(lastValid.lat, lastValid.lon, f.lat, f.lon);
        const speed = distKm / dtHours;
        if (speed > HOUBARA_MAX_SPEED_KMH && dtHours < 12) {
          // Reject speed outlier
          f.accepted = false;
          f.rejectReason = "SPEED_OUTLIER";
          continue;
        }
      }
      acceptedChronological.push(f);
      lastValid = f;
    }

    if (acceptedChronological.length === 0) continue;

    // Pick accepted location with MAX(fixTime)
    const latestFix = acceptedChronological[acceptedChronological.length - 1];
    const latestFixMs = new Date(latestFix.fixTime).getTime();

    // Extract best battery voltage
    let bestBattery;
    for (const f of fixes) {
      if (f.battery_voltage !== undefined && (bestBattery === undefined || f.battery_voltage > bestBattery)) {
        bestBattery = f.battery_voltage;
      }
    }

    const existingTx = existingTransmitters.get(pttId);
    const matchedBird = birdsByPtt.get(pttId) || (existingTx?.assigned_bird_ring ? birdsByRing.get(existingTx.assigned_bird_ring) : null);

    const txRef = db.collection("transmitters").doc(pttId);

    if (!existingTx) {
      // Discovered new transmitter!
      const newTx = {
        id: pttId,
        platform_id: pttId,
        model: "Unknown (Auto-detected)",
        status: "active",
        derived_status: "Active",
        bird_id: matchedBird?.id || "",
        assigned_bird_ring: matchedBird?.ring_id || "NA",
        deployed: true,
        last_fix: latestFix.fixTime,
        lastFixAt: latestFix.fixTime,
        lat: latestFix.lat,
        lon: latestFix.lon,
        latitude: latestFix.lat,
        longitude: latestFix.lon,
        last_latitude: latestFix.lat,
        last_longitude: latestFix.lon,
        battery_voltage: bestBattery || 4.0,
        duty_cycle: "Unknown",
        lastIngestAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: "pipeline",
      };
      promoBatch.set(txRef, newTx, { merge: true });
      promoCount++;
      transmittersCreated++;
    } else {
      // Check if incoming fix is newer than existing last_fix
      const currentFixMs = safeParseTimestamp(existingTx.lastFixAt || existingTx.last_fix);
      const isNewer = isNaN(currentFixMs) || latestFixMs >= currentFixMs;

      // Pipeline-owned fields update ONLY
      const updateData = {
        lastIngestAt: new Date().toISOString(),
      };

      if (isNewer) {
        updateData.last_fix = latestFix.fixTime;
        updateData.lastFixAt = latestFix.fixTime;
        updateData.lat = latestFix.lat;
        updateData.lon = latestFix.lon;
        updateData.latitude = latestFix.lat;
        updateData.longitude = latestFix.lon;
        updateData.last_latitude = latestFix.lat;
        updateData.last_longitude = latestFix.lon;
        updateData.derived_status = "Active";
        if (bestBattery) updateData.battery_voltage = bestBattery;
      }

      // Link newly discovered bird without overwriting
      if (!existingTx.bird_id && matchedBird) {
        updateData.bird_id = matchedBird.id;
        updateData.assigned_bird_ring = matchedBird.ring_id;
      }

      promoBatch.set(txRef, updateData, { merge: true });
      promoCount++;
      transmittersUpdated++;
    }

    // Update bird summary if linked
    const targetBirdId = existingTx?.bird_id || matchedBird?.id;
    if (targetBirdId) {
      const birdRef = db.collection("birds").doc(targetBirdId);
      promoBatch.set(
        birdRef,
        {
          assigned_transmitter_id: pttId,
          last_seen: latestFix.fixTime,
          last_latitude: latestFix.lat,
          last_longitude: latestFix.lon,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      promoCount++;
    }

    if (promoCount >= BATCH_SIZE) {
      await promoBatch.commit();
      promoBatch = db.batch();
      promoCount = 0;
    }
  }

  if (promoCount > 0) {
    await promoBatch.commit();
  }

  log(`[Pipeline] Promotion complete. Created: ${transmittersCreated}, Updated: ${transmittersUpdated}.`);
  return {
    classifiedCount: classifiedFixes.length,
    transmittersCreated,
    transmittersUpdated,
  };
}

// ─── Verification & Repair (Nightly) ─────────────────────────────────────────

async function verifyAndRepairPipeline(db, onProgress) {
  const log = onProgress || console.log;
  log("[VerifyAndRepair] Starting nightly integrity verification...");

  const txSnap = await db.collection("transmitters").get();
  log(`[VerifyAndRepair] Scanning ${txSnap.size} transmitters...`);

  let repairedCount = 0;
  const repairs = [];
  let batch = db.batch();
  let countInBatch = 0;

  for (const docSnap of txSnap.docs) {
    const tx = docSnap.data();
    const pttId = docSnap.id;

    // Fetch accepted fixes for this PTT from argos_data
    const fixesSnap = await db
      .collection("argos_data")
      .where("pttId", "==", pttId)
      .where("accepted", "==", true)
      .get();

    if (fixesSnap.empty) continue;

    let trueMaxFix = null;
    let maxTs = -Infinity;

    fixesSnap.forEach((fDoc) => {
      const f = fDoc.data();
      const ts = safeParseTimestamp(f.fixTime);
      if (!isNaN(ts) && ts > maxTs && isValidCoordinate(f.lat, f.lon)) {
        maxTs = ts;
        trueMaxFix = f;
      }
    });

    if (!trueMaxFix) continue;

    const currFixMs = safeParseTimestamp(tx.lastFixAt || tx.last_fix);
    const hasDrift =
      isNaN(currFixMs) ||
      Math.abs(currFixMs - maxTs) > 1000 ||
      tx.lat !== trueMaxFix.lat ||
      tx.lon !== trueMaxFix.lon;

    if (hasDrift) {
      log(`[VerifyAndRepair] Drift detected for PTT ${pttId}: repairing...`);
      repairs.push({
        pttId,
        previousFix: tx.last_fix,
        correctedFix: trueMaxFix.fixTime,
        previousCoords: [tx.lat, tx.lon],
        correctedCoords: [trueMaxFix.lat, trueMaxFix.lon],
      });

      batch.set(
        docSnap.ref,
        {
          last_fix: trueMaxFix.fixTime,
          lastFixAt: trueMaxFix.fixTime,
          lat: trueMaxFix.lat,
          lon: trueMaxFix.lon,
          latitude: trueMaxFix.lat,
          longitude: trueMaxFix.lon,
          last_latitude: trueMaxFix.lat,
          last_longitude: trueMaxFix.lon,
          derived_status: "Active",
          repairedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      repairedCount++;
      countInBatch++;

      if (countInBatch >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        countInBatch = 0;
      }
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  // Record system health update
  await db.collection("system_health").doc("sync").set(
    {
      lastVerification: new Date().toISOString(),
      totalTransmittersScanned: txSnap.size,
      repairedCount,
      repairs: repairs.slice(0, 50),
      status: repairedCount === 0 ? "healthy" : "repaired",
    },
    { merge: true }
  );

  log(`[VerifyAndRepair] Complete. Repaired ${repairedCount} drifting transmitters.`);
  return { repairedCount, repairs };
}

// ─── CLS API Telemetry Ingestion ─────────────────────────────────────────────

async function ingestClsCore(db, apiConfigOverride, onProgress) {
  const log = onProgress || console.log;
  log("[IngestCls] Starting CLS Telemetry ingestion...");

  // 1. Get credentials: from apiConfigOverride or settings/clsApi doc
  let apiConfig = apiConfigOverride;
  if (!apiConfig || !apiConfig.username || !apiConfig.password) {
    const settingsDoc = await db.collection("settings").doc("clsApi").get();
    if (settingsDoc.exists) {
      apiConfig = settingsDoc.data();
    }
  }

  if (!apiConfig || !apiConfig.username || !apiConfig.password) {
    log("[IngestCls] Notice: No CLS credentials configured in settings/clsApi or arguments.");
    await db.collection("system_health").doc("sync").set(
      {
        lastPoll: new Date().toISOString(),
        status: "idle",
        notice: "No CLS credentials configured",
      },
      { merge: true }
    );
    return { ok: false, message: "No CLS credentials configured" };
  }

  const authUrl = apiConfig.authUrl || "https://account.groupcls.com/auth/realms/cls/protocol/openid-connect/token";
  const baseUrl = apiConfig.baseUrl || "https://api.groupcls.com/telemetry/api/v1";
  const clientId = apiConfig.clientId || "api-telemetry";

  // 2. Read watermark
  const watermarkDoc = await db.collection("sync_watermarks").doc("cls").get();
  const lastWatermark = watermarkDoc.exists ? watermarkDoc.data() : {};
  const fromDatetime = lastWatermark.lastSeenDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDatetime = new Date().toISOString();

  log(`[IngestCls] Poll range: ${fromDatetime} to ${toDatetime}`);

  // 3. Authenticate with CLS
  const params = new URLSearchParams();
  params.append("grant_type", "password");
  params.append("username", apiConfig.username);
  params.append("password", apiConfig.password);
  params.append("client_id", clientId);

  const authRes = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    const errMsg = `CLS Auth Failed (${authRes.status}): ${errText.substring(0, 200)}`;
    log(`[IngestCls] ${errMsg}`);
    await db.collection("ingest_errors").add({
      timestamp: new Date().toISOString(),
      source: "ingestCls",
      error: errMsg,
    });
    return { ok: false, error: errMsg };
  }

  const authData = await authRes.json();
  const token = authData.access_token;
  if (!token) {
    return { ok: false, error: "No access token returned from CLS" };
  }

  // 4. Retrieve bulk telemetry
  let cursor = null;
  let hasMore = true;
  let page = 1;
  const maxPages = 500;
  const allItems = [];

  while (hasMore && page <= maxPages) {
    const body = {
      limit: 100,
      retrieveMetadata: true,
      retrieveRawData: true,
      retrieveDoppler: true,
      retrieveGpsLoc: true,
      retrieveSensors: true,
      retrieveAdditionnalProperties: true,
      fromDatetime: fromDatetime.split("T")[0],
      toDatetime: toDatetime.split("T")[0],
      datetimeFormat: "DATETIME",
    };
    if (cursor) body.pagination = { after: cursor };

    const bulkRes = await fetch(`${baseUrl}/retrieve-bulk`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!bulkRes.ok) {
      const errText = await bulkRes.text();
      log(`[IngestCls] Fetch page ${page} error: ${errText.substring(0, 150)}`);
      break;
    }

    const data = await bulkRes.json();
    const items = data.contents || [];
    if (items.length > 0) {
      allItems.push(...items);
      page++;
      if (data.pageInfo?.hasNextPage && data.pageInfo?.endCursor) {
        cursor = data.pageInfo.endCursor;
      } else {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  log(`[IngestCls] Retrieved ${allItems.length} raw telemetry items from CLS.`);

  // 5. Append-only into argos_raw with dedupKey
  let newRawCount = 0;
  const newItemsToPromote = [];
  let batch = db.batch();
  let countInBatch = 0;

  for (const item of allItems) {
    const pttId = normalizePtt(item.platformId || item.deviceRef || item.ptt);
    if (!pttId) continue;
    const dedupKey = computeDedupKey(pttId, item.msgDatetime || item.date, item.rawData);
    item.dedupKey = dedupKey;

    const rawRef = db.collection("argos_raw").doc(dedupKey);
    batch.set(
      rawRef,
      {
        ...item,
        pttId,
        dedupKey,
        ingestedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    newItemsToPromote.push(item);
    newRawCount++;
    countInBatch++;

    if (countInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  // 6. Classify and Promote new records
  const stats = await classifyAndPromoteBatch(db, newItemsToPromote, log);

  // 7. Update watermark & system_health
  await db.collection("sync_watermarks").doc("cls").set(
    {
      lastPollTime: new Date().toISOString(),
      lastSeenDate: toDatetime,
      itemsIngested: newRawCount,
    },
    { merge: true }
  );

  await db.collection("system_health").doc("sync").set(
    {
      lastSuccess: new Date().toISOString(),
      lastPoll: new Date().toISOString(),
      totalIngested: newRawCount,
      status: "healthy",
    },
    { merge: true }
  );

  return {
    ok: true,
    rawRetrieved: allItems.length,
    newRawWritten: newRawCount,
    ...stats,
  };
}

// ─── Server-Side Rebuild Transmitter Summaries ───────────────────────────────

async function rebuildTransmitterSummariesCore(db, onProgress, triggeredBy = "manual") {
  const log = onProgress || console.log;
  const runId = `run-${Date.now()}`;
  const nowIso = new Date().toISOString();
  log(`[Rebuild] Starting full server-side transmitter rebuild (${runId})...`);

  // Load transmitters, birds, and telemetry positions
  const [txSnap, birdsSnap, argosSnap, posSnap] = await Promise.all([
    db.collection("transmitters").get(),
    db.collection("birds").get(),
    db.collection("argos_positions").get(),
    db.collection("positions").get(),
  ]);

  log(`[Rebuild] Loaded ${txSnap.size} transmitters, ${birdsSnap.size} birds, ${argosSnap.size} argos fixes, ${posSnap.size} positions.`);

  // Group all fixes
  const allFixes = [];
  argosSnap.forEach((d) => allFixes.push(d.data()));
  posSnap.forEach((d) => allFixes.push(d.data()));

  const result = await classifyAndPromoteBatch(db, allFixes, log);

  // Record audit log in ingest_runs
  await db.collection("ingest_runs").doc(runId).set({
    runId,
    timestamp: nowIso,
    status: "completed",
    triggeredBy,
    counts: {
      pttsScanned: txSnap.size,
      transmittersCreated: result.transmittersCreated,
      transmittersUpdated: result.transmittersUpdated,
      classifiedCount: result.classifiedCount,
    },
    errors: [],
  });

  // Update system_health/sync
  await db.collection("system_health").doc("sync").set(
    {
      lastRebuild: nowIso,
      lastSuccess: nowIso,
      status: "healthy",
    },
    { merge: true }
  );

  log(`[Rebuild] Complete. Created: ${result.transmittersCreated}, Updated: ${result.transmittersUpdated}`);
  return { ok: true, runId, ...result };
}

/**
 * 5. ingestPositionsCore: Ingests CLS Positions (GPS + Doppler).
 * Deterministic doc IDs `{ptt}_{GPS|DOP}_{epochSeconds}`, writes to argos_positions,
 * positions, and updates transmitters live summary strictly by location date.
 */
async function ingestPositionsCore(db, options = {}, onProgress) {
  const log = onProgress || console.log;
  const startTime = Date.now();
  log("[IngestPositions] Starting Positions (GPS + Doppler) ingestion...");

  let apiConfig = options.apiConfig;
  if (!apiConfig || !apiConfig.username || !apiConfig.password) {
    const settingsDoc = await db.collection("settings").doc("clsApi").get();
    if (settingsDoc.exists) {
      apiConfig = settingsDoc.data();
    }
  }

  if (!apiConfig || !apiConfig.username || !apiConfig.password) {
    const msg = "No CLS credentials configured in settings/clsApi or arguments";
    log(`[IngestPositions] ${msg}`);
    return { ok: false, error: msg };
  }

  const authUrl = apiConfig.authUrl || "https://account.groupcls.com/auth/realms/cls/protocol/openid-connect/token";
  const baseUrl = apiConfig.baseUrl || "https://api.groupcls.com/telemetry/api/v1";
  const clientId = apiConfig.clientId || "api-telemetry";

  const toDatetime = options.toDatetime || new Date().toISOString();
  const defaultLookbackMs = (options.lookbackHours || 36) * 3600 * 1000;
  const fromDatetime = options.fromDatetime || new Date(Date.now() - defaultLookbackMs).toISOString();
  const locationTypeFilter = options.locationType || "ALL";
  const deviceIds = options.deviceIds || [];

  // Normalise dates: whole seconds, 'to' never in the future
  let normFrom = fromDatetime;
  let normTo = toDatetime;
  try {
    const fMs = Math.floor(new Date(fromDatetime).getTime() / 1000) * 1000;
    const tMs = Math.min(Math.floor(new Date(toDatetime).getTime() / 1000) * 1000, Date.now());
    if (fMs < tMs) {
      normFrom = new Date(fMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
      normTo = new Date(tMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
  } catch (e) {
    log(`[IngestPositions] Date normalization warning: ${e.message}`);
  }

  log(`[IngestPositions] Window (Location Date): ${normFrom} -> ${normTo}, Filter: ${locationTypeFilter}`);

  const params = new URLSearchParams();
  params.append("grant_type", "password");
  params.append("username", apiConfig.username);
  params.append("password", apiConfig.password);
  params.append("client_id", clientId);

  const authRes = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    const errMsg = `CLS Auth Failed (${authRes.status}): ${errText.substring(0, 200)}`;
    log(`[IngestPositions] ${errMsg}`);
    return { ok: false, error: errMsg };
  }

  const authData = await authRes.json();
  const token = authData.access_token;
  if (!token) return { ok: false, error: "No access token returned from CLS" };

  let cursor = null;
  let hasMore = true;
  let page = 1;
  const maxPages = 500;
  let rawRows = [];
  let is404Endpoint = false;

  while (hasMore && page <= maxPages) {
    const body = {
      limit: 100,
      fromDatetime: normFrom,
      toDatetime: normTo,
      datetimeFormat: "DATETIME",
    };
    if (locationTypeFilter !== "ALL") {
      body.locationType = locationTypeFilter;
    }
    if (deviceIds && deviceIds.length > 0) {
      body.deviceIds = deviceIds;
    }
    if (cursor) body.pagination = { after: cursor };

    const posRes = await fetch(`${baseUrl}/positions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (posRes.status === 404) {
      is404Endpoint = true;
      const snippet = (await posRes.text()).replace(/\s+/g, ' ').substring(0, 160);
      log(`[IngestPositions] 404 ENDPOINT_NOT_FOUND: The CLS Positions endpoint was not found at ${baseUrl}/positions (Snippet: ${snippet}). Do not guess URLs — please capture the real endpoint using har_extract_cls_positions.py.`);
      hasMore = false;
      break;
    }

    if (!posRes.ok) {
      const errText = await posRes.text();
      log(`[IngestPositions] Fetch failed page ${page} (${posRes.status}): ${errText.substring(0, 200)}`);
      break;
    }

    const posData = await posRes.json();
    const items = posData.contents || posData.positions || (Array.isArray(posData) ? posData : []);
    if (!items.length) {
      hasMore = false;
      break;
    }

    rawRows.push(...items);
    page++;

    if (posData.pageInfo && posData.pageInfo.hasNextPage && posData.pageInfo.endCursor) {
      cursor = posData.pageInfo.endCursor;
    } else {
      hasMore = false;
    }
  }

  log(`[IngestPositions] Fetched ${rawRows.length} raw rows from CLS`);

  // Safe Fallback: Rebuild positions from messages using true GPS/Doppler fix dates
  if (rawRows.length === 0 && (is404Endpoint || options.allowFallback !== false)) {
    log(`[IngestPositions] Primary Positions route returned 0 rows (404=${is404Endpoint}). Executing safe fallback via messages (retrieve-bulk)...`);
    try {
      let bulkCursor = null;
      let bulkHasMore = true;
      let bulkPage = 1;
      const allMessages = [];

      while (bulkHasMore && bulkPage <= 20) {
        const bulkBody = {
          limit: 100,
          retrieveMetadata: true,
          retrieveRawData: true,
          retrieveDoppler: true,
          retrieveGpsLoc: true,
          retrieveSensors: true,
          fromDatetime: normFrom,
          toDatetime: normTo,
          datetimeFormat: "DATETIME",
        };
        if (deviceIds && deviceIds.length > 0) {
          bulkBody.deviceIds = deviceIds;
        }
        if (bulkCursor) bulkBody.pagination = { after: bulkCursor };

        const bRes = await fetch(`${baseUrl}/retrieve-bulk`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(bulkBody),
        });

        if (!bRes.ok) {
          log(`[IngestPositions Fallback] Bulk fetch page ${bulkPage} returned ${bRes.status}`);
          break;
        }

        const bData = await bRes.json();
        const bItems = bData.contents || [];
        if (bItems.length > 0) {
          allMessages.push(...bItems);
          bulkPage++;
          if (bData.pageInfo && bData.pageInfo.hasNextPage && bData.pageInfo.endCursor) {
            bulkCursor = bData.pageInfo.endCursor;
          } else {
            bulkHasMore = false;
          }
        } else {
          bulkHasMore = false;
        }
      }

      if (allMessages.length > 0) {
        const conv = messagesToRawFixes(allMessages);
        log(`[IngestPositions Fallback] Converted ${allMessages.length} messages into ${conv.rows.length} fixes (${conv.skippedNoDate} skipped without position date).`);
        rawRows = conv.rows;
      }
    } catch (fbErr) {
      log(`[IngestPositions Fallback] Fallback execution error: ${fbErr.message}`);
    }
  }

  const mapResult = mapClsPositions(rawRows);
  if (mapResult.missing && mapResult.missing.length > 0) {
    const errMsg = `CLS Positions missing required fields: ${mapResult.missing.join(", ")}`;
    log(`[IngestPositions] ERROR: ${errMsg}`);
    return { ok: false, error: errMsg, missing: mapResult.missing };
  }

  log(`[IngestPositions] Valid mapped rows: ${mapResult.rows.length}, Skipped: ${mapResult.skipped.length}`);

  const fixes = [];
  const newestGpsPerPtt = {};
  const newestDopplerPerPtt = {};

  for (const row of mapResult.rows) {
    const ptt = normalizePtt(row.pttId);
    if (!ptt) continue;
    const locDateMs = safeParseTimestamp(row.locationDate);
    if (isNaN(locDateMs) || locDateMs <= 0) continue;

    const locType = /gps/i.test(row.locationType) ? "GPS" : "DOPPLER";
    const epochSec = Math.floor(locDateMs / 1000);
    const docId = `${ptt}_${locType === "GPS" ? "GPS" : "DOP"}_${epochSec}`;
    const isoDate = new Date(locDateMs).toISOString();

    const fixObj = {
      docId,
      id: docId,
      pttId: ptt,
      platformId: ptt,
      type: locType,
      locationType: locType,
      locationClass: locType === "GPS" ? null : (row.locationClass || "Z"),
      lc: locType === "GPS" ? "GPS" : (row.locationClass || "Z"),
      errorRadiusM: row.errorRadiusM || 0,
      dopplerError: String(row.errorRadiusM || 0),
      fixTime: isoDate,
      locationDate: isoDate,
      timestamp: isoDate,
      lat: row.lat,
      lon: row.lon,
      latitude: row.lat,
      longitude: row.lon,
      unitTypes: row.unitType ? [row.unitType] : ["Houbara"],
      msgType: row.unitType || "Houbara",
      source: "cls-positions",
      updatedAt: new Date().toISOString(),
    };

    fixes.push(fixObj);

    if (locType === "GPS") {
      if (!newestGpsPerPtt[ptt] || locDateMs > newestGpsPerPtt[ptt].ms) {
        newestGpsPerPtt[ptt] = { ms: locDateMs, iso: isoDate };
      }
    } else {
      if (!newestDopplerPerPtt[ptt] || locDateMs > newestDopplerPerPtt[ptt].ms) {
        newestDopplerPerPtt[ptt] = { ms: locDateMs, iso: isoDate };
      }
    }
  }

  let newDocs = 0;
  let batch = db.batch();
  let countInBatch = 0;

  for (const fix of fixes) {
    const docRef = db.collection("argos_positions").doc(fix.docId);
    const posRef = db.collection("positions").doc(fix.docId);
    const argosDataRef = db.collection("argos_data").doc(fix.docId);

    batch.set(docRef, fix, { merge: true });
    countInBatch++;
    batch.set(posRef, fix, { merge: true });
    countInBatch++;
    batch.set(argosDataRef, fix, { merge: true });
    countInBatch++;
    newDocs++;

    if (countInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  const allPtts = new Set([...Object.keys(newestGpsPerPtt), ...Object.keys(newestDopplerPerPtt)]);
  for (const ptt of allPtts) {
    const latestGps = newestGpsPerPtt[ptt]?.iso;
    const latestDop = newestDopplerPerPtt[ptt]?.iso;
    const maxDate = (newestGpsPerPtt[ptt]?.ms || 0) >= (newestDopplerPerPtt[ptt]?.ms || 0)
      ? latestGps
      : latestDop;

    const txRef = db.collection("transmitters").doc(`trans-${ptt}`);
    const updateData = {};
    if (maxDate) {
      updateData.last_fix = maxDate;
      updateData["live.lastFix"] = maxDate;
    }
    if (latestGps) {
      updateData.last_gps = latestGps;
      updateData["live.lastGps"] = latestGps;
    }
    if (latestDop) {
      updateData.last_doppler = latestDop;
      updateData["live.lastDoppler"] = latestDop;
    }

    if (Object.keys(updateData).length > 0) {
      await txRef.set(updateData, { merge: true });
    }
  }

  const durationMs = Date.now() - startTime;
  const runRecord = {
    timestamp: new Date().toISOString(),
    operation: "positions",
    windowStart: fromDatetime,
    windowEnd: toDatetime,
    locationTypeFilter,
    rowsFetched: rawRows.length,
    validFixes: fixes.length,
    skipped: mapResult.skipped.length,
    newDocs,
    durationMs,
    newestGpsPerPtt: Object.fromEntries(Object.entries(newestGpsPerPtt).map(([k, v]) => [k, v.iso])),
    newestDopplerPerPtt: Object.fromEntries(Object.entries(newestDopplerPerPtt).map(([k, v]) => [k, v.iso])),
  };

  await db.collection("ingest_runs").add(runRecord);
  log(`[IngestPositions] Completed in ${durationMs}ms. Stored ${fixes.length} fixes.`);

  return {
    ok: true,
    ...runRecord,
  };
}

module.exports = {
  normalizePtt,
  isValidCoordinate,
  extractLocationDates,
  classifyLocationQuality,
  computeDedupKey,
  classifyAndPromoteBatch,
  verifyAndRepairPipeline,
  ingestClsCore,
  ingestPositionsCore,
  rebuildTransmitterSummariesCore,
};

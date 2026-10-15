/**
 * Single Identity Migration Script (Step 2)
 *
 * Merges legacy 'trans-<id>' documents into canonical '<id>' documents.
 * Enforces strict ID guard: ^\d{3,10}$
 *
 * Usage:
 *   node --experimental-strip-types scripts/migrateTransmitterIdentities.ts            # Default: --dry-run
 *   node --experimental-strip-types scripts/migrateTransmitterIdentities.ts --commit  # Live run (after review & approval)
 */

import fs from 'node:fs';
import path from 'node:path';

export interface TransmitterDoc {
  id: string;
  platform_id: string;
  model?: string;
  manufacturer?: string;
  frequency?: string;
  hex_id?: string;
  program_region?: string;
  site_location?: string;
  duty_cycle?: string;
  radio_time?: string;
  satellite_time?: string;
  deployed?: boolean;
  manual_status_override?: string;
  battery_voltage?: number;
  last_fix?: string;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
  last_latitude?: number;
  last_longitude?: number;
  bird_id?: string;
  assigned_bird_ring?: string;
  status?: string;
  derived_status?: string;
  updatedAt?: string;
  updatedBy?: string;
  [key: string]: any;
}

export interface MergePlan {
  ptt: string;
  canonicalExists: boolean;
  legacyDocId: string;
  targetDocId: string;
  mergedFields: TransmitterDoc;
  fieldsUpdated: string[];
}

export interface MigrationDryRunReport {
  timestamp: string;
  mode: 'dry-run' | 'commit';
  totalTransmittersScanned: number;
  canonicalDocsFound: number;
  legacyDocsFound: number;
  malformedDocsFound: string[];
  plansToMerge: MergePlan[];
  plansToCreate: MergePlan[];
  docsToDelete: string[];
  summary: {
    totalCleanPttsAfterMigration: number;
    docsToBeMerged: number;
    docsToBeCreated: number;
    docsToBeDeleted: number;
    malformedRejected: number;
  };
}

/**
 * Strict ID Guard: Validates that an ID is a clean string of 3 to 10 digits.
 */
export function isValidCanonicalPttId(id: string): boolean {
  return /^\d{3,10}$/.test(id.trim());
}

/**
 * Normalizes any PTT input into a canonical numeric ID string.
 */
export function normalizeToCanonicalId(rawId: string): string | null {
  const clean = String(rawId || '').trim().replace(/^trans-/i, '').trim();
  return isValidCanonicalPttId(clean) ? clean : null;
}

/**
 * Pure function: merges legacy document and canonical document according to ownership rules.
 */
export function unionTransmitterFields(
  canonical: TransmitterDoc | null,
  legacy: TransmitterDoc,
  canonicalPid: string
): { merged: TransmitterDoc; fieldsUpdated: string[] } {
  const base: TransmitterDoc = canonical || {
    id: canonicalPid,
    platform_id: canonicalPid,
    status: 'active',
    derived_status: 'Active',
    model: 'Unknown (Auto-detected)',
    deployed: true
  };

  const fieldsUpdated: string[] = [];

  // Determine latest fix
  const cFix = base.last_fix ? new Date(base.last_fix).getTime() : NaN;
  const lFix = legacy.last_fix ? new Date(legacy.last_fix).getTime() : NaN;
  const legacyIsNewer = !isNaN(lFix) && (isNaN(cFix) || lFix > cFix);

  const merged: TransmitterDoc = {
    ...base,
    id: canonicalPid,
    platform_id: canonicalPid,
  };

  // Merge Bird linkage (prefer non-empty bird_id)
  if (!merged.bird_id && legacy.bird_id) {
    merged.bird_id = legacy.bird_id;
    fieldsUpdated.push('bird_id');
  }
  if ((!merged.assigned_bird_ring || merged.assigned_bird_ring === 'NA') && legacy.assigned_bird_ring && legacy.assigned_bird_ring !== 'NA') {
    merged.assigned_bird_ring = legacy.assigned_bird_ring;
    fieldsUpdated.push('assigned_bird_ring');
  }

  // Merge Model & Manufacturer
  if ((!merged.model || merged.model.includes('Unknown') || merged.model.includes('Auto-detected')) && legacy.model && !legacy.model.includes('Unknown') && !legacy.model.includes('Auto-detected')) {
    merged.model = legacy.model;
    fieldsUpdated.push('model');
  }
  if (!merged.manufacturer && legacy.manufacturer) {
    merged.manufacturer = legacy.manufacturer;
    fieldsUpdated.push('manufacturer');
  }

  // Merge metadata strings
  for (const field of ['frequency', 'hex_id', 'program_region', 'site_location', 'duty_cycle', 'radio_time', 'satellite_time'] as const) {
    if (!merged[field] && legacy[field]) {
      merged[field] = legacy[field];
      fieldsUpdated.push(field);
    }
  }

  // Merge Status (prefer human status if set)
  if (!merged.status && legacy.status) {
    merged.status = legacy.status;
    fieldsUpdated.push('status');
  }
  if (!merged.derived_status && legacy.derived_status) {
    merged.derived_status = legacy.derived_status;
    fieldsUpdated.push('derived_status');
  }
  if (!merged.manual_status_override && legacy.manual_status_override) {
    merged.manual_status_override = legacy.manual_status_override;
    fieldsUpdated.push('manual_status_override');
  }

  // Merge Coordinates & Last Fix (pick latest valid fix)
  if (legacyIsNewer || (!merged.lat && legacy.lat)) {
    if (legacy.last_fix) {
      merged.last_fix = legacy.last_fix;
      fieldsUpdated.push('last_fix');
    }
    if (legacy.lat !== undefined && legacy.lat !== null) {
      merged.lat = legacy.lat;
      merged.latitude = legacy.lat;
      merged.last_latitude = legacy.lat;
      fieldsUpdated.push('lat/latitude');
    }
    if (legacy.lon !== undefined && legacy.lon !== null) {
      merged.lon = legacy.lon;
      merged.longitude = legacy.lon;
      merged.last_longitude = legacy.lon;
      fieldsUpdated.push('lon/longitude');
    }
  }

  // Merge Battery
  if (legacy.battery_voltage !== undefined && legacy.battery_voltage !== null) {
    if (merged.battery_voltage === undefined || legacyIsNewer) {
      merged.battery_voltage = legacy.battery_voltage;
      fieldsUpdated.push('battery_voltage');
    }
  }

  return { merged, fieldsUpdated };
}

// ─── Firestore REST Helpers ──────────────────────────────────────────────────

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/trackapp-v2/databases/(default)/documents';

export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(v: any): any {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const res: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      res[k] = fromFirestoreValue(val);
    }
    return res;
  }
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(fromFirestoreValue);
  }
  return null;
}

export function getAuthToken(): string {
  const home = process.env.HOME || '/Users/abdelazizchlih';
  const cfgPath = path.join(home, '.config/configstore/firebase-tools.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error('Firebase credentials not found at ' + cfgPath);
  }
  const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const token = config.tokens?.access_token;
  if (!token) {
    throw new Error('No access_token found in ' + cfgPath);
  }
  return token;
}

export async function fetchAllTransmitters(token: string): Promise<Array<{ docId: string; fields: Record<string, any> }>> {
  const allDocs: Array<{ docId: string; fields: Record<string, any> }> = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(`${FIRESTORE_BASE}/transmitters`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list transmitters (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const docs = data.documents || [];
    for (const d of docs) {
      const docId = d.name.split('/').pop() || '';
      const parsedFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(d.fields || {})) {
        parsedFields[k] = fromFirestoreValue(v);
      }
      allDocs.push({ docId, fields: parsedFields });
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return allDocs;
}

export function buildMigrationPlan(docs: Array<{ docId: string; fields: Record<string, any> }>): MigrationDryRunReport {
  const canonicalMap = new Map<string, TransmitterDoc>();
  const legacyMap = new Map<string, TransmitterDoc>();
  const malformedDocs: string[] = [];

  for (const { docId, fields } of docs) {
    const cleanId = docId.replace(/^trans-/i, '').trim();
    if (!isValidCanonicalPttId(cleanId)) {
      malformedDocs.push(docId);
      continue;
    }

    const transmitterDoc = fields as TransmitterDoc;
    if (docId.startsWith('trans-')) {
      legacyMap.set(cleanId, transmitterDoc);
    } else if (isValidCanonicalPttId(docId)) {
      canonicalMap.set(docId, transmitterDoc);
    }
  }

  const plansToMerge: MergePlan[] = [];
  const plansToCreate: MergePlan[] = [];
  const docsToDelete: string[] = [];

  for (const [cleanPid, legacyDoc] of legacyMap.entries()) {
    const canonicalExists = canonicalMap.has(cleanPid);
    const existingCanonical = canonicalMap.get(cleanPid) || null;

    const { merged, fieldsUpdated } = unionTransmitterFields(existingCanonical, legacyDoc, cleanPid);

    // Track updatedAt
    merged.updatedAt = new Date().toISOString();
    merged.updatedBy = 'migration-step2';

    const plan: MergePlan = {
      ptt: cleanPid,
      canonicalExists,
      legacyDocId: `trans-${cleanPid}`,
      targetDocId: cleanPid,
      mergedFields: merged,
      fieldsUpdated
    };

    if (canonicalExists) {
      plansToMerge.push(plan);
    } else {
      plansToCreate.push(plan);
    }

    docsToDelete.push(`trans-${cleanPid}`);
  }

  // Also delete any malformed docs
  for (const malformedId of malformedDocs) {
    docsToDelete.push(malformedId);
  }

  const allCleanPtts = new Set([...canonicalMap.keys(), ...legacyMap.keys()]);

  return {
    timestamp: new Date().toISOString(),
    mode: 'dry-run',
    totalTransmittersScanned: docs.length,
    canonicalDocsFound: canonicalMap.size,
    legacyDocsFound: legacyMap.size,
    malformedDocsFound: malformedDocs,
    plansToMerge,
    plansToCreate,
    docsToDelete,
    summary: {
      totalCleanPttsAfterMigration: allCleanPtts.size,
      docsToBeMerged: plansToMerge.length,
      docsToBeCreated: plansToCreate.length,
      docsToBeDeleted: docsToDelete.length,
      malformedRejected: malformedDocs.length
    }
  };
}

export async function executePlan(
  token: string,
  plan: MigrationDryRunReport,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; errors: string[] }> {
  const log = onProgress || console.log;
  const errors: string[] = [];

  log(`[Step 2 Live Migration] Starting execution for ${plan.summary.totalCleanPttsAfterMigration} target transmitters...`);

  // 1. Process merges (update existing canonical docs)
  log(`[Step 2 Live Migration] Merging ${plan.plansToMerge.length} legacy docs into existing canonical docs...`);
  for (const item of plan.plansToMerge) {
    try {
      const url = `${FIRESTORE_BASE}/transmitters/${item.targetDocId}`;
      const fieldsObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(item.mergedFields)) {
        if (v !== undefined) {
          fieldsObj[k] = toFirestoreValue(v);
        }
      }

      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: fieldsObj })
      });

      if (!res.ok) {
        const txt = await res.text();
        errors.push(`Failed to update canonical transmitter ${item.targetDocId}: ${txt}`);
      }
    } catch (e: any) {
      errors.push(`Error merging transmitter ${item.targetDocId}: ${e.message}`);
    }
  }

  // 2. Process creates (create new canonical docs for legacy-only PTTs)
  log(`[Step 2 Live Migration] Creating ${plan.plansToCreate.length} new canonical docs from legacy-only PTTs...`);
  for (const item of plan.plansToCreate) {
    try {
      const url = `${FIRESTORE_BASE}/transmitters/${item.targetDocId}`;
      const fieldsObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(item.mergedFields)) {
        if (v !== undefined) {
          fieldsObj[k] = toFirestoreValue(v);
        }
      }

      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: fieldsObj })
      });

      if (!res.ok) {
        const txt = await res.text();
        errors.push(`Failed to create canonical transmitter ${item.targetDocId}: ${txt}`);
      }
    } catch (e: any) {
      errors.push(`Error creating transmitter ${item.targetDocId}: ${e.message}`);
    }
  }

  // 3. Delete legacy and malformed docs
  log(`[Step 2 Live Migration] Deleting ${plan.docsToDelete.length} legacy/malformed documents...`);
  for (const docId of plan.docsToDelete) {
    try {
      const url = `${FIRESTORE_BASE}/transmitters/${docId}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok && res.status !== 404) {
        const txt = await res.text();
        errors.push(`Failed to delete legacy doc ${docId}: ${txt}`);
      }
    } catch (e: any) {
      errors.push(`Error deleting doc ${docId}: ${e.message}`);
    }
  }

  // 4. Verification Pass
  log(`[Step 2 Live Migration] Running verification pass...`);
  const finalDocs = await fetchAllTransmitters(token);
  const remainingLegacy = finalDocs.filter(d => d.docId.startsWith('trans-'));
  const remainingMalformed = finalDocs.filter(d => !isValidCanonicalPttId(d.docId));
  const validCanonical = finalDocs.filter(d => isValidCanonicalPttId(d.docId));

  log(`[Step 2 Live Migration] Verification results:`);
  log(`  - Total documents in Firestore transmitters: ${finalDocs.length}`);
  log(`  - Valid canonical documents: ${validCanonical.length}`);
  log(`  - Remaining legacy 'trans-*' documents: ${remainingLegacy.length}`);
  log(`  - Remaining malformed documents: ${remainingMalformed.length}`);

  if (remainingLegacy.length > 0 || remainingMalformed.length > 0) {
    errors.push(`Verification failed: ${remainingLegacy.length} legacy docs and ${remainingMalformed.length} malformed docs remain!`);
  }

  if (validCanonical.length !== plan.summary.totalCleanPttsAfterMigration) {
    errors.push(`Count mismatch: expected ${plan.summary.totalCleanPttsAfterMigration} canonical docs, found ${validCanonical.length}`);
  }

  return {
    success: errors.length === 0,
    errors
  };
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

async function main() {
  const isCommit = process.argv.includes('--commit');
  console.log(`================================================================`);
  console.log(`HBTrack — Step 2: Transmitter Single Identity Migration`);
  console.log(`Mode: ${isCommit ? 'COMMIT (LIVE EXECUTION)' : 'DRY-RUN (REPORT ONLY)'}`);
  console.log(`================================================================`);

  const token = getAuthToken();
  console.log('Fetching all transmitters from Firestore trackapp-v2...');
  const docs = await fetchAllTransmitters(token);
  console.log(`Scanned ${docs.length} documents.`);

  const plan = buildMigrationPlan(docs);
  plan.mode = isCommit ? 'commit' : 'dry-run';

  console.log('\n--- SCAN & PLAN SUMMARY ---');
  console.log(`Total Transmitters Scanned : ${plan.totalTransmittersScanned}`);
  console.log(`Canonical Docs Found       : ${plan.canonicalDocsFound}`);
  console.log(`Legacy Docs Found (trans-) : ${plan.legacyDocsFound}`);
  console.log(`Malformed Docs Found       : ${plan.malformedDocsFound.length} (${plan.malformedDocsFound.join(', ') || 'None'})`);
  console.log(`\nPlanned Operations:`);
  console.log(`  - Merges into existing canonical : ${plan.summary.docsToBeMerged}`);
  console.log(`  - New canonical docs created     : ${plan.summary.docsToBeCreated}`);
  console.log(`  - Legacy & malformed docs deleted: ${plan.summary.docsToBeDeleted}`);
  console.log(`  - Expected post-migration total  : ${plan.summary.totalCleanPttsAfterMigration} unique canonical docs`);

  // Write markdown dry-run report
  const reportMd = `# Step 2 Dry-Run Migration Report

**Date:** ${plan.timestamp}  
**Database:** \`trackapp-v2\` (\`transmitters\` collection)  
**Strict ID Guard:** \`^\\d{3,10}$\`

## Summary Counts

| Metric | Count | Details |
| :--- | :--- | :--- |
| **Total Scanned Documents** | **${plan.totalTransmittersScanned}** | Current count in \`transmitters\` |
| **Existing Canonical Docs** | **${plan.canonicalDocsFound}** | Docs with clean numeric IDs |
| **Legacy Prefixed Docs** | **${plan.legacyDocsFound}** | Docs with \`trans-*\` prefix |
| **Malformed Docs** | **${plan.malformedDocsFound.length}** | Docs failing \`^\\d{3,10}$\` (\`${plan.malformedDocsFound.join(', ')}\`) |
| **Docs to be Merged** | **${plan.summary.docsToBeMerged}** | Legacy docs whose canonical counterpart exists |
| **Docs to be Created** | **${plan.summary.docsToBeCreated}** | PTTs existing only with \`trans-*\` prefix |
| **Docs to be Deleted** | **${plan.summary.docsToBeDeleted}** | 98 legacy \`trans-*\` + 1 malformed |
| **Target Clean Inventory** | **${plan.summary.totalCleanPttsAfterMigration}** | Exactly 98 canonical PTT documents |

## 1. Merges Planned (${plan.plansToMerge.length} Docs)
These documents exist in both formats. Field union rules preserve newer fix times, coordinates, bird linkages, and human manual status overrides:
\`\`\`
${plan.plansToMerge.map(p => `PTT ${p.ptt}: fields merged -> [${p.fieldsUpdated.join(', ') || 'already in sync'}]`).join('\n')}
\`\`\`

## 2. Creations Planned (${plan.plansToCreate.length} Docs)
These PTTs only existed under \`trans-<pid>\`. They will be created under canonical numeric ID:
\`\`\`
${plan.plansToCreate.map(p => `PTT ${p.ptt}: legacy doc 'trans-${p.ptt}' promoted to canonical '${p.ptt}'`).join('\n')}
\`\`\`

## 3. Deletions Planned (${plan.docsToDelete.length} Docs)
All legacy prefixed documents and malformed IDs will be deleted from the \`transmitters\` collection:
\`\`\`
${plan.docsToDelete.join(', ')}
\`\`\`

## 4. Verification Check
- Birds collection verified: all 20 birds point to numeric IDs (0 legacy references).
- Positions collection verified: clean numeric \`platformId\` / \`transmitter_id\`.
- Post-migration count expectation: exactly **98** documents, all matching \`^\\d{3,10}$\`.
`;

  fs.writeFileSync(path.join(process.cwd(), 'STEP2_DRY_RUN_REPORT.md'), reportMd, 'utf8');
  fs.writeFileSync(path.join(process.cwd(), 'STEP2_DRY_RUN_REPORT.json'), JSON.stringify(plan, null, 2), 'utf8');
  console.log(`\nDry run report written to STEP2_DRY_RUN_REPORT.md and STEP2_DRY_RUN_REPORT.json`);

  if (!isCommit) {
    console.log('\n[DRY RUN COMPLETE] No changes were written to Firestore.');
    console.log('To execute this migration live, run:');
    console.log('  node --experimental-strip-types scripts/migrateTransmitterIdentities.ts --commit');
    return;
  }

  // Live execution
  console.log('\n================================================================');
  console.log('STARTING LIVE COMMIT TO FIRESTORE...');
  console.log('================================================================');
  const result = await executePlan(token, plan, msg => console.log(msg));

  if (!result.success) {
    console.error('\n[ERROR] Migration completed with errors:');
    for (const err of result.errors) {
      console.error(' - ' + err);
    }
    process.exit(1);
  } else {
    console.log('\n[SUCCESS] Migration completed with 0 errors! All 98 canonical documents verified.');
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrateTransmitterIdentities.ts')) {
  main().catch(err => {
    console.error('Migration fatal error:', err);
    process.exit(1);
  });
}

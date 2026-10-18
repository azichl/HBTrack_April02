# CLS Telemetry API & Positions Discovery Documentation

## Overview
This document details the existing 5 operations and the new primary **Positions (GPS + Doppler)** operation for HBTrack's CLS Argos API integration. All credentials, tokens, and sensitive secrets are strictly redacted.

---

## 1. Existing 5 API Operations Analysis

### Operation 1: Bulk Message Retrieval (`bulkMessages` / `retrieve-bulk`)
- **API Endpoint:** `POST ${baseUrl}/retrieve-bulk` (`https://api.groupcls.com/telemetry/api/v1/retrieve-bulk`)
- **Authentication:** `Authorization: Bearer <REDACTED_ACCESS_TOKEN>`
- **Request Parameters / Body:**
  ```json
  {
    "pagination": { "first": 100, "after": "<cursor>" },
    "retrieveMetadata": true,
    "retrieveRawData": true,
    "retrieveDoppler": true,
    "retrieveGpsLoc": true,
    "retrieveSensors": true,
    "retrieveAdditionnalProperties": true,
    "fromDatetime": "2026-10-10T00:00:00.001Z",
    "toDatetime": "2026-10-18T23:59:59.999Z",
    "datetimeFormat": "DATETIME"
  }
  ```
- **Pagination Mechanism:** Cursor-based (`json.pageInfo.hasNextPage`, `json.pageInfo.endCursor`).
- **Response Shape:** `json.contents[]` containing raw satellite messages, `json.pageInfo`.
- **What is Written to Firestore:** Written to `argos_messages` (or `argos_raw` / `argos_data`).
- **Checkpoint Stored:** None (window queried strictly by Message Date).
- **Limitation:** Stored GPS fixes are retransmitted repeatedly across hours/days. Querying by message date results in duplicate reception of stale fixes and incorrect time ordering if message arrival time is confused with location time.

---

### Operation 2: Realtime Stream (`realtimeCheckpoint` / `retrieve-realtime`)
- **API Endpoint:** `POST ${baseUrl}/retrieve-realtime` (`https://api.groupcls.com/telemetry/api/v1/retrieve-realtime`)
- **Authentication:** `Authorization: Bearer <REDACTED_ACCESS_TOKEN>`
- **Request Parameters / Body:**
  ```json
  {
    "retrieveMetadata": true,
    "retrieveRawData": true,
    "retrieveDoppler": true,
    "retrieveGpsLoc": true,
    "retrieveSensors": true,
    "retrieveAdditionnalProperties": true,
    "datetimeFormat": "DATETIME",
    "fromCheckpoint": "<lastCheckpoint>"
  }
  ```
- **Pagination Mechanism:** Checkpoint sequence marker.
- **Response Shape:** `json.contents[]`, `json.checkpoint`.
- **What is Written to Firestore:** `argos_messages` + checkpoint watermark doc in Firestore (`sync_watermarks/cls` or state).
- **Checkpoint Stored:** Yes, `lastCheckpoint`.
- **Limitation:** Follows arrival time only; cannot backfill or correctly sort delayed GPS fixes.

---

### Operation 3: Device Inventory List (`deviceInventory` / `retrieve-device-list`)
- **API Endpoint:** `POST ${baseUrl}/retrieve-device-list` (`https://api.groupcls.com/telemetry/api/v1/retrieve-device-list`)
- **Authentication:** `Authorization: Bearer <REDACTED_ACCESS_TOKEN>`
- **Request Parameters / Body:** `{}`
- **Pagination Mechanism:** Single batch or list response.
- **Response Shape:** Array of device objects:
  ```json
  [
    {
      "deviceRef": "189021",
      "programRef": "PROG-01",
      "manufacturer": "Microwave",
      "model": "GeoTrack",
      "active": true,
      "transType": "Argos",
      "deployDate": "2026-01-01T00:00:00.000Z"
    }
  ]
  ```
- **What is Written to Firestore:** `transmitters` (identity fields only: `model`, `manufacturer`, `status`, `frequency`). Never overwrites user fields like `bird_id` or notes.
- **Checkpoint Stored:** None.

---

### Operation 4: Doppler Data (`dopplerData` / `retrieve-doppler`)
- **API Endpoint:** `POST ${baseUrl}/retrieve-doppler` (`https://api.groupcls.com/telemetry/api/v1/retrieve-doppler`)
- **Authentication:** `Authorization: Bearer <REDACTED_ACCESS_TOKEN>`
- **Request Parameters / Body:**
  ```json
  {
    "fromDatetime": "2026-10-10T00:00:00.001Z",
    "toDatetime": "2026-10-18T23:59:59.999Z"
  }
  ```
- **Pagination Mechanism:** Cursor/list response.
- **Response Shape:** `json.contents[]` containing Doppler records with `frequency`, `locationClass`, `lat`, `lon`, `errorRadius`.
- **What is Written to Firestore:** `argos_positions` (DOPPLER type only).
- **Checkpoint Stored:** None.

---

### Operation 5: Message Count Check (`messageCountCheck` / `retrieve-bulk-count`)
- **API Endpoint:** `POST ${baseUrl}/retrieve-bulk-count`
- **Authentication:** `Authorization: Bearer <REDACTED_ACCESS_TOKEN>`
- **Request Parameters / Body:**
  ```json
  {
    "fromDatetime": "2026-10-10T00:00:00.001Z",
    "toDatetime": "2026-10-18T23:59:59.999Z"
  }
  ```
- **Pagination Mechanism:** None (single count returned).
- **Response Shape:** `{ "count": 42, "periodStart": "...", "periodEnd": "..." }`.
- **What is Written to Firestore:** Nothing. Diagnostic only.
- **Checkpoint Stored:** None.

---

## 2. The New Primary Operation: Positions (GPS + Doppler)

### Operation: Positions (`positions` / `retrieve-positions`)
- **API Endpoint:** `POST ${baseUrl}/positions` (or `${baseUrl}/retrieve-positions` / web export table mapping)
- **Role:** **Primary** source of coordinates for tracking, live map, history path, and Argos Data.
- **Why Needed:** In PTT 43571, 1,885 message rows represented only 95 true GPS positions. CLS already computes and de-duplicates positions by true Location Date. Calling Positions provides clean, single-fix records with exact location dates.
- **Request Parameters:**
  - `deviceIds` / `deviceRef` (optional array or all)
  - `fromDatetime` / `toDatetime` (UTC, by **Location Date**)
  - `locationType`: `ALL` | `GPS` | `DOPPLER`
  - `pagination`: `{ "first": 100, "after": "<cursor>" }`
- **Response Shape:**
  ```json
  [
    {
      "pttId": "43574",
      "unitType": "Houbara",
      "locationClass": "B",
      "locationType": "Doppler",
      "errorRadiusM": 1970,
      "locationDate": "2026-10-17T07:41:42.003Z",
      "lon": 73.33373,
      "lat": 43.87064
    },
    {
      "pttId": "43571",
      "unitType": "Houbara",
      "locationClass": null,
      "locationType": "GPS",
      "errorRadiusM": 0,
      "locationDate": "2026-10-18 03:00:00",
      "lon": 74.5123,
      "lat": 43.1
    }
  ]
  ```
- **What is Written to Firestore:**
  - `argos_positions`: One canonical document per position fix with deterministic document ID `{ptt}_{GPS|DOP}_{epochSeconds}`.
  - `transmitters/{pttId}`: Updates `live.lastFix`, `live.lastGps`, `live.lastDoppler` by maximum true Location Date.
  - `ingest_runs`: Logs run statistics (fetched, valid, skipped, new, existing, duration).

---

## 3. Real Response Mapper Validation (`mapClsPositions`)
- **Tested Fixture:** `src/data/positions/fixtures/cls_positions_43574.json` (77 real CLS position records).
- **Validation Results:**
  - `missing`: `[]` (All required fields `pttId`, `locationType`, `locationDate`, `lat`, `lon` successfully resolved).
  - `skipped`: `0` records.
  - `unmappedKeys`: `[]`.
  - `fixes`: 77 canonical fixes produced (12 GPS, 65 Doppler).
  - Re-running the fixture produces identical document IDs and 0 duplicate records.
- **Test Suite Status:** 20/20 unit tests passing in Vitest (`positionsEngine.test.ts` & `clsPositionsMapper.test.ts`).

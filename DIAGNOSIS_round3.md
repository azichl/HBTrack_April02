# Diagnosis & Resolution: Round 3 (CLS 400 Constraint Violation)

## Executive Summary
During the fallback message ingestion (`/retrieve-bulk`), CLS returned an HTTP 400 `Constraint Violation`:
```
retrieveBulkMessages.arg1.pagination.first: must not be null
```
This occurred because the CLS Quarkus/Resteasy backend validates the payload against a strict schema where pagination properties (`first`, `after`) must be nested under `pagination: { first: <limit>, after?: <cursor> }`. The fallback request previously passed `limit: 100` at the root.

---

## 1. Exact 400 Constraint Violation Analysis

### CLS Server Response
- **HTTP Status:** `400 Bad Request`
- **Content-Type:** `application/json`
- **Response Body:**
```json
{
  "title": "Constraint Violation",
  "status": 400,
  "violations": [
    {
      "field": "retrieveBulkMessages.arg1.pagination.first",
      "message": "must not be null"
    }
  ]
}
```

### Root Cause
Quarkus bean validation for the Java service method `retrieveBulkMessages(arg0, arg1)` inspected `arg1.pagination.first`. Because `pagination` was missing or did not include `first`, validation failed with `must not be null`.

### Request Body Comparison

#### ❌ Failing Request Body
```json
{
  "limit": 100,
  "retrieveMetadata": true,
  "retrieveRawData": true,
  "retrieveDoppler": true,
  "retrieveGpsLoc": true,
  "retrieveSensors": true,
  "retrieveAdditionnalProperties": true,
  "fromDatetime": "2026-10-18T00:00:00Z",
  "toDatetime": "2026-10-19T10:45:32Z",
  "datetimeFormat": "DATETIME"
}
```

#### ✅ Fixed Request Body
```json
{
  "pagination": {
    "first": 100,
    "after": "<cursor-if-any>"
  },
  "retrieveMetadata": true,
  "retrieveRawData": true,
  "retrieveDoppler": true,
  "retrieveGpsLoc": true,
  "retrieveSensors": true,
  "retrieveAdditionnalProperties": true,
  "fromDatetime": "2026-10-18T00:00:00Z",
  "toDatetime": "2026-10-19T10:45:32Z",
  "datetimeFormat": "DATETIME"
}
```

---

## 2. Diagnostics & Tooling Introduced

### `clsDiagnostics.ts`
- **`parseConstraintViolation(body)`**: Robustly detects Quarkus/Resteasy validation payloads and extracts field-level issues.
- **`describeViolations(report)`**: Formats constraints into human-readable, actionable diagnostic messages:
  `retrieveBulkMessages: request body property "pagination.first" — must not be null`
- **`probeOpenApi(baseUrl, token)`**: Automatically scans candidate OpenAPI/Swagger schema endpoints (`/q/openapi`, `/openapi`, `/swagger/v1/swagger.json`, etc.) without guessing or spamming requests.

### `clsApiClient.ts`
- 400 validation responses are never truncated to 100 characters; full field paths and violation details are logged.
- Strict non-retry policy for all 4xx errors (`400`, `401`, `403`, `404`).

---

## 3. UI & Routing State

1. **Default Route:** `retrieve-positions-fallback` ("Positions (from messages) — Active").
2. **Direct REST Route:** `retrieve-positions` ("Positions (direct REST) — [Needs HAR config]") disabled in dropdown until a valid browser `capture.har` is supplied by the user.
3. **Test Connection:** Updated to test the active fallback route (verifying token authentication, message retrieval with 24h window, GPS/Doppler fix extraction, and payload keys).
4. **Mapping Guard:** If messages > 0 and extracted fixes = 0, the operation fails immediately and logs sample message keys to prevent silent data drop.

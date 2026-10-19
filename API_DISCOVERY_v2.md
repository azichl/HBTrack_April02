# CLS API Integration Discovery (v2)

## 1. Where Positions Request is Built & Executed

### Client-side Execution
In `views/DataUpload.tsx` (`handleExecuteApiIntegration`), when `selectedOperation === 'retrieve-positions'`:
- **Date Window**: Formatted as:
  ```ts
  const startStr = `${dateRange.start}T00:00:00.001Z`;
  const endStr = `${dateRange.end}T23:59:59.999Z`;
  ```
  - `startStr` had fractional milliseconds (`.001Z`).
  - `endStr` was set to the end of the day (`23:59:59.999Z`), which extends into the future when the end date is today.
- **Function Call**: Calls `fetchArgosPositions(token, apiConfig, startStr, endStr, selectedLocationType, deviceIds, logCb)` in `services/argosService.ts`.
- **Target URL Construction**:
  ```ts
  let targetUrl = getUrl(`${baseUrl}/positions`);
  // If 404 received, falls back to:
  targetUrl = getUrl(`${baseUrl}/retrieve-positions`);
  ```
- **Base URL & Host**: `https://api.groupcls.com/telemetry/api/v1`
- **Method**: `POST`
- **Headers**:
  ```http
  Authorization: Bearer <REDACTED_ACCESS_TOKEN>
  Content-Type: application/json
  Accept: application/json
  ```
- **Body**:
  ```json
  {
    "limit": 100,
    "fromDatetime": "2026-10-18T00:00:00.001Z",
    "toDatetime": "2026-10-19T23:59:59.999Z",
    "datetimeFormat": "DATETIME",
    "locationType": "ALL"
  }
  ```

### Server-side / Cloud Function Execution
In `functions/clsPipeline.js` (`ingestPositionsJob`):
- Same guessed URLs: `${baseUrl}/positions` and `${baseUrl}/retrieve-positions`.
- Neither endpoint exists in the CLS Telemetry v1 public API routing.

---

## 2. Comparison With The Other 5 Working Operations

| Operation | Path / Endpoint | Method | Format / Query / Body | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | `https://account.groupcls.com/auth/realms/cls/protocol/openid-connect/token` | POST | `grant_type=password&client_id=api-telemetry` (url-encoded) | **Works** (200 OK) |
| **Bulk Message Retrieval** | `${baseUrl}/retrieve-bulk` | POST | JSON body with flags `retrieveDoppler`, `retrieveGpsLoc`, etc. | **Works** (200 OK) |
| **Realtime Stream (Checkpoint)** | `${baseUrl}/retrieve-realtime` | POST | JSON body with cursor pagination | **Works** (200 OK) |
| **Device Inventory List** | `${baseUrl}/retrieve-device-list` | POST / GET | JSON list of active transmitter platform IDs | **Works** (200 OK) |
| **Doppler Data** | `${baseUrl}/retrieve-doppler` | POST | JSON body with `fromDatetime`, `toDatetime` | **Works** (200 OK) |
| **Message Count Check** | `${baseUrl}/retrieve-bulk-count` | POST | JSON body with date range | **Works** (200 OK) |
| **Positions (GPS + Doppler)** | `${baseUrl}/positions` or `/retrieve-positions` | POST | **Guessed paths — Neither exists on CLS Telemetry v1** | **Fails (404 Not Found)** |

CLS API uses explicit verbs like `/retrieve-bulk`, `/retrieve-doppler`, `/retrieve-device-list`. Guessed paths like `/positions` or `/retrieve-positions` are returned by the upstream gateway with an HTML 404 page:
```html
<html><body><h1>Resource not found</h1></body></html>
```

---

## 3. Why 404 Was Retried as "Network error"

In `services/argosService.ts` (lines 445-487):
```ts
while (retries < 3) {
    try {
        let targetUrl = getUrl(`${baseUrl}/positions`);
        let res = await fetch(targetUrl, ...);
        if (res.status === 404) {
            targetUrl = getUrl(`${baseUrl}/retrieve-positions`);
            res = await fetch(targetUrl, ...);
        }
        ...
        const text = await res.text();
        if (!res.ok) throw new Error(`Positions Fetch Failed (${res.status}): ${text.substring(0, 100)}`);
        json = JSON.parse(text);
        break;
    } catch (e: any) {
        if (e.message.includes('Auth Failed')) throw e;
        retries++;
        if (retries >= 3) throw e;
        addLog(`Network error on page ${page}, retrying (${retries}/3)...`);
        await new Promise(r => setTimeout(r, 2000));
    }
}
```

1. Both `/positions` and `/retrieve-positions` return HTTP 404.
2. `if (!res.ok)` threw `Error("Positions Fetch Failed (404): <html>...")`.
3. The enclosing `catch (e: any)` caught the exception and blindly treated **all** exceptions (other than `Auth Failed`) as network drops.
4. It logged `Network error on page 1, retrying (1/3)...`, waited 2 seconds, and repeated the 404 request 3 times before failing!

---

## 4. Proxies and URL Rewrites

1. **Local Vite Dev Proxy (`vite.config.ts`)**:
   ```ts
   '^/proxy/argos': {
     target: 'https://trackapp-v2.web.app/proxy/argos',
     changeOrigin: true,
     rewrite: (path) => path.replace(/^\/proxy\/argos/, '')
   }
   ```
2. **Firebase Hosting Rewrites (`firebase.json`)**:
   ```json
   {
     "source": "/proxy/argos",
     "function": "proxyArgosApi"
   }
   ```
3. **Cloud Function Proxy (`functions/index.js`)**:
   `proxyArgosApi` parses `req.query.url`, forwards headers (`Authorization`, `Content-Type`, `Accept`), issues `fetch(targetUrl, ...)`, and passes back `res.status(response.status).send(responseBody)` with upstream `Content-Type`.
   When CLS responds with an HTML 404, the proxy faithfully returns HTTP 404 with `Content-Type: text/html`.

---

## 5. Security & Credentials (Redacted)

All credentials, access tokens, passwords, and client secrets are strictly masked using `maskSecrets`:
- `Authorization: Bearer [REDACTED]`
- Passwords and client secrets: `[REDACTED]`
- HTML error pages are sanitized to short, readable text snippets rather than raw dumps.

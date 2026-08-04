# RAF Tracking — iOS Application (WKWebView Wrapper)

Native iOS Xcode project for **RAF Tracking (Houbara Tracker v2.0)**.

The app uses a lightweight SwiftUI `WKWebView` wrapper to load the React web application hosted on Firebase. 100% code reuse with native iOS safe-area, file upload, location permissions, and camera support.

---

## ✅ Stable Version

| Date | Commit | Description |
|------|--------|-------------|
| **03/08/2026 23:43** | `cce6304` (web) | **Last known stable iOS version** — Working: Map Layers popup, Weather popup, History panel, GPS fly-to, Layers/Weather/History tools. iOS-only: hides AI Forecast, GEE satellite layers, Mark as Dead button. Distance measurement tool working. |
| **04/08/2026 08:50** | `eb429d2` (ios) | Added RAF Tracking App Icon (white background, all iOS sizes) + updated display name |

---

## 📱 Features & Module Filtering

When launched, the iOS app automatically loads with `?mode=ios` parameter. This instructs the React web app to display **ONLY**:
1. **Dashboard** — System KPIs, transmitter counts, status overviews
2. **Live Tracking Map** — Real-time Houbara bird positions, terrain layers, Layers/Weather/History tools
3. **Data Upload / API Ingestion** — Argos API ingestion, CLS CSV import

**iOS-specific map behavior:**
- ✅ Map Layers panel (switch basemap tiles)
- ✅ Weather overlay popup
- ✅ History panel (track position history)
- ✅ GPS auto-fly to current location
- ✅ Distance measurement tool
- ❌ AI Forecast (hidden on iOS)
- ❌ GEE satellite analysis layers (hidden on iOS)
- ❌ Mark as Dead button (hidden on iOS)

---

## 🛠️ How to Open and Run in Xcode

1. Open **Xcode** on your Mac.
2. Select **Open a project or file** and navigate to this repo:
   ```
   HBTrack.xcodeproj
   ```
3. Choose your target simulator (e.g., **iPhone 15 Pro**) or connected physical iOS device.
4. Press `Cmd + R` or click the **Run ▶** button in Xcode.

---

## ⚙️ Configurable Web App URL

By default, the app loads:
```
https://trackapp-v2.web.app/?mode=ios
```

### Changing URL for Local Testing:
- Tap the **Gear Icon ⚙️** at the top right of the iOS app header.
- Choose **"Use Local Dev Server (localhost:5173)"** or enter your local IP address (e.g., `http://192.168.1.100:5173/?mode=ios`).
- Tap **Save** to reload the app immediately against your local Vite server (`npm run dev`).

---

## 🔄 Two-Repo Architecture

This project is split into **two independent Git repositories** to keep iOS and web code completely isolated:

| Repo | Contains | Push command |
|------|----------|-------------|
| `azichl/Houbara-Tracker-v2.0-iOS` | Swift Xcode project (this repo) | `cd ios && git push origin main` |
| `azichl/HBTrack_April02` | React web app (Vite + Firebase) | `cd .. && git push origin main` |

> **Important**: The iOS app loads the **web app via Firebase Hosting**. Any changes to the map, UI, or features must be made in the **web repo** (`HBTrack_April02`) and deployed with `firebase deploy`. The iOS Xcode project only contains Swift wrapper code.

---

## 📋 Xcode Project Details

- **App Display Name**: RAF Tracking
- **Bundle ID**: `com.houbara.hbtrack`
- **Target iOS Version**: iOS 15.0+
- **Interface**: SwiftUI + WKWebView (`UIViewRepresentable`)
- **Permissions Configured (`Info.plist`)**:
  - Location (Live position marker on map)
  - Camera & Photo Library (Data Upload spreadsheet/CSV ingestion)
  - Arbitrary Loads (Allows connection to local dev server and Firebase backend)

---

## 🚀 Workflow: Making Changes

### To update iOS Swift code (navigation, UI chrome, URL):
```bash
cd /path/to/HBTrack_April02/ios
# make changes to HBTrack/*.swift or project files
git add -A
git commit -m "fix(ios): description"
git push origin main
```

### To update web app (map, features, data):
```bash
cd /path/to/HBTrack_April02
# make changes to views/, components/, etc.
npm run build
git add -A
git commit -m "feat: description"
git push origin main
# then deploy to Firebase:
firebase deploy --only hosting
```

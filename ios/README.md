# HBTrack iOS Application (Lightweight WKWebView Wrapper)

This directory contains the native iOS Xcode project for **HBTrack (Houbara Tracker v2.0)**.

The app uses a lightweight SwiftUI `WKWebView` wrapper approach to load the existing React web application with 100% code reuse and native iOS safe-area / file upload support.

---

## 📱 Features & Module Filtering

When launched, the iOS app automatically loads with `?mode=ios` parameter. This instructs the React app to display **ONLY**:
1. **Dashboard** (System KPIs, transmitter counts, status overviews)
2. **Live Tracking Map** (Real-time Houbara bird positions, terrain map, GPS filtering)
3. **Data Upload / API Ingestion** (CSV/Excel import, Argos API ingestion, manual data entries)

An iOS bottom navigation bar (`IOSBottomNav`) is rendered at the bottom for quick tab switching.

---

## 🛠️ How to Open and Run in Xcode

1. Open **Xcode** on your Mac.
2. Select **Open a project or file** and navigate to:
   ```
   ios/HBTrack.xcodeproj
   ```
3. Choose your target simulator (e.g., **iPhone 15 Pro**) or connected physical iOS device.
4. Press `Cmd + R` or click the **Run ▶** button in Xcode.

---

## ⚙️ Configurable Web App URL

By default, the app loads `https://houbara-tracker.web.app/?mode=ios`.

### Changing URL for Local Testing:
- Tap the **Gear Icon ⚙️** at the top right of the iOS app header.
- Choose **"Use Local Dev Server (localhost:5173)"** or enter your local IP address (e.g., `http://192.168.1.100:5173/?mode=ios`).
- Tap **Save** to reload the app immediately against your local Vite server (`npm run dev`).

---

## 📋 Xcode Project Details

- **Target iOS Version**: iOS 15.0+
- **Interface**: SwiftUI + WKWebView (`UIViewRepresentable`)
- **Permissions Configured (`Info.plist`)**:
  - Location (Live position marker on map)
  - Camera & Photo Library (Data Upload spreadsheet/CSV ingestion)
  - Arbitrary Loads (Allows connection to local dev server and Firebase backend)

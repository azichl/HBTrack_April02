# RAF Tracking — Native SwiftUI iOS Application

Native iOS Xcode application for **RAF Tracking (Houbara Tracker v2.0)** built with SwiftUI, MapKit, Swift Charts, and the Firebase iOS SDK.

Directly connected to **Cloud Firestore** and **Firebase Authentication** without any WebView wrappers.

---

## 📱 Architecture

- **UI Framework**: 100% Native SwiftUI (Targeting iOS 16.0+)
- **Map Engine**: Apple MapKit (`MKMapView` & SwiftUI `Map`) with live transmitter annotations, historical tracks, and distance measurement HUD
- **Data Visualization**: Native SwiftUI Charts and responsive KPI cards
- **Backend & Database**: Firebase iOS SDK (FirebaseAuth, FirebaseFirestore, FirebaseFunctions)
- **State Management**: MVVM with ObservableObject and Combine / Swift Concurrency (`async/await`)

---

## 🚀 Application Modules (4 Core Tabs)

1. **Dashboard**
   - KPI Cards: Deployed PTTs, Birds Tracked, Active Alerts, Last Ingest Time
   - Transmitter Status Breakdown (Active, Static test, Potential Mortality, Inactive, Dead)
   - 7-Day Ingestion Flow Chart
   - Live Alert Feed with severity indicators

2. **Live Map**
   - Real-time Houbara bird positions with live Firestore updates
   - Status-colored custom annotations
   - Interactive transmitter detail bottom sheet
   - Historical trajectory polyline overlays with time filters (24h, 7d, 30d, 1y, 2y, custom)
   - Real-time distance measurement tool
   - Standard, Satellite, and Hybrid layer switcher

3. **Data Upload**
   - Argos CLS API telemetry ingestion via secure proxy
   - Real-time sync logs and batch record processing

4. **Settings**
   - Profile management (name, timezone, language)
   - Dark mode preference toggle
   - Account security & password update
   - Role badge & Sign Out action

---

## 🛠️ How to Open and Run in Xcode

1. Open **Xcode** on your Mac.
2. Open `ios/HBTrack.xcodeproj`.
3. Xcode will automatically resolve the Swift Package Manager dependency:
   - `firebase-ios-sdk` (FirebaseAuth, FirebaseFirestore, FirebaseFunctions)
4. Ensure `GoogleService-Info.plist` is in `HBTrack/` matching your Firebase project (`trackapp-v2`).
5. Choose target simulator (e.g., **iPhone 16 Pro**) or a connected physical device.
6. Press `Cmd + R` or click **Run ▶**.

---

## 📋 Xcode Project Details

- **App Display Name**: RAF Tracking
- **Bundle ID**: `com.houbara.hbtrack`
- **Target iOS Version**: iOS 16.0+
- **Architecture**: Native SwiftUI + MapKit + Swift Charts + Firebase iOS SDK
- **Permissions (`Info.plist`)**:
  - `NSLocationWhenInUseUsageDescription`: Displays user position on tracking map relative to transmitter locations.

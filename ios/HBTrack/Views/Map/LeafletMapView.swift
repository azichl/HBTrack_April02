import SwiftUI
import WebKit
import CoreLocation

struct LeafletMapView: UIViewRepresentable {
    @ObservedObject var viewModel: MapViewModel
    var activeWeatherOverlay: String = "none" // "none", "temp_new", "precipitation_new", "wind_new", "clouds_new"
    var activeBaseLayer: String = "google_hybrid" // "google_hybrid", "google_roadmap", "osm", "esri"
    var onMarkerTapped: ((String) -> Void)?
    var onMapTapped: ((CLLocationCoordinate2D) -> Void)?
    
    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "onMarkerClick")
        contentController.add(context.coordinator, name: "onMapClick")
        contentController.add(context.coordinator, name: "onMeasurePoint")
        
        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.navigationDelegate = context.coordinator
        
        let html = generateLeafletHTML()
        webView.loadHTMLString(html, baseURL: URL(string: "https://houbaratracker.com"))
        
        context.coordinator.webView = webView
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.isLoaded else { return }
        updateMapState(in: webView)
    }
    
    func updateMapState(in webView: WKWebView) {
        // 1. Update Base Layer
        let layerJs = "setBaseLayer('\(activeBaseLayer)');"
        webView.evaluateJavaScript(layerJs, completionHandler: nil)
        
        // 2. Update Weather Overlay
        let weatherJs = "setWeatherOverlay('\(activeWeatherOverlay)');"
        webView.evaluateJavaScript(weatherJs, completionHandler: nil)
        
        // 3. Update Transmitters JSON (hide unselected transmitters when history mode is active)
        let activeAnnotations = (viewModel.showHistory && !viewModel.selectedTransmitterIds.isEmpty)
            ? viewModel.annotations.filter { viewModel.selectedTransmitterIds.contains($0.transmitter.platform_id) }
            : viewModel.annotations
            
        let markersData = activeAnnotations.map { ann -> [String: Any] in
            let tx = ann.transmitter
            let status = tx.effectiveStatus
            return [
                "id": tx.platform_id,
                "lat": ann.coordinate.latitude,
                "lon": ann.coordinate.longitude,
                "status": status,
                "birdRing": tx.assigned_bird_ring ?? ann.bird?.ring_id ?? "",
                "species": ann.bird?.species ?? ""
            ]
        }
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: markersData),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            let js = "updateMarkers(\(jsonString));"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
        
        // 4. Update History Polyline & Points (Multi-PTT colored paths)
        if viewModel.showHistory && !viewModel.historyPaths.isEmpty {
            let pathsData = viewModel.historyPaths.map { hp -> [String: Any] in
                return [
                    "id": hp.id,
                    "color": hp.color,
                    "path": hp.positions.map { pos -> [String: Any] in
                        return [
                            "lat": pos.coordinate.latitude,
                            "lon": pos.coordinate.longitude,
                            "date": pos.timestamp,
                            "speed": pos.speed_kmh ?? 0,
                            "course": pos.course ?? 0,
                            "type": pos.locationType ?? "GPS",
                            "lc": pos.lc ?? ""
                        ]
                    }
                ]
            }
            if let histJson = try? JSONSerialization.data(withJSONObject: pathsData),
               let histStr = String(data: histJson, encoding: .utf8) {
                let js = "drawHistoryPaths(\(histStr));"
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        } else {
            webView.evaluateJavaScript("clearHistory();", completionHandler: nil)
        }
        
        // 5. Update Measurement Mode
        let measureJs = "setMeasurementMode(\(viewModel.isMeasuring));"
        webView.evaluateJavaScript(measureJs, completionHandler: nil)
        if !viewModel.isMeasuring {
            webView.evaluateJavaScript("clearMeasurement();", completionHandler: nil)
        }
        
        // 6. Update User GPS Location
        if viewModel.isTrackingUser, let userLoc = viewModel.userLocation {
            let headingParam = viewModel.userHeading != nil ? "\(viewModel.userHeading!)" : "null"
            let gpsJs = "updateUserLocation(\(userLoc.latitude), \(userLoc.longitude), 25, \(headingParam));"
            webView.evaluateJavaScript(gpsJs, completionHandler: nil)
        } else {
            webView.evaluateJavaScript("clearUserLocation();", completionHandler: nil)
        }
        
        // 7. Handle flyTo target
        if let target = viewModel.flyToTarget {
            let flyJs = "flyToCoord(\(target.coordinate.latitude), \(target.coordinate.longitude), \(target.zoom));"
            webView.evaluateJavaScript(flyJs, completionHandler: nil)
            DispatchQueue.main.async {
                viewModel.flyToTarget = nil
            }
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: LeafletMapView
        var webView: WKWebView?
        var isLoaded = false
        
        init(_ parent: LeafletMapView) {
            self.parent = parent
        }
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            isLoaded = true
            parent.updateMapState(in: webView)
        }
        
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "onMarkerClick" {
                if let txId = message.body as? String {
                    DispatchQueue.main.async {
                        if let transmitter = self.parent.viewModel.transmitters.first(where: { $0.platform_id == txId }) {
                            self.parent.viewModel.selectTransmitter(transmitter)
                        }
                        self.parent.onMarkerTapped?(txId)
                    }
                }
            } else if message.name == "onMapClick" {
                if let dict = message.body as? [String: Double],
                   let lat = dict["lat"], let lon = dict["lon"] {
                    let coord = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                    DispatchQueue.main.async {
                        self.parent.onMapTapped?(coord)
                    }
                }
            } else if message.name == "onMeasurePoint" {
                if let dict = message.body as? [String: Double],
                   let lat = dict["lat"], let lon = dict["lon"] {
                    let coord = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                    DispatchQueue.main.async {
                        self.parent.viewModel.addMeasurePoint(coord)
                    }
                }
            }
        }
    }
    
    private func generateLeafletHTML() -> String {
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
            <style>
                html, body, #map {
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    padding: 0;
                    background-color: #0b0f19;
                }
                .leaflet-container {
                    background: #111827;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .ptt-badge-label {
                    background: #ffffff !important;
                    color: #0f172a !important;
                    font-weight: 800 !important;
                    font-size: 11px !important;
                    padding: 1px 7px !important;
                    border-radius: 9999px !important;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
                    border: 2px solid #22c55e;
                    white-space: nowrap !important;
                    text-align: center !important;
                }
                .ptt-badge-label.active { border-color: #22c55e; }
                .ptt-badge-label.potential { border-color: #f97316; }
                .ptt-badge-label.static { border-color: #eab308; }
                .ptt-badge-label.dead { border-color: #dc2626; }
                .ptt-badge-label.inactive { border-color: #0f172a; }
                
                .leaflet-tooltip-top:before {
                    display: none !important;
                }
                .custom-leaflet-tooltip {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                }
                
                /* Compass Rose positioned cleanly above the zoom controls */
                .compass-rose {
                    position: absolute;
                    bottom: 96px;
                    right: 14px;
                    width: 48px;
                    height: 48px;
                    z-index: 999;
                    pointer-events: none;
                    filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));
                }
                
                /* User GPS Pulse Animation */
                @keyframes gps-pulse {
                    0% { transform: scale(0.6); opacity: 1; }
                    100% { transform: scale(2.2); opacity: 0; }
                }
                
                .weather-temp-popup .leaflet-popup-content-wrapper {
                    background: #0f172a !important;
                    color: #ffffff !important;
                    border-radius: 14px !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important;
                    padding: 4px 8px !important;
                }
                .weather-temp-popup .leaflet-popup-tip {
                    background: #0f172a !important;
                }
            </style>
        </head>
        <body>
            <div id="map"></div>
            <svg class="compass-rose" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="rgba(15, 23, 42, 0.85)" stroke="#eab308" stroke-width="2"/>
                <polygon points="50,12 43,48 50,44 57,48" fill="#ef4444"/>
                <polygon points="50,88 43,52 50,56 57,52" fill="#ffffff"/>
                <polygon points="12,50 48,43 44,50 48,57" fill="#cbd5e1"/>
                <polygon points="88,50 52,43 56,50 52,57" fill="#cbd5e1"/>
                <text x="50" y="24" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">N</text>
                <text x="50" y="82" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">S</text>
                <text x="22" y="53" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">W</text>
                <text x="78" y="53" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">E</text>
                <circle cx="50" cy="50" r="4" fill="#eab308"/>
            </svg>

            <script>
                const WEATHER_API_KEY = 'c748a0edae0f262b7a5405b65c42eac9';
                let currentActiveWeather = 'none';
                
                // Initialize Map centered on Middle East / Central Asia (matches web default)
                const map = L.map('map', {
                    center: [25.276987, 51.520008],
                    zoom: 5,
                    zoomControl: false,
                    attributionControl: true
                });

                // Add Zoom & Scale Controls
                L.control.zoom({ position: 'bottomright' }).addTo(map);
                L.control.scale({ imperial: true, metric: true, position: 'bottomleft' }).addTo(map);

                // Base Tile Layers (identical to web app)
                const baseLayers = {
                    'google_hybrid': L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                        maxZoom: 20,
                        attribution: '&copy; Google'
                    }),
                    'google_roadmap': L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                        maxZoom: 20,
                        attribution: '&copy; Google'
                    }),
                    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 19,
                        attribution: '&copy; OpenStreetMap'
                    }),
                    'esri': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                        maxZoom: 19,
                        attribution: '&copy; Esri'
                    })
                };

                let currentBaseLayer = baseLayers['google_hybrid'];
                currentBaseLayer.addTo(map);

                function setBaseLayer(layerKey) {
                    if (baseLayers[layerKey] && baseLayers[layerKey] !== currentBaseLayer) {
                        map.removeLayer(currentBaseLayer);
                        currentBaseLayer = baseLayers[layerKey];
                        currentBaseLayer.addTo(map);
                    }
                }

                // Weather Overlays (OpenWeatherMap)
                let currentWeatherLayer = null;
                function setWeatherOverlay(overlayKey) {
                    currentActiveWeather = overlayKey;
                    if (currentWeatherLayer) {
                        map.removeLayer(currentWeatherLayer);
                        currentWeatherLayer = null;
                    }
                    if (overlayKey && overlayKey !== 'none') {
                        currentWeatherLayer = L.tileLayer('https://tile.openweathermap.org/map/' + overlayKey + '/{z}/{x}/{y}.png?appid=' + WEATHER_API_KEY, {
                            maxZoom: 18,
                            opacity: 0.65,
                            zIndex: 400
                        });
                        currentWeatherLayer.addTo(map);
                    }
                }

                // Custom SVG Marker Pin generator (identical to web app)
                function createPinSvg(colorHex) {
                    return `
                        <div style="position: relative; width: 22px; height: 36px; cursor: pointer;">
                            <svg width="22" height="36" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12.5 0C5.596 0 0 5.596 0 12.5C0 21.875 12.5 41 12.5 41C12.5 41 25 21.875 25 12.5C25 5.596 19.404 0 12.5 0Z" fill="${colorHex}" stroke="#000000" stroke-width="1.5" stroke-opacity="0.4"/>
                                <circle cx="12.5" cy="12.5" r="5" fill="#ffffff" opacity="0.9"/>
                            </svg>
                        </div>
                    `;
                }

                function getStatusColor(status) {
                    const s = (status || '').toLowerCase();
                    if (s === 'active') return '#22c55e';
                    if (s.includes('mortality') || s === 'potential') return '#f97316';
                    if (s.includes('static')) return '#eab308';
                    if (s === 'dead') return '#dc2626';
                    return '#0f172a';
                }

                function getBadgeClass(status) {
                    const s = (status || '').toLowerCase();
                    if (s === 'active') return 'active';
                    if (s.includes('mortality') || s === 'potential') return 'potential';
                    if (s.includes('static')) return 'static';
                    if (s === 'dead') return 'dead';
                    return 'inactive';
                }

                // Markers Management
                const markerMap = {};
                const markerGroup = L.featureGroup().addTo(map);

                function updateMarkers(markers) {
                    const incomingIds = new Set(markers.map(m => String(m.id)));
                    
                    // Remove old markers
                    for (const id in markerMap) {
                        if (!incomingIds.has(id)) {
                            markerGroup.removeLayer(markerMap[id]);
                            delete markerMap[id];
                        }
                    }

                    // Add or update
                    markers.forEach(m => {
                        const idStr = String(m.id);
                        const lat = Number(m.lat);
                        const lon = Number(m.lon);
                        if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return;

                        const color = getStatusColor(m.status);
                        const badgeClass = getBadgeClass(m.status);
                        
                        const icon = L.divIcon({
                            className: 'custom-pin-marker',
                            html: createPinSvg(color),
                            iconSize: [22, 36],
                            iconAnchor: [11, 36]
                        });

                        if (markerMap[idStr]) {
                            markerMap[idStr].setLatLng([lat, lon]);
                            markerMap[idStr].setIcon(icon);
                        } else {
                            const marker = L.marker([lat, lon], { icon: icon });
                            
                            // Permanent Top PTT ID Badge
                            marker.bindTooltip(
                                `<div class="ptt-badge-label ${badgeClass}">${idStr}</div>`,
                                {
                                    permanent: true,
                                    direction: 'top',
                                    offset: [0, -32],
                                    className: 'custom-leaflet-tooltip'
                                }
                            );

                            marker.on('click', () => {
                                if (window.webkit && window.webkit.messageHandlers.onMarkerClick) {
                                    window.webkit.messageHandlers.onMarkerClick.postMessage(idStr);
                                }
                            });

                            markerGroup.addLayer(marker);
                            markerMap[idStr] = marker;
                        }
                    });
                }

                // History Track Polyline & Points
                let historyPolyline = null;
                let historyPointsGroup = L.featureGroup().addTo(map);

                async function fetchMeteoArchive(lat, lon, isoTimestamp, elementId) {
                    const el = document.getElementById(elementId);
                    if (!el) return;

                    try {
                        const date = new Date(isoTimestamp);
                        if (isNaN(date.getTime())) {
                            el.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 4px;">Time unavailable</div>';
                            return;
                        }

                        const dateStr = date.toISOString().split('T')[0];
                        const utcHour = date.getUTCHours();
                        const diffDays = (Date.now() - date.getTime()) / (1000 * 3600 * 24);
                        const isArchive = diffDays > 5;

                        const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,soil_temperature_0cm,soil_temperature_0_to_7cm&timezone=UTC`;
                        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,soil_temperature_0cm,soil_temperature_0_to_7cm&timezone=UTC`;

                        const primaryUrl = isArchive ? archiveUrl : forecastUrl;
                        const fallbackUrl = isArchive ? forecastUrl : archiveUrl;

                        let res = null;
                        let apiUsed = isArchive ? 'Open-Meteo ERA5 (Archive)' : 'Open-Meteo (Forecast)';

                        try {
                            res = await fetch(primaryUrl);
                            if (!res.ok) throw new Error('Primary failed');
                        } catch (e) {
                            res = await fetch(fallbackUrl);
                            apiUsed = isArchive ? 'Open-Meteo (Forecast)' : 'Open-Meteo ERA5 (Archive)';
                        }

                        if (!res.ok) {
                            throw new Error('All weather endpoints failed');
                        }

                        const data = await res.json();
                        if (data && data.hourly && data.hourly.temperature_2m) {
                            const h = data.hourly;
                            const idx = (utcHour >= 0 && utcHour < 24) ? utcHour : 0;
                            const air = h.temperature_2m[idx];
                            const s0 = (h.soil_temperature_0cm && h.soil_temperature_0cm[idx] !== null) ? h.soil_temperature_0cm[idx] : null;
                            const s7 = (h.soil_temperature_0_to_7cm && h.soil_temperature_0_to_7cm[idx] !== null) ? h.soil_temperature_0_to_7cm[idx] : null;
                            const soil = (s0 !== null && s0 !== undefined) ? s0 : s7;

                            let html = '<div style="display: flex; justify-content: space-around; align-items: center; margin: 4px 0;">';
                            if (air !== null && air !== undefined) {
                                html += `
                                    <div style="text-align: center;">
                                        <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Air Temp (2m)</div>
                                        <div style="font-size: 18px; font-weight: 900; color: #ea580c;">${Number(air).toFixed(1)}°C</div>
                                    </div>`;
                            }
                            if (soil !== null && soil !== undefined) {
                                html += `
                                    <div style="text-align: center;">
                                        <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">Surface / Soil</div>
                                        <div style="font-size: 16px; font-weight: 800; color: #b45309;">${Number(soil).toFixed(1)}°C</div>
                                    </div>`;
                            }
                            html += '</div>';
                            html += `<div style="font-size: 8px; color: #c2410c; opacity: 0.8; text-align: center; margin-top: 2px;">Source: ${apiUsed}</div>`;
                            el.innerHTML = html;
                        } else {
                            el.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 4px;">Weather Data Unavailable</div>';
                        }
                    } catch (err) {
                        el.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 4px;">Weather Data Unavailable</div>';
                    }
                }

                let historyLayersGroup = L.featureGroup().addTo(map);
                const historyCanvasRenderer = L.canvas({ padding: 0.5 });

                function drawHistoryPaths(pathsList) {
                    clearHistory();
                    if (!pathsList || pathsList.length === 0) return;

                    let allLatLngs = [];

                    pathsList.forEach((hp) => {
                        const pttId = hp.id || '';
                        const color = hp.color || '#6366f1';
                        const positions = hp.path || [];

                        const validPositions = positions.filter(p => {
                            const lat = Number(p.lat);
                            const lon = Number(p.lon);
                            return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;
                        });
                        if (validPositions.length === 0) return;

                        const latlngs = validPositions.map(p => [Number(p.lat), Number(p.lon)]);
                        allLatLngs.push(...latlngs);

                        // 1. Draw distinct colored polyline for this PTT
                        const polyline = L.polyline(latlngs, {
                            color: color,
                            weight: 3.5,
                            opacity: 0.85,
                            dashArray: '7, 5'
                        }).addTo(historyLayersGroup);

                        // 2. High-performance canvas rendering for EVERY single fix (no skipped points!)
                        const total = validPositions.length;

                        validPositions.forEach((p, index) => {
                            const isStart = index === 0;
                            const isEnd = index === total - 1;

                            const latNum = Number(p.lat);
                            const lonNum = Number(p.lon);
                            const pt = [latNum, lonNum];
                            const isGps = (p.type || '').toUpperCase() === 'GPS';

                            // Circle marker on canvas: start = deep blue, end = emerald green, intermediate = blue dot for GPS / purple for Doppler (or PTT color)
                            const dotColor = pathsList.length > 1 ? color : (isGps ? '#2563eb' : '#9333ea');
                            const circle = L.circleMarker(pt, {
                                renderer: historyCanvasRenderer,
                                radius: isEnd ? 7 : (isStart ? 6.5 : 4.5),
                                fillColor: isEnd ? '#22c55e' : (isStart ? '#1e40af' : dotColor),
                                color: '#ffffff',
                                weight: 1.5,
                                opacity: 1,
                                fillOpacity: 0.95
                            });

                            const popupUid = 'meteo-pop-' + Math.floor(Math.random() * 1000000);
                            const fixBadgeStyle = isGps 
                                ? 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;' 
                                : 'background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff;';
                            const fixLabel = isGps ? 'GPS' : `Doppler ${p.lc ? '(LC ' + p.lc + ')' : ''}`;

                            // Coordinate formatting (HDD, HDMM, HDMS matching web app)
                            function formatDM(val, isLat) {
                                const abs = Math.abs(val || 0);
                                const deg = Math.floor(abs);
                                const min = (abs - deg) * 60;
                                const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
                                return deg + "° " + min.toFixed(3) + "' " + dir;
                            }
                            function formatDMS(val, isLat) {
                                const abs = Math.abs(val || 0);
                                const deg = Math.floor(abs);
                                const min = Math.floor((abs - deg) * 60);
                                const sec = ((abs - deg) * 60 - min) * 60;
                                const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
                                return deg + "° " + min + "' " + sec.toFixed(1) + '" ' + dir;
                            }

                            const hddStr = latNum.toFixed(5) + ", " + lonNum.toFixed(5);
                            const hdmmStr = formatDM(latNum, true) + "  " + formatDM(lonNum, false);
                            const hdmsStr = formatDMS(latNum, true) + "  " + formatDMS(lonNum, false);

                            const popupHtml = `
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 220px; max-width: 260px; padding: 2px;">
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">
                                        <span style="font-size: 14px; font-weight: 800; color: ${color};">PTT ${p.pttId || pttId}</span>
                                        <span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 6px; ${fixBadgeStyle}">
                                            ${fixLabel}
                                        </span>
                                    </div>
                                    <div style="font-size: 11px; font-weight: 600; color: #334155; margin-bottom: 6px;">
                                        📅 ${p.date || ''}
                                    </div>
                                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 8px; border-radius: 6px; font-family: monospace; font-size: 10px; color: #475569; margin-bottom: 6px; line-height: 1.4;">
                                        <div><b>HDD:</b> ${hddStr}</div>
                                        <div><b>HDMM:</b> ${hdmmStr}</div>
                                        <div><b>HDMS:</b> ${hdmsStr}</div>
                                    </div>
                                    ${(p.speed > 0 || p.course > 0) ? `
                                    <div style="font-size: 10px; color: #64748b; margin-bottom: 6px;">
                                        Speed: <b>${Math.round(p.speed)} km/h</b> ${p.course > 0 ? '· Course: <b>' + Math.round(p.course) + '°</b>' : ''}
                                    </div>` : ''}
                                    <div style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 1px solid #fed7aa; border-radius: 8px; padding: 7px; margin-bottom: 6px;">
                                        <div style="font-size: 9.5px; font-weight: 800; color: #9a3412; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
                                            ☀️ Weather Context
                                        </div>
                                        <div id="${popupUid}">
                                            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 0; color: #ea580c; font-size: 10.5px; font-weight: 600;">
                                                <span style="display: inline-block; width: 10px; height: 10px; border: 2px solid #fdba74; border-top-color: #ea580c; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
                                                Loading Weather Archive...
                                            </div>
                                        </div>
                                    </div>
                                    <a href="https://earth.google.com/web/search/${latNum},${lonNum}" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 4px; padding: 5px 0; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px; text-decoration: none; font-size: 10px; font-weight: 700; text-transform: uppercase;">
                                        🌐 View on Google Earth
                                    </a>
                                </div>
                            `;

                            circle.bindPopup(popupHtml, { maxWidth: 280, className: 'custom-history-popup' });
                            circle.on('popupopen', () => {
                                fetchMeteoArchive(latNum, lonNum, p.date, popupUid);
                            });

                            historyLayersGroup.addLayer(circle);
                        });
                    });

                    if (allLatLngs.length > 1) {
                        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50], maxZoom: 13 });
                    } else if (allLatLngs.length === 1) {
                        map.flyTo(allLatLngs[0], 11, { animate: true });
                    }
                }

                function drawHistory(positions) {
                    drawHistoryPaths([{ id: '', color: '#6366f1', path: positions }]);
                }

                function clearHistory() {
                    historyLayersGroup.clearLayers();
                }

                // Measurement Mode
                let isMeasuring = false;
                let measurePoints = [];
                let measurePolyline = null;
                let measureMarkers = L.featureGroup().addTo(map);

                function setMeasurementMode(enabled) {
                    isMeasuring = enabled;
                }

                function clearMeasurement() {
                    measurePoints = [];
                    if (measurePolyline) {
                        map.removeLayer(measurePolyline);
                        measurePolyline = null;
                    }
                    measureMarkers.clearLayers();
                }

                // User GPS Marker & Location Tracking
                let userLocationMarker = null;
                let userAccuracyCircle = null;

                function updateUserLocation(lat, lon, accuracy, heading) {
                    if (isNaN(lat) || isNaN(lon)) return;
                    
                    const userIcon = L.divIcon({
                        className: 'user-gps-marker',
                        html: `
                            <div style="position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                                <div style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(59, 130, 246, 0.4); animation: gps-pulse 2s infinite ease-out;"></div>
                                <div style="width: 14px; height: 14px; border-radius: 50%; background: #2563eb; border: 2.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); margin: auto;"></div>
                            </div>
                        `,
                        iconSize: [26, 26],
                        iconAnchor: [13, 13]
                    });

                    if (userLocationMarker) {
                        userLocationMarker.setLatLng([lat, lon]);
                    } else {
                        userLocationMarker = L.marker([lat, lon], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
                    }

                    if (accuracy && accuracy > 0) {
                        if (userAccuracyCircle) {
                            userAccuracyCircle.setLatLng([lat, lon]).setRadius(accuracy);
                        } else {
                            userAccuracyCircle = L.circle([lat, lon], {
                                radius: accuracy,
                                color: '#3b82f6',
                                fillColor: '#60a5fa',
                                fillOpacity: 0.12,
                                weight: 1.5,
                                dashArray: '4, 4'
                            }).addTo(map);
                        }
                    }
                }

                function clearUserLocation() {
                    if (userLocationMarker) {
                        map.removeLayer(userLocationMarker);
                        userLocationMarker = null;
                    }
                    if (userAccuracyCircle) {
                        map.removeLayer(userAccuracyCircle);
                        userAccuracyCircle = null;
                    }
                }

                // Map Click Events (Measurement, Temperature Weather Fetch, Native Callback)
                map.on('click', async (e) => {
                    const lat = e.latlng.lat;
                    const lon = e.latlng.lng;

                    // Always notify native host to dismiss floating drawers/popups
                    if (window.webkit && window.webkit.messageHandlers.onMapClick) {
                        window.webkit.messageHandlers.onMapClick.postMessage({ lat: lat, lon: lon });
                    }

                    if (isMeasuring) {
                        measurePoints.push([lat, lon]);
                        
                        const dot = L.circleMarker([lat, lon], {
                            radius: 5,
                            fillColor: '#3b82f6',
                            color: '#ffffff',
                            weight: 2,
                            fillOpacity: 1
                        });
                        measureMarkers.addLayer(dot);

                        if (!measurePolyline) {
                            measurePolyline = L.polyline(measurePoints, {
                                color: '#3b82f6',
                                weight: 3,
                                dashArray: '5, 5'
                            }).addTo(map);
                        } else {
                            measurePolyline.setLatLngs(measurePoints);
                        }

                        if (window.webkit && window.webkit.messageHandlers.onMeasurePoint) {
                            window.webkit.messageHandlers.onMeasurePoint.postMessage({ lat: lat, lon: lon });
                        }
                    } else if (currentActiveWeather === 'temp_new') {
                        // Fetch temperature at this coordinate from OpenWeatherMap API
                        try {
                            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_API_KEY}`;
                            const res = await fetch(url);
                            const data = await res.json();
                            if (data && data.main) {
                                const temp = Math.round(data.main.temp);
                                const desc = (data.weather && data.weather[0] ? data.weather[0].description : 'Weather').toUpperCase();
                                const tempColor = temp > 30 ? '#ef4444' : (temp > 20 ? '#f97316' : (temp > 10 ? '#eab308' : '#3b82f6'));
                                
                                const popupContent = `
                                    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 2px 4px; text-align: center; min-width: 100px;">
                                        <div style="font-size: 9px; color: #94a3b8; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 2px;">${desc}</div>
                                        <div style="font-size: 22px; font-weight: 800; color: ${tempColor}; line-height: 1.1;">${temp}°C</div>
                                        <div style="font-size: 9px; color: #64748b; margin-top: 4px;">${lat.toFixed(3)}°, ${lon.toFixed(3)}°</div>
                                    </div>
                                `;
                                L.popup({ className: 'weather-temp-popup', closeButton: true, offset: [0, -6] })
                                    .setLatLng([lat, lon])
                                    .setContent(popupContent)
                                    .openOn(map);
                            }
                        } catch(err) {
                            console.error("Temperature fetch error:", err);
                        }
                    }
                });

                function flyToCoord(lat, lon, zoom = 11) {
                    map.flyTo([lat, lon], zoom, { animate: true, duration: 1.2 });
                }
            </script>
        </body>
        </html>
        """
    }
}

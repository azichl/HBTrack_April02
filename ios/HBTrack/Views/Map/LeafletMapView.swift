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
        
        // 1. Update Base Layer
        let layerJs = "setBaseLayer('\(activeBaseLayer)');"
        webView.evaluateJavaScript(layerJs, completionHandler: nil)
        
        // 2. Update Weather Overlay
        let weatherJs = "setWeatherOverlay('\(activeWeatherOverlay)');"
        webView.evaluateJavaScript(weatherJs, completionHandler: nil)
        
        // 3. Update Transmitters JSON
        let markersData = viewModel.annotations.map { ann -> [String: Any] in
            let tx = ann.transmitter
            let status = tx.derived_status ?? tx.status ?? "Inactive"
            return [
                "id": tx.platform_id,
                "lat": ann.coordinate.latitude,
                "lon": ann.coordinate.longitude,
                "status": status,
                "birdRing": tx.assigned_bird_ring ?? ann.bird?.ring_id ?? "",
                "birdName": ann.bird?.name ?? ""
            ]
        }
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: markersData),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            let js = "updateMarkers(\(jsonString));"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
        
        // 4. Update History Polyline
        if viewModel.showHistory && !viewModel.historyPositions.isEmpty {
            let historyData = viewModel.historyPositions.map { pos -> [String: Any] in
                return [
                    "lat": pos.coordinate.latitude,
                    "lon": pos.coordinate.longitude,
                    "date": pos.formattedDate,
                    "altitude": pos.altitude ?? 0
                ]
            }
            if let histJson = try? JSONSerialization.data(withJSONObject: historyData),
               let histStr = String(data: histJson, encoding: .utf8) {
                let js = "drawHistory(\(histStr));"
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
            parent.updateUIView(webView, context: Context(self))
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
                .compass-rose {
                    position: absolute;
                    bottom: 24px;
                    right: 14px;
                    width: 48px;
                    height: 48px;
                    z-index: 999;
                    pointer-events: none;
                    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5));
                }
            </style>
        </head>
        <body>
            <div id="map"></div>
            <svg class="compass-rose" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="rgba(15, 23, 42, 0.75)" stroke="#eab308" stroke-width="2"/>
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

                // History Track Polyline
                let historyPolyline = null;
                let historyPointsGroup = L.featureGroup().addTo(map);

                function drawHistory(positions) {
                    clearHistory();
                    if (!positions || positions.length === 0) return;

                    const latlngs = positions.map(p => [Number(p.lat), Number(p.lon)]).filter(pt => !isNaN(pt[0]) && !isNaN(pt[1]));
                    if (latlngs.length === 0) return;

                    historyPolyline = L.polyline(latlngs, {
                        color: '#ef4444',
                        weight: 3.5,
                        opacity: 0.85,
                        dashArray: '6, 6'
                    }).addTo(map);

                    latlngs.forEach((pt, index) => {
                        const circle = L.circleMarker(pt, {
                            radius: index === 0 ? 6 : 4,
                            fillColor: index === 0 ? '#22c55e' : '#f59e0b',
                            color: '#ffffff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.9
                        });
                        historyPointsGroup.addLayer(circle);
                    });

                    map.fitBounds(historyPolyline.getBounds(), { padding: [40, 40] });
                }

                function clearHistory() {
                    if (historyPolyline) {
                        map.removeLayer(historyPolyline);
                        historyPolyline = null;
                    }
                    historyPointsGroup.clearLayers();
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

                // Map Click Events
                map.on('click', (e) => {
                    const lat = e.latlng.lat;
                    const lon = e.latlng.lng;

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
                    } else {
                        if (window.webkit && window.webkit.messageHandlers.onMapClick) {
                            window.webkit.messageHandlers.onMapClick.postMessage({ lat: lat, lon: lon });
                        }
                    }
                });

                function flyToCoord(lat, lon, zoom = 9) {
                    map.flyTo([lat, lon], zoom, { animate: true, duration: 1.2 });
                }
            </script>
        </body>
        </html>
        """
    }
}

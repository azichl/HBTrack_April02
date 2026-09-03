import Foundation
import MapKit
import SwiftUI
import FirebaseFirestore
import CoreLocation

enum DatePreset: String, CaseIterable, Identifiable {
    case twentyFourHours = "24h"
    case fortyEightHours = "48h"
    case sevenDays = "7d"
    case thirtyDays = "30d"
    case sixMonths = "6m"
    case oneYear = "1y"
    case twoYears = "2y"
    case custom = "Custom"
    
    var id: String { self.rawValue }
    
    func dateRange(customStart: Date, customEnd: Date) -> (Date, Date) {
        let calendar = Calendar.current
        let now = Date()
        switch self {
        case .twentyFourHours:
            return (calendar.date(byAdding: .hour, value: -24, to: now) ?? now, now)
        case .fortyEightHours:
            return (calendar.date(byAdding: .hour, value: -48, to: now) ?? now, now)
        case .sevenDays:
            return (calendar.date(byAdding: .day, value: -7, to: now) ?? now, now)
        case .thirtyDays:
            return (calendar.date(byAdding: .day, value: -30, to: now) ?? now, now)
        case .sixMonths:
            return (calendar.date(byAdding: .month, value: -6, to: now) ?? now, now)
        case .oneYear:
            return (calendar.date(byAdding: .year, value: -1, to: now) ?? now, now)
        case .twoYears:
            return (calendar.date(byAdding: .year, value: -2, to: now) ?? now, now)
        case .custom:
            return (customStart, customEnd)
        }
    }
}

struct HistoryPath: Identifiable, Equatable {
    let id: String
    let color: String
    var positions: [Position]
    
    static func == (lhs: HistoryPath, rhs: HistoryPath) -> Bool {
        return lhs.id == rhs.id && lhs.color == rhs.color && lhs.positions.count == rhs.positions.count
    }
}

enum MapStyleOption: String, CaseIterable, Identifiable {
    case standard = "Standard"
    case satellite = "Satellite"
    case hybrid = "Hybrid"
    
    var id: String { self.rawValue }
}

struct TransmitterMapAnnotation: Identifiable {
    let id: String
    let transmitter: Transmitter
    let position: Position
    let bird: Bird?
    let coordinate: CLLocationCoordinate2D
    let statusColor: Color
    var statusUIColor: UIColor {
        transmitter.statusUIColor
    }
}

struct FlyToRequest: Equatable {
    let coordinate: CLLocationCoordinate2D
    let zoom: Int
    
    static func == (lhs: FlyToRequest, rhs: FlyToRequest) -> Bool {
        return lhs.coordinate.latitude == rhs.coordinate.latitude &&
               lhs.coordinate.longitude == rhs.coordinate.longitude &&
               lhs.zoom == rhs.zoom
    }
}

class MapLocationDelegate: NSObject, CLLocationManagerDelegate {
    private let onLocationUpdate: (CLLocationCoordinate2D, Double?) -> Void
    
    init(onLocationUpdate: @escaping (CLLocationCoordinate2D, Double?) -> Void) {
        self.onLocationUpdate = onLocationUpdate
        super.init()
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        let headingVal = loc.course >= 0 ? loc.course : nil
        onLocationUpdate(loc.coordinate, headingVal)
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard newHeading.headingAccuracy >= 0 else { return }
        let headingVal = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        if let loc = manager.location {
            onLocationUpdate(loc.coordinate, headingVal)
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location manager error: \(error)")
    }
}

@MainActor
class MapViewModel: ObservableObject {
    @Published var transmitters: [Transmitter] = []
    @Published var birds: [Bird] = []
    @Published var positions: [Position] = []
    @Published var annotations: [TransmitterMapAnnotation] = []
    
    @Published var selectedTransmitter: Transmitter?
    @Published var selectedBird: Bird?
    @Published var selectedPosition: Position?
    @Published var showDetail: Bool = false
    
    static let historyColors: [String] = [
        "#6366f1", // Indigo
        "#ec4899", // Pink
        "#14b8a6", // Teal
        "#f59e0b", // Amber
        "#8b5cf6", // Purple
        "#ef4444", // Red
        "#10b981", // Emerald
        "#3b82f6"  // Blue
    ]
    
    @Published var showHistory: Bool = false
    @Published var selectedTransmitterIds: [String] = []
    @Published var rawHistoryPositionsByTx: [String: [Position]] = [:]
    @Published var historyPaths: [HistoryPath] = []
    @Published var historyPositions: [Position] = []
    @Published var selectedDatePreset: DatePreset = .thirtyDays
    @Published var selectedLocationType: String = "All"
    @Published var customStartDate: Date = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    @Published var customEndDate: Date = Date()
    
    var visibleAnnotations: [TransmitterMapAnnotation] {
        if showHistory && !selectedTransmitterIds.isEmpty {
            return annotations.filter { selectedTransmitterIds.contains($0.transmitter.platform_id) }
        }
        return annotations
    }
    
    var historyDatePreset: DatePreset {
        get { selectedDatePreset }
        set { selectedDatePreset = newValue }
    }
    
    var historyLocationType: String {
        get { selectedLocationType }
        set { selectedLocationType = newValue }
    }
    
    @Published var isMeasuring: Bool = false
    @Published var measurePoints: [CLLocationCoordinate2D] = []
    @Published var totalMeasureDistance: Double = 0.0
    
    var totalDistanceMeters: Double {
        get { totalMeasureDistance }
        set { totalMeasureDistance = newValue }
    }
    
    // GPS Navigation & User Location
    @Published var isTrackingUser: Bool = false
    @Published var userLocation: CLLocationCoordinate2D? = nil
    @Published var userHeading: Double? = nil
    @Published var flyToTarget: FlyToRequest? = nil
    
    private var locationManager: CLLocationManager?
    private var locationDelegate: MapLocationDelegate?
    
    @Published var mapStyle: MapStyleOption = .standard
    @Published var region: MKCoordinateRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 25.276987, longitude: 51.520008),
        span: MKCoordinateSpan(latitudeDelta: 6.0, longitudeDelta: 6.0)
    )
    
    @Published var searchQuery: String = ""
    @Published var searchResults: [Transmitter] = []
    
    var searchText: String {
        get { searchQuery }
        set { searchQuery = newValue }
    }
    
    @Published var isLoading: Bool = false
    
    private var positionsListener: ListenerRegistration?
    
    deinit {
        positionsListener?.remove()
        locationManager?.stopUpdatingLocation()
        locationManager?.stopUpdatingHeading()
    }
    
    func loadData(forceRefresh: Bool = false, visibilityFilter: @escaping (String) -> Bool = { _ in true }) async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            let fetchedTransmitters = try await TransmitterService.shared.fetchAllTransmitters(forceRefresh: forceRefresh)
            let fetchedBirds = try await TransmitterService.shared.fetchAllBirds(forceRefresh: forceRefresh)
            
            self.transmitters = fetchedTransmitters
            self.birds = fetchedBirds
            
            // Fetch latest position for ALL transmitters from Firebase (positions + argos_positions + transmitter document coordinates)
            let fetchedPositions = try await TransmitterService.shared.fetchLatestPositionsPerTransmitter(for: fetchedTransmitters, forceRefresh: forceRefresh)
            self.positions = fetchedPositions
            
            buildAnnotations(visibilityFilter: visibilityFilter)
        } catch {
            print("Error loading map data: \(error)")
        }
    }
    
    func buildAnnotations(visibilityFilter: (String) -> Bool) {
        // Fast index of latest position per transmitter
        var latestPositionsByTx: [String: Position] = [:]
        for pos in positions {
            let pids = [pos.transmitter_id, pos.platformId].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            for pid in pids {
                if let existing = latestPositionsByTx[pid] {
                    if pos.timestamp > existing.timestamp {
                        latestPositionsByTx[pid] = pos
                    }
                } else {
                    latestPositionsByTx[pid] = pos
                }
            }
        }
        
        // Fast index of birds by ring_id and id
        var birdsByRing: [String: Bird] = [:]
        for bird in birds {
            if let ring = bird.ring_id {
                birdsByRing[ring.trimmingCharacters(in: .whitespacesAndNewlines)] = bird
            }
            if let id = bird.id {
                birdsByRing[id.trimmingCharacters(in: .whitespacesAndNewlines)] = bird
            }
        }
        
        var newAnnotations: [TransmitterMapAnnotation] = []
        newAnnotations.reserveCapacity(transmitters.count)
        
        let cal = Calendar.current
        let currentYear = cal.component(.year, from: Date())
        let currentMonth = cal.component(.month, from: Date())
        let currentMonthKey = String(format: "%04d-%02d", currentYear, currentMonth)
        
        for transmitter in transmitters {
            let txKey = transmitter.platform_id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !txKey.isEmpty, visibilityFilter(txKey) else { continue }
            
            // Static Test Rule: display on live map ONLY if tested during the current calendar month
            let st = transmitter.effectiveStatus.lowercased()
            if st.contains("static") {
                var isTestedThisMonth = false
                if let fix = transmitter.last_fix {
                    if fix.hasPrefix(currentMonthKey) {
                        isTestedThisMonth = true
                    } else if let date = DateFormatters.parseDate(fix) {
                        let y = cal.component(.year, from: date)
                        let m = cal.component(.month, from: date)
                        if String(format: "%04d-%02d", y, m) == currentMonthKey {
                            isTestedThisMonth = true
                        }
                    }
                }
                if !isTestedThisMonth {
                    continue
                }
            }
            
            let docId = (transmitter.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            
            var posCandidate = latestPositionsByTx[txKey] ?? (docId.isEmpty ? nil : latestPositionsByTx[docId])
            
            // If position not found in positions table, check direct coordinates on the transmitter model
            if posCandidate == nil, let directCoord = transmitter.directCoordinate {
                posCandidate = Position(
                    id: "tx-direct-\(docId.isEmpty ? txKey : docId)",
                    transmitter_id: txKey,
                    platformId: txKey,
                    timestamp: transmitter.last_fix ?? ISO8601DateFormatter().string(from: Date()),
                    lat: directCoord.latitude,
                    lon: directCoord.longitude,
                    lc: "3",
                    is_kalman: false,
                    speed_kmh: 0,
                    course: 0,
                    satellite: "GPS",
                    locationType: "GPS"
                )
            }
            
            if let latestPos = posCandidate {
                let ringKey = transmitter.assigned_bird_ring?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let linkedBird = (!ringKey.isEmpty ? birdsByRing[ringKey] : nil) ?? birdsByRing[txKey] ?? (docId.isEmpty ? nil : birdsByRing[docId])
                
                let annotation = TransmitterMapAnnotation(
                    id: transmitter.id ?? transmitter.platform_id,
                    transmitter: transmitter,
                    position: latestPos,
                    bird: linkedBird,
                    coordinate: latestPos.coordinate,
                    statusColor: transmitter.statusColor
                )
                newAnnotations.append(annotation)
            }
        }
        
        self.annotations = newAnnotations
    }
    
    func subscribeToPositions(visibilityFilter: @escaping (String) -> Bool = { _ in true }) {
        positionsListener?.remove()
        positionsListener = TransmitterService.shared.subscribeToPositions { [weak self] updatedPositions in
            guard let self = self else { return }
            Task { @MainActor in
                // Merge new incoming live positions
                var currentMap: [String: Position] = [:]
                for p in self.positions {
                    if let key = p.effectiveTransmitterId {
                        currentMap[key] = p
                    }
                }
                for p in updatedPositions {
                    if let key = p.effectiveTransmitterId {
                        if let existing = currentMap[key] {
                            if p.timestamp >= existing.timestamp {
                                currentMap[key] = p
                            }
                        } else {
                            currentMap[key] = p
                        }
                    }
                }
                self.positions = Array(currentMap.values)
                self.buildAnnotations(visibilityFilter: visibilityFilter)
            }
        }
    }
    
    func toggleUserTracking() {
        if isTrackingUser {
            locationManager?.stopUpdatingLocation()
            locationManager?.stopUpdatingHeading()
            isTrackingUser = false
            userLocation = nil
            userHeading = nil
        } else {
            if locationManager == nil {
                let manager = CLLocationManager()
                let delegate = MapLocationDelegate { [weak self] coord, heading in
                    Task { @MainActor in
                        guard let self = self else { return }
                        let isFirst = self.userLocation == nil
                        self.userLocation = coord
                        if let h = heading {
                            self.userHeading = h
                        }
                        if isFirst {
                            self.flyTo(coord, zoom: 14)
                        }
                    }
                }
                manager.delegate = delegate
                manager.desiredAccuracy = kCLLocationAccuracyBest
                self.locationManager = manager
                self.locationDelegate = delegate
            }
            
            locationManager?.requestWhenInUseAuthorization()
            locationManager?.startUpdatingLocation()
            if CLLocationManager.headingAvailable() {
                locationManager?.startUpdatingHeading()
            }
            isTrackingUser = true
        }
    }
    
    func selectTransmitter(_ transmitter: Transmitter) {
        self.selectedTransmitter = transmitter
        self.selectedBird = birds.first { $0.ring_id == transmitter.platform_id || $0.id == transmitter.id }
        self.selectedPosition = positions.first { $0.effectiveTransmitterId == transmitter.platform_id }
        self.showDetail = true
        
        if let pos = selectedPosition {
            flyTo(pos.coordinate, zoom: 12)
        }
    }
    
    func selectTransmitter(_ annotation: TransmitterMapAnnotation) {
        selectTransmitter(annotation.transmitter)
    }
    
    func selectTransmitterForHistory(_ tx: Transmitter) {
        selectedTransmitter = tx
        selectedTransmitterIds = [tx.platform_id]
        showHistory = true
        Task {
            await loadHistory()
        }
    }
    
    func toggleHistoryTransmitter(_ pttId: String) {
        if let idx = selectedTransmitterIds.firstIndex(of: pttId) {
            if selectedTransmitterIds.count > 1 {
                selectedTransmitterIds.remove(at: idx)
                applyHistoryFilter()
            }
        } else {
            selectedTransmitterIds.append(pttId)
            Task {
                await loadHistory()
            }
        }
    }
    
    func hexColorForHistoryTransmitter(_ pttId: String) -> String {
        if let idx = selectedTransmitterIds.firstIndex(of: pttId) {
            return MapViewModel.historyColors[idx % MapViewModel.historyColors.count]
        }
        return "#6366f1"
    }
    
    func colorForHistoryTransmitter(_ pttId: String) -> Color {
        return Color(hex: hexColorForHistoryTransmitter(pttId))
    }
    
    func loadHistory() async {
        if selectedTransmitterIds.isEmpty {
            if let tx = selectedTransmitter {
                selectedTransmitterIds = [tx.platform_id]
            } else if let first = transmitters.first {
                selectedTransmitter = first
                selectedTransmitterIds = [first.platform_id]
            }
        }
        guard !selectedTransmitterIds.isEmpty else { return }
        
        isLoading = true
        defer { isLoading = false }
        
        let (startDate, endDate) = selectedDatePreset.dateRange(customStart: customStartDate, customEnd: customEndDate)
        
        do {
            let rawDict = try await TransmitterService.shared.fetchHistoricalPositions(
                transmitterIds: selectedTransmitterIds,
                startDate: startDate,
                endDate: endDate,
                locationType: nil
            )
            self.rawHistoryPositionsByTx = rawDict
            applyHistoryFilter()
            
            if let firstId = selectedTransmitterIds.first,
               let path = historyPaths.first(where: { $0.id == firstId }),
               let lastCoord = path.positions.last?.coordinate {
                flyTo(lastCoord, zoom: 11)
            }
        } catch {
            print("Error loading history: \(error)")
        }
    }
    
    func applyHistoryFilter() {
        var newPaths: [HistoryPath] = []
        var allPositions: [Position] = []
        
        let cal = Calendar.current
        let currentYear = cal.component(.year, from: Date())
        let currentMonth = cal.component(.month, from: Date())
        let currentMonthKey = String(format: "%04d-%02d", currentYear, currentMonth)
        
        for (index, pttId) in selectedTransmitterIds.enumerated() {
            var fixes = rawHistoryPositionsByTx[pttId] ?? []
            let tx = transmitters.first(where: { $0.platform_id == pttId })
            let st = tx?.effectiveStatus.lowercased() ?? ""
            
            // Static Test Rule (mirrors web app):
            // If transmitter is Static test, only positions from current calendar month are shown
            if st.contains("static") {
                fixes = fixes.filter { p in
                    if p.timestamp.hasPrefix(currentMonthKey) { return true }
                    if let d = DateFormatters.parseDate(p.timestamp) {
                        let y = cal.component(.year, from: d)
                        let m = cal.component(.month, from: d)
                        return String(format: "%04d-%02d", y, m) == currentMonthKey
                    }
                    return false
                }
            }
            
            // Filter by location type (All, GPS, Doppler)
            if selectedLocationType == "GPS" {
                fixes = fixes.filter { ($0.locationType ?? "").uppercased() == "GPS" }
            } else if selectedLocationType == "Doppler" {
                fixes = fixes.filter { ($0.locationType ?? "").uppercased() == "DOPPLER" }
            }
            
            let hexColor = MapViewModel.historyColors[index % MapViewModel.historyColors.count]
            newPaths.append(HistoryPath(id: pttId, color: hexColor, positions: fixes))
            allPositions.append(contentsOf: fixes)
        }
        
        self.historyPaths = newPaths
        self.historyPositions = allPositions
    }
    
    func markDead(userId: String, email: String, role: String) async {
        guard let transmitter = selectedTransmitter else { return }
        let docId = transmitter.id ?? transmitter.platform_id
        do {
            try await TransmitterService.shared.markTransmitterDead(
                transmitterId: docId,
                userId: userId,
                userEmail: email,
                userRole: role
            )
            if let index = transmitters.firstIndex(where: { $0.platform_id == transmitter.platform_id }) {
                transmitters[index].derived_status = "Dead"
                selectedTransmitter = transmitters[index]
            }
        } catch {
            print("Error marking dead: \(error)")
        }
    }
    
    func unmarkDead() async {
        guard let transmitter = selectedTransmitter else { return }
        let docId = transmitter.id ?? transmitter.platform_id
        do {
            try await TransmitterService.shared.unmarkTransmitterDead(transmitterId: docId)
            if let index = transmitters.firstIndex(where: { $0.platform_id == transmitter.platform_id }) {
                transmitters[index].derived_status = "Active"
                selectedTransmitter = transmitters[index]
            }
        } catch {
            print("Error unmarking dead: \(error)")
        }
    }
    
    func addMeasurePoint(_ coord: CLLocationCoordinate2D) {
        measurePoints.append(coord)
        calculateTotalDistance()
    }
    
    func removeLastMeasurePoint() {
        if !measurePoints.isEmpty {
            measurePoints.removeLast()
            calculateTotalDistance()
        }
    }
    
    func clearMeasurement() {
        measurePoints.removeAll()
        totalMeasureDistance = 0.0
    }
    
    private func calculateTotalDistance() {
        guard measurePoints.count > 1 else {
            totalMeasureDistance = 0.0
            return
        }
        
        var total: Double = 0.0
        for i in 0..<(measurePoints.count - 1) {
            total += HaversineDistance.distance(from: measurePoints[i], to: measurePoints[i + 1])
        }
        totalMeasureDistance = total
    }
    
    func flyTo(_ coordinate: CLLocationCoordinate2D, zoom: Int = 11) {
        self.flyToTarget = FlyToRequest(coordinate: coordinate, zoom: zoom)
        self.region = MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.5, longitudeDelta: 0.5)
        )
    }
    
    func search() {
        let clean = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            searchResults = []
            return
        }
        
        searchResults = transmitters.filter {
            $0.platform_id.localizedCaseInsensitiveContains(clean) ||
            ($0.assigned_bird_ring ?? "").localizedCaseInsensitiveContains(clean)
        }
        
        if let match = annotations.first(where: { $0.transmitter.platform_id.localizedCaseInsensitiveContains(clean) }) {
            flyTo(match.coordinate, zoom: 12)
        }
    }
}

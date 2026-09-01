import Foundation
import MapKit
import SwiftUI
import FirebaseFirestore

enum DatePreset: String, CaseIterable, Identifiable {
    case twentyFourHours = "24 Hours"
    case sevenDays = "7 Days"
    case thirtyDays = "30 Days"
    case oneYear = "1 Year"
    case twoYears = "2 Years"
    case custom = "Custom"
    
    var id: String { self.rawValue }
    
    func dateRange(customStart: Date, customEnd: Date) -> (Date, Date) {
        let calendar = Calendar.current
        let now = Date()
        switch self {
        case .twentyFourHours:
            return (calendar.date(byAdding: .hour, value: -24, to: now) ?? now, now)
        case .sevenDays:
            return (calendar.date(byAdding: .day, value: -7, to: now) ?? now, now)
        case .thirtyDays:
            return (calendar.date(byAdding: .day, value: -30, to: now) ?? now, now)
        case .oneYear:
            return (calendar.date(byAdding: .year, value: -1, to: now) ?? now, now)
        case .twoYears:
            return (calendar.date(byAdding: .year, value: -2, to: now) ?? now, now)
        case .custom:
            return (customStart, customEnd)
        }
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
    
    @Published var showHistory: Bool = false
    @Published var historyPositions: [Position] = []
    @Published var selectedDatePreset: DatePreset = .thirtyDays
    @Published var selectedLocationType: String = "All"
    @Published var customStartDate: Date = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    @Published var customEndDate: Date = Date()
    
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
    }
    
    func loadData(forceRefresh: Bool = false, visibilityFilter: @escaping (String) -> Bool = { _ in true }) async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            async let fetchedTransmitters = TransmitterService.shared.fetchAllTransmitters(forceRefresh: forceRefresh)
            async let fetchedBirds = TransmitterService.shared.fetchAllBirds(forceRefresh: forceRefresh)
            async let fetchedPositions = TransmitterService.shared.fetchLatestPositions(forceRefresh: forceRefresh)
            
            self.transmitters = try await fetchedTransmitters
            self.birds = try await fetchedBirds
            self.positions = try await fetchedPositions
            
            buildAnnotations(visibilityFilter: visibilityFilter)
        } catch {
            print("Error loading map data: \(error)")
        }
    }
    
    func buildAnnotations(visibilityFilter: (String) -> Bool) {
        // Fast O(M) index of latest position per transmitter
        var latestPositionsByTx: [String: Position] = [:]
        for pos in positions {
            guard let txId = pos.effectiveTransmitterId, !txId.isEmpty else { continue }
            if let existing = latestPositionsByTx[txId] {
                if pos.timestamp > existing.timestamp {
                    latestPositionsByTx[txId] = pos
                }
            } else {
                latestPositionsByTx[txId] = pos
            }
        }
        
        // Fast O(B) index of birds by ring_id and id
        var birdsByRing: [String: Bird] = [:]
        for bird in birds {
            if let ring = bird.ring_id {
                birdsByRing[ring] = bird
            }
            if let id = bird.id {
                birdsByRing[id] = bird
            }
        }
        
        var newAnnotations: [TransmitterMapAnnotation] = []
        newAnnotations.reserveCapacity(transmitters.count)
        
        for transmitter in transmitters {
            guard visibilityFilter(transmitter.platform_id) else { continue }
            
            let txKey = transmitter.platform_id
            let docId = transmitter.id ?? ""
            
            let posCandidate = latestPositionsByTx[txKey] ?? (docId.isEmpty ? nil : latestPositionsByTx[docId])
            if let latestPos = posCandidate {
                let linkedBird = birdsByRing[txKey] ?? (docId.isEmpty ? nil : birdsByRing[docId])
                
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
                self.positions = updatedPositions
                self.buildAnnotations(visibilityFilter: visibilityFilter)
            }
        }
    }
    
    func selectTransmitter(_ transmitter: Transmitter) {
        self.selectedTransmitter = transmitter
        self.selectedBird = birds.first { $0.ring_id == transmitter.platform_id || $0.id == transmitter.id }
        self.selectedPosition = positions.first { $0.effectiveTransmitterId == transmitter.platform_id }
        self.showDetail = true
        
        if let pos = selectedPosition {
            flyTo(pos.coordinate)
        }
    }
    
    func selectTransmitter(_ annotation: TransmitterMapAnnotation) {
        selectTransmitter(annotation.transmitter)
    }
    
    func loadHistory() async {
        guard let transmitter = selectedTransmitter else { return }
        isLoading = true
        defer { isLoading = false }
        
        let (startDate, endDate) = selectedDatePreset.dateRange(customStart: customStartDate, customEnd: customEndDate)
        let locationType = selectedLocationType == "All" ? nil : selectedLocationType
        
        do {
            self.historyPositions = try await TransmitterService.shared.fetchHistoricalPositions(
                transmitterId: transmitter.platform_id,
                startDate: startDate,
                endDate: endDate,
                locationType: locationType
            )
            
            if let firstCoord = historyPositions.first?.coordinate {
                flyTo(firstCoord)
            }
        } catch {
            print("Error loading history: \(error)")
        }
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
    
    func flyTo(_ coordinate: CLLocationCoordinate2D) {
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
            flyTo(match.coordinate)
        }
    }
}

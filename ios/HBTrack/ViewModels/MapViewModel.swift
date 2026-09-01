import SwiftUI
import MapKit
import FirebaseFirestore
import FirebaseAuth
import CoreLocation

enum DatePreset: String, CaseIterable, Identifiable {
    case last24h = "24h"
    case last7d = "7d"
    case last30d = "30d"
    case last1y = "1y"
    case last2y = "2y"
    case custom = "Custom"
    
    var id: String { rawValue }
    
    var startDate: Date {
        let now = Date()
        switch self {
        case .last24h: return Calendar.current.date(byAdding: .day, value: -1, to: now) ?? now
        case .last7d: return Calendar.current.date(byAdding: .day, value: -7, to: now) ?? now
        case .last30d: return Calendar.current.date(byAdding: .day, value: -30, to: now) ?? now
        case .last1y: return Calendar.current.date(byAdding: .year, value: -1, to: now) ?? now
        case .last2y: return Calendar.current.date(byAdding: .year, value: -2, to: now) ?? now
        case .custom: return Calendar.current.date(byAdding: .day, value: -7, to: now) ?? now
        }
    }
}

enum MapStyleOption: String, CaseIterable, Identifiable {
    case standard = "Standard"
    case satellite = "Satellite"
    case hybrid = "Hybrid"
    var id: String { rawValue }
}

enum WeatherLayer: String, CaseIterable, Identifiable {
    case none = "None"
    case clouds = "Clouds"
    case precipitation = "Precipitation"
    case temperature = "Temperature"
    case wind = "Wind"
    var id: String { rawValue }
}

struct TransmitterMapAnnotation: Identifiable {
    let id: String
    let transmitter: Transmitter
    let position: Position
    let bird: Bird?
    var coordinate: CLLocationCoordinate2D
    var statusColor: Color
}

@MainActor
class MapViewModel: ObservableObject {
    @Published var transmitters: [Transmitter] = []
    @Published var positions: [Position] = []
    @Published var birds: [Bird] = []
    @Published var annotations: [TransmitterMapAnnotation] = []
    
    @Published var selectedTransmitter: Transmitter?
    @Published var showDetail: Bool = false
    
    @Published var showHistory: Bool = false
    @Published var historyPositions: [Position] = []
    @Published var historyDatePreset: DatePreset = .last7d
    @Published var historyStartDate: Date = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
    @Published var historyEndDate: Date = Date()
    @Published var historyLocationType: String = "All"
    
    @Published var searchQuery: String = ""
    @Published var searchResults: [Transmitter] = []
    
    @Published var isLoading: Bool = false
    
    @Published var isMeasuring: Bool = false
    @Published var measurePoints: [CLLocationCoordinate2D] = []
    @Published var totalMeasureDistance: Double = 0.0
    
    @Published var mapStyle: MapStyleOption = .satellite
    @Published var showWeather: Bool = false
    @Published var weatherLayer: WeatherLayer = .none
    
    @Published var region: MKCoordinateRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 36.0, longitude: 42.0),
        span: MKCoordinateSpan(latitudeDelta: 60.0, longitudeDelta: 60.0)
    )
    
    private var positionsListener: ListenerRegistration?
    
    deinit {
        positionsListener?.remove()
    }
    
    func loadData() async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            async let fetchedTransmitters = TransmitterService.shared.fetchAllTransmitters()
            async let fetchedBirds = TransmitterService.shared.fetchAllBirds()
            async let fetchedPositions = TransmitterService.shared.fetchLatestPositions()
            
            self.transmitters = try await fetchedTransmitters
            self.birds = try await fetchedBirds
            self.positions = try await fetchedPositions
            
            buildAnnotations(visibilityFilter: { _ in true })
        } catch {
            print("Error loading map data: \(error)")
        }
    }
    
    func buildAnnotations(visibilityFilter: (String) -> Bool) {
        var newAnnotations: [TransmitterMapAnnotation] = []
        
        for transmitter in transmitters {
            guard visibilityFilter(transmitter.platform_id) else { continue }
            
            // Find latest position for this transmitter
            let matchingPositions = positions.filter { pos in
                pos.effectiveTransmitterId == transmitter.platform_id ||
                pos.transmitter_id == transmitter.id
            }
            
            if let latestPos = matchingPositions.sorted(by: { $0.timestamp > $1.timestamp }).first {
                let linkedBird = birds.first { bird in
                    bird.ring_id == transmitter.platform_id ||
                    bird.id == transmitter.id
                }
                
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
    
    func subscribeToPositions() {
        positionsListener?.remove()
        positionsListener = TransmitterService.shared.subscribeToPositions { [weak self] updatedPositions in
            guard let self = self else { return }
            Task { @MainActor in
                self.positions = updatedPositions
                self.buildAnnotations(visibilityFilter: { _ in true })
            }
        }
    }
    
    func selectTransmitter(_ annotation: TransmitterMapAnnotation) {
        selectedTransmitter = annotation.transmitter
        showDetail = true
        flyTo(annotation.coordinate)
    }
    
    func loadHistory() async {
        guard let transmitter = selectedTransmitter else { return }
        
        isLoading = true
        defer { isLoading = false }
        
        do {
            let start = historyDatePreset == .custom ? historyStartDate : historyDatePreset.startDate
            let locType = historyLocationType == "All" ? nil : historyLocationType
            
            let fetched = try await TransmitterService.shared.fetchHistoricalPositions(
                transmitterId: transmitter.platform_id,
                startDate: start,
                endDate: historyEndDate,
                locationType: locType
            )
            
            self.historyPositions = fetched
        } catch {
            print("Error loading history: \(error)")
        }
    }
    
    func search() {
        if searchQuery.trimmingCharacters(in: .whitespaces).isEmpty {
            searchResults = []
        } else {
            let query = searchQuery.lowercased()
            searchResults = transmitters.filter { $0.platform_id.lowercased().contains(query) }
        }
    }
    
    func addMeasurePoint(_ coord: CLLocationCoordinate2D) {
        measurePoints.append(coord)
        calculateTotalDistance()
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
        
        var total: Double = 0
        for i in 0..<(measurePoints.count - 1) {
            total += HaversineDistance.distance(from: measurePoints[i], to: measurePoints[i+1])
        }
        totalMeasureDistance = total
    }
    
    func flyTo(_ coordinate: CLLocationCoordinate2D) {
        withAnimation {
            region = MKCoordinateRegion(
                center: coordinate,
                span: MKCoordinateSpan(latitudeDelta: 2.0, longitudeDelta: 2.0)
            )
        }
    }
    
    func markDead(userId: String, email: String, role: String) async {
        guard let transmitter = selectedTransmitter, let id = transmitter.id else { return }
        do {
            try await TransmitterService.shared.markTransmitterDead(transmitterId: id, userId: userId, userEmail: email, userRole: role)
            if let index = transmitters.firstIndex(where: { $0.id == id }) {
                transmitters[index].derived_status = "Dead"
                selectedTransmitter = transmitters[index]
            }
            buildAnnotations(visibilityFilter: { _ in true })
        } catch {
            print("Error marking transmitter dead: \(error)")
        }
    }
    
    func unmarkDead() async {
        guard let transmitter = selectedTransmitter, let id = transmitter.id else { return }
        do {
            try await TransmitterService.shared.unmarkTransmitterDead(transmitterId: id)
            if let index = transmitters.firstIndex(where: { $0.id == id }) {
                transmitters[index].derived_status = "Active"
                selectedTransmitter = transmitters[index]
            }
            buildAnnotations(visibilityFilter: { _ in true })
        } catch {
            print("Error unmarking transmitter dead: \(error)")
        }
    }
}
